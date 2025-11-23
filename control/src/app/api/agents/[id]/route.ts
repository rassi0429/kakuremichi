import { NextRequest, NextResponse } from 'next/server';
import { db, agents } from '@/lib/db';
import { wsServer } from '@/lib/ws';
import { eq } from 'drizzle-orm';

/**
 * GET /api/agents/:id - Get agent by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = await db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);

    if (agent.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json(agent[0]);
  } catch (error) {
    console.error('Failed to fetch agent:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agents/:id - Delete agent
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await db
      .delete(agents)
      .where(eq(agents.id, id))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Gateways need to drop this agent from their config
    try {
      await wsServer.broadcastGatewayConfig();
    } catch (err) {
      console.error('Failed to broadcast agent delete config:', err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json(
      { error: 'Failed to delete agent' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/agents/:id - Update agent status
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, lastSeenAt } = body;

    const updated = await db
      .update(agents)
      .set({
        ...(status && { status }),
        ...(lastSeenAt && { lastSeenAt: new Date(lastSeenAt) }),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Keep gateways up-to-date on agent status changes
    try {
      await wsServer.broadcastGatewayConfig();
    } catch (err) {
      console.error('Failed to broadcast agent update config:', err);
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error('Failed to update agent:', error);
    return NextResponse.json(
      { error: 'Failed to update agent' },
      { status: 500 }
    );
  }
}
