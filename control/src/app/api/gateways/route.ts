import { NextRequest, NextResponse } from 'next/server';
import { db, gateways } from '@/lib/db';
import { createGatewaySchema } from '@/lib/utils/validation';
import { generateGatewayApiKey, allocateTunnelIpsForGateway } from '@/lib/utils';
import { getWebSocketServer } from '@/lib/ws';

/**
 * GET /api/gateways - List all gateways
 */
export async function GET() {
  try {
    const allGateways = await db.select().from(gateways);
    return NextResponse.json(allGateways);
  } catch (error) {
    console.error('Failed to fetch gateways:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gateways' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/gateways - Create a new gateway
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const validatedData = createGatewaySchema.parse(body);

    // Generate API key
    const apiKey = generateGatewayApiKey();

    // Insert gateway
    const newGateway = await db
      .insert(gateways)
      .values({
        name: validatedData.name,
        apiKey,
        publicIp: validatedData.publicIp ?? null,
        wireguardPublicKey: validatedData.wireguardPublicKey ?? null,
        region: validatedData.region ?? null,
        status: 'offline',
      })
      .returning();

    const createdGateway = newGateway[0];

    // Allocate IPs for this gateway in all existing tunnels
    if (createdGateway) {
      await allocateTunnelIpsForGateway(createdGateway.id);
    }

    // Broadcast updated config to all agents (they need to know about the new gateway)
    try {
      const wsServer = getWebSocketServer();
      if (wsServer) {
        await wsServer.broadcastAllAgentConfigs();
      }
    } catch (err) {
      console.error('Failed to broadcast gateway creation config:', err);
    }

    return NextResponse.json(createdGateway, { status: 201 });
  } catch (error) {
    console.error('Failed to create gateway:', error);

    if (error instanceof Error && 'issues' in error) {
      return NextResponse.json(
        { error: 'Validation failed', details: error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create gateway' },
      { status: 500 }
    );
  }
}
