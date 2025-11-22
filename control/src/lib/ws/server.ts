import { WebSocketServer, WebSocket } from 'ws';
import { db, agents, gateways, tunnels } from '../db';
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

  constructor(port: number = 3001) {
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    console.log(`WebSocket server listening on port ${port}`);
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

        clientId = gateway[0].id;

        // Update last seen
        await db
          .update(gateways)
          .set({
            status: 'online',
            lastSeenAt: new Date(),
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

        clientId = agent[0].id;

        // Calculate virtualIp from subnet (always .100 in the agent's subnet)
        // Example: "10.1.0.0/24" -> "10.1.0.100"
        let virtualIp: string | null = null;
        if (agent[0].subnet) {
          const subnetMatch = agent[0].subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
          if (subnetMatch) {
            virtualIp = `${subnetMatch[1]}.100`;
          }
        }

        // Update agent with publicKey and calculated virtualIp
        await db
          .update(agents)
          .set({
            status: 'online',
            lastSeenAt: new Date(),
            wireguardPublicKey: message.publicKey,
            virtualIp: virtualIp,
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

      // Send initial configuration
      await this.sendConfigToClient(clientId);
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

  private removeClient(ws: WebSocket) {
    const client = Array.from(this.clients.entries()).find(
      ([_, c]) => c.ws === ws
    );

    if (client) {
      const [clientId, clientInfo] = client;
      console.log(`Removing client ${clientId}`);

      // Update status to offline
      if (clientInfo.type === 'gateway') {
        db.update(gateways)
          .set({ status: 'offline' })
          .where(eq(gateways.id, clientId))
          .catch(console.error);
      } else {
        db.update(agents)
          .set({ status: 'offline' })
          .where(eq(agents.id, clientId))
          .catch(console.error);
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
   * Send configuration to a Gateway
   */
  private async sendGatewayConfig(gatewayId: string, ws: WebSocket) {
    // Get all agents
    const allAgents = await db.select().from(agents);

    // Get all tunnels
    const allTunnels = await db.select().from(tunnels);

    // Build agent list with WireGuard info
    const agentList = allAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      wireguardPublicKey: agent.wireguardPublicKey,
      subnet: agent.subnet,
      virtualIP: agent.virtualIp,  // Fixed: use virtualIp not virtualIP
    }));

    // Build tunnel list with agent info
    const tunnelList = allTunnels.map((tunnel) => ({
      id: tunnel.id,
      domain: tunnel.domain,
      agentId: tunnel.agentId,
      target: tunnel.target,
      enabled: tunnel.enabled,
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
   */
  private async sendAgentConfig(agentId: string, ws: WebSocket) {
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

    const agentData = agent[0];

    // Get all gateways
    const allGateways = await db.select().from(gateways);

    // Build gateway list with endpoint
    const gatewayList = allGateways.map((gw) => ({
      id: gw.id,
      name: gw.name,
      publicIp: gw.publicIp,  // Fixed: use publicIp not publicIP
      wireguardPublicKey: gw.wireguardPublicKey,
      endpoint: `${gw.publicIp}:51820`,  // Fixed: use publicIp not publicIP
    }));

    // Get tunnels for this agent
    const agentTunnels = await db
      .select()
      .from(tunnels)
      .where(eq(tunnels.agentId, agentId));

    const tunnelList = agentTunnels.map((tunnel) => ({
      id: tunnel.id,
      domain: tunnel.domain,
      target: tunnel.target,
      enabled: tunnel.enabled,
    }));

    const config = {
      agent: {
        id: agentData.id,
        name: agentData.name,
        virtualIp: agentData.virtualIp,  // Fixed: use virtualIp not virtualIP
        subnet: agentData.subnet,
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
