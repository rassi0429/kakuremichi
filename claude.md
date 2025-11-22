# kakuremichi - アーキテクチャ検討

## プロジェクトの目的

Pangolinを参考にしながら、独自のトンネル型リバースプロキシシステムを構築する。
ファイアウォール背後のプライベートネットワークへの安全なアクセスを実現することが目標。

## 解決したい課題

1. **プライベートネットワークへのリモートアクセス**
   - ファイアウォールやNATの背後にあるサービスに安全にアクセスしたい
   - VPNのような複雑な設定なしにアクセス可能にしたい

2. **セキュリティとアクセス制御**
   - 誰がどのサービスにアクセスできるかを細かく制御したい
   - 認証・認可の仕組みが必要

3. **管理の容易性**
   - Webインターフェースで簡単に管理できるようにしたい
   - サービスの追加・削除を動的に行いたい

4. **スケーラビリティ**
   - 複数のプライベートネットワーク、複数のサービスに対応したい
   - 将来的には多数のユーザー・組織に対応したい

## Pangolinから学んだこと

### 良い点
- コントロールプレーン・データプレーンの分離
- WireGuardによる暗号化トンネル
- WebSocketによるリアルタイム制御
- 軽量なエッジクライアント設計

### 検討が必要な点
- コンポーネントが多く複雑（Control Plane, Gerbil, Newt, Badger, Reverse Proxy）
- 技術スタックの混在（TypeScript, Go, Gerbil Scheme）
- Gerbilの役割が不明確（なぜ別コンポーネントなのか？）

## 基本設計方針

### コントロールプレーンとデータプレーンの分離

**重要**: 管理・設定を行うコントロールプレーンと、実際のトラフィックを流すデータプレーンを完全に分離する。

```
■ コントロールプレーン（管理・設定）:
┌─────────┐
│ Control │ ← Web管理画面でアクセス
└─────────┘
  ↓WebSocket  ↓WebSocket
  (設定配信)  (設定配信)
  ↓           ↓
[Gateway]   [Agent]
   群          群

■ データプレーン（実際のトラフィック）:
外部ユーザー → [Gateway] ─トンネル→ [Agent] → アプリ
                (Controlを経由しない)
```

**この設計のメリット**:
- 中央管理サーバーがボトルネックにならない
- パフォーマンスが高い（トラフィックが直接流れる）
- 中央管理サーバーがダウンしても既存の通信は継続可能
- スケーラビリティが高い（入口ノードを独立して増やせる）

## アーキテクチャ構成

### 採用構成: マルチゲートウェイ型
```
┌─────────┐
│ Control │
│ - Web管理UI│
│ - REST API│
│ - WebSocket│
│ - DB（設定）│
└─────────┘
  ↓設定    ↓設定
  ↓        ↓
┌─────────┐ ┌─────────┐
│ Gateway │ │ Agent   │
│  #1     │ │ - トンネル│
├─────────┤ │ - プロキシ│
│ Gateway │ └─────────┘
│  #2     │     ↓
├─────────┤ ┌─────────┐
│ Gateway │ │プライベート│
│  #3     │ │  アプリ  │
└─────────┘ └─────────┘
  ↑
  │ データトラフィック
  │ (Control経由しない)
  ↓
外部ユーザー
```

**コンポーネント**:
- **Control**: 中央管理サーバー（コントロールプレーン）
- **Gateway**: 入口ノード（動的に追加・削除可能）
- **Agent**: エッジクライアント（オリジン側）

**特徴**:
- Gatewayを動的に追加・削除可能
- 各Gatewayは独立して動作
- 負荷分散とDDoS対策
- 高可用性

## 技術選択

### 1. トンネル技術: WireGuard

**採用理由**:
- 高速、セキュア、モダン
- カーネルレベルの実装で低レイテンシ
- NAT traversal対応
- 実績あり（Pangolinでも採用）

**実装方針**:
- **Gateway**: WireGuardサーバー（ポート51820/udp）
  - ネイティブLinux WireGuardまたはwireguard-go
  - 仮想IP: 10.0.0.1, 10.0.0.2, 10.0.0.3, ...
- **Agent**: WireGuardクライアント（ユーザースペース）
  - wireguard-go + netstack
  - **1つのWireGuardインターフェースで複数Gatewayに接続**
  - 仮想IP: 10.0.0.100/24
  - **ポート開放不要**（アウトバウンド接続のみ）

**WireGuard仮想ネットワーク（スケーラブル設計）**:

各Agentが独自の/24サブネットを持つことで、Gateway設定がAgent数に依存しない：

```
Agent A のサブネット: 10.1.0.0/24
  ├─ 10.1.0.100 (Agent A)
  ├─ 10.1.0.1 (Gateway1)
  ├─ 10.1.0.2 (Gateway2)
  └─ 10.1.0.3 (Gateway3)

Agent B のサブネット: 10.2.0.0/24
  ├─ 10.2.0.100 (Agent B)
  ├─ 10.2.0.1 (Gateway1)
  ├─ 10.2.0.2 (Gateway2)
  └─ 10.2.0.3 (Gateway3)

Agent C のサブネット: 10.3.0.0/24
  ├─ 10.3.0.100 (Agent C)
  ├─ 10.3.0.1 (Gateway1)
  ├─ 10.3.0.2 (Gateway2)
  └─ 10.3.0.3 (Gateway3)
```

**Agent側のWireGuard設定例（Agent A）**:
```ini
[Interface]
PrivateKey = <AgentAのPrivateKey>
Address = 10.1.0.100/24

[Peer]  # Gateway1
PublicKey = <Gateway1のPublicKey>
Endpoint = 1.2.3.4:51820
AllowedIPs = 10.1.0.1/32  # Gateway1のみ許可
PersistentKeepalive = 25

[Peer]  # Gateway2
PublicKey = <Gateway2のPublicKey>
Endpoint = 5.6.7.8:51820
AllowedIPs = 10.1.0.2/32  # Gateway2のみ許可
PersistentKeepalive = 25

[Peer]  # Gateway3
PublicKey = <Gateway3のPublicKey>
Endpoint = 9.10.11.12:51820
AllowedIPs = 10.1.0.3/32  # Gateway3のみ許可
PersistentKeepalive = 25
```

**Gateway側のWireGuard設定例（Gateway1）**:
```ini
[Interface]
PrivateKey = <Gateway1のPrivateKey>
# 複数のサブネットに参加するため、複数のIPアドレスを持つ
Address = 10.1.0.1/24, 10.2.0.1/24, 10.3.0.1/24
ListenPort = 51820

[Peer]  # Agent A（サブネット全体を許可）
PublicKey = <AgentAのPublicKey>
AllowedIPs = 10.1.0.0/24  # Agent Aのサブネット全体

[Peer]  # Agent B（サブネット全体を許可）
PublicKey = <AgentBのPublicKey>
AllowedIPs = 10.2.0.0/24  # Agent Bのサブネット全体

[Peer]  # Agent C（サブネット全体を許可）
PublicKey = <AgentCのPublicKey>
AllowedIPs = 10.3.0.0/24  # Agent Cのサブネット全体
```

**セキュリティ**:
- `AllowedIPs`で通信相手を厳密に制限
- Agent間の直接通信は不可能（異なるサブネット）
- Agent ⇔ Gateway のみ通信可能

**スケーラビリティのメリット**:
- Gatewayに新しいAgentを追加する際、IPアドレスを1つ追加するだけ
- Agent数が増えても設定の複雑さは線形増加
- 最大254個のサブネット（10.1.0.0/24 〜 10.254.0.0/24）までサポート可能
```

**DNSラウンドロビン対応**:
```
example.com のAレコード:
  - 1.2.3.4 (Gateway1)
  - 5.6.7.8 (Gateway2)
  - 9.10.11.12 (Gateway3)

外部ユーザー
  ↓ DNS round robin → どれかのGateway（例: Gateway1）
  ↓ HTTPS:443
Gateway1（SSL終端）
  ↓ WireGuardトンネル経由
  → 10.1.0.100 (Agent A の仮想IP)
  ↓
Agent A
  ↓ ローカルプロキシ
プライベートアプリ
```

**トラフィックフロー例**:
1. ユーザーが`https://app.example.com`にアクセス
2. DNSがラウンドロビンで`1.2.3.4`（Gateway1）を返す
3. Gateway1がHTTPS通信を受信、SSL終端
4. Gateway1が`10.1.0.100`（Agent A）にトンネル経由でプロキシ
5. Agent AがローカルのDockerコンテナ（例: `localhost:8080`）にプロキシ
6. レスポンスが逆順で返る

どのGatewayに接続しても、すべてのGatewayが同じAgent（10.1.0.100）に到達できるため、透過的に動作します。

### 2. 認証・認可・鍵管理の設計

**✅ 採用済み: APIキー認証 + ゼロトラストWireGuard鍵管理**

**鍵管理方針（セキュリティ重視）**:
```
Agent/Gateway起動フロー:
1. 起動時に自分でWireGuard key pairを生成
2. private keyはメモリ内のみで保持（永続化しない）
3. WebSocket認証時にpublic key + virtual IPをControlに送信
4. Controlはpublic keyのみをDBに保存

Control Server:
- private keyは見ない・保存しない・送信しない
- 各Agent/Gatewayのpublic keyのみ管理
- 設定配信時は他のpublic keysのみ送信
```

**セキュリティ利点**:
- Controlサーバーが侵害されても秘密鍵は漏洩しない
- 各Agentのprivate keyは分散管理（ゼロトラスト）
- 秘密鍵の一元管理リスクを排除

### 3. データフローの設計

**データプレーン（実際のトラフィック）はどこを通るか？**

**パターンA: ダイレクトトンネル**
```
外部ユーザー → コントロールプレーン（認証） → エッジクライアント → アプリ
                       ↓
              トンネル確立後は直接通信
```

**パターンB: ゲートウェイ経由**
```
外部ユーザー → ゲートウェイ → トンネル → エッジクライアント → アプリ
                   ↑
         コントロールプレーンで認証・ルーティング決定
```

**→ 検討結果: ?**

### 4. エッジクライアントの役割

**必須機能**:
- トンネル確立・維持
- ローカルサービスへのプロキシ

**オプション機能**:
- Docker統合（コンテナ自動検出）
- ヘルスチェック
- メトリクス収集
- 複数サービスのプロキシ

**→ 検討結果: ?**

### 5. 技術スタック

**サーバーサイド（コントロールプレーン）**:
- Node.js + TypeScript?
- Go?
- Python?

**エッジクライアント**:
- Go（軽量、クロスプラットフォーム）
- Rust（パフォーマンス重視）
- Node.js（TypeScriptで統一）

**データベース**:
- SQLite（シンプル）
- PostgreSQL（スケーラブル）
- 両対応？

**フロントエンド**:
- Next.js + React（フルスタック）
- Vue.js + 別途API
- シンプルなHTML + vanilla JS

**→ 検討結果: ?**

### 6. 開発戦略

**アプローチA: MVP優先**
- 最小限の機能で動くものをまず作る
- 認証なし、1対1接続のみ
- 動いたら機能追加

**アプローチB: 設計優先**
- アーキテクチャをしっかり設計
- 拡張性を考慮した実装
- 初期投資は大きいが後が楽

**→ 検討結果: ?**

## 次に決めること

1. [ ] どのアーキテクチャオプションを選ぶか（シンプル / 2層 / 3層）
2. [ ] トンネル技術の選択（WireGuard / SSH / カスタム）
3. [ ] データフローのパターン（ダイレクト / ゲートウェイ経由）
4. [ ] 技術スタックの決定（言語、フレームワーク、DB）
5. [ ] 開発アプローチ（MVP優先 / 設計優先）
6. [ ] MVPの範囲定義（どこまでの機能を最初に実装するか）

## メモ・アイデア

（ここに検討中のアイデアや気づいたことをメモ）

---

**最終更新**: 2025-11-22
