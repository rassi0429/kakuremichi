# kakuremichi - プロジェクト構成

## 概要

モノレポ構成で、Control、Gateway、Agentを1つのリポジトリで管理します。

**リポジトリ名**: `kakuremichi`

---

## ディレクトリ構成

```
kakuremichi/
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI/CD（テスト、ビルド）
│       └── release.yml         # リリース自動化
├── docs/                       # ドキュメント
│   ├── architecture.md         # アーキテクチャ
│   ├── api.md                  # API仕様
│   ├── deployment.md           # デプロイ手順
│   └── development.md          # 開発ガイド
├── control/                    # Controlサーバー（Node.js/TypeScript/Next.js）
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   │   ├── (auth)/         # 認証関連ページ（将来）
│   │   │   ├── api/            # API Routes
│   │   │   │   ├── agents/
│   │   │   │   ├── gateways/
│   │   │   │   ├── tunnels/
│   │   │   │   └── install/    # インストールスクリプト配信
│   │   │   ├── agents/         # Agent管理画面
│   │   │   ├── gateways/       # Gateway管理画面
│   │   │   ├── tunnels/        # Tunnel管理画面
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx        # ダッシュボード
│   │   ├── components/         # Reactコンポーネント
│   │   │   ├── ui/             # 汎用UIコンポーネント
│   │   │   ├── agents/
│   │   │   ├── gateways/
│   │   │   └── tunnels/
│   │   ├── lib/                # ユーティリティ
│   │   │   ├── db/             # Drizzle ORM
│   │   │   │   ├── schema/     # スキーマ定義
│   │   │   │   │   ├── agents.ts
│   │   │   │   │   ├── gateways.ts
│   │   │   │   │   ├── tunnels.ts
│   │   │   │   │   └── certificates.ts
│   │   │   │   ├── migrations/ # マイグレーション
│   │   │   │   └── index.ts    # DB接続
│   │   │   ├── ws/             # WebSocketサーバー
│   │   │   │   ├── server.ts
│   │   │   │   ├── handlers/
│   │   │   │   │   ├── agent.ts
│   │   │   │   │   └── gateway.ts
│   │   │   │   └── types.ts
│   │   │   ├── wireguard/      # WireGuard設定生成
│   │   │   │   └── config.ts
│   │   │   └── utils/          # 汎用ユーティリティ
│   │   │       ├── api-key.ts
│   │   │       ├── subnet.ts
│   │   │       └── validation.ts
│   │   └── types/              # TypeScript型定義
│   ├── public/                 # 静的ファイル
│   │   └── install/            # インストールスクリプト
│   │       ├── agent.sh
│   │       └── gateway.sh
│   ├── tests/                  # テスト
│   │   ├── unit/
│   │   └── integration/
│   ├── drizzle.config.ts       # Drizzle設定
│   ├── next.config.js          # Next.js設定
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── gateway/                    # Gateway（Go）
│   ├── cmd/
│   │   └── gateway/
│   │       └── main.go         # エントリーポイント
│   ├── internal/
│   │   ├── config/             # 設定管理
│   │   │   └── config.go
│   │   ├── wireguard/          # WireGuard管理
│   │   │   ├── interface.go
│   │   │   └── peer.go
│   │   ├── proxy/              # リバースプロキシ
│   │   │   ├── http.go
│   │   │   └── router.go
│   │   ├── ssl/                # SSL/TLS証明書管理
│   │   │   ├── autocert.go     # Let's Encrypt
│   │   │   └── storage.go
│   │   ├── ws/                 # WebSocketクライアント
│   │   │   ├── client.go
│   │   │   └── handler.go
│   │   └── tunnel/             # トンネル管理
│   │       └── manager.go
│   ├── pkg/                    # 公開パッケージ（共通ライブラリ）
│   │   └── protocol/           # Control ⇔ Gateway プロトコル
│   │       └── message.go
│   ├── scripts/                # ビルド・デプロイスクリプト
│   │   ├── build.sh
│   │   └── install.sh
│   ├── go.mod
│   ├── go.sum
│   └── .env.example
├── agent/                      # Agent（Go）
│   ├── cmd/
│   │   └── agent/
│   │       └── main.go
│   ├── internal/
│   │   ├── config/
│   │   │   └── config.go
│   │   ├── wireguard/          # WireGuard + netstack
│   │   │   ├── device.go
│   │   │   ├── netstack.go
│   │   │   └── tunnel.go
│   │   ├── proxy/              # ローカルプロキシ
│   │   │   └── local.go
│   │   ├── docker/             # Docker統合
│   │   │   ├── client.go
│   │   │   └── discovery.go
│   │   ├── ws/                 # WebSocketクライアント
│   │   │   ├── client.go
│   │   │   └── handler.go
│   │   └── tunnel/
│   │       └── manager.go
│   ├── pkg/
│   │   └── protocol/           # Control ⇔ Agent プロトコル
│   │       └── message.go
│   ├── scripts/
│   │   ├── build.sh
│   │   └── install.sh
│   ├── go.mod
│   ├── go.sum
│   └── .env.example
├── shared/                     # 共通ファイル
│   ├── proto/                  # Protocol Buffers（将来的に）
│   └── scripts/                # 共通スクリプト
├── docker/                     # Docker関連
│   ├── control/
│   │   └── Dockerfile
│   ├── gateway/
│   │   └── Dockerfile
│   ├── agent/
│   │   └── Dockerfile
│   └── docker-compose.yml      # 開発環境
├── .gitignore
├── .editorconfig
├── LICENSE                     # MIT License
├── README.md
└── CONTRIBUTING.md

```

---

## 各ディレクトリの役割

### `/control` - Controlサーバー

**技術スタック**: Node.js 22, TypeScript 5, Next.js 15

**主要ディレクトリ**:
- `src/app/`: Next.js App Routerのページとレイアウト
- `src/app/api/`: REST API（Agent/Gateway管理、Tunnel管理）
- `src/components/`: Reactコンポーネント
- `src/lib/db/`: Drizzle ORM（スキーマ、マイグレーション）
- `src/lib/ws/`: WebSocketサーバー（Agent/Gatewayとの通信）
- `src/lib/wireguard/`: WireGuard設定生成ロジック
- `public/install/`: インストールスクリプト（agent.sh, gateway.sh）

**エントリーポイント**:
- Webサーバー: `npm run dev` → Next.js開発サーバー
- WebSocketサーバー: `src/lib/ws/server.ts`（Next.jsと統合）

---

### `/gateway` - Gateway

**技術スタック**: Go 1.23+

**主要ディレクトリ**:
- `cmd/gateway/`: エントリーポイント
- `internal/wireguard/`: WireGuardインターフェース管理
- `internal/proxy/`: HTTPリバースプロキシ
- `internal/ssl/`: Let's Encrypt（autocert）
- `internal/ws/`: WebSocketクライアント（Control接続）
- `pkg/protocol/`: Control ⇔ Gateway 通信プロトコル

**エントリーポイント**:
- バイナリ: `./gateway`
- 設定ファイル: `/etc/kakuremichi/gateway.conf`

**ビルド**:
```bash
cd gateway
go build -o gateway ./cmd/gateway
```

---

### `/agent` - Agent

**技術スタック**: Go 1.23+

**主要ディレクトリ**:
- `cmd/agent/`: エントリーポイント
- `internal/wireguard/`: WireGuard + netstack（ユーザースペース）
- `internal/proxy/`: ローカルプロキシ（Agent → アプリ）
- `internal/docker/`: Docker統合（コンテナ検出）
- `internal/ws/`: WebSocketクライアント（Control接続）
- `pkg/protocol/`: Control ⇔ Agent 通信プロトコル

**エントリーポイント**:
- バイナリ: `./agent`
- 設定ファイル: `/etc/kakuremichi/agent.conf`

**ビルド**:
```bash
cd agent
go build -o agent ./cmd/agent
```

---

### `/docker` - Docker関連

**含むもの**:
- `Dockerfile`（Control、Gateway、Agent）
- `docker-compose.yml`（開発環境）

**開発環境起動**:
```bash
docker-compose up
```

**含まれるサービス**:
- `control`: Controlサーバー（Next.js + WebSocket）
- `gateway`: Gateway（開発用、1つ）
- `agent`: Agent（開発用、1つ）
- `db`: SQLite（Controlがホスト）

---

### `/docs` - ドキュメント

- `architecture.md`: アーキテクチャ設計（既存のclaude.mdの内容）
- `api.md`: API仕様（REST、WebSocket）
- `deployment.md`: デプロイ手順
- `development.md`: 開発ガイド

---

## パッケージ管理

### Control (Node.js)

**パッケージマネージャー**: npm

**主要依存**:
```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "drizzle-orm": "latest",
    "better-sqlite3": "latest",
    "ws": "^8.0.0",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "drizzle-kit": "latest",
    "@types/ws": "^8.0.0",
    "vitest": "latest"
  }
}
```

### Gateway/Agent (Go)

**パッケージマネージャー**: Go modules

**主要依存**:
```
golang.zx2c4.com/wireguard
github.com/gorilla/websocket
golang.org/x/crypto/acme/autocert
github.com/docker/docker/client (Agentのみ)
gvisor.dev/gvisor/pkg/tcpip/stack (Agentのみ、netstack)
```

---

## ビルド・デプロイ

### 開発環境

```bash
# Controlサーバー起動
cd control
npm install
npm run dev

# Gateway起動
cd gateway
go run ./cmd/gateway --api-key=gtw_xxx --control-url=ws://localhost:3000

# Agent起動
cd agent
go run ./cmd/agent --api-key=agt_xxx --control-url=ws://localhost:3000
```

### 本番ビルド

```bash
# Controlサーバー
cd control
npm run build
npm start

# Gateway
cd gateway
go build -o gateway ./cmd/gateway

# Agent
cd agent
go build -o agent ./cmd/agent
```

### Dockerビルド

```bash
# すべてのコンポーネントをビルド
docker-compose build

# 個別ビルド
docker build -f docker/control/Dockerfile -t kakuremichi/control .
docker build -f docker/gateway/Dockerfile -t kakuremichi/gateway .
docker build -f docker/agent/Dockerfile -t kakuremichi/agent .
```

---

## 環境変数

### Control (.env)

```env
# Database
DATABASE_URL=./data/kakuremichi.db

# Server
PORT=3000
NODE_ENV=production

# WebSocket
WS_PORT=3001

# URL
PUBLIC_URL=https://control.example.com
```

### Gateway (.env)

```env
# Control
CONTROL_URL=wss://control.example.com
API_KEY=gtw_xxxxxxxxxxxx

# WireGuard
WIREGUARD_PORT=51820

# HTTP/HTTPS
HTTP_PORT=80
HTTPS_PORT=443

# Let's Encrypt
ACME_EMAIL=admin@example.com
ACME_STAGING=false
```

### Agent (.env)

```env
# Control
CONTROL_URL=wss://control.example.com
API_KEY=agt_xxxxxxxxxxxx

# Docker（オプション）
DOCKER_ENABLED=true
DOCKER_SOCKET=/var/run/docker.sock
```

---

## Git構成

### .gitignore

```gitignore
# Node.js
node_modules/
.next/
dist/
*.log

# Go
*.exe
*.exe~
*.dll
*.so
*.dylib
vendor/

# Database
*.db
*.db-shm
*.db-wal

# Environment
.env
.env.local

# IDEs
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Build artifacts
control/build/
gateway/gateway
agent/agent
```

---

## 開発ワークフロー

### 1. ローカル開発

```bash
# リポジトリクローン
git clone https://github.com/yourname/kakuremichi.git
cd kakuremichi

# Controlセットアップ
cd control
npm install
npm run db:migrate
npm run dev

# Gateway開発（別ターミナル）
cd gateway
go run ./cmd/gateway --api-key=dev_gateway --control-url=ws://localhost:3000

# Agent開発（別ターミナル）
cd agent
go run ./cmd/agent --api-key=dev_agent --control-url=ws://localhost:3000
```

### 2. Docker開発環境

```bash
docker-compose up
```

- Control: http://localhost:3000
- Gateway: 動作中（バックグラウンド）
- Agent: 動作中（バックグラウンド）

### 3. テスト

```bash
# Control
cd control
npm test

# Gateway
cd gateway
go test ./...

# Agent
cd agent
go test ./...
```

---

## CI/CD

### GitHub Actions

`.github/workflows/ci.yml`:
- プルリクエストで自動テスト
- Lintチェック
- ビルド確認

`.github/workflows/release.yml`:
- タグプッシュで自動リリース
- バイナリビルド（Linux、macOS、Windows）
- Dockerイメージプッシュ

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
