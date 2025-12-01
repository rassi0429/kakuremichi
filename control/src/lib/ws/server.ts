import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HTTPServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { db, agents, gateways, tunnels, tunnelGatewayIps } from '../db';
import { eq } from 'drizzle-orm';
import type {
  WSMessage,
  AuthMessage,
  ConnectedClient,
  MessageType,
} from './types';

/**
 * WebSocket server for Control ⇔ Gateway/Agent communication
 */
export class ControlWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    port: number = 3001,
    server?: HTTPServer,
    path: string = '/ws',
  ) {
    // If no server is provided, use noServer mode for manual upgrade handling
    if (!server) {
      this.wss = new WebSocketServer({ noServer: true });
      console.log(`WebSocket server initialized in noServer mode for path ${path}`);
    } else {
      this.wss = new WebSocketServer({ server, path });
      console.log(`WebSocket server attached to existing server at path ${path}`);
    }
    this.setupServer();
  }

  /**
   * Handle WebSocket upgrade manually (for noServer mode)
   */
  public handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  private setupServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection');

      // Set up message handler
      ws.on('message', async (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('Failed to parse message:', error);
          this.sendError(ws, 'Invalid message format');
        }
      });

      // Handle connection close
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        this.removeClient(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.removeClient(ws);
      });
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  private async handleMessage(ws: WebSocket, message: WSMessage) {
    console.log('Received message:', message.type);

    switch (message.type) {
      case 'auth':
        await this.handleAuth(ws, message as AuthMessage);
        break;

      case 'ping':
        this.handlePing(ws);
        break;

      case 'status_update':
        await this.handleStatusUpdate(ws, message);
        break;

      case 'config_ack':
        console.log('Config acknowledged by client');
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  private async handleAuth(ws: WebSocket, message: AuthMessage) {
    console.log(`Auth request from ${message.clientType}`);

    try {
      let clientId: string | null = null;

      // Verify API key
      if (message.clientType === 'gateway') {
        const gateway = await db
          .select()
          .from(gateways)
          .where(eq(gateways.apiKey, message.apiKey))
          .limit(1);

        if (gateway.length === 0) {
          throw new Error('Invalid API key');
        }

        clientId = gateway[0]!.id;

        // Update last seen and public key
        await db
          .update(gateways)
          .set({
            status: 'online',
            lastSeenAt: new Date(),
            wireguardPublicKey: message.publicKey || null,
            publicIp: message.publicIp || null,
          })
          .where(eq(gateways.id, clientId));
      } else if (message.clientType === 'agent') {
        const agent = await db
          .select()
          .from(agents)
          .where(eq(agents.apiKey, message.apiKey))
          .limit(1);

        if (agent.length === 0) {
          throw new Error('Invalid API key');
        }

        clientId = agent[0]!.id;

        // Update agent with publicKey (virtualIp is now at tunnel level)
        await db
          .update(agents)
          .set({
            status: 'online',
            lastSeenAt: new Date(),
            wireguardPublicKey: message.publicKey,
          })
          .where(eq(agents.id, clientId));
      }

      if (!clientId) {
        throw new Error('Authentication failed');
      }

      // Store client
      this.clients.set(clientId, {
        id: clientId,
        type: message.clientType,
        ws,
        lastSeen: new Date(),
        authenticated: true,
      });

      // Send success response
      this.send(ws, {
        type: 'auth_success' as MessageType.AUTH_SUCCESS,
        timestamp: Date.now(),
        clientId,
        clientType: message.clientType,
      });

      console.log(`${message.clientType} ${clientId} authenticated`);

      // Send initial configuration to the newly connected client
      await this.sendConfigToClient(clientId);

      // Notify other clients about this client coming online
      if (message.clientType === 'gateway') {
        // Gateway came online - notify all Agents so they can update their peer list
        console.log('Gateway came online, broadcasting config to all agents');
        this.broadcastAllAgentConfigs().catch(console.error);
      } else if (message.clientType === 'agent') {
        // Agent came online - notify all Gateways so they can update their peer list
        console.log('Agent came online, broadcasting config to all gateways');
        this.broadcastGatewayConfig().catch(console.error);
      }
    } catch (error) {
      console.error('Auth error:', error);
      this.send(ws, {
        type: 'auth_error' as MessageType.AUTH_ERROR,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
      ws.close();
    }
  }

  private handlePing(ws: WebSocket) {
    this.send(ws, {
      type: 'pong' as MessageType.PONG,
      timestamp: Date.now(),
    });
  }

  private async handleStatusUpdate(ws: WebSocket, message: any) {
    console.log('Status update:', message.status);

    // Find client
    const client = Array.from(this.clients.values()).find((c) => c.ws === ws);
    if (!client) return;

    // Update last seen
    client.lastSeen = new Date();

    // Update database status
    if (client.type === 'gateway') {
      await db
        .update(gateways)
        .set({
          status: message.status,
          lastSeenAt: new Date(),
        })
        .where(eq(gateways.id, client.id));
    } else {
      await db
        .update(agents)
        .set({
          status: message.status,
          lastSeenAt: new Date(),
        })
        .where(eq(agents.id, client.id));
    }
  }

  private send(ws: WebSocket, message: any) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, error: string) {
    this.send(ws, {
      type: 'error' as MessageType.ERROR,
      timestamp: Date.now(),
      error,
    });
  }

  private async removeClient(ws: WebSocket) {
    const client = Array.from(this.clients.entries()).find(
      ([_, c]) => c.ws === ws
    );

    if (client) {
      const [clientId, clientInfo] = client;
      console.log(`Removing client ${clientId} (${clientInfo.type})`);

      // Update status to offline
      if (clientInfo.type === 'gateway') {
        await db.update(gateways)
          .set({ status: 'offline' })
          .where(eq(gateways.id, clientId))
          .catch(console.error);

        // Gateway went offline - notify all Agents so they can update their peer list
        console.log('Gateway went offline, broadcasting config to all agents');
        this.broadcastAllAgentConfigs().catch(console.error);
      } else {
        await db.update(agents)
          .set({ status: 'offline' })
          .where(eq(agents.id, clientId))
          .catch(console.error);

        // Agent went offline - notify all Gateways so they can update their peer list
        console.log('Agent went offline, broadcasting config to all gateways');
        this.broadcastGatewayConfig().catch(console.error);
      }

      this.clients.delete(clientId);
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeout = 60000; // 60 seconds

      this.clients.forEach((client, clientId) => {
        if (now - client.lastSeen.getTime() > timeout) {
          console.log(`Client ${clientId} timed out`);
          client.ws.close();
          this.clients.delete(clientId);
        }
      });
    }, 30000); // Check every 30 seconds
  }

  public close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.wss.close();
  }

  /**
   * Broadcast configuration update to all clients of a specific type
   */
  public async broadcastConfig(clientType: 'gateway' | 'agent') {
    console.log(`Broadcasting config to all ${clientType}s`);

    this.clients.forEach((client) => {
      if (client.type === clientType && client.authenticated) {
        // TODO: Generate and send configuration
        console.log(`Sending config to ${client.id}`);
      }
    });
  }

  /**
   * Send configuration to a specific client
   */
  public async sendConfigToClient(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) {
      console.log(`Client ${clientId} not connected`);
      return;
    }

    console.log(`Sending config to ${clientId}`);

    try {
      if (client.type === 'gateway') {
        await this.sendGatewayConfig(clientId, client.ws);
      } else if (client.type === 'agent') {
        await this.sendAgentConfig(clientId, client.ws);
      }
    } catch (error) {
      console.error(`Failed to send config to ${clientId}:`, error);
    }
  }

  /**
   * Send configuration to all connected Gateways
   */
  public async broadcastGatewayConfig(): Promise<void> {
    console.log('Broadcasting Gateway config to all connected gateways');

    for (const [clientId, client] of this.clients.entries()) {
      if (client.type !== 'gateway' || !client.authenticated) continue;
      try {
        await this.sendGatewayConfig(clientId, client.ws);
      } catch (error) {
        console.error(`Failed to send Gateway config to ${clientId}:`, error);
      }
    }
  }

  /**
   * Send configuration to a specific Agent
   */
  public async broadcastAgentConfig(agentId: string): Promise<void> {
    console.log(`Broadcasting Agent config to agent ${agentId}`);

    const client = this.clients.get(agentId);
    if (!client || client.type !== 'agent' || !client.authenticated) {
      console.log(`Agent ${agentId} not connected; skipping config push`);
      return;
    }

    try {
      await this.sendAgentConfig(agentId, client.ws);
    } catch (error) {
      console.error(`Failed to send Agent config to ${agentId}:`, error);
    }
  }

  /**
   * Send configuration to all connected Agents
   */
  public async broadcastAllAgentConfigs(): Promise<void> {
    console.log('Broadcasting Agent config to all connected agents');

    for (const [clientId, client] of this.clients.entries()) {
      if (client.type !== 'agent' || !client.authenticated) continue;
      try {
        await this.sendAgentConfig(clientId, client.ws);
      } catch (error) {
        console.error(`Failed to send Agent config to ${clientId}:`, error);
      }
    }
  }

  /**
   * Send configuration to a Gateway
   * Gateway needs:
   * - List of agents with their WireGuard public keys and AllowedIPs (agent IPs from tunnels)
   * - List of tunnels with this gateway's specific IP for each tunnel
   */
  public async sendGatewayConfig(gatewayId: string, ws: WebSocket) {
    // Get all agents
    const allAgents = await db.select().from(agents);

    // Get all tunnels
    const allTunnels = await db.select().from(tunnels);

    // Get this gateway's IPs for all tunnels
    const gatewayIps = await db
      .select()
      .from(tunnelGatewayIps)
      .where(eq(tunnelGatewayIps.gatewayId, gatewayId));

    // Create a map of tunnelId -> this gateway's IP
    const gatewayIpByTunnel = new Map(gatewayIps.map(ip => [ip.tunnelId, ip.ip]));

    // Build agent list with WireGuard info (only online agents)
    // Each agent's AllowedIPs should be the agentIPs of its tunnels
    const agentList = allAgents
      .filter((agent) => agent.status === 'online') // Only include online agents
      .map((agent) => {
        // Get all tunnels for this agent and collect their agentIPs
        const agentTunnels = allTunnels.filter(t => t.agentId === agent.id);
        const allowedIPs = agentTunnels
          .filter(t => t.agentIp)
          .map(t => `${t.agentIp}/32`);

        return {
          id: agent.id,
          name: agent.name,
          wireguardPublicKey: agent.wireguardPublicKey,
          allowedIPs, // List of /32 IPs for WireGuard peer config
        };
      });

    // Build tunnel list with network info (including this gateway's IP)
    const tunnelList = allTunnels.map((tunnel) => ({
      id: tunnel.id,
      domain: tunnel.domain,
      agentId: tunnel.agentId,
      target: tunnel.target,
      enabled: tunnel.enabled,
      subnet: tunnel.subnet,
      gatewayIp: gatewayIpByTunnel.get(tunnel.id) || null, // This gateway's IP for this tunnel
      agentIp: tunnel.agentIp,
    }));

    const config = {
      agents: agentList,
      tunnels: tunnelList,
    };

    this.send(ws, {
      type: 'config_update' as MessageType.CONFIG_UPDATE,
      timestamp: Date.now(),
      config,
    });

    console.log(`Sent Gateway config to ${gatewayId}`);
  }

  /**
   * Send configuration to an Agent
   * Agent needs:
   * - List of gateways with their WireGuard public keys, endpoints, and AllowedIPs (gateway IPs from tunnels)
   * - List of tunnels with all gateway IPs for each tunnel
   */
  public async sendAgentConfig(agentId: string, ws: WebSocket) {
    // Get agent info
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (agent.length === 0) {
      console.error(`Agent ${agentId} not found in database`);
      return;
    }

    const agentData = agent[0]!;

    // Get all gateways
    const allGateways = await db.select().from(gateways);

    // Get tunnels for this agent
    const agentTunnels = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.agentId, agentId));

    // Get all gateway IPs for this agent's tunnels
    const tunnelIds = agentTunnels.map(t => t.id);
    const allGatewayIps = tunnelIds.length > 0
      ? await db.select().from(tunnelGatewayIps)
      : [];

    // Filter to only this agent's tunnels
    const relevantGatewayIps = allGatewayIps.filter(ip => tunnelIds.includes(ip.tunnelId));

    // Group gateway IPs by tunnel
    const gatewayIpsByTunnel = new Map<string, Array<{ gatewayId: string; ip: string }>>();
    for (const ip of relevantGatewayIps) {
      if (!gatewayIpsByTunnel.has(ip.tunnelId)) {
        gatewayIpsByTunnel.set(ip.tunnelId, []);
      }
      gatewayIpsByTunnel.get(ip.tunnelId)!.push({ gatewayId: ip.gatewayId, ip: ip.ip });
    }

    // Get set of online gateway IDs for filtering
    const onlineGatewayIds = new Set(
      allGateways.filter(gw => gw.status === 'online').map(gw => gw.id)
    );

    // Collect all unique gateway IPs across all tunnels, grouped by gateway (only online)
    const gatewayIpsByGateway = new Map<string, string[]>();
    for (const ip of relevantGatewayIps) {
      if (!onlineGatewayIds.has(ip.gatewayId)) continue; // Skip offline gateways
      if (!gatewayIpsByGateway.has(ip.gatewayId)) {
        gatewayIpsByGateway.set(ip.gatewayId, []);
      }
      gatewayIpsByGateway.get(ip.gatewayId)!.push(`${ip.ip}/32`);
    }

    // Build gateway list with endpoint and AllowedIPs (only online gateways)
    const gatewayList = allGateways
      .filter((gw) => gw.status === 'online') // Only include online gateways
      .map((gw) => {
        const allowedIPs = gatewayIpsByGateway.get(gw.id) || [];

        return {
          id: gw.id,
          name: gw.name,
          publicIp: gw.publicIp,
          wireguardPublicKey: gw.wireguardPublicKey,
          endpoint: gw.publicIp ? `${gw.publicIp}:51820` : null,
          allowedIPs, // This gateway's IPs for WireGuard peer config
        };
      });

    // Build tunnel list with gateway IPs (only for online gateways)
    const tunnelList = agentTunnels.map((tunnel) => {
      const tunnelGatewayIpList = (gatewayIpsByTunnel.get(tunnel.id) || [])
        .filter(gip => onlineGatewayIds.has(gip.gatewayId)); // Only include online gateways

      return {
        id: tunnel.id,
        domain: tunnel.domain,
        target: tunnel.target,
        enabled: tunnel.enabled,
        subnet: tunnel.subnet,
        agentIp: tunnel.agentIp,
        gatewayIps: tunnelGatewayIpList, // Gateway IPs for this tunnel (online only)
      };
    });

    const config = {
      agent: {
        id: agentData.id,
        name: agentData.name,
        wireguardPublicKey: agentData.wireguardPublicKey,
      },
      gateways: gatewayList,
      tunnels: tunnelList,
    };

    this.send(ws, {
      type: 'config_update' as MessageType.CONFIG_UPDATE,
      timestamp: Date.now(),
      config,
    });

    console.log(`Sent Agent config to ${agentId}`, config);
  }
}
