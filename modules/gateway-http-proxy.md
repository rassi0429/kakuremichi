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

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
