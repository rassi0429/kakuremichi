import { NextRequest, NextResponse } from 'next/server';
import { db, agents } from '@/lib/db';
import { getWebSocketServer } from '@/lib/ws';
import { createAgentSchema } from '@/lib/utils/validation';
import { generateAgentApiKey, getNextSubnet, getVirtualIpFromSubnet } from '@/lib/utils';
import { eq } from 'drizzle-orm';

/**
 * GET /api/agents - List all agents
 */
export async function GET() {
  try {
    const allAgents = await db.select().from(agents);
    return NextResponse.json(allAgents);
  } catch (error) {
    console.error('Failed to fetch agents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agents - Create a new agent
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = createAgentSchema.parse(body);

    // Generate API key
    const apiKey = generateAgentApiKey();

    // Get next available subnet
    const subnet = await getNextSubnet();
    const virtualIp = getVirtualIpFromSubnet(subnet);

    // Insert agent
    const newAgent = await db
      .insert(agents)
      .values({
        name: validatedData.name,
        apiKey,
        wireguardPublicKey: validatedData.wireguardPublicKey ?? null,
        virtualIp,
        subnet,
        status: 'offline',
      })
      .returning();

    // Broadcast to all gateways so they learn about the new agent
    try {
      const wsServer = getWebSocketServer();
      if (wsServer) {
        await wsServer.broadcastGatewayConfig();
      } else {
        console.warn('WebSocket server not initialized; cannot broadcast agent creation config.');
      }
    } catch (err) {
      console.error('Failed to broadcast agent creation config:', err);
    }

    return NextResponse.json(newAgent[0], { status: 201 });
  } catch (error) {
    console.error('Failed to create agent:', error);

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
