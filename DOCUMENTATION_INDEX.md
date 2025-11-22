# kakuremichi - ドキュメント一覧

## 設計ドキュメント

### 1. プロジェクト全体

| ドキュメント | 説明 | パス |
|------------|------|------|
| **要件定義** | MVP要件、ユースケース、成功基準 | `requirements.md` |
| **ロードマップ** | Phase 2以降の機能計画 | `roadmap.md` |
| **アーキテクチャ** | システム設計、WireGuard構成 | `claude.md` |
| **コンポーネント定義** | Control/Gateway/Agentの役割 | `components.md` |
| **技術スタック** | 使用ライブラリ、技術選定 | `tech-stack.md` |
| **プロジェクト構成** | ディレクトリ構造、モノレポ設計 | `project-structure.md` |
| **データモデル** | データベーススキーマ、ER図 | `data-model.md` |
| **API設計** | REST API、WebSocketプロトコル | `api-design.md` |

---

### 2. モジュール仕様

| モジュール | コンポーネント | 説明 | パス |
|-----------|--------------|------|------|
| **WebSocketサーバー** | Control | Agent/Gatewayとの通信管理 | `modules/control-websocket-server.md` |
| **WireGuard管理** | Gateway | WireGuardインターフェース、Peer管理 | `modules/gateway-wireguard.md` |
| **HTTPプロキシ** | Gateway | HTTPS受信、SSL終端、ルーティング | `modules/gateway-http-proxy.md` |
| **ローカルプロキシ** | Agent | WireGuard → ローカルアプリへのプロキシ | `modules/agent-local-proxy.md` |

---

## ドキュメント構成マップ

```
kakuremichi/
├── README.md                          # プロジェクト概要
├── DOCUMENTATION_INDEX.md             # このファイル（ドキュメント一覧）
│
├── 全体設計/
│   ├── requirements.md                # 要件定義（MVP）
│   ├── roadmap.md                     # ロードマップ（Phase 2+）
│   ├── claude.md                      # アーキテクチャ検討
│   ├── components.md                  # コンポーネント定義
│   ├── tech-stack.md                  # 技術スタック
│   ├── project-structure.md           # プロジェクト構成
│   ├── data-model.md                  # データモデル
│   └── api-design.md                  # API設計
│
└── モジュール仕様/
    ├── control-websocket-server.md    # Control: WebSocket
    ├── gateway-wireguard.md           # Gateway: WireGuard
    ├── gateway-http-proxy.md          # Gateway: HTTP Proxy
    └── agent-local-proxy.md           # Agent: Local Proxy
```

---

## 実装前チェックリスト

実装開始前に以下のドキュメントを確認：

### Phase 1: プロジェクト理解
- [ ] `requirements.md` - MVPの要件を理解
- [ ] `claude.md` - アーキテクチャを理解
- [ ] `components.md` - 各コンポーネントの役割を理解

### Phase 2: 技術設計
- [ ] `tech-stack.md` - 使用技術を確認
- [ ] `data-model.md` - データベース構造を理解
- [ ] `api-design.md` - API仕様を理解

### Phase 3: 実装計画
- [ ] `project-structure.md` - ディレクトリ構成を確認
- [ ] `modules/*.md` - 実装するモジュールの仕様を確認

---

## 次のステップ

### 1. 追加で必要なモジュール仕様

以下のモジュール仕様を作成すると、実装がさらにスムーズになります：

**Control**:
- [ ] `control-database.md` - Drizzle ORM、スキーマ、マイグレーション
- [ ] `control-api-routes.md` - REST API実装（Agent/Gateway/Tunnel管理）
- [ ] `control-wireguard-config.md` - WireGuard設定生成ロジック
- [ ] `control-frontend.md` - Next.js UI実装（ページ、コンポーネント）

**Gateway**:
- [ ] `gateway-websocket-client.md` - Control接続、メッセージハンドリング
- [ ] `gateway-ssl.md` - Let's Encrypt証明書管理

**Agent**:
- [ ] `agent-wireguard.md` - WireGuard + netstack実装
- [ ] `agent-websocket-client.md` - Control接続、メッセージハンドリング
- [ ] `agent-docker.md` - Docker統合（コンテナ検出）

**共通**:
- [ ] `install-scripts.md` - agent.sh、gateway.shの実装仕様

### 2. プロジェクト初期化

ディレクトリ作成、package.json、go.modのセットアップ

### 3. 実装開始

モジュール仕様に基づいて実装

---

## ドキュメント作成ガイドライン

新しいモジュール仕様を作成する際のテンプレート：

```markdown
# [コンポーネント] - [モジュール名]

## 概要
モジュールの目的と役割

## 責務
1. 責務1
2. 責務2

## 依存パッケージ
使用するライブラリ

## 構造体定義
主要な型定義

## 主要メソッド
各メソッドの処理フロー、サンプルコード

## 使用例
実際の使い方

## テスト
テストコード例
```

---

## 参考資料

### 外部ドキュメント
- [Pangolin分析](pangolin-ecosystem-analysis.md) - 参考にしたPangolinの調査結果

### 技術ドキュメント
- [WireGuard公式](https://www.wireguard.com/)
- [Next.js公式](https://nextjs.org/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Let's Encrypt](https://letsencrypt.org/)

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
