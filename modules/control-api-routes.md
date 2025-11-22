# Control - API Routes

## 概要

ControlサーバーのREST API実装。Next.js App Router（Route Handlers）を使用。

**パス**: `control/src/app/api/`

---

## ディレクトリ構成

```
control/src/app/api/
├── auth/
│   ├── login/
│   │   └── route.ts          # POST /api/auth/login
│   ├── logout/
│   │   └── route.ts          # POST /api/auth/logout
│   └── me/
│       └── route.ts          # GET /api/auth/me
├── agents/
│   ├── route.ts              # GET /api/agents, POST /api/agents (認証必須)
│   └── [id]/
│       ├── route.ts          # GET /api/agents/:id, PATCH /api/agents/:id, DELETE /api/agents/:id (認証必須)
│       └── tunnels/
│           └── route.ts      # GET /api/agents/:id/tunnels (認証必須)
├── gateways/
│   ├── route.ts              # GET /api/gateways, POST /api/gateways (認証必須)
│   └── [id]/
│       └── route.ts          # GET /api/gateways/:id, DELETE /api/gateways/:id (認証必須)
├── tunnels/
│   ├── route.ts              # GET /api/tunnels, POST /api/tunnels (認証必須)
│   └── [id]/
│       └── route.ts          # GET /api/tunnels/:id, PATCH /api/tunnels/:id, DELETE /api/tunnels/:id (認証必須)
└── install/
    ├── agent.sh/
    │   └── route.ts          # GET /api/install/agent.sh (認証不要 - スクリプトダウンロード)
    └── gateway.sh/
        └── route.ts          # GET /api/install/gateway.sh (認証不要 - スクリプトダウンロード)
```

---

## 認証ミドルウェア

すべての管理APIは認証が必須です（install/配下を除く）。

### Session管理

**ファイル**: `control/src/lib/auth/session.ts`

```typescript
import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  authenticated: boolean;
  role: 'admin';
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: 'kakuremichi-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function requireAuth(): Promise<void> {
  const session = await getSession();
  if (!session.authenticated) {
    throw new Error('UNAUTHORIZED');
  }
}
```

---

### 認証チェックヘルパー

**ファイル**: `control/src/lib/auth/middleware.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from './session';

export async function withAuth(
  handler: (request: NextRequest, ...args: any[]) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: any[]) => {
    try {
      await requireAuth();
      return handler(request, ...args);
    } catch (error) {
      if (error instanceof Error && error.message === 'UNAUTHORIZED') {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 }
        );
      }
      throw error;
    }
  };
}
```

---

## 認証 API

### POST /api/auth/login

管理者ログイン

**ファイル**: `control/src/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = loginSchema.parse(body);

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD not set');
      return NextResponse.json(
        { error: { code: 'CONFIG_ERROR', message: 'Server misconfigured' } },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid password' } },
        { status: 401 }
      );
    }

    // Session作成
    const session = await getSession();
    session.authenticated = true;
    session.role = 'admin';
    await session.save();

    return NextResponse.json({
      success: true,
      message: 'Logged in successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.errors } },
        { status: 400 }
      );
    }

    console.error('Login error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Login failed' } },
      { status: 500 }
    );
  }
}
```

---

### POST /api/auth/logout

ログアウト

**ファイル**: `control/src/app/api/auth/logout/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function POST() {
  try {
    const session = await getSession();
    session.destroy();

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Logout failed' } },
      { status: 500 }
    );
  }
}
```

---

### GET /api/auth/me

現在の認証状態確認

**ファイル**: `control/src/app/api/auth/me/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();

    if (!session.authenticated) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      role: session.role,
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Auth check failed' } },
      { status: 500 }
    );
  }
}
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
import { requireAuth } from '@/lib/auth/session';

// バリデーションスキーマ
const createAgentSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/),
});

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    await requireAuth();

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
    // 認証エラー
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

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
    // 認証チェック
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const agents = await getAllAgents(status ? { status } : undefined);

    return NextResponse.json({
      agents,
      total: agents.length,
    });
  } catch (error) {
    // 認証エラー
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

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

**方針1: Pure JavaScriptライブラリ使用（推奨）**

```typescript
import crypto from 'crypto';

/**
 * Curve25519鍵ペアを生成
 * WireGuardはCurve25519を使用
 */
export function generateWireGuardKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  // 秘密鍵生成（32 bytes random）
  const privateKeyBytes = crypto.randomBytes(32);

  // Curve25519 clamping（WireGuard仕様）
  privateKeyBytes[0] &= 248;
  privateKeyBytes[31] &= 127;
  privateKeyBytes[31] |= 64;

  // Base64エンコード
  const privateKey = privateKeyBytes.toString('base64');

  // 公開鍵生成（Curve25519）
  // Node.js組み込みのcrypto.diffieHellmanを使用
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(privateKeyBytes);
  const publicKeyBytes = ecdh.getPublicKey();

  // 注: より正確な実装には @noble/curves を推奨
  // import { x25519 } from '@noble/curves/ed25519';
  // const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);

  const publicKey = publicKeyBytes.toString('base64');

  return { publicKey, privateKey };
}
```

**依存パッケージ**:
```bash
npm install @noble/curves
```

**推奨実装（@noble/curves使用）**:
```typescript
import crypto from 'crypto';
import { x25519 } from '@noble/curves/ed25519';

export function generateWireGuardKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  // 秘密鍵生成（32 bytes random）
  const privateKeyBytes = crypto.randomBytes(32);

  // Curve25519 clamping
  privateKeyBytes[0] &= 248;
  privateKeyBytes[31] &= 127;
  privateKeyBytes[31] |= 64;

  // 公開鍵生成
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);

  return {
    privateKey: Buffer.from(privateKeyBytes).toString('base64'),
    publicKey: Buffer.from(publicKeyBytes).toString('base64'),
  };
}
```

---

**方針2: wireguard-toolsへの外部依存（非推奨）**

```typescript
import { execSync } from 'child_process';

export function generateWireGuardKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  try {
    const privateKey = execSync('wg genkey').toString().trim();
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`).toString().trim();
    return { publicKey, privateKey };
  } catch (error) {
    throw new Error(
      'wireguard-tools not found. Install with: apt-get install wireguard-tools'
    );
  }
}
```

**Dockerfile対応**:
```dockerfile
FROM node:22-alpine

# wireguard-toolsインストール
RUN apk add --no-cache wireguard-tools

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

CMD ["npm", "start"]
```

**注意**:
- 方針1（Pure JavaScript）を推奨
- 外部依存がなく、ビルド環境に依存しない
- Dockerコンテナサイズも削減

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
