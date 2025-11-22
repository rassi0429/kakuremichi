# Pangolinエコシステム分析レポート

## 目次
1. [プロジェクト概要](#プロジェクト概要)
2. [主要コンポーネント](#主要コンポーネント)
3. [技術スタック](#技術スタック)
4. [アーキテクチャ](#アーキテクチャ)
5. [データフロー](#データフロー)
6. [開発環境とビルド](#開発環境とビルド)
7. [クローン実装のための重要ポイント](#クローン実装のための重要ポイント)

---

## プロジェクト概要

Pangolinは、ID認証とコンテキスト認識アクセス制御機能を持つ、自己ホスト型のトンネル型リバースプロキシサーバーです。ファイアウォール背後の隔離されたネットワークでも、暗号化トンネルを通じてリモートサービスへの簡単なアクセスを可能にします。

### 主な特徴
- セルフホスト可能（Community Edition: AGPL-3, Enterprise Edition: Fossorial Commercial License）
- ID認識とコンテキスト認識のアクセス制御（SSO、OIDC、PIN、パスワード、地理位置情報、IPなど）
- 複数ネットワーク間のリバースプロキシ
- 軽量なサイトコネクター（Newt）
- 統合ダッシュボードUI

### リポジトリ
- **Pangolin**: https://github.com/fosrl/pangolin
- **Newt**: https://github.com/fosrl/newt

---

## 主要コンポーネント

### 1. Pangolin（コントロールプレーン）

#### 概要
システムの中央ハブとして機能し、管理と制御を担当。

#### 技術スタック
- **フロントエンド**: Next.js 15.5.6 + React 19.2.0
- **バックエンド**: Express 5.1.0 + TypeScript
- **データベース**: Drizzle ORM (PostgreSQL / SQLite対応)
- **認証**: Oslo (セッション管理), Arctic (OAuth), SimpleWebAuthn
- **UI**: Radix UI + Tailwind CSS
- **その他**: WebSocket (ws), Zod (バリデーション), Monaco Editor

#### ディレクトリ構造
```
pangolin/
├── server/               # バックエンドコード
│   ├── routers/         # APIルーター
│   │   ├── gerbil/      # Gerbil関連のエンドポイント
│   │   ├── site/        # サイト管理
│   │   └── ...
│   ├── db/              # データベース層
│   ├── lib/             # ライブラリ・ユーティリティ
│   ├── auth/            # 認証ロジック
│   └── middlewares/     # Expressミドルウェア
├── src/                 # Next.jsフロントエンド
│   ├── app/             # App Router
│   ├── components/      # Reactコンポーネント
│   ├── services/        # サービスレイヤー
│   └── lib/             # クライアントユーティリティ
├── cli/                 # CLIツール
├── config/              # 設定ファイル
└── install/             # インストールスクリプト
```

#### 主要機能
- **Webインターフェース**: サイト、ユーザー、アクセスポリシーの管理ダッシュボード
- **REST API**: プログラマティックなアクセス
- **WebSocketサーバー**: リアルタイム制御とオーケストレーション
- **認証管理**: ユーザー認証、セッション管理
- **データベース**: 状態管理とストレージ
- **リバースプロキシ統合**: Traefikとの統合（ファイルモード対応）

---

### 2. Gerbil（トンネルマネージャー）

#### 概要
Go言語で書かれたシンプルなWireGuardインターフェース管理サーバー。HTTP APIを介してWireGuardインターフェースの作成やピアの追加・削除を簡単に行えます。

#### 技術スタック
- **言語**: Go 1.23.1
- **WireGuard**: ネイティブLinux WireGuardインターフェース
- **HTTP API**: ピア管理、帯域幅レポート
- **プロキシ**: SNI (Server Name Indication) プロキシ

#### ディレクトリ構造
```
gerbil/
├── main.go              # メインエントリポイント
├── proxy/               # SNIプロキシ
├── relay/               # クライアントリレー（NAT hole punching）
├── logger/              # ロギング
└── public/              # 静的ファイル
```

#### 主な機能

**1. WireGuardセットアップ**
- ローカルLinuxマシンまたはDockerコンテナ上にWireGuardインターフェースを作成・設定
- JSONコンフィグファイルまたはリモートサーバーからの設定値を使用
- 既存インターフェースがある場合は再設定

**2. ピア管理**
- WireGuardインターフェース上にピアを作成
- HTTP APIを使用してピアの削除、作成、更新を動的に実行
- Pangolinリポジトリの `server/routers/gerbil/` エンドポイントと連携

**3. 帯域幅レポート**
- 各ピアの送受信バイト数を10秒ごとに収集
- APIエンドポイント経由で増分使用量をレポート
- リモートサーバー側で各ピアのデータ使用量を追跡可能

**4. クライアントリレー処理**
- ポート21820でUDP hole punchパケットを受信
- OlmとNewtクライアント間のNAT hole punchingをオーケストレート
- Gerbilサーバー経由でNewtへのデータリレーを処理
- パケットヘッダーをスキャンして適切に処理

**5. SNIプロキシ**
- Pangolinノード間のHTTPSトラフィックをインテリジェントにルーティング
- TLS接続時にSNI拡張からホスト名を抽出
- Pangolinにクエリして正しいルーティング先を決定
- 機能:
  - ローカル処理設定（ローカルオーバーライドまたはローカルSNI）の場合、ローカルプロキシにルーティング
  - それ以外は、Pangolinのルーティング APIにクエリしてトラフィックを処理するノードを決定
  - ルーティング決定のキャッシングでパフォーマンス向上
  - 接続プーリングとグレースフルシャットダウン
  - オプションのPROXY protocol v1サポート（元のクライアントIPアドレスを保持）

**PROXY Protocol**:
下流プロキシ（HAProxy、Nginxなど）が実際のクライアントIPを知ることができるように、`--proxy-protocol`フラグで有効化可能。

#### Pangolinでの役割
Pangolinリポジトリ内の `server/routers/gerbil/` ディレクトリにGerbil関連のAPIルーターが実装されており、以下の機能を提供:
- WireGuardピア接続管理
- トンネルライフサイクル管理
- Exit Node管理
- Hole Punching（NAT traversal）
- エッジネットワークと中央サーバー間の暗号化トラフィックルーティング

#### CLI引数
- `reachableAt`: GerbilのAPIへのリーチ可能なURL
- `generateAndSaveKeyTo`: WireGuard秘密鍵の保存先（再起動時の永続化用）
- `remoteConfig`: リモート設定のHTTP GET先URL
- `config`: ローカルJSONコンフィグファイルパス
- `interface`: WireGuardインターフェース名（デフォルト: `wg0`）
- `listen`: HTTPサーバーのリスニングポート（デフォルト: `:3004`）
- `log-level`: ログレベル（デフォルト: `INFO`）
- `mtu`: WireGuardインターフェースのMTU（デフォルト: `1280`）
- `sni-port`: SNIプロキシのポート（デフォルト: `8443`）
- `local-proxy`: ローカルトラフィックルーティング時のアドレス（デフォルト: `localhost`）
- `local-proxy-port`: ローカルプロキシポート（デフォルト: `443`）
- `local-overrides`: 常にローカルプロキシにルーティングするドメイン名（カンマ区切り）
- `proxy-protocol`: PROXY protocol v1の有効化（デフォルト: `false`）

#### 注意事項
**Gerbil SchemeとGerbilプロジェクトの違い**:
- **Gerbil Scheme** (https://cons.io/): Schemeの現代的な方言（プログラミング言語）
- **fosrl/gerbil**: Go言語で書かれたWireGuard管理サーバー（Pangolinエコシステムの一部）

これらは全く別のプロジェクトであり、名前が同じだけで技術的な関係はありません。

---

### 3. Newt（エッジクライアント）

#### 概要
エッジインフラストラクチャに展開される軽量なWireGuardトンネルクライアント。

#### 技術スタック
- **言語**: Go 1.23.1
- **WireGuard**: ユーザースペース実装（wireguard-go + netstack）
- **プロキシ**: TCP/UDPプロキシ
- **Docker統合**: Docker APIを介したコンテナ検出

#### ディレクトリ構造
```
newt/
├── main.go              # メインエントリポイント
├── clients.go           # クライアント管理
├── proxy/               # TCP/UDPプロキシ
├── wg/                  # WireGuard関連
├── wgnetstack/          # ユーザースペースWireGuard
├── websocket/           # WebSocket通信
├── network/             # ネットワーク機能
├── healthcheck/         # ヘルスチェック
├── logger/              # ロギング
└── internal/            # 内部パッケージ
```

#### 主要機能

**1. Pangolinへの登録**
- Newt IDとシークレットを使ってHTTPリクエスト
- セッショントークンを受信
- WebSocket接続を確立・維持
- WebSocket経由で制御メッセージを受信

**2. WireGuard制御メッセージの受信**
- エンドポイントと公開鍵の情報を受信
- netstack（ユーザースペース）でWireGuardトンネルを確立
- Gerbil側のピアを確認するためにping

**3. プロキシ制御メッセージの受信**
- ローレベルTCP/UDPプロキシを作成
- 仮想トンネルにアタッチ
- プログラムされたターゲットにトラフィックをリレー

**4. 動作モード**
- **ユーザースペースモード（デフォルト）**: root権限不要、全プラットフォーム対応
- **ネイティブモード（Linux のみ）**: カーネルモジュール使用、root権限必要

**5. Docker統合**
- Docker Socketを介したコンテナ情報の検査
- コンテナメタデータ、ネットワーク設定、ポートマッピングの取得
- ネットワーク検証（オプション）

**6. クライアント受け入れモード**
- `--accept-clients`フラグで有効化
- 他のWireGuardクライアントからの接続を受け入れ
- サイト間接続を実現
- WGTesterサーバーで接続テスト

---

### 4. Badger（認証ミドルウェア）

#### 概要
すべての受信リクエストをアプリケーションに到達する前にキャッチし、ユーザー認証情報と権限を確認。

#### 主要機能
- リクエストインターセプト
- ユーザー資格情報の検証
- 権限チェック
- 直接アクセスからの保護

---

### 5. リバースプロキシ（ルーター）

#### 概要
受信トラフィックをバックエンドサービスに振り分ける。

#### 主要機能
- トラフィックルーティング
- SSL証明書管理
- セキュリティとモニタリングのミドルウェア統合
- Traefik統合（`server/lib/traefik/TraefikConfigManager`）

---

## 技術スタック

### Pangolin（サーバー）
| カテゴリ | 技術 |
|---------|------|
| **ランタイム** | Node.js (Next.js 15 + Express 5) |
| **言語** | TypeScript 5 |
| **フロントエンド** | React 19, Radix UI, Tailwind CSS 4 |
| **バックエンド** | Express, WebSocket (ws) |
| **データベース** | Drizzle ORM (PostgreSQL / SQLite) |
| **認証** | Oslo, Arctic, SimpleWebAuthn, Argon2 |
| **バリデーション** | Zod |
| **ビルド** | esbuild, Next.js build |
| **その他** | Helmet, CORS, Rate Limiting, Winston (logging) |

### Newt（クライアント）
| カテゴリ | 技術 |
|---------|------|
| **言語** | Go 1.23.1 |
| **WireGuard** | wireguard-go, netstack |
| **通信** | WebSocket, HTTP/HTTPS |
| **プロキシ** | TCP/UDP proxy |
| **Docker** | Docker API |
| **ビルド** | Go modules, Makefile |

### Gerbil（トンネルマネージャー）
| カテゴリ | 技術 |
|---------|------|
| **言語** | Go 1.23.1 |
| **WireGuard** | ネイティブLinux WireGuard |
| **HTTP API** | ピア管理、帯域幅レポート |
| **プロキシ** | SNI proxy, PROXY protocol v1 |
| **リレー** | NAT hole punching |

---

## アーキテクチャ

### システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                     インターネット                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │    Reverse Proxy          │
              │    (Traefik/Nginx)        │
              │  - SSL Termination        │
              │  - Traffic Routing        │
              └───────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │    Badger                 │
              │  (Authentication          │
              │   Middleware)             │
              │  - Identity Check         │
              │  - Access Control         │
              └───────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                ▼                            ▼
    ┌──────────────────────┐     ┌──────────────────────┐
    │   Pangolin           │     │  Backend Apps        │
    │   (Control Plane)    │     │  - Web Apps          │
    │                      │     │  - APIs              │
    │  - Dashboard UI      │     │  - Services          │
    │  - REST API          │     └──────────────────────┘
    │  - WebSocket Server  │
    │  - Database          │
    └──────────────────────┘
           │         ▲
           │         │
           │    WebSocket
           │    (Control)
           ▼         │
    ┌──────────────────────┐
    │   Gerbil             │
    │   (Tunnel Manager)   │
    │                      │
    │  - WireGuard Peer    │
    │  - Tunnel Lifecycle  │
    │  - Encrypted Routing │
    └──────────────────────┘
           │         ▲
           │         │
       WireGuard  WireGuard
       Tunnel     Tunnel
           │         │
           ▼         │
    ┌──────────────────────┐
    │   Newt (Edge Client) │
    │                      │
    │  - WireGuard Client  │
    │  - TCP/UDP Proxy     │
    │  - Docker Discovery  │
    └──────────────────────┘
           │
           ▼
    ┌──────────────────────┐
    │  Private Network     │
    │  - Apps              │
    │  - Services          │
    │  - Containers        │
    └──────────────────────┘
```

### レイヤー構造

#### 1. アクセス層
- **Reverse Proxy**: トラフィックルーティング、SSL終端
- **Badger**: 認証・認可ミドルウェア

#### 2. コントロール層
- **Pangolin**: 中央制御、管理UI、API、WebSocket

#### 3. トンネル層
- **Gerbil**: WireGuardトンネル管理、暗号化通信

#### 4. エッジ層
- **Newt**: エッジクライアント、ローカルプロキシ

#### 5. アプリケーション層
- バックエンドアプリケーション、サービス、コンテナ

---

## データフロー

### 1. 外部リクエストフロー

```
外部ユーザー
  ↓ HTTPS
Reverse Proxy
  ↓
Badger (認証)
  ↓ 認証成功
Backend App または Pangolin Dashboard
```

### 2. エッジネットワークへのアクセスフロー

```
外部ユーザー
  ↓ HTTPS
Reverse Proxy
  ↓
Badger (認証)
  ↓
Pangolin (ルーティング決定)
  ↓
Gerbil (WireGuard Tunnel)
  ↓ 暗号化トラフィック
Newt (Edge Client)
  ↓ TCP/UDPプロキシ
Private Network App
```

### 3. 制御フロー

```
Pangolin Dashboard (管理者)
  ↓ REST API / UI
Pangolin Server (設定変更)
  ↓ WebSocket
Newt Client (制御メッセージ)
  ↓
WireGuard Tunnel確立/更新
  ↓
プロキシ設定変更
```

### 4. Newt登録フロー

```
Newt起動
  ↓ HTTP POST (ID + Secret)
Pangolin認証
  ↓ セッショントークン
WebSocket接続確立
  ↓
制御メッセージ受信
  ↓
WireGuard設定 + プロキシ設定
```

---

## 開発環境とビルド

### Pangolin

#### 前提条件
- Node.js 20+
- PostgreSQL または SQLite

#### ビルドオプション
```bash
# OSS版の設定
npm run set:oss
npm run set:sqlite  # または npm run set:pg

# 開発サーバー起動
npm run dev

# ビルド
npm run build:sqlite  # または npm run build:pg

# 本番起動
npm start
```

#### データベースマイグレーション
```bash
# SQLite
npm run db:sqlite:generate
npm run db:sqlite:push

# PostgreSQL
npm run db:pg:generate
npm run db:pg:push
```

### Newt

#### 前提条件
- Go 1.23.1+

#### ビルド
```bash
# コンテナビルド
make

# ローカルバイナリ
make local

# Nix Flake
nix build
```

#### 起動
```bash
newt \
  --id <newt-id> \
  --secret <secret> \
  --endpoint https://your-pangolin.com
```

### Gerbil

#### 前提条件
- Go 1.23.1+
- Linux（WireGuardカーネルモジュール）またはDocker

#### ビルド
```bash
# コンテナビルド
make

# ローカルバイナリ
make local
```

#### 起動例
```bash
./gerbil \
  --reachableAt=http://gerbil:3004 \
  --generateAndSaveKeyTo=/var/config/key \
  --remoteConfig=http://pangolin:3001/api/v1/
```

---

## クローン実装のための重要ポイント

### 1. コアコンポーネントの理解

#### 必須実装
- **Pangolin**:
  - Next.js + Expressサーバー
  - WebSocketサーバー（制御チャネル）
  - REST API（管理、認証）
  - データベース層（Drizzle ORM）
  - 認証システム（Oslo, Arctic）

- **Newt**:
  - Go言語WireGuardクライアント
  - WebSocketクライアント
  - TCP/UDPプロキシ
  - Docker統合（オプション）

- **Gerbil**:
  - WireGuardトンネル管理
  - ピア接続管理
  - ルーティングロジック

#### オプション実装
- Badger認証ミドルウェア（Pangolinに統合可能）
- Traefik統合（他のリバースプロキシでも可）

### 2. 通信プロトコル

#### WebSocket制御プロトコル
Newt ⇔ Pangolin間:
- 認証メッセージ
- WireGuard設定メッセージ
- プロキシ設定メッセージ
- ステータス更新

実装参考: `server/routers/gerbil/` および `newt/websocket/`

#### WireGuardトンネル
- ピア設定の動的更新
- Allowed IPs管理
- Keep-alive/Ping

### 3. データベーススキーマ

重要なテーブル:
- `users` - ユーザー管理
- `sessions` - セッション管理
- `sites` - サイト（リソース）管理
- `organizations` - 組織管理
- `api_keys` - API認証
- `exit_nodes` - Gerbil Exit Node情報
- `newts` - Newtクライアント情報

Drizzle ORMスキーマ: `server/db/pg/` または `server/db/sqlite/`

### 4. セキュリティ考慮事項

- **認証**: Oslo（セッション）、Arctic（OAuth）、Argon2（パスワードハッシュ）
- **トンネル暗号化**: WireGuard（Curve25519鍵交換、ChaCha20暗号化）
- **トークン管理**: JWT、セッショントークン
- **mTLS**: オプションの相互TLS認証
- **証明書管理**: Let's Encryptまたは自己署名証明書

### 5. スケーラビリティ

- **水平スケーリング**: WebSocketサーバーの複数インスタンス
- **データベース**: PostgreSQLで本番環境スケール
- **キャッシュ**: Redis統合（`ioredis`依存）
- **ロードバランシング**: Gerbilの複数インスタンス

### 6. モニタリングと監視

- **ロギング**: Winston（サーバー）、Goロギング（Newt）
- **メトリクス**: Prometheus exporterサポート（Newt）
- **OTLP**: OpenTelemetry対応（Newt）
- **ヘルスチェック**: Newt healthcheck機能

### 7. 開発の優先順位

#### フェーズ1: MVP
1. Pangolinサーバー（認証なし、基本UI）
2. 基本的なNewtクライアント（WireGuard + WebSocket）
3. シンプルなGerbilトンネル管理

#### フェーズ2: セキュリティ
1. 認証システム（Oslo）
2. Badgerミドルウェア
3. SSL/TLS対応

#### フェーズ3: 高度な機能
1. Docker統合
2. 複数組織サポート
3. 高度なアクセス制御

#### フェーズ4: エンタープライズ
1. OIDC/SAML統合
2. 監査ログ
3. 高可用性構成

### 8. 技術的課題

#### WireGuardユーザースペース実装
- `wireguard-go` + `netstack`の理解が必要
- TCP/UDPプロキシの低レベル実装
- パフォーマンスチューニング（MTU、バッファサイズ）

#### WebSocket管理
- 接続の永続化
- 再接続ロジック
- メッセージキューイング

#### 複数ネットワーク間のルーティング
- Allowed IPsの動的管理
- NATトラバーサル（Hole Punching）
- ピア検出とヘルスチェック

### 9. 参考リソース

- **公式ドキュメント**: https://docs.pangolin.net
- **Pangolinリポジトリ**: https://github.com/fosrl/pangolin
- **Newtリポジトリ**: https://github.com/fosrl/newt
- **Gerbil Scheme**: https://cons.io/
- **WireGuard**: https://www.wireguard.com/
- **Drizzle ORM**: https://orm.drizzle.team/

---

## まとめ

Pangolinエコシステムは以下の要素で構成される複雑だが強力なシステムです:

1. **Pangolin（TypeScript/Next.js）**: 中央管理とコントロールプレーン
2. **Gerbil（Gerbil Scheme）**: WireGuardトンネル管理
3. **Newt（Go）**: 軽量エッジクライアント
4. **Badger**: 認証ミドルウェア
5. **Reverse Proxy**: トラフィックルーティング

クローンを実装する際は、これらのコンポーネント間の通信プロトコル（WebSocket、WireGuard）とデータモデルを正確に理解することが重要です。MVPから始めて段階的に機能を追加するアプローチを推奨します。
