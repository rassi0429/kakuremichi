# kakuremichi - API設計

## 概要

ControlサーバーのAPI設計を定義します。

**API種類**:
1. **REST API**: Web UI ⇔ Control（HTTP/JSON）
2. **WebSocket API**: Control ⇔ Agent/Gateway（リアルタイム設定配信）

---

## REST API

### ベースURL

```
https://control.example.com/api
```

### 認証

**MVP（Phase 1）**:
- **管理者パスワード認証**: 環境変数`ADMIN_PASSWORD`で設定
- **Session Cookie**: `iron-session`を使用した暗号化Cookie
- **CSRF対策**: Next.jsのデフォルト機能（Same-Site Cookie）

**認証フロー**:
1. POST /api/auth/login でパスワード送信
2. Session Cookieを発行
3. 以降のAPI呼び出しで自動的に認証

**Phase 2以降**:
- OAuth/OIDC統合（Google, GitHub等）
- ユーザー管理（複数管理者、RBAC）
- API Token認証（プログラマティックアクセス）

---

## エンドポイント一覧

### 認証

#### `POST /api/auth/login`

管理者ログイン

**リクエスト**:
```json
{
  "password": "your-admin-password"
}
```

**レスポンス**:
```json
{
  "success": true,
  "message": "Logged in successfully"
}
```

**ステータスコード**:
- `200`: ログイン成功（Session Cookie発行）
- `401`: パスワード不正
- `400`: バリデーションエラー

**注意**: レスポンスにSession Cookieが`Set-Cookie`ヘッダーで設定されます。

---

#### `POST /api/auth/logout`

ログアウト

**レスポンス**:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**ステータスコード**:
- `200`: ログアウト成功

---

#### `GET /api/auth/me`

現在の認証状態を確認

**レスポンス**:
```json
{
  "authenticated": true,
  "role": "admin"
}
```

**ステータスコード**:
- `200`: 認証済み
- `401`: 未認証

---

### Agent管理

**注意**: 以下のすべてのエンドポイントは認証必須です。

#### `POST /api/agents`

新しいAgentを作成

**リクエスト**:
```json
{
  "name": "home-server"
}
```

**レスポンス**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "home-server",
  "apiKey": "agt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "wireguardPublicKey": "base64-encoded-key",
  "virtualIp": "10.1.0.100",
  "subnet": "10.1.0.0/24",
  "status": "offline",
  "installCommand": "curl -sSL https://control.example.com/install/agent.sh | sh -s -- --api-key=agt_xxx --control-url=https://control.example.com",
  "createdAt": "2025-11-22T10:00:00Z",
  "updatedAt": "2025-11-22T10:00:00Z"
}
```

**ステータスコード**:
- `201`: 作成成功
- `400`: バリデーションエラー
- `500`: サーバーエラー

---

#### `GET /api/agents`

Agent一覧を取得

**クエリパラメータ**:
- `status`: フィルター（`online`, `offline`, `error`）

**レスポンス**:
```json
{
  "agents": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "home-server",
      "virtualIp": "10.1.0.100",
      "status": "online",
      "lastSeenAt": "2025-11-22T10:05:00Z",
      "createdAt": "2025-11-22T10:00:00Z"
    }
  ],
  "total": 1
}
```

**ステータスコード**:
- `200`: 成功

---

#### `GET /api/agents/:id`

特定のAgent詳細を取得

**レスポンス**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "home-server",
  "apiKey": "agt_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "wireguardPublicKey": "base64-encoded-key",
  "virtualIp": "10.1.0.100",
  "subnet": "10.1.0.0/24",
  "status": "online",
  "lastSeenAt": "2025-11-22T10:05:00Z",
  "metadata": {},
  "createdAt": "2025-11-22T10:00:00Z",
  "updatedAt": "2025-11-22T10:05:00Z"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Agentが見つからない

---

#### `PATCH /api/agents/:id`

Agent情報を更新

**リクエスト**:
```json
{
  "name": "new-name"
}
```

**レスポンス**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "new-name",
  "updatedAt": "2025-11-22T10:10:00Z"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Agentが見つからない
- `400`: バリデーションエラー

---

#### `DELETE /api/agents/:id`

Agentを削除

**レスポンス**:
```json
{
  "message": "Agent deleted successfully"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Agentが見つからない

---

### Gateway管理

#### `POST /api/gateways`

新しいGatewayを作成

**リクエスト**:
```json
{
  "name": "gateway-tokyo",
  "region": "tokyo"
}
```

**レスポンス**:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "gateway-tokyo",
  "apiKey": "gtw_k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "wireguardPublicKey": "base64-encoded-key",
  "region": "tokyo",
  "status": "offline",
  "installCommand": "curl -sSL https://control.example.com/install/gateway.sh | sh -s -- --api-key=gtw_xxx --control-url=https://control.example.com",
  "createdAt": "2025-11-22T10:00:00Z",
  "updatedAt": "2025-11-22T10:00:00Z"
}
```

**ステータスコード**:
- `201`: 作成成功
- `400`: バリデーションエラー
- `500`: サーバーエラー

---

#### `GET /api/gateways`

Gateway一覧を取得

**レスポンス**:
```json
{
  "gateways": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "gateway-tokyo",
      "publicIp": "1.2.3.4",
      "region": "tokyo",
      "status": "online",
      "lastSeenAt": "2025-11-22T10:05:00Z",
      "createdAt": "2025-11-22T10:00:00Z"
    }
  ],
  "total": 1
}
```

**ステータスコード**:
- `200`: 成功

---

#### `GET /api/gateways/:id`

特定のGateway詳細を取得

**レスポンス**:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "name": "gateway-tokyo",
  "apiKey": "gtw_k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
  "publicIp": "1.2.3.4",
  "wireguardPublicKey": "base64-encoded-key",
  "region": "tokyo",
  "status": "online",
  "lastSeenAt": "2025-11-22T10:05:00Z",
  "metadata": {},
  "createdAt": "2025-11-22T10:00:00Z",
  "updatedAt": "2025-11-22T10:05:00Z"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Gatewayが見つからない

---

#### `DELETE /api/gateways/:id`

Gatewayを削除

**レスポンス**:
```json
{
  "message": "Gateway deleted successfully"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Gatewayが見つからない

---

### Tunnel管理

#### `POST /api/tunnels`

新しいTunnelを作成

**リクエスト**:
```json
{
  "domain": "app.example.com",
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "target": "localhost:8080",
  "description": "My web app"
}
```

**レスポンス**:
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "domain": "app.example.com",
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "target": "localhost:8080",
  "enabled": true,
  "description": "My web app",
  "createdAt": "2025-11-22T10:00:00Z",
  "updatedAt": "2025-11-22T10:00:00Z"
}
```

**ステータスコード**:
- `201`: 作成成功
- `400`: バリデーションエラー（ドメイン重複など）
- `404`: Agentが見つからない

---

#### `GET /api/tunnels`

Tunnel一覧を取得

**クエリパラメータ**:
- `agentId`: 特定のAgentのTunnelのみ取得

**レスポンス**:
```json
{
  "tunnels": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "domain": "app.example.com",
      "agentId": "550e8400-e29b-41d4-a716-446655440000",
      "agentName": "home-server",
      "target": "localhost:8080",
      "enabled": true,
      "createdAt": "2025-11-22T10:00:00Z"
    }
  ],
  "total": 1
}
```

**ステータスコード**:
- `200`: 成功

---

#### `GET /api/tunnels/:id`

特定のTunnel詳細を取得

**レスポンス**:
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "domain": "app.example.com",
  "agentId": "550e8400-e29b-41d4-a716-446655440000",
  "agentName": "home-server",
  "target": "localhost:8080",
  "enabled": true,
  "description": "My web app",
  "createdAt": "2025-11-22T10:00:00Z",
  "updatedAt": "2025-11-22T10:00:00Z"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Tunnelが見つからない

---

#### `PATCH /api/tunnels/:id`

Tunnel情報を更新

**リクエスト**:
```json
{
  "target": "localhost:3000",
  "enabled": false
}
```

**レスポンス**:
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "target": "localhost:3000",
  "enabled": false,
  "updatedAt": "2025-11-22T10:10:00Z"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Tunnelが見つからない
- `400`: バリデーションエラー

---

#### `DELETE /api/tunnels/:id`

Tunnelを削除

**レスポンス**:
```json
{
  "message": "Tunnel deleted successfully"
}
```

**ステータスコード**:
- `200`: 成功
- `404`: Tunnelが見つからない

---

### インストールスクリプト配信

#### `GET /install/agent.sh`

Agentインストールスクリプトを取得

**レスポンス**: Shell script

**ステータスコード**:
- `200`: 成功

---

#### `GET /install/gateway.sh`

Gatewayインストールスクリプトを取得

**レスポンス**: Shell script

**ステータスコード**:
- `200`: 成功

---

## WebSocket API

### 接続URL

```
wss://control.example.com/ws
```

### 認証

**クエリパラメータ**:
- `apiKey`: Agent/GatewayのAPI Key
- `type`: `agent` または `gateway`

**例**:
```
wss://control.example.com/ws?apiKey=agt_xxx&type=agent
```

---

## WebSocketメッセージフォーマット

すべてのメッセージはJSON形式

```typescript
type Message = {
  type: string;
  data: any;
}
```

---

## Agent ⇔ Control メッセージ

### Agent → Control

#### 1. `auth` - 認証

接続直後に送信

```json
{
  "type": "auth",
  "data": {
    "apiKey": "agt_xxx"
  }
}
```

#### 2. `heartbeat` - ハートビート

定期的に送信（30秒ごと）

```json
{
  "type": "heartbeat",
  "data": {
    "timestamp": 1700000000
  }
}
```

#### 3. `status` - ステータス報告

Agentの状態変化時に送信

```json
{
  "type": "status",
  "data": {
    "tunnels": [
      {
        "domain": "app.example.com",
        "status": "connected"
      }
    ]
  }
}
```

---

### Control → Agent

#### 1. `auth_success` - 認証成功

```json
{
  "type": "auth_success",
  "data": {
    "agentId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Authentication successful"
  }
}
```

#### 2. `auth_error` - 認証失敗

```json
{
  "type": "auth_error",
  "data": {
    "message": "Invalid API key"
  }
}
```

#### 3. `config` - 設定配信

認証成功後、または設定変更時に送信

```json
{
  "type": "config",
  "data": {
    "agent": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "home-server",
      "virtualIp": "10.1.0.100",
      "subnet": "10.1.0.0/24",
      "wireguardPrivateKey": "base64-encoded-key"
    },
    "gateways": [
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "gateway-tokyo",
        "publicIp": "1.2.3.4",
        "wireguardPublicKey": "base64-encoded-key",
        "virtualIps": ["10.1.0.1", "10.2.0.1"]
      }
    ],
    "tunnels": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "domain": "app.example.com",
        "target": "localhost:8080",
        "enabled": true
      }
    ]
  }
}
```

#### 4. `tunnel_create` - Tunnel作成

新しいTunnelが作成された時

```json
{
  "type": "tunnel_create",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "domain": "app.example.com",
    "target": "localhost:8080",
    "enabled": true
  }
}
```

#### 5. `tunnel_update` - Tunnel更新

Tunnelが更新された時

```json
{
  "type": "tunnel_update",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "target": "localhost:3000",
    "enabled": false
  }
}
```

#### 6. `tunnel_delete` - Tunnel削除

Tunnelが削除された時

```json
{
  "type": "tunnel_delete",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002"
  }
}
```

---

## Gateway ⇔ Control メッセージ

### Gateway → Control

#### 1. `auth` - 認証

```json
{
  "type": "auth",
  "data": {
    "apiKey": "gtw_xxx",
    "publicIp": "1.2.3.4"
  }
}
```

#### 2. `heartbeat` - ハートビート

```json
{
  "type": "heartbeat",
  "data": {
    "timestamp": 1700000000
  }
}
```

#### 3. `certificate_obtained` - 証明書取得完了

Let's Encryptで証明書を取得した時

```json
{
  "type": "certificate_obtained",
  "data": {
    "domain": "app.example.com",
    "certificate": "-----BEGIN CERTIFICATE-----...",
    "privateKey": "-----BEGIN PRIVATE KEY-----...",
    "expiresAt": "2026-11-22T10:00:00Z"
  }
}
```

---

### Control → Gateway

#### 1. `auth_success` - 認証成功

```json
{
  "type": "auth_success",
  "data": {
    "gatewayId": "660e8400-e29b-41d4-a716-446655440001",
    "message": "Authentication successful"
  }
}
```

#### 2. `config` - 設定配信

認証成功後、または設定変更時に送信

```json
{
  "type": "config",
  "data": {
    "gateway": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "gateway-tokyo",
      "wireguardPrivateKey": "base64-encoded-key"
    },
    "agents": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "home-server",
        "virtualIp": "10.1.0.100",
        "subnet": "10.1.0.0/24",
        "wireguardPublicKey": "base64-encoded-key"
      }
    ],
    "tunnels": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "domain": "app.example.com",
        "agentVirtualIp": "10.1.0.100",
        "target": "localhost:8080",
        "enabled": true
      }
    ],
    "certificates": [
      {
        "domain": "app.example.com",
        "certificate": "-----BEGIN CERTIFICATE-----...",
        "privateKey": "-----BEGIN PRIVATE KEY-----...",
        "expiresAt": "2026-11-22T10:00:00Z"
      }
    ]
  }
}
```

#### 3. `tunnel_create` - Tunnel作成

```json
{
  "type": "tunnel_create",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "domain": "app.example.com",
    "agentVirtualIp": "10.1.0.100",
    "target": "localhost:8080",
    "enabled": true
  }
}
```

#### 4. `tunnel_update` - Tunnel更新

```json
{
  "type": "tunnel_update",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "enabled": false
  }
}
```

#### 5. `tunnel_delete` - Tunnel削除

```json
{
  "type": "tunnel_delete",
  "data": {
    "id": "770e8400-e29b-41d4-a716-446655440002"
  }
}
```

---

## エラーハンドリング

### REST API

すべてのエラーは以下の形式で返される

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid domain format",
    "details": {
      "field": "domain",
      "value": "invalid..domain"
    }
  }
}
```

**エラーコード**:
- `VALIDATION_ERROR`: バリデーションエラー
- `NOT_FOUND`: リソースが見つからない
- `DUPLICATE`: 重複エラー（ドメイン、API Keyなど）
- `INTERNAL_ERROR`: サーバー内部エラー

### WebSocket

エラーは`error`メッセージとして送信

```json
{
  "type": "error",
  "data": {
    "code": "AUTH_FAILED",
    "message": "Invalid API key"
  }
}
```

**エラーコード**:
- `AUTH_FAILED`: 認証失敗
- `INVALID_MESSAGE`: メッセージ形式が不正
- `INTERNAL_ERROR`: サーバー内部エラー

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
