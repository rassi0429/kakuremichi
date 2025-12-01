import { NextRequest, NextResponse } from 'next/server';
import { db, tunnels, agents, tunnelGatewayIps, gateways } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createTunnelSchema, allocateTunnelSubnet, allocateGatewayIpsForTunnel } from '@/lib/utils';
import { eq } from 'drizzle-orm';

/**
 * GET /api/tunnels - List all tunnels with gateway IPs
 */
export async function GET() {
  try {
    // Get all tunnels with agent info
    const allTunnels = await db
      .select({
        id: tunnels.id,
        domain: tunnels.domain,
        agentId: tunnels.agentId,
        target: tunnels.target,
        enabled: tunnels.enabled,
        description: tunnels.description,
        subnet: tunnels.subnet,
        agentIp: tunnels.agentIp,
        createdAt: tunnels.createdAt,
        updatedAt: tunnels.updatedAt,
        agent: {
          id: agents.id,
          name: agents.name,
          status: agents.status,
        },
      })
      .from(tunnels)
      .leftJoin(agents, eq(tunnels.agentId, agents.id));

    // Get gateway IPs for all tunnels
    const allGatewayIps = await db
      .select({
        tunnelId: tunnelGatewayIps.tunnelId,
        gatewayId: tunnelGatewayIps.gatewayId,
        gatewayName: gateways.name,
        ip: tunnelGatewayIps.ip,
      })
      .from(tunnelGatewayIps)
      .innerJoin(gateways, eq(tunnelGatewayIps.gatewayId, gateways.id));

    // Group gateway IPs by tunnel
    const gatewayIpsByTunnel = new Map<string, Array<{ gatewayId: string; gatewayName: string; ip: string }>>();
    for (const ip of allGatewayIps) {
      if (!gatewayIpsByTunnel.has(ip.tunnelId)) {
        gatewayIpsByTunnel.set(ip.tunnelId, []);
      }
      gatewayIpsByTunnel.get(ip.tunnelId)!.push({
        gatewayId: ip.gatewayId,
        gatewayName: ip.gatewayName,
        ip: ip.ip,
      });
    }

    // Add gateway IPs to each tunnel
    const tunnelsWithGatewayIps = allTunnels.map(tunnel => ({
      ...tunnel,
      gatewayIps: gatewayIpsByTunnel.get(tunnel.id) || [],
    }));

    return NextResponse.json(tunnelsWithGatewayIps);
  } catch (error) {
    console.error('Failed to fetch tunnels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tunnels' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tunnels - Create a new tunnel
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = createTunnelSchema.parse(body);

    // Check if agent exists
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, validatedData.agentId))
      .limit(1);

    if (agent.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Allocate a new subnet for this tunnel
    const subnetAllocation = await allocateTunnelSubnet();

    // Insert tunnel with subnet allocation (no gatewayIp - it's in tunnel_gateway_ips now)
    const newTunnel = await db
      .insert(tunnels)
      .values({
        domain: validatedData.domain,
        agentId: validatedData.agentId,
        target: validatedData.target,
        description: validatedData.description,
        enabled: true,
        subnet: subnetAllocation.subnet,
        agentIp: subnetAllocation.agentIp,
      })
      .returning();

    const createdTunnel = newTunnel[0];

    // Allocate gateway IPs for all existing gateways
    if (createdTunnel) {
      await allocateGatewayIpsForTunnel(createdTunnel.id, subnetAllocation.subnet);
    }

    // Push latest config to gateways and the target agent (if online)
    try {
      const wsServer = getWebSocketServer();
      console.log('WebSocket server instance:', wsServer ? 'available' : 'NULL');
      if (wsServer) {
        console.log('Broadcasting config to gateways...');
        await wsServer.broadcastGatewayConfig();
        if (createdTunnel?.agentId) {
          console.log('Broadcasting config to agent:', createdTunnel.agentId);
          await wsServer.broadcastAgentConfig(createdTunnel.agentId);
        }
      } else {
        console.warn('WebSocket server not initialized, cannot broadcast config');
      }
    } catch (err) {
      console.error('Failed to broadcast tunnel creation config:', err);
    }

    return NextResponse.json(createdTunnel, { status: 201 });
  } catch (error) {
    console.error('Failed to create tunnel:', error);

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create tunnel' },
      { status: 500 }
    );
  }
}
