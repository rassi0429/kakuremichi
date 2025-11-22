# kakuremichi - 技術スタック・ライブラリ選定

## Control（Node.js + TypeScript）

### フレームワーク・ランタイム
- **Node.js**: 22.x LTS
- **TypeScript**: 5.x
- **Next.js**: 15.x（App Router）
  - フルスタックフレームワーク
  - API Routes
  - React 19

### データベース・ORM
- **データベース**: SQLite（MVP）
- **ORM**: Drizzle ORM
  - TypeScript-first
  - 型安全
  - マイグレーション対応

### WebSocket
- **ws** ✓
  - シンプル、軽量、低レベルAPI
  - Next.jsとの統合が容易

### バリデーション
- **Zod**: スキーマバリデーション、型推論

### 認証
- **iron-session**: 暗号化Session Cookie管理 ✓
  - MVP: 管理者パスワード認証
  - CSRF対策（Same-Site Cookie）
  - Phase 2: OAuth/OIDC統合候補
    - `next-auth` / `auth.js`

### WireGuard鍵生成
- **@noble/curves**: Curve25519暗号化ライブラリ ✓
  - WireGuard鍵ペア生成
  - Pure JavaScript実装（外部依存なし）
  - wireguard-tools不要

### その他
- **日時**: `date-fns`
- **UUID**: `uuid`（またはnode:crypto.randomUUID）
- **暗号化**: `node:crypto`（標準ライブラリ）

---

## Gateway（Go）

**ランタイム**: Go 1.23+

### WireGuard
- **golang.zx2c4.com/wireguard**
  - 公式Go実装
  - userspace実装
- **golang.zx2c4.com/wireguard/device**
- **golang.zx2c4.com/wireguard/tun**

### HTTP/HTTPSサーバー
- **net/http**（標準ライブラリ）✓
  - シンプル、安定
  - 依存を減らす

### リバースプロキシ
- **net/http/httputil.ReverseProxy**（標準ライブラリ）
  - WireGuard経由でAgentにプロキシ

### SSL/TLS証明書（Let's Encrypt）
- **golang.org/x/crypto/acme/autocert** ✓
  - 公式、自動更新
  - HTTP-01チャレンジ対応
  - シンプルで十分

### WebSocketクライアント（Control接続用）
- **gorilla/websocket** ✓
  - 人気、安定、実績豊富
  - Gateway/Agent両方で使用

### 設定管理
- **flag + os.Getenv**（標準ライブラリ）✓
  - シンプルで十分

### ログ
- **log/slog**（標準ライブラリ、Go 1.21+で導入）✓
  - 構造化ログ
  - 十分高機能

---

## Agent（Go）

**ランタイム**: Go 1.23+

### WireGuard
- **golang.zx2c4.com/wireguard**
- **gvisor.dev/gvisor/pkg/tcpip/stack** (netstack)
  - ユーザースペースネットワークスタック
  - ポート開放不要

### HTTPプロキシ（ローカル→アプリ）
- **net/http/httputil.ReverseProxy**（標準ライブラリ）

### WebSocketクライアント（Control接続用）
- **gorilla/websocket** ✓
  - Gatewayと同じ

### Docker統合
- **github.com/docker/docker/client** ✓
  - Docker API公式クライアント
  - コンテナ検出、ラベル取得

### 設定管理
- **flag + os.Getenv**（標準ライブラリ）✓

### ログ
- **log/slog**（標準ライブラリ）✓

---

## 共通

### Go モジュール管理
- **Go modules**（標準）

### Node.js パッケージ管理
- **npm** ✓
  - 標準、安定

---

## 開発ツール

### コード品質
- **ESLint** + **Prettier**（Node.js/TypeScript）
- **golangci-lint**（Go）
  - 複数のlinterを統合

### テスト
- **Vitest**（Node.js/TypeScript）
- **Go testing**（標準ライブラリ）

### CI/CD
- **GitHub Actions**

### コンテナ
- **Docker**
- **Docker Compose**（開発環境）

---

## 決定事項まとめ

### Control
- WebSocket: `ws` ✓
- パッケージマネージャー: `npm` ✓

### Gateway
- HTTPサーバー: `net/http`（標準ライブラリ）✓
- ACME クライアント: `autocert` ✓
- WebSocketクライアント: `gorilla/websocket` ✓
- WireGuard: `wireguard-go` ✓

### Agent
- WebSocketクライアント: `gorilla/websocket` ✓
- WireGuard: `wireguard-go` + `netstack` ✓

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
