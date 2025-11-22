# kakuremichi - 実装状況レポート

**更新日**: 2025-11-22
**Phase**: 1 - 基本アーキテクチャ実装（進行中）

---

## 完了した実装

### ✅ Control Server (Node.js + TypeScript)

#### データベース
- ✅ Drizzle ORMスキーマ定義（agents, gateways, tunnels）
- ✅ マイグレーションファイル生成
- ✅ データベース初期化（SQLite）

#### REST API
- ✅ `/api/agents` - Agent CRUD操作
- ✅ `/api/gateways` - Gateway CRUD操作
- ✅ `/api/tunnels` - Tunnel CRUD操作
- ✅ バリデーション（Zod）
- ✅ エラーハンドリング

#### ユーティリティ
- ✅ APIキー生成（`agt_`/`gtw_` prefix）
- ✅ サブネット自動割り当て（10.1.0.0/24, 10.2.0.0/24, ...）
- ✅ WireGuard鍵ペア生成（@noble/curves使用）
- ✅ WireGuard設定生成（Gateway/Agent用）

#### WebSocket
- ✅ WebSocketサーバー実装
  - 認証（API key検証）
  - ハートビート（ping/pong）
  - クライアント管理
  - 接続状態の追跡
- ✅ メッセージプロトコル定義
- ✅ 設定配信メカニズム（骨組み）

### ✅ Gateway (Go)

#### 基本構造
- ✅ Go modulesセットアップ
- ✅ 設定管理（環境変数 + コマンドライン引数）
- ✅ エントリーポイント（main.go）
- ✅ ビルド成功確認（gateway.exe）

#### WebSocket
- ✅ WebSocketクライアント実装
  - Control接続
  - 認証
  - メッセージ送受信
  - ハートビート
- ✅ 設定受信コールバック

### ✅ Agent (Go)

#### 基本構造
- ✅ Go modulesセットアップ
- ✅ 設定管理（環境変数 + コマンドライン引数）
- ✅ エントリーポイント（main.go）
- ✅ ビルド成功確認（agent.exe）

### ✅ Docker

- ✅ Control Dockerfile
- ✅ Gateway Dockerfile
- ✅ Agent Dockerfile
- ✅ docker-compose.yml

### ✅ ドキュメント

- ✅ README.md
- ✅ .gitignore
- ✅ PHASE1_COMPLETE.md
- ✅ IMPLEMENTATION_STATUS.md（このファイル）

---

## 🚧 実装中

### Agent WebSocketクライアント
- Gatewayと同様のWebSocketクライアントが必要
- 実装予定

---

## 📋 未実装（Phase 1で必要）

### Gateway

1. **WireGuardインターフェース管理**
   - WireGuardインターフェースの作成・管理
   - Peer（Agent）の追加・削除
   - 設定の動的更新

2. **HTTPリバースプロキシ**
   - HTTPS受信（ポート443）
   - ドメインベースルーティング
   - WireGuard経由でAgentにプロキシ
   - Let's Encrypt統合（Phase 2）

### Agent

1. **WebSocketクライアント**
   - Gatewayと同様の実装

2. **WireGuard + netstack**
   - ユーザースペースWireGuardデバイス
   - 複数Gateway同時接続
   - ポート開放不要

3. **ローカルプロキシ**
   - WireGuardから受信したHTTPリクエストを
ローカルアプリ（localhost:8080等）に転送

---

## ビルド・起動確認

### ビルドステータス

| コンポーネント | ビルド | 起動 | 機能テスト |
|--------------|--------|------|-----------|
| Control      | ✅ 成功 | ✅ 成功 | 🚧 一部 |
| Gateway      | ✅ 成功 | ✅ 成功 | 🚧 一部 |
| Agent        | ✅ 成功 | ✅ 成功 | ❌ 未実施 |

### 修正したビルドエラー

1. **Control**: TypeScript型エラー（subnet.ts）
2. **Gateway**: 未使用変数エラー（ctx）
3. **Agent**: 未使用変数エラー（ctx）

---

## 次のステップ（優先順位順）

### 1. Agent WebSocketクライアント実装 (高)
- `agent/internal/ws/` ディレクトリに実装
- Gatewayのコードを参考に作成

### 2. WebSocket統合テスト (高)
- Control起動
- Gateway/Agent起動
- 接続・認証確認
- 設定配信テスト

### 3. WireGuard統合 (中)
- Gateway: WireGuardインターフェース管理
- Agent: WireGuard + netstackデバイス
- トンネル確立テスト

### 4. プロキシ実装 (中)
- Gateway: HTTPリバースプロキシ
- Agent: ローカルプロキシ
- End-to-Endトラフィックテスト

### 5. Web UI (低)
- Agent/Gateway/Tunnelリスト画面
- 管理画面の基本機能

---

## 技術的な決定事項（再確認）

### 通信プロトコル

**WebSocket** (Control ⇔ Gateway/Agent):
- 認証: API key検証
- メッセージフォーマット: JSON
- ハートビート: 30秒ごと

**WireGuard** (Gateway ⇔ Agent):
- 暗号化トンネル
- 各Agentが独自サブネット（/24）
- Gateway が各Agentサブネットに参加

### データフロー

```
外部ユーザー
    ↓ HTTPS
Gateway (SSL終端)
    ↓ WireGuard tunnel
Agent
    ↓ HTTP
ローカルアプリ
```

**重要**: データトラフィックはControlを経由しない（コントロールプレーン/データプレーン分離）

---

## 開発コマンド

### Control Server

```bash
cd control
npm install          # 初回のみ
npm run db:migrate   # DBマイグレーション
npm run dev          # Next.js開発サーバー（ポート3000）
npm run dev:ws       # WebSocketサーバー（ポート3001）
```

### Gateway

```bash
cd gateway
go build -o gateway.exe ./cmd/gateway
./gateway.exe --api-key=gtw_test --control-url=ws://localhost:3001
```

### Agent

```bash
cd agent
go build -o agent.exe ./cmd/agent
./agent.exe --api-key=agt_test --control-url=ws://localhost:3001
```

---

## 既知の課題

1. **WebSocket自動再接続**: 未実装
   - Gateway/Agentが切断された場合の再接続ロジック

2. **エラーハンドリング**: 基本的なもののみ
   - より詳細なエラーメッセージとリカバリー

3. **ログ**: 構造化されているが最適化の余地あり
   - ログレベルの設定
   - ログローテーション

4. **テスト**: ユニットテストが未実装
   - Control: APIエンドポイントテスト
   - Gateway/Agent: 各モジュールのテスト

---

## コード統計

- **TypeScript files**: 15個
- **Go files**: 5個
- **設定ファイル**: 8個
- **ドキュメント**: 20個以上

**総計**: Phase 1の約60%完了

---

**次回更新**: Agent WebSocketクライアント実装後
