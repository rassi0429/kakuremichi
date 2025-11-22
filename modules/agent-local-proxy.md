# Agent - ローカルプロキシ

## 概要

AgentのローカルHTTPプロキシ実装。WireGuardトンネル経由で受信したリクエストをローカルアプリケーションにプロキシ。

**パス**: `agent/internal/proxy/`

---

## 責務

1. WireGuard仮想IP（例: 10.1.0.100）でHTTPリクエストを受信
2. Tunnel設定に基づいてローカルターゲットにプロキシ
3. 複数のTunnelを同時処理
4. エラーハンドリング

---

## 依存パッケージ

```go
import (
    "net/http"
    "net/http/httputil"
    "net/url"
    "log/slog"
)
```

---

## 構造体定義

```go
// agent/internal/proxy/local.go

type TunnelConfig struct {
    ID      string
    Domain  string
    Target  string  // 例: "localhost:8080", "192.168.1.10:3000"
    Enabled bool
}

type LocalProxy struct {
    virtualIP  string                        // Agent仮想IP（例: "10.1.0.100"）
    tunnels    map[string]*TunnelConfig      // key: domain
    server     *http.Server
    logger     *slog.Logger
}
```

---

## 主要メソッド

### `NewLocalProxy(virtualIP string, logger *slog.Logger) *LocalProxy`

**サンプルコード**:
```go
func NewLocalProxy(virtualIP string, logger *slog.Logger) *LocalProxy {
    return &LocalProxy{
        virtualIP: virtualIP,
        tunnels:   make(map[string]*TunnelConfig),
        logger:    logger,
    }
}
```

---

### `UpdateTunnels(tunnels []TunnelConfig) error`

Controlからのconfigメッセージでトンネル一覧を受け取った際に呼び出す。

**サンプルコード**:
```go
func (p *LocalProxy) UpdateTunnels(tunnels []TunnelConfig) error {
    p.logger.Info("Updating tunnels", "count", len(tunnels))

    // 既存のトンネルをクリア
    p.tunnels = make(map[string]*TunnelConfig)

    // 新しいトンネルを追加
    for _, tunnel := range tunnels {
        if tunnel.Enabled {
            p.tunnels[tunnel.Domain] = &tunnel
            p.logger.Info("Tunnel registered",
                "domain", tunnel.Domain,
                "target", tunnel.Target,
            )
        }
    }

    return nil
}
```

---

### `AddTunnel(tunnel TunnelConfig) error`

単一のトンネルを追加

**サンプルコード**:
```go
func (p *LocalProxy) AddTunnel(tunnel TunnelConfig) error {
    if !tunnel.Enabled {
        return nil
    }

    p.logger.Info("Adding tunnel",
        "domain", tunnel.Domain,
        "target", tunnel.Target,
    )

    p.tunnels[tunnel.Domain] = &tunnel

    return nil
}
```

---

### `RemoveTunnel(domain string) error`

トンネルを削除

**サンプルコード**:
```go
func (p *LocalProxy) RemoveTunnel(domain string) error {
    p.logger.Info("Removing tunnel", "domain", domain)
    delete(p.tunnels, domain)
    return nil
}
```

---

### `Start() error`

HTTPサーバーを起動。仮想IPの80ポートでリッスン。

**処理フロー**:
1. 仮想IP:80でリッスン
2. リクエストを受信
3. Hostヘッダーからドメインを判定
4. tunnelsマップから対応するターゲットを検索
5. ターゲットにプロキシ

**サンプルコード**:
```go
func (p *LocalProxy) Start() error {
    addr := fmt.Sprintf("%s:80", p.virtualIP)
    p.logger.Info("Starting local proxy", "addr", addr)

    p.server = &http.Server{
        Addr:    addr,
        Handler: http.HandlerFunc(p.handleRequest),
    }

    return p.server.ListenAndServe()
}
```

---

### `handleRequest(w http.ResponseWriter, req *http.Request)`

リクエストをルーティング

**サンプルコード**:
```go
func (p *LocalProxy) handleRequest(w http.ResponseWriter, req *http.Request) {
    domain := req.Host

    p.logger.Debug("Incoming request",
        "domain", domain,
        "path", req.URL.Path,
        "method", req.Method,
    )

    // トンネルを検索
    tunnel, exists := p.tunnels[domain]
    if !exists {
        p.logger.Warn("Tunnel not found", "domain", domain)
        http.Error(w, "Tunnel not found", http.StatusNotFound)
        return
    }

    if !tunnel.Enabled {
        p.logger.Warn("Tunnel disabled", "domain", domain)
        http.Error(w, "Tunnel disabled", http.StatusServiceUnavailable)
        return
    }

    // ターゲットURLを構築
    targetURL, err := url.Parse(fmt.Sprintf("http://%s", tunnel.Target))
    if err != nil {
        p.logger.Error("Invalid target URL", "error", err)
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }

    // リバースプロキシ作成
    proxy := httputil.NewSingleHostReverseProxy(targetURL)

    // エラーハンドラー
    proxy.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
        p.logger.Error("Proxy error",
            "domain", domain,
            "target", tunnel.Target,
            "error", err,
        )
        http.Error(w, "Bad Gateway", http.StatusBadGateway)
    }

    // プロキシ実行
    p.logger.Info("Proxying request",
        "domain", domain,
        "target", tunnel.Target,
        "path", req.URL.Path,
    )

    proxy.ServeHTTP(w, req)
}
```

---

### `Stop(ctx context.Context) error`

HTTPサーバーを停止

**サンプルコード**:
```go
func (p *LocalProxy) Stop(ctx context.Context) error {
    if p.server == nil {
        return nil
    }

    p.logger.Info("Stopping local proxy")
    return p.server.Shutdown(ctx)
}
```

---

## リクエストフロー

```
外部ユーザー
  ↓ HTTPS
Gateway (1.2.3.4:443)
  ↓ SSL終端
  ↓ WireGuardトンネル経由
  ↓ HTTP
Agent (10.1.0.100:80)  ← LocalProxyがリッスン
  ↓ HTTP
ローカルアプリ (localhost:8080)
```

**例**:
1. ユーザーが `https://app.example.com/api/users` にアクセス
2. DNSがGateway (1.2.3.4) を返す
3. GatewayがSSL終端、Hostヘッダーから `app.example.com` を検出
4. Gatewayのルーターが `app.example.com` → Agent仮想IP `10.1.0.100` にマッピング
5. Gatewayが `http://10.1.0.100/api/users` にプロキシ（WireGuardトンネル経由）
6. AgentのLocalProxyが `10.1.0.100:80` でリクエストを受信
7. Hostヘッダー `app.example.com` から Tunnel設定を検索
8. ターゲット `localhost:8080` にプロキシ
9. ローカルアプリが処理、レスポンスを返す
10. 逆順で外部ユーザーにレスポンスが返る

---

## 使用例

```go
// agent/cmd/agent/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // Agent設定（Controlから受信）
    virtualIP := "10.1.0.100"

    // LocalProxy作成
    localProxy := proxy.NewLocalProxy(virtualIP, logger)

    // Tunnel設定（Controlから受信）
    tunnels := []proxy.TunnelConfig{
        {
            ID:      "tunnel-1",
            Domain:  "app.example.com",
            Target:  "localhost:8080",
            Enabled: true,
        },
        {
            ID:      "tunnel-2",
            Domain:  "api.example.com",
            Target:  "localhost:3000",
            Enabled: true,
        },
    }
    localProxy.UpdateTunnels(tunnels)

    // プロキシ起動
    if err := localProxy.Start(); err != nil {
        logger.Error("Failed to start local proxy", "error", err)
        os.Exit(1)
    }
}
```

---

## Docker統合

Dockerコンテナを自動検出してTunnelを作成する機能（MVP後）

```go
// agent/internal/docker/discovery.go

type ContainerInfo struct {
    ID     string
    Name   string
    Domain string  // ラベル: kakuremichi.domain
    Port   int     // ラベル: kakuremichi.port
}

func (d *Discovery) DiscoverContainers() ([]ContainerInfo, error) {
    // Dockerコンテナ一覧を取得
    // kakuremichi.enabled=true ラベルでフィルター
    // Domain, Portを抽出
    // ContainerInfoの配列を返す
}

// 使用例
func (a *Agent) syncDockerContainers() {
    containers, _ := a.dockerDiscovery.DiscoverContainers()

    for _, container := range containers {
        tunnel := proxy.TunnelConfig{
            ID:      container.ID,
            Domain:  container.Domain,
            Target:  fmt.Sprintf("localhost:%d", container.Port),
            Enabled: true,
        }
        a.localProxy.AddTunnel(tunnel)
    }
}
```

---

## テスト

```go
// agent/internal/proxy/local_test.go

func TestLocalProxy_HandleRequest(t *testing.T) {
    logger := slog.Default()
    proxy := NewLocalProxy("127.0.0.1", logger)

    // テスト用トンネル
    proxy.AddTunnel(TunnelConfig{
        ID:      "test",
        Domain:  "test.example.com",
        Target:  "localhost:8081",  // テストサーバーを8081で起動
        Enabled: true,
    })

    // テストサーバー起動（localhost:8081）
    testServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("Hello from test server"))
    }))
    defer testServer.Close()

    // リクエスト作成
    req := httptest.NewRequest("GET", "http://127.0.0.1/", nil)
    req.Host = "test.example.com"
    w := httptest.NewRecorder()

    proxy.handleRequest(w, req)

    // レスポンス確認
    if w.Code != http.StatusOK {
        t.Errorf("Expected status 200, got %d", w.Code)
    }
}
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
