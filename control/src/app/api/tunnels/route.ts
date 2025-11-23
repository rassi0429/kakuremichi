import { NextRequest, NextResponse } from 'next/server';
import { db, tunnels, agents } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createTunnelSchema } from '@/lib/utils/validation';
import { eq } from 'drizzle-orm';

/**
 * GET /api/tunnels - List all tunnels
 */
export async function GET() {
  try {
    const allTunnels = await db
      .select({
        id: tunnels.id,
        domain: tunnels.domain,
        agentId: tunnels.agentId,
        target: tunnels.target,
        enabled: tunnels.enabled,
        description: tunnels.description,
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

    return NextResponse.json(allTunnels);
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

    // Insert tunnel
    const newTunnel = await db
      .insert(tunnels)
      .values({
        domain: validatedData.domain,
        agentId: validatedData.agentId,
        target: validatedData.target,
        description: validatedData.description,
        enabled: true,
      })
      .returning();

    const createdTunnel = newTunnel[0];

    // Push latest config to gateways and the target agent (if online)
    try {
      const wsServer = getWebSocketServer();
      await wsServer.broadcastGatewayConfig();
      if (createdTunnel?.agentId) {
        await wsServer.broadcastAgentConfig(createdTunnel.agentId);
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
