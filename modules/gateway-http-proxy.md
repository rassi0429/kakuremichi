# Gateway - HTTPリバースプロキシ

## 概要

GatewayのHTTP/HTTPSリバースプロキシ実装。外部ユーザーからのリクエストを受信し、WireGuardトンネル経由でAgentにプロキシ。

**パス**: `gateway/internal/proxy/`

---

## 責務

1. HTTPS通信の受信（ポート443）
2. SSL/TLS終端
3. ドメインベースルーティング（domain → Agent）
4. WireGuardトンネル経由でAgentにプロキシ
5. Let's Encrypt証明書の自動取得・更新

---

## 依存パッケージ

```go
import (
    "net/http"
    "net/http/httputil"
    "net/url"
    "golang.org/x/crypto/acme/autocert"
    "log/slog"
)
```

---

## 構造体定義

```go
// gateway/internal/proxy/router.go

type TunnelConfig struct {
    ID             string
    Domain         string
    AgentVirtualIP string  // 例: "10.1.0.100"
    Target         string  // 例: "localhost:8080"
    Enabled        bool
}

type Router struct {
    tunnels    map[string]*TunnelConfig  // key: domain
    certManager *autocert.Manager
    logger      *slog.Logger
}
```

---

## 主要メソッド

### `NewRouter(certManager *autocert.Manager, logger *slog.Logger) *Router`

**サンプルコード**:
```go
func NewRouter(certManager *autocert.Manager, logger *slog.Logger) *Router {
    return &Router{
        tunnels:     make(map[string]*TunnelConfig),
        certManager: certManager,
        logger:      logger,
    }
}
```

---

### `UpdateTunnels(tunnels []TunnelConfig) error`

Controlからのconfigメッセージでトンネル一覧を受け取った際に呼び出す。

**サンプルコード**:
```go
func (r *Router) UpdateTunnels(tunnels []TunnelConfig) error {
    r.logger.Info("Updating tunnels", "count", len(tunnels))

    // 既存のトンネルをクリア
    r.tunnels = make(map[string]*TunnelConfig)

    // 新しいトンネルを追加
    for _, tunnel := range tunnels {
        if tunnel.Enabled {
            r.tunnels[tunnel.Domain] = &tunnel
            r.logger.Info("Tunnel registered",
                "domain", tunnel.Domain,
                "agentIP", tunnel.AgentVirtualIP,
                "target", tunnel.Target,
            )
        }
    }

    // autocertのHostPolicyを更新
    r.updateHostPolicy()

    return nil
}
```

---

### `AddTunnel(tunnel TunnelConfig) error`

単一のトンネルを追加

**サンプルコード**:
```go
func (r *Router) AddTunnel(tunnel TunnelConfig) error {
    if !tunnel.Enabled {
        return nil
    }

    r.logger.Info("Adding tunnel",
        "domain", tunnel.Domain,
        "agentIP", tunnel.AgentVirtualIP,
    )

    r.tunnels[tunnel.Domain] = &tunnel
    r.updateHostPolicy()

    return nil
}
```

---

### `RemoveTunnel(domain string) error`

トンネルを削除

**サンプルコード**:
```go
func (r *Router) RemoveTunnel(domain string) error {
    r.logger.Info("Removing tunnel", "domain", domain)

    delete(r.tunnels, domain)
    r.updateHostPolicy()

    return nil
}
```

---

### `ServeHTTP(w http.ResponseWriter, req *http.Request)`

HTTPリクエストをルーティング

**処理フロー**:
1. リクエストのHostヘッダーからドメインを取得
2. tunnelsマップからTunnelConfigを検索
3. 存在しない場合は404
4. AgentのvirtualIPをターゲットとしてプロキシ

**サンプルコード**:
```go
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
    domain := req.Host

    r.logger.Debug("Incoming request",
        "domain", domain,
        "path", req.URL.Path,
        "method", req.Method,
    )

    // トンネルを検索
    tunnel, exists := r.tunnels[domain]
    if !exists {
        r.logger.Warn("Tunnel not found", "domain", domain)
        http.Error(w, "Tunnel not found", http.StatusNotFound)
        return
    }

    if !tunnel.Enabled {
        r.logger.Warn("Tunnel disabled", "domain", domain)
        http.Error(w, "Tunnel disabled", http.StatusServiceUnavailable)
        return
    }

    // AgentのvirtualIP:targetにプロキシ
    // 例: AgentVirtualIP=10.1.0.100, Target=localhost:8080
    // → http://10.1.0.100:8080にプロキシ
    targetURL, err := url.Parse(fmt.Sprintf("http://%s", tunnel.AgentVirtualIP))
    if err != nil {
        r.logger.Error("Invalid target URL", "error", err)
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }

    // リバースプロキシ作成
    proxy := httputil.NewSingleHostReverseProxy(targetURL)

    // エラーハンドラー
    proxy.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
        r.logger.Error("Proxy error",
            "domain", domain,
            "agentIP", tunnel.AgentVirtualIP,
            "error", err,
        )
        http.Error(w, "Bad Gateway", http.StatusBadGateway)
    }

    // プロキシ実行
    r.logger.Info("Proxying request",
        "domain", domain,
        "agentIP", tunnel.AgentVirtualIP,
        "path", req.URL.Path,
    )

    proxy.ServeHTTP(w, req)
}
```

**注意**: Agentは自分のvirtualIP（例: 10.1.0.100）でリクエストをリッスンし、localhost:8080にプロキシする。

---

### `updateHostPolicy()`

autocertのHostPolicyを更新。Let's Encryptが証明書を取得するドメインを制限。

**サンプルコード**:
```go
func (r *Router) updateHostPolicy() {
    domains := make([]string, 0, len(r.tunnels))
    for domain := range r.tunnels {
        domains = append(domains, domain)
    }

    r.logger.Info("Updating host policy", "domains", domains)

    r.certManager.HostPolicy = autocert.HostWhitelist(domains...)
}
```

---

## SSL/TLS証明書管理

### `NewCertManager(cacheDir string, email string) *autocert.Manager`

**サンプルコード**:
```go
// gateway/internal/ssl/autocert.go

func NewCertManager(cacheDir string, email string, logger *slog.Logger) *autocert.Manager {
    manager := &autocert.Manager{
        Prompt:      autocert.AcceptTOS,
        Cache:       autocert.DirCache(cacheDir),
        Email:       email,
        HostPolicy:  autocert.HostWhitelist(),  // 初期は空、Routerが更新
    }

    logger.Info("Certificate manager created",
        "cacheDir", cacheDir,
        "email", email,
    )

    return manager
}
```

---

## HTTPサーバー起動

```go
// gateway/internal/proxy/server.go

type Server struct {
    router      *Router
    certManager *autocert.Manager
    httpServer  *http.Server
    httpsServer *http.Server
    logger      *slog.Logger
}

func NewServer(router *Router, certManager *autocert.Manager, logger *slog.Logger) *Server {
    return &Server{
        router:      router,
        certManager: certManager,
        logger:      logger,
    }
}

func (s *Server) Start() error {
    // HTTPサーバー（ポート80）
    // HTTP-01 チャレンジとHTTPS リダイレクト
    s.httpServer = &http.Server{
        Addr: ":80",
        Handler: s.certManager.HTTPHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // HTTPSにリダイレクト
            target := "https://" + r.Host + r.URL.Path
            if r.URL.RawQuery != "" {
                target += "?" + r.URL.RawQuery
            }
            http.Redirect(w, r, target, http.StatusMovedPermanently)
        })),
    }

    // HTTPSサーバー（ポート443）
    s.httpsServer = &http.Server{
        Addr:      ":443",
        Handler:   s.router,
        TLSConfig: s.certManager.TLSConfig(),
    }

    // 並行起動
    go func() {
        s.logger.Info("Starting HTTP server", "port", 80)
        if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            s.logger.Error("HTTP server error", "error", err)
        }
    }()

    s.logger.Info("Starting HTTPS server", "port", 443)
    return s.httpsServer.ListenAndServeTLS("", "")
}

func (s *Server) Shutdown(ctx context.Context) error {
    s.logger.Info("Shutting down HTTP/HTTPS servers")

    if err := s.httpServer.Shutdown(ctx); err != nil {
        return err
    }

    return s.httpsServer.Shutdown(ctx)
}
```

---

## 使用例

```go
// gateway/cmd/gateway/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // SSL証明書マネージャー
    certManager := ssl.NewCertManager(
        "/var/cache/kakuremichi/certs",
        "admin@example.com",
        logger,
    )

    // ルーター
    router := proxy.NewRouter(certManager, logger)

    // トンネル設定（Controlから受信）
    tunnels := []proxy.TunnelConfig{
        {
            ID:             "tunnel-1",
            Domain:         "app.example.com",
            AgentVirtualIP: "10.1.0.100",
            Target:         "localhost:8080",
            Enabled:        true,
        },
    }
    router.UpdateTunnels(tunnels)

    // HTTPサーバー起動
    server := proxy.NewServer(router, certManager, logger)
    if err := server.Start(); err != nil {
        logger.Error("Server error", "error", err)
        os.Exit(1)
    }
}
```

---

## Agent側の対応

Agentは自分のvirtualIP（例: 10.1.0.100）でHTTPリクエストをリッスンする必要がある：

```go
// agent/internal/proxy/local.go

func (a *Agent) StartLocalProxy() error {
    // virtualIP:80 でリッスン
    listener, err := net.Listen("tcp", fmt.Sprintf("%s:80", a.virtualIP))
    if err != nil {
        return err
    }

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        // ターゲット（localhost:8080など）にプロキシ
        proxy := httputil.NewSingleHostReverseProxy(targetURL)
        proxy.ServeHTTP(w, r)
    })

    return http.Serve(listener, nil)
}
```

---

## テスト

```go
// gateway/internal/proxy/router_test.go

func TestRouter_ServeHTTP(t *testing.T) {
    logger := slog.Default()
    router := NewRouter(nil, logger)

    // テスト用トンネル
    router.AddTunnel(TunnelConfig{
        ID:             "test",
        Domain:         "test.example.com",
        AgentVirtualIP: "10.1.0.100",
        Target:         "localhost:8080",
        Enabled:        true,
    })

    // リクエスト作成
    req := httptest.NewRequest("GET", "https://test.example.com/", nil)
    req.Host = "test.example.com"
    w := httptest.NewRecorder()

    // テスト（実際のAgentは起動していないので失敗するが、ルーティングロジックは確認できる）
    router.ServeHTTP(w, req)

    // 404ではないことを確認（トンネルが見つかっている）
    if w.Code == http.StatusNotFound {
        t.Error("Tunnel not found")
    }
}
```

---

## ACME/SSL証明書管理の詳細設計

### autocertの動作フロー

#### 初回証明書取得（HTTP-01チャレンジ）

1. **クライアントがHTTPS接続を試みる**: `https://app.example.com`
2. **autocertが証明書キャッシュを確認**: キャッシュになし
3. **Let's EncryptにACME証明書リクエスト**:
   - ドメイン: `app.example.com`
   - アカウント鍵を使用（初回は自動生成）
4. **Let's EncryptがHTTP-01チャレンジを発行**:
   - チャレンジトークン: `abc123`
   - 検証URL: `http://app.example.com/.well-known/acme-challenge/abc123`
5. **autocertがチャレンジレスポンスを返す**:
   - `/.well-known/acme-challenge/*`へのリクエストを自動処理
   - チャレンジトークンに対応するレスポンスを返す
6. **Let's Encryptが検証**:
   - DNS: `app.example.com` → Gateway IPを解決
   - HTTP GET: `http://app.example.com/.well-known/acme-challenge/abc123`
   - レスポンスが正しければ検証成功
7. **証明書発行**: Let's Encryptが証明書+秘密鍵を発行
8. **autocertがキャッシュに保存**: `/var/cache/autocert/app.example.com`

### 複数Gateway時の課題と解決策

#### 問題点

DNS Round Robin環境で複数Gatewayが存在する場合：

```
app.example.com → 1.2.3.4 (Gateway1)
                 → 5.6.7.8 (Gateway2)
```

- Gateway1が証明書取得を開始
- Let's EncryptがHTTP-01チャレンジの検証リクエストを送信
- **DNS Round RobinでGateway2に振り分けられる可能性**
- Gateway2はチャレンジトークンを持っていない → 検証失敗

#### 解決策1: 証明書の事前取得（推奨、MVP採用）

**Control側でACME取得を行い、Gatewayに配信する方式**

```typescript
// control/src/lib/acme/manager.ts

import { autocert } from 'golang.org/x/crypto/acme/autocert';

class ACMEManager {
  async obtainCertificate(domain: string): Promise<{ cert: string; key: string }> {
    // Controlサーバーで証明書取得
    // HTTP-01チャレンジはControlが応答
    const manager = new autocert.Manager({
      Prompt: autocert.AcceptTOS,
      HostPolicy: autocert.HostWhitelist(domain),
      Cache: autocert.DirCache('/var/cache/acme'),
    });

    const cert = await manager.GetCertificate(domain);

    // DBに保存
    await db.insert(certificates).values({
      domain,
      certificate: cert.Certificate,
      privateKey: cert.PrivateKey,
      expiresAt: cert.Leaf.NotAfter,
    });

    // 全Gatewayに配信（WebSocket経由）
    await wsServer.broadcastCertificate({
      domain,
      certificate: cert.Certificate,
      privateKey: cert.PrivateKey,
    });

    return { cert: cert.Certificate, key: cert.PrivateKey };
  }
}
```

**メリット**:
- 複数Gateway間で証明書の不整合が発生しない
- Let's EncryptのRate Limit回避（1つのドメインで1回のみ取得）

**デメリット**:
- Controlサーバーに証明書取得用のHTTP 80番ポート公開が必要
- または別の検証方法（DNS-01）が必要

#### 解決策2: 証明書キャッシュの共有（Phase 2）

**共有ストレージでautocertキャッシュを共有**

```go
// gateway/internal/proxy/http.go

import (
    "golang.org/x/crypto/acme/autocert"
    "cloud.google.com/go/storage"
)

// GCS（Google Cloud Storage）をキャッシュとして使用
type GCSCache struct {
    bucket *storage.BucketHandle
}

func (c *GCSCache) Get(ctx context.Context, key string) ([]byte, error) {
    // GCSからキャッシュ取得
}

func (c *GCSCache) Put(ctx context.Context, key string, data []byte) error {
    // GCSにキャッシュ保存
}

func (c *GCSCache) Delete(ctx context.Context, key string) error {
    // GCSからキャッシュ削除
}

// autocertで使用
m := &autocert.Manager{
    Cache: &GCSCache{bucket: gcsBucket},
    // ...
}
```

**メリット**:
- 複数Gateway間で証明書を自動共有
- どのGatewayでも証明書取得・検証可能

**デメリット**:
- 外部ストレージ（GCS、S3、Azure Blob）が必要
- MVP範囲外

### MVP実装方針（解決策1採用）

#### Tunnel作成時の証明書自動取得フロー

1. **ユーザーがWeb UIでTunnel作成**:
   - ドメイン: `app.example.com`
   - Agent: `agent-1`
   - Target: `localhost:8080`

2. **Control APIがTunnel作成**:
   ```typescript
   POST /api/tunnels
   {
     "domain": "app.example.com",
     "agentId": "uuid",
     "target": "localhost:8080"
   }
   ```

3. **証明書の確認と取得**:
   ```typescript
   // Tunnel作成時に証明書を確認
   const existingCert = await db.query.certificates.findFirst({
     where: eq(certificates.domain, domain),
   });

   if (!existingCert) {
     // 証明書がない場合は取得
     const { cert, key } = await acmeManager.obtainCertificate(domain);
   }
   ```

4. **Gatewayに証明書配信**:
   - WebSocket経由で全Gatewayに`certificate_create`メッセージ送信
   - Gateway側でメモリキャッシュに保存

### 証明書の自動更新

**Let's Encrypt証明書の有効期限**: 90日

**更新タイミング**: 有効期限の30日前（残り60日）

```typescript
// control/src/lib/acme/renewal.ts

import cron from 'node-cron';

// 毎日0時に証明書の有効期限をチェック
cron.schedule('0 0 * * *', async () => {
  const certificates = await db.query.certificates.findMany();

  for (const cert of certificates) {
    const daysUntilExpiry = Math.floor(
      (cert.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiry <= 30) {
      logger.info('Renewing certificate', { domain: cert.domain, daysUntilExpiry });

      try {
        const { cert: newCert, key: newKey } = await acmeManager.obtainCertificate(cert.domain);

        // DBを更新
        await db.update(certificates)
          .set({ certificate: newCert, privateKey: newKey, expiresAt: newExpiresAt })
          .where(eq(certificates.domain, cert.domain));

        // Gatewayに配信
        await wsServer.broadcastCertificate({
          domain: cert.domain,
          certificate: newCert,
          privateKey: newKey,
        });

        logger.info('Certificate renewed', { domain: cert.domain });
      } catch (error) {
        logger.error('Failed to renew certificate', { domain: cert.domain, error });
        // アラート送信（Phase 2）
      }
    }
  }
});
```

### DNSの設定要件

**前提条件**: ドメインのDNS AレコードをGateway IPに向ける

```
app.example.com.  IN  A  1.2.3.4  # Gateway1
app.example.com.  IN  A  5.6.7.8  # Gateway2
```

**注意点**:
- DNS Round Robin環境でLet's Encrypt検証が失敗しないよう、すべてのGateway IPでHTTP-01チャレンジに応答できる必要がある
- MVP実装（解決策1）ではControlサーバーが証明書を取得するため、**ControlサーバーのIPアドレスをDNSに登録**する必要がある

**MVP代替案**: DNS-01チャレンジ使用

- HTTP-01の代わりにDNS-01チャレンジを使用
- DNS TXTレコードで検証
- Cloudflare API、Route53 APIなどと連携

```typescript
// DNS-01チャレンジ例（Cloudflare使用）
import Cloudflare from 'cloudflare';

const cf = new Cloudflare({ apiToken: process.env.CLOUDFLARE_API_TOKEN });

async function createDNSTXTRecord(domain: string, value: string) {
  await cf.dns.records.create({
    zone_id: zoneId,
    type: 'TXT',
    name: `_acme-challenge.${domain}`,
    content: value,
  });
}
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
