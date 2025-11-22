# Control - API Routes

## 概要

ControlサーバーのREST API実装。Next.js App Router（Route Handlers）を使用。

**パス**: `control/src/app/api/`

---

## ディレクトリ構成

```
control/src/app/api/
├── agents/
│   ├── route.ts              # GET /api/agents, POST /api/agents
│   └── [id]/
│       ├── route.ts          # GET /api/agents/:id, PATCH /api/agents/:id, DELETE /api/agents/:id
│       └── tunnels/
│           └── route.ts      # GET /api/agents/:id/tunnels
├── gateways/
│   ├── route.ts              # GET /api/gateways, POST /api/gateways
│   └── [id]/
│       └── route.ts          # GET /api/gateways/:id, DELETE /api/gateways/:id
├── tunnels/
│   ├── route.ts              # GET /api/tunnels, POST /api/tunnels
│   └── [id]/
│       └── route.ts          # GET /api/tunnels/:id, PATCH /api/tunnels/:id, DELETE /api/tunnels/:id
└── install/
    ├── agent.sh/
    │   └── route.ts          # GET /api/install/agent.sh
    └── gateway.sh/
        └── route.ts          # GET /api/install/gateway.sh
```

---

## Agent API

### POST /api/agents

新しいAgentを作成

**ファイル**: `control/src/app/api/agents/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAgent, getNextAvailableSubnet } from '@/lib/db/queries/agents';
import { generateWireGuardKeyPair } from '@/lib/wireguard/keygen';
import { generateApiKey } from '@/lib/utils/api-key';

// バリデーションスキーマ
const createAgentSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/),
});

export async function POST(request: NextRequest) {
  try {
    // リクエストボディをパース
    const body = await request.json();
    const { name } = createAgentSchema.parse(body);

    // WireGuard鍵ペア生成
    const { publicKey, privateKey } = generateWireGuardKeyPair();

    // API Key生成
    const apiKey = generateApiKey('agt');

    // サブネット自動割り当て
    const subnet = await getNextAvailableSubnet();
    const subnetNumber = parseInt(subnet.split('.')[1]);
    const virtualIp = `10.${subnetNumber}.0.100`;

    // Agent作成
    const agent = await createAgent({
      name,
      apiKey,
      wireguardPublicKey: publicKey,
      wireguardPrivateKey: privateKey,
      virtualIp,
      subnet,
    });

    // インストールコマンド生成
    const controlUrl = process.env.PUBLIC_URL || 'https://control.example.com';
    const installCommand = `curl -sSL ${controlUrl}/install/agent.sh | sh -s -- --api-key=${apiKey} --control-url=${controlUrl}`;

    return NextResponse.json(
      {
        ...agent,
        installCommand,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    console.error('Failed to create agent:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create agent',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const agents = await getAllAgents(status ? { status } : undefined);

    return NextResponse.json({
      agents,
      total: agents.length,
    });
  } catch (error) {
    console.error('Failed to get agents:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get agents',
        },
      },
      { status: 500 }
    );
  }
}
```

---

### GET /api/agents/:id

特定のAgent詳細を取得

**ファイル**: `control/src/app/api/agents/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAgentById, updateAgent, deleteAgent } from '@/lib/db/queries/agents';
import { z } from 'zod';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await getAgentById(params.id);

    if (!agent) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Agent not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(agent);
  } catch (error) {
    console.error('Failed to get agent:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get agent',
        },
      },
      { status: 500 }
    );
  }
}

const updateAgentSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data = updateAgentSchema.parse(body);

    const agent = await getAgentById(params.id);
    if (!agent) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Agent not found' } },
        { status: 404 }
      );
    }

    const updated = await updateAgent(params.id, data);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    console.error('Failed to update agent:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update agent' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await getAgentById(params.id);
    if (!agent) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Agent not found' } },
        { status: 404 }
      );
    }

    await deleteAgent(params.id);

    return NextResponse.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Failed to delete agent:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete agent' } },
      { status: 500 }
    );
  }
}
```

---

## Tunnel API

### POST /api/tunnels

新しいTunnelを作成

**ファイル**: `control/src/app/api/tunnels/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createTunnel, getAllTunnels } from '@/lib/db/queries/tunnels';
import { getAgentById } from '@/lib/db/queries/agents';
import { getWebSocketServer } from '@/lib/ws';

const createTunnelSchema = z.object({
  domain: z.string().regex(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
  agentId: z.string().uuid(),
  target: z.string().regex(/^[a-zA-Z0-9.-]+:\d+$/),
  description: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = createTunnelSchema.parse(body);

    // Agentの存在確認
    const agent = await getAgentById(data.agentId);
    if (!agent) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Agent not found',
          },
        },
        { status: 404 }
      );
    }

    // Tunnel作成
    const tunnel = await createTunnel(data);

    // WebSocket経由でブロードキャスト
    const wsServer = getWebSocketServer();
    await wsServer.broadcastTunnelCreate({
      ...tunnel,
      agentVirtualIp: agent.virtualIp,
    });

    return NextResponse.json(tunnel, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    // ドメイン重複エラー
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE',
            message: 'Domain already exists',
          },
        },
        { status: 400 }
      );
    }

    console.error('Failed to create tunnel:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create tunnel',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    const tunnels = await getAllTunnels(agentId ? { agentId } : undefined);

    return NextResponse.json({
      tunnels,
      total: tunnels.length,
    });
  } catch (error) {
    console.error('Failed to get tunnels:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to get tunnels' } },
      { status: 500 }
    );
  }
}
```

---

### PATCH /api/tunnels/:id

Tunnelを更新

**ファイル**: `control/src/app/api/tunnels/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTunnelById, updateTunnel, deleteTunnel } from '@/lib/db/queries/tunnels';
import { getWebSocketServer } from '@/lib/ws';

const updateTunnelSchema = z.object({
  target: z.string().regex(/^[a-zA-Z0-9.-]+:\d+$/).optional(),
  enabled: z.boolean().optional(),
  description: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const data = updateTunnelSchema.parse(body);

    const tunnel = await getTunnelById(params.id);
    if (!tunnel) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tunnel not found' } },
        { status: 404 }
      );
    }

    const updated = await updateTunnel(params.id, data);

    // WebSocket経由でブロードキャスト
    const wsServer = getWebSocketServer();
    await wsServer.broadcastTunnelUpdate(updated);

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors,
          },
        },
        { status: 400 }
      );
    }

    console.error('Failed to update tunnel:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update tunnel' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tunnel = await getTunnelById(params.id);
    if (!tunnel) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tunnel not found' } },
        { status: 404 }
      );
    }

    await deleteTunnel(params.id);

    // WebSocket経由でブロードキャスト
    const wsServer = getWebSocketServer();
    await wsServer.broadcastTunnelDelete(params.id, tunnel.agentId);

    return NextResponse.json({ message: 'Tunnel deleted successfully' });
  } catch (error) {
    console.error('Failed to delete tunnel:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to delete tunnel' } },
      { status: 500 }
    );
  }
}
```

---

## ユーティリティ関数

### WireGuard鍵ペア生成

**ファイル**: `control/src/lib/wireguard/keygen.ts`

```typescript
import { execSync } from 'child_process';

export function generateWireGuardKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  // wg genkey | tee privatekey | wg pubkey
  const privateKey = execSync('wg genkey')
    .toString()
    .trim();

  const publicKey = execSync(`echo "${privateKey}" | wg pubkey`)
    .toString()
    .trim();

  return { publicKey, privateKey };
}
```

**注**: 本番環境では、ライブラリ（例: `wireguard-tools` npmパッケージ）を使用することを推奨。

---

### API Key生成

**ファイル**: `control/src/lib/utils/api-key.ts`

```typescript
import crypto from 'crypto';

export function generateApiKey(prefix: 'agt' | 'gtw'): string {
  const randomBytes = crypto.randomBytes(24);
  const key = randomBytes.toString('base64url');
  return `${prefix}_${key}`;
}
```

---

## エラーハンドリングミドルウェア

共通エラーハンドラー

**ファイル**: `control/src/lib/api/error-handler.ts`

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';

export function handleApiError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.errors,
        },
      },
      { status: 400 }
    );
  }

  if (error instanceof Error) {
    if (error.message.includes('UNIQUE constraint')) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE',
            message: 'Resource already exists',
          },
        },
        { status: 400 }
      );
    }

    if (error.message.includes('NOT_FOUND')) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
          },
        },
        { status: 404 }
      );
    }
  }

  console.error('API Error:', error);
  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    },
    { status: 500 }
  );
}
```

**使用例**:
```typescript
export async function POST(request: NextRequest) {
  try {
    // API処理...
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

## テスト

```typescript
// control/tests/api/agents.test.ts

import { describe, it, expect, beforeEach } from 'vitest';

describe('POST /api/agents', () => {
  beforeEach(async () => {
    // テストDB初期化
  });

  it('should create agent with valid data', async () => {
    const response = await fetch('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent' }),
    });

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.name).toBe('test-agent');
    expect(data.apiKey).toMatch(/^agt_/);
    expect(data.virtualIp).toMatch(/^10\.\d+\.0\.100$/);
  });

  it('should reject invalid name', async () => {
    const response = await fetch('http://localhost:3000/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'invalid name!' }),
    });

    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error.code).toBe('VALIDATION_ERROR');
  });
});
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
