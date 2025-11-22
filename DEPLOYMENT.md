# kakuremichi デプロイメントガイド

本番環境へのデプロイ手順とSSL/TLS証明書の自動取得設定について説明します。

## 前提条件

### 必須要件

1. **ドメイン名**
   - 公開用のドメイン（例: `example.com`）
   - DNSレコードの管理権限

2. **サーバー**
   - **Control Server**: 内部ネットワーク（プライベートIPでも可）
   - **Gateway Server**: パブリックIPアドレス付きVPS/クラウドインスタンス
   - **Agent**: プライベートネットワーク内のサーバー（ポート開放不要）

3. **ソフトウェア**
   - Docker & Docker Compose（推奨）
   - または Go 1.23+, Node.js 22+

4. **ポート開放（Gateway Serverのみ）**
   - `80/tcp`: HTTP-01 Challenge（Let's Encrypt証明書検証用）
   - `443/tcp`: HTTPS
   - `51820/udp`: WireGuard
   - `3001/tcp`: WebSocket（Controlとの通信用、内部ネットワークのみ可）

---

## アーキテクチャ概要

```
                       ┌─────────────┐
                       │   Control   │ (内部ネットワーク)
                       │   Server    │
                       └─────────────┘
                         ↓ WebSocket (3001)
                         ↓
┌──────────────────────────────────────────────┐
│              Gateway Server                   │ (パブリックIP)
│  - HTTP/HTTPS Proxy (80, 443)                │
│  - WireGuard Server (51820/udp)              │
│  - Let's Encrypt ACME (自動SSL証明書)        │
└──────────────────────────────────────────────┘
                         ↑ WireGuard Tunnel
                         ↓
                    ┌─────────┐
                    │  Agent  │ (プライベートネットワーク)
                    └─────────┘
                         ↓
              ┌─────────────────────┐
              │  Private Services   │
              │  (Docker containers) │
              └─────────────────────┘
```

---

## 1. Control Server のデプロイ

Control ServerはWebSocketサーバーとREST API、Webインターフェースを提供します。

### 1.1 環境変数の設定

`control/.env` ファイルを作成：

```bash
# データベース
DATABASE_URL=file:./data/kakuremichi.db

# WebSocketサーバー
WS_PORT=3001

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### 1.2 起動

```bash
cd control
npm install
npm run db:migrate  # データベースマイグレーション
npm run build       # 本番ビルド
npm start           # 本番起動
```

またはDockerを使用：

```bash
docker build -t kakuremichi-control -f docker/control/Dockerfile .
docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/control/data:/app/data \
  --name control \
  kakuremichi-control
```

### 1.3 Gateway/Agent用のAPIキーを生成

Web UI（`http://localhost:3000`）にアクセスして、GatewayとAgentを登録し、APIキーを生成します。

---

## 2. Gateway のデプロイ（SSL自動取得対応）

GatewayはパブリックIPを持つサーバーにデプロイします。Let's Encryptを使用してSSL証明書を自動取得・更新します。

### 2.1 DNS設定

GatewayのパブリックIPアドレスにDNS Aレコードを設定：

```
# 例: Gatewayのパブリックip が 203.0.113.10 の場合

# メインドメイン
example.com.         A    203.0.113.10

# トンネル用サブドメイン（必要に応じて）
app.example.com.     A    203.0.113.10
api.example.com.     A    203.0.113.10
```

DNSの反映を確認：

```bash
dig example.com +short
# → 203.0.113.10 が表示されればOK
```

### 2.2 環境変数の設定

`gateway/.env` ファイルまたは環境変数を設定：

```bash
# Control ServerへのWebSocket接続
CONTROL_URL=ws://control-server-ip:3001
API_KEY=gtw_xxxxxxxxxxxxxxxxxxxxxxxx  # Control UIで生成したAPIキー

# WireGuard設定
WIREGUARD_PORT=51820
WIREGUARD_INTERFACE=wg0

# HTTP/HTTPS
HTTP_PORT=80
HTTPS_PORT=443

# Let's Encrypt ACME設定
ACME_EMAIL=admin@example.com           # 証明書通知用メールアドレス（必須）
ACME_STAGING=false                     # 本番環境ではfalse、テスト時はtrue
ACME_CACHE_DIR=/var/cache/autocert     # 証明書キャッシュディレクトリ
```

**重要な設定項目:**

- **ACME_EMAIL**: Let's Encryptからの証明書期限通知を受け取るメールアドレス。必ず有効なメールアドレスを設定してください。
- **ACME_STAGING**:
  - `true`: Let's Encrypt Staging環境（テスト用、証明書は無効だがrate limit無し）
  - `false`: Let's Encrypt Production環境（本番、rate limit有り）
- **ACME_CACHE_DIR**: 証明書キャッシュの保存先。永続化ストレージを使用すること。

### 2.3 ポートの開放（ファイアウォール設定）

Gatewayサーバーで以下のポートを開放：

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 80/tcp    # HTTP (ACME Challenge用)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 51820/udp # WireGuard
sudo ufw allow 3001/tcp  # WebSocket (Control Serverとの通信)

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=51820/udp
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --reload
```

### 2.4 Gatewayの起動

#### バイナリで起動する場合

```bash
cd gateway
go build -o gateway ./cmd/gateway

# root権限が必要（ポート80, 443, WireGuardの操作）
sudo ./gateway
```

#### Dockerで起動する場合

```bash
docker build -t kakuremichi-gateway -f docker/gateway/Dockerfile .

docker run -d \
  --name gateway \
  --cap-add NET_ADMIN \
  --cap-add SYS_MODULE \
  --sysctl net.ipv4.ip_forward=1 \
  -p 80:80 \
  -p 443:443 \
  -p 51820:51820/udp \
  -p 3001:3001 \
  -v /var/cache/autocert:/var/cache/autocert \
  -e CONTROL_URL=ws://control-server-ip:3001 \
  -e API_KEY=gtw_xxxxxxxxxxxx \
  -e ACME_EMAIL=admin@example.com \
  -e ACME_STAGING=false \
  kakuremichi-gateway
```

**重要**:
- `--cap-add NET_ADMIN`: WireGuardインターフェース操作に必要
- `-v /var/cache/autocert:/var/cache/autocert`: 証明書キャッシュの永続化（重要！）

### 2.5 証明書取得の確認

Gatewayのログを確認：

```bash
# Dockerの場合
docker logs -f gateway

# バイナリ起動の場合
# 標準出力にログが表示される
```

期待されるログ出力:

```
{"level":"info","msg":"ACME/TLS enabled","email":"admin@example.com","staging":false,"cache_dir":"/var/cache/autocert"}
{"level":"info","msg":"Starting HTTP proxy","addr":":80"}
{"level":"info","msg":"ACME HTTP-01 challenge handler mounted at /.well-known/acme-challenge/"}
{"level":"info","msg":"Starting HTTPS proxy","addr":":443"}
{"level":"info","msg":"HTTPS server started with automatic ACME certificate management"}
```

初回アクセス時にSSL証明書が自動取得されます：

```bash
# HTTPSでアクセステスト
curl -I https://example.com

# 証明書の確認
openssl s_client -connect example.com:443 -servername example.com < /dev/null 2>/dev/null | grep "CN="
```

---

## 3. Agent のデプロイ

Agentはプライベートネットワーク内のサーバーにデプロイします。ポート開放は不要です（アウトバウンド接続のみ）。

### 3.1 環境変数の設定

`agent/.env`:

```bash
# Control ServerへのWebSocket接続
CONTROL_URL=ws://control-server-ip:3001
API_KEY=agt_xxxxxxxxxxxxxxxxxxxxxxxx  # Control UIで生成したAPIキー

# WireGuard設定（自動生成されるため通常は設定不要）
WIREGUARD_INTERFACE=wg1
```

### 3.2 Agentの起動

```bash
cd agent
go build -o agent ./cmd/agent

# root権限が必要（WireGuardの操作）
sudo ./agent
```

またはDockerを使用：

```bash
docker build -t kakuremichi-agent -f docker/agent/Dockerfile .

docker run -d \
  --name agent \
  --cap-add NET_ADMIN \
  --sysctl net.ipv4.ip_forward=1 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e CONTROL_URL=ws://control-server-ip:3001 \
  -e API_KEY=agt_xxxxxxxxxxxx \
  kakuremichi-agent
```

---

## 4. Tunnel の作成と有効化

Control Server のWeb UI（`http://localhost:3000`）にアクセスして、Tunnelを作成します。

### 4.1 Tunnel設定例

- **Domain**: `app.example.com`
- **Target**: `http://localhost:8080` (Agentからアクセス可能なローカルサービス)
- **Agent**: Agent一覧から選択
- **Enabled**: チェックを入れる

### 4.2 動作確認

1. DNSレコードが正しく設定されていることを確認
2. `https://app.example.com` にアクセス
3. SSL証明書が自動取得され、HTTPSで接続できることを確認
4. ターゲットサービスにプロキシされることを確認

---

## 5. Let's Encrypt Rate Limits（重要）

Let's Encryptには以下のrate limitがあります：

- **証明書発行制限**: 同一ドメインで **週50枚**まで
- **Failed Validation制限**: 同一アカウント・ドメインで **時間あたり5回**まで

### 5.1 テスト時のベストプラクティス

本番環境での証明書取得テストを行う前に、必ず **Staging環境** を使用してください：

```bash
ACME_STAGING=true
```

Staging環境で正常に証明書が取得できることを確認してから、本番環境に切り替えます：

```bash
ACME_STAGING=false
```

### 5.2 証明書キャッシュの重要性

証明書は `/var/cache/autocert` にキャッシュされます。このディレクトリを永続化することで：

- サーバー再起動時に証明書を再取得しない
- Rate limitに引っかからない
- 起動時間が短縮される

**必ずボリュームマウントして永続化してください！**

---

## 6. トラブルシューティング

### 6.1 証明書が取得できない

**症状**: HTTPSでアクセスできない、証明書エラーが出る

**原因と対策**:

1. **DNS設定が反映されていない**
   ```bash
   dig app.example.com +short
   # GatewayのパブリックIPが表示されるか確認
   ```

2. **ポート80が開放されていない**
   ```bash
   # 外部から確認
   curl -I http://app.example.com/.well-known/acme-challenge/test
   # 404エラーならOK（チャレンジハンドラが動作している証拠）
   # タイムアウトならポート80が閉じている
   ```

3. **ドメインがTunnelに登録されていない**
   - Control UIでTunnelが作成されているか確認
   - Tunnelが `Enabled` になっているか確認

4. **Rate limitに引っかかった**
   - Staging環境に切り替えてテスト
   - キャッシュディレクトリを確認

### 6.2 HTTP-01 Challenge が失敗する

**ログを確認**:

```bash
docker logs gateway 2>&1 | grep -i acme
```

**よくあるエラー**:

```
ACME: Rejecting certificate request for unknown domain: app.example.com
```

→ TunnelがControl Serverに登録されていない、またはGatewayが設定を受信していない

**解決策**:
1. Control ServerのWebSocketが正常に動作しているか確認
2. GatewayがControl Serverに接続できているか確認
3. Tunnelの設定を再保存してGatewayに再送信

### 6.3 Gateway と Control Server の接続が切れる

**症状**: Gatewayがオフラインになる、設定が反映されない

**原因と対策**:

1. **WebSocketポート（3001）が閉じている**
   ```bash
   telnet control-server-ip 3001
   ```

2. **APIキーが無効**
   - Control UIでGatewayのAPIキーを再生成
   - Gatewayの環境変数 `API_KEY` を更新

3. **ファイアウォールでブロックされている**
   - Control Server側でポート3001を開放

---

## 7. 本番環境のベストプラクティス

### 7.1 セキュリティ

- **APIキーの管理**:
  - 環境変数で渡す（ソースコードに埋め込まない）
  - 定期的にローテーション
- **ACME_EMAIL**:
  - 必ず有効なメールアドレスを設定（証明書期限通知を受け取る）
- **ファイアウォール**:
  - 必要なポートのみ開放
  - WebSocketポート（3001）は内部ネットワークのみ許可

### 7.2 監視

- **証明書の有効期限**:
  - Let's Encryptは90日で期限切れ
  - autocertが自動更新するが、念のためモニタリング推奨
- **Gatewayのログ監視**:
  - SSL証明書取得エラー
  - WireGuard接続エラー
- **WebSocket接続状態**:
  - Control UIでGateway/Agentのステータスを確認

### 7.3 バックアップ

- **証明書キャッシュ**: `/var/cache/autocert` をバックアップ
- **Controlデータベース**: `control/data/kakuremichi.db` をバックアップ

### 7.4 高可用性

複数のGatewayをデプロイしてDNSラウンドロビンを設定：

```
# DNS設定例
example.com.    A    203.0.113.10   (Gateway #1)
example.com.    A    203.0.113.11   (Gateway #2)
example.com.    A    203.0.113.12   (Gateway #3)
```

すべてのGatewayが同じAgentに接続できるため、負荷分散と冗長性を実現できます。

---

## 8. systemdサービス化（推奨）

### 8.1 Gateway用systemdユニット

`/etc/systemd/system/kakuremichi-gateway.service`:

```ini
[Unit]
Description=kakuremichi Gateway
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/kakuremichi/gateway
Environment="CONTROL_URL=ws://control-server-ip:3001"
Environment="API_KEY=gtw_xxxxxxxxxxxx"
Environment="ACME_EMAIL=admin@example.com"
Environment="ACME_STAGING=false"
Environment="ACME_CACHE_DIR=/var/cache/autocert"
ExecStart=/opt/kakuremichi/gateway/gateway
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

起動：

```bash
sudo systemctl daemon-reload
sudo systemctl enable kakuremichi-gateway
sudo systemctl start kakuremichi-gateway
sudo systemctl status kakuremichi-gateway
```

### 8.2 Agent用systemdユニット

`/etc/systemd/system/kakuremichi-agent.service`:

```ini
[Unit]
Description=kakuremichi Agent
After=network.target docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/kakuremichi/agent
Environment="CONTROL_URL=ws://control-server-ip:3001"
Environment="API_KEY=agt_xxxxxxxxxxxx"
ExecStart=/opt/kakuremichi/agent/agent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## 9. まとめ

kakuremichiのデプロイ手順：

1. ✅ Control Server を起動
2. ✅ Gateway/Agent用のAPIキーを生成
3. ✅ DNS AレコードをGatewayのパブリックIPに設定
4. ✅ Gatewayをデプロイ（ポート80, 443, 51820, 3001を開放）
5. ✅ Agentをプライベートネットワークにデプロイ
6. ✅ Control UIでTunnelを作成・有効化
7. ✅ HTTPSでアクセスして動作確認

Let's Encryptを使用することで、SSL証明書は完全自動で取得・更新されます。

**次のステップ**:
- Web UIの完成（Phase 2）
- マルチゲートウェイの負荷分散
- Kubernetesデプロイメント

---

**困ったときは**: [GitHub Issues](https://github.com/yourorg/kakuremichi/issues)
