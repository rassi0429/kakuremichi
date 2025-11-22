# Control - WebSocketサーバー

## 概要

ControlサーバーのWebSocketサーバー実装。Agent/Gatewayとのリアルタイム通信を担当。

**パス**: `control/src/lib/ws/server.ts`

---

## 責務

1. Agent/Gatewayからの接続を受け付ける
2. API Key認証
3. メッセージのルーティング
4. 設定の配信（config, tunnel_create, tunnel_update, tunnel_delete）
5. ハートビート監視
6. 接続状態の管理（online/offline）

---

## 依存

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { db } from '../db';
import { agents, gateways } from '../db/schema';
import { eq } from 'drizzle-orm';
```

---

## 型定義

```typescript
// types.ts
export type ClientType = 'agent' | 'gateway';

export type Client = {
  id: string;              // Agent/Gateway ID
  type: ClientType;        // agent or gateway
  ws: WebSocket;
  apiKey: string;
  authenticated: boolean;
  lastHeartbeat: number;
};

export type Message = {
  type: string;
  data: any;
};

// Agent → Control メッセージ
export type AgentMessage =
  | { type: 'auth'; data: { apiKey: string } }
  | { type: 'heartbeat'; data: { timestamp: number } }
  | { type: 'status'; data: { tunnels: Array<{ domain: string; status: string }> } };

// Gateway → Control メッセージ
export type GatewayMessage =
  | { type: 'auth'; data: { apiKey: string; publicIp: string } }
  | { type: 'heartbeat'; data: { timestamp: number } }
  | { type: 'certificate_obtained'; data: { domain: string; certificate: string; privateKey: string; expiresAt: string } };

// Control → Agent/Gateway メッセージ
export type ControlMessage =
  | { type: 'auth_success'; data: { agentId?: string; gatewayId?: string; message: string } }
  | { type: 'auth_error'; data: { message: string } }
  | { type: 'config'; data: any }
  | { type: 'tunnel_create'; data: any }
  | { type: 'tunnel_update'; data: any }
  | { type: 'tunnel_delete'; data: { id: string } }
  | { type: 'error'; data: { code: string; message: string } };
```

---

## クラス設計

```typescript
export class WSServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.setupServer();
    this.startHeartbeatMonitor();
  }

  private setupServer(): void {
    this.wss.on('connection', this.handleConnection.bind(this));
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    // クエリパラメータからapiKeyとtypeを取得
    // 一時的なClientオブジェクトを作成
    // メッセージハンドラーをセットアップ
    // 切断ハンドラーをセットアップ
  }

  private async handleMessage(client: Client, message: string): Promise<void> {
    // メッセージをパース
    // 認証チェック
    // メッセージタイプに応じてルーティング
  }

  private async handleAuth(client: Client, data: any): Promise<void> {
    // API Key検証
    // DB照会（agents/gateways）
    // 認証成功/失敗メッセージ送信
    // 認証成功なら設定を送信
  }

  private async handleHeartbeat(client: Client, data: any): Promise<void> {
    // lastHeartbeatを更新
    // DBのlast_seen_atを更新
  }

  private async sendConfig(client: Client): Promise<void> {
    // clientのtypeに応じて設定を取得
    // Agent: gateways, tunnels
    // Gateway: agents, tunnels, certificates
    // configメッセージとして送信
  }

  public async broadcastTunnelCreate(tunnel: any): Promise<void> {
    // 対象のAgentに送信
    // 全Gatewayに送信
  }

  public async broadcastTunnelUpdate(tunnel: any): Promise<void> {
    // 対象のAgentに送信
    // 全Gatewayに送信
  }

  public async broadcastTunnelDelete(tunnelId: string, agentId: string): Promise<void> {
    // 対象のAgentに送信
    // 全Gatewayに送信
  }

  private startHeartbeatMonitor(): void {
    // 30秒ごとにチェック
    // 60秒以上ハートビートがないクライアントを切断
    // DBのstatusをofflineに更新
  }

  private handleDisconnect(client: Client): void {
    // clientsから削除
    // DBのstatusをofflineに更新
  }

  public getConnectedClients(): Client[] {
    return Array.from(this.clients.values());
  }

  public close(): void {
    // すべての接続を閉じる
    // ハートビートモニターを停止
    // WebSocketサーバーを停止
  }
}
```

---

## 主要メソッド詳細

### `handleAuth(client, data)`

**処理フロー**:
1. API Keyを検証
2. clientのtypeに応じてDB照会:
   - `agent`: `agents`テーブル
   - `gateway`: `gateways`テーブル
3. レコードが存在しない場合、`auth_error`を送信
4. レコードが存在する場合:
   - `client.id`にAgent/Gateway IDをセット
   - `client.authenticated = true`
   - `clients`マップに追加
   - DBの`status`を`online`、`last_seen_at`を現在時刻に更新
   - `auth_success`メッセージを送信
   - `sendConfig(client)`を呼び出して設定を送信

**サンプルコード**:
```typescript
private async handleAuth(client: Client, data: { apiKey: string; publicIp?: string }): Promise<void> {
  const { apiKey } = data;

  try {
    let record;
    if (client.type === 'agent') {
      record = await db.query.agents.findFirst({
        where: eq(agents.apiKey, apiKey),
      });
    } else {
      record = await db.query.gateways.findFirst({
        where: eq(gateways.apiKey, apiKey),
      });
    }

    if (!record) {
      this.send(client, {
        type: 'auth_error',
        data: { message: 'Invalid API key' },
      });
      client.ws.close();
      return;
    }

    // 認証成功
    client.id = record.id;
    client.authenticated = true;
    this.clients.set(client.id, client);

    // DBステータス更新
    const now = new Date();
    if (client.type === 'agent') {
      await db.update(agents)
        .set({ status: 'online', lastSeenAt: now, updatedAt: now })
        .where(eq(agents.id, record.id));
    } else {
      // Gatewayの場合、publicIpも更新
      await db.update(gateways)
        .set({ status: 'online', publicIp: data.publicIp || record.publicIp, lastSeenAt: now, updatedAt: now })
        .where(eq(gateways.id, record.id));
    }

    // 認証成功メッセージ
    this.send(client, {
      type: 'auth_success',
      data: {
        [client.type === 'agent' ? 'agentId' : 'gatewayId']: record.id,
        message: 'Authentication successful',
      },
    });

    // 設定を送信
    await this.sendConfig(client);
  } catch (error) {
    console.error('Auth error:', error);
    this.send(client, {
      type: 'auth_error',
      data: { message: 'Internal server error' },
    });
    client.ws.close();
  }
}
```

---

### `sendConfig(client)`

**処理フロー**:
1. clientのtypeに応じて設定を取得
2. Agentの場合:
   - Agent自身の情報（id, name, virtualIp, subnet, wireguardPrivateKey）
   - 全Gatewayの情報（id, name, publicIp, wireguardPublicKey, virtualIps）
   - このAgentに紐づくTunnelの一覧
3. Gatewayの場合:
   - Gateway自身の情報（id, name, wireguardPrivateKey）
   - 全Agentの情報（id, name, virtualIp, subnet, wireguardPublicKey）
   - 全Tunnelの情報（domain, agentVirtualIp, target, enabled）
   - 全証明書の情報
4. `config`メッセージとして送信

**サンプルコード**:
```typescript
private async sendConfig(client: Client): Promise<void> {
  if (client.type === 'agent') {
    // Agent用の設定
    const agent = await db.query.agents.findFirst({
      where: eq(agents.id, client.id),
    });

    const gatewayList = await db.query.gateways.findMany();

    const tunnelList = await db.query.tunnels.findMany({
      where: eq(tunnels.agentId, client.id),
    });

    this.send(client, {
      type: 'config',
      data: {
        agent: {
          id: agent.id,
          name: agent.name,
          virtualIp: agent.virtualIp,
          subnet: agent.subnet,
          wireguardPrivateKey: agent.wireguardPrivateKey,
        },
        gateways: gatewayList.map(gw => ({
          id: gw.id,
          name: gw.name,
          publicIp: gw.publicIp,
          wireguardPublicKey: gw.wireguardPublicKey,
          virtualIps: this.getGatewayVirtualIps(gw.id), // 各Agentサブネット内のIP
        })),
        tunnels: tunnelList.map(t => ({
          id: t.id,
          domain: t.domain,
          target: t.target,
          enabled: t.enabled,
        })),
      },
    });
  } else {
    // Gateway用の設定
    const gateway = await db.query.gateways.findFirst({
      where: eq(gateways.id, client.id),
    });

    const agentList = await db.query.agents.findMany();
    const tunnelList = await db.query.tunnels.findMany();
    const certList = await db.query.certificates.findMany();

    this.send(client, {
      type: 'config',
      data: {
        gateway: {
          id: gateway.id,
          name: gateway.name,
          wireguardPrivateKey: gateway.wireguardPrivateKey,
        },
        agents: agentList.map(a => ({
          id: a.id,
          name: a.name,
          virtualIp: a.virtualIp,
          subnet: a.subnet,
          wireguardPublicKey: a.wireguardPublicKey,
        })),
        tunnels: tunnelList.map(t => {
          const agent = agentList.find(a => a.id === t.agentId);
          return {
            id: t.id,
            domain: t.domain,
            agentVirtualIp: agent?.virtualIp,
            target: t.target,
            enabled: t.enabled,
          };
        }),
        certificates: certList.map(c => ({
          domain: c.domain,
          certificate: c.certificate,
          privateKey: c.privateKey,
          expiresAt: c.expiresAt,
        })),
      },
    });
  }
}
```

---

### `broadcastTunnelCreate(tunnel)`

**処理フロー**:
1. 対象のAgentに`tunnel_create`メッセージを送信
2. 全Gatewayに`tunnel_create`メッセージを送信

**サンプルコード**:
```typescript
public async broadcastTunnelCreate(tunnel: any): Promise<void> {
  // Agentに送信
  const agentClient = this.clients.get(tunnel.agentId);
  if (agentClient && agentClient.authenticated) {
    this.send(agentClient, {
      type: 'tunnel_create',
      data: {
        id: tunnel.id,
        domain: tunnel.domain,
        target: tunnel.target,
        enabled: tunnel.enabled,
      },
    });
  }

  // 全Gatewayに送信
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, tunnel.agentId),
  });

  for (const client of this.clients.values()) {
    if (client.type === 'gateway' && client.authenticated) {
      this.send(client, {
        type: 'tunnel_create',
        data: {
          id: tunnel.id,
          domain: tunnel.domain,
          agentVirtualIp: agent?.virtualIp,
          target: tunnel.target,
          enabled: tunnel.enabled,
        },
      });
    }
  }
}
```

---

## エントリーポイント

```typescript
// control/src/lib/ws/index.ts
import { WSServer } from './server';

export let wsServer: WSServer | null = null;

export function startWebSocketServer(port: number = 3001): WSServer {
  if (wsServer) {
    throw new Error('WebSocket server already running');
  }

  wsServer = new WSServer(port);
  console.log(`WebSocket server listening on port ${port}`);

  return wsServer;
}

export function getWebSocketServer(): WSServer {
  if (!wsServer) {
    throw new Error('WebSocket server not started');
  }
  return wsServer;
}
```

---

## 使用例（API Routesから）

```typescript
// control/src/app/api/tunnels/route.ts
import { getWebSocketServer } from '@/lib/ws';

export async function POST(req: Request) {
  // Tunnel作成処理...
  const tunnel = await db.insert(tunnels).values(data).returning();

  // WebSocket経由でブロードキャスト
  const wsServer = getWebSocketServer();
  await wsServer.broadcastTunnelCreate(tunnel[0]);

  return Response.json(tunnel[0], { status: 201 });
}
```

---

## テスト

```typescript
// control/tests/unit/ws/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WSServer } from '@/lib/ws/server';
import WebSocket from 'ws';

describe('WSServer', () => {
  let server: WSServer;

  beforeEach(() => {
    server = new WSServer(3002);
  });

  afterEach(() => {
    server.close();
  });

  it('should accept connections', async () => {
    const client = new WebSocket('ws://localhost:3002');
    await new Promise(resolve => client.on('open', resolve));
    expect(client.readyState).toBe(WebSocket.OPEN);
    client.close();
  });

  it('should authenticate agent with valid API key', async () => {
    // テストコード...
  });

  it('should reject invalid API key', async () => {
    // テストコード...
  });

  it('should send config after authentication', async () => {
    // テストコード...
  });

  it('should broadcast tunnel creation', async () => {
    // テストコード...
  });
});
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
