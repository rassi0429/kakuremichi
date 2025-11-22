# Agent - Docker統合

## 概要

AgentのDocker統合機能。Dockerコンテナを自動検出し、ラベルベースでトンネルを自動作成。

**パス**: `agent/internal/docker/`

---

## 責務

1. Dockerコンテナの自動検出
2. ラベルベースの設定読み取り
3. トンネルの自動作成・削除
4. コンテナイベントの監視

---

## 依存パッケージ

```go
import (
    "github.com/docker/docker/client"
    "github.com/docker/docker/api/types"
    "github.com/docker/docker/api/types/filters"
    "log/slog"
    "context"
)
```

---

## ラベルスキーマ

コンテナに以下のラベルを付与することで、自動的にトンネルが作成される：

```yaml
services:
  app:
    image: my-app:latest
    labels:
      - "kakuremichi.enabled=true"          # 必須
      - "kakuremichi.domain=app.example.com" # 必須
      - "kakuremichi.port=8080"              # 必須
      - "kakuremichi.description=My App"     # オプション
```

---

## 構造体定義

```go
// agent/internal/docker/discovery.go

type Config struct {
    DockerSocket string // /var/run/docker.sock
    Enabled      bool
}

type ContainerInfo struct {
    ID          string
    Name        string
    Domain      string
    Port        int
    Description string
}

type Discovery struct {
    client  *client.Client
    config  Config
    logger  *slog.Logger
    onAdd   func(ContainerInfo)
    onRemove func(containerID string)
}
```

---

## 主要メソッド

### `NewDiscovery(config Config, logger *slog.Logger) (*Discovery, error)`

**サンプルコード**:
```go
func NewDiscovery(config Config, logger *slog.Logger) (*Discovery, error) {
    if !config.Enabled {
        logger.Info("Docker discovery disabled")
        return nil, nil
    }

    logger.Info("Creating Docker client", "socket", config.DockerSocket)

    cli, err := client.NewClientWithOpts(
        client.FromEnv,
        client.WithHost("unix://"+config.DockerSocket),
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create Docker client: %w", err)
    }

    // Docker接続確認
    ctx := context.Background()
    if _, err := cli.Ping(ctx); err != nil {
        return nil, fmt.Errorf("failed to ping Docker: %w", err)
    }

    logger.Info("Docker client created successfully")

    return &Discovery{
        client: cli,
        config: config,
        logger: logger,
    }, nil
}
```

---

### `DiscoverContainers(ctx context.Context) ([]ContainerInfo, error)`

現在実行中のコンテナからkakuremichi有効なものを取得

**サンプルコード**:
```go
func (d *Discovery) DiscoverContainers(ctx context.Context) ([]ContainerInfo, error) {
    d.logger.Info("Discovering containers")

    // kakuremichi.enabled=true でフィルター
    filterArgs := filters.NewArgs()
    filterArgs.Add("label", "kakuremichi.enabled=true")

    containers, err := d.client.ContainerList(ctx, types.ContainerListOptions{
        Filters: filterArgs,
    })
    if err != nil {
        return nil, fmt.Errorf("failed to list containers: %w", err)
    }

    var result []ContainerInfo

    for _, container := range containers {
        info, err := d.parseContainer(container)
        if err != nil {
            d.logger.Warn("Failed to parse container",
                "id", container.ID[:12],
                "error", err,
            )
            continue
        }

        result = append(result, info)
    }

    d.logger.Info("Containers discovered", "count", len(result))

    return result, nil
}
```

---

### `parseContainer(container types.Container) (ContainerInfo, error)`

コンテナ情報をパースしてContainerInfoに変換

**サンプルコード**:
```go
func (d *Discovery) parseContainer(container types.Container) (ContainerInfo, error) {
    labels := container.Labels

    // 必須ラベルチェック
    domain, ok := labels["kakuremichi.domain"]
    if !ok || domain == "" {
        return ContainerInfo{}, fmt.Errorf("missing kakuremichi.domain label")
    }

    portStr, ok := labels["kakuremichi.port"]
    if !ok || portStr == "" {
        return ContainerInfo{}, fmt.Errorf("missing kakuremichi.port label")
    }

    port, err := strconv.Atoi(portStr)
    if err != nil {
        return ContainerInfo{}, fmt.Errorf("invalid port: %s", portStr)
    }

    // コンテナ名（スラッシュを除去）
    name := strings.TrimPrefix(container.Names[0], "/")

    info := ContainerInfo{
        ID:          container.ID,
        Name:        name,
        Domain:      domain,
        Port:        port,
        Description: labels["kakuremichi.description"],
    }

    d.logger.Info("Container parsed",
        "id", container.ID[:12],
        "name", name,
        "domain", domain,
        "port", port,
    )

    return info, nil
}
```

---

### `WatchEvents(ctx context.Context) error`

Dockerイベントを監視し、コンテナの開始・停止に応じてトンネルを追加・削除

**サンプルコード**:
```go
func (d *Discovery) WatchEvents(ctx context.Context) error {
    d.logger.Info("Starting Docker event watcher")

    // イベントフィルター（コンテナのstart, stopのみ）
    filterArgs := filters.NewArgs()
    filterArgs.Add("type", "container")
    filterArgs.Add("event", "start")
    filterArgs.Add("event", "stop")
    filterArgs.Add("label", "kakuremichi.enabled=true")

    eventChan, errChan := d.client.Events(ctx, types.EventsOptions{
        Filters: filterArgs,
    })

    for {
        select {
        case <-ctx.Done():
            d.logger.Info("Event watcher stopped")
            return ctx.Err()

        case err := <-errChan:
            return fmt.Errorf("event error: %w", err)

        case event := <-eventChan:
            d.handleEvent(ctx, event)
        }
    }
}

func (d *Discovery) handleEvent(ctx context.Context, event events.Message) {
    containerID := event.Actor.ID

    d.logger.Info("Docker event",
        "event", event.Action,
        "container", containerID[:12],
    )

    switch event.Action {
    case "start":
        // コンテナ情報を取得
        containerJSON, err := d.client.ContainerInspect(ctx, containerID)
        if err != nil {
            d.logger.Error("Failed to inspect container", "error", err)
            return
        }

        // ContainerInfoに変換
        info, err := d.parseContainerJSON(containerJSON)
        if err != nil {
            d.logger.Warn("Failed to parse container", "error", err)
            return
        }

        // コールバック実行
        if d.onAdd != nil {
            d.onAdd(info)
        }

    case "stop":
        // コールバック実行
        if d.onRemove != nil {
            d.onRemove(containerID)
        }
    }
}
```

---

### `OnAdd(callback func(ContainerInfo))`

コンテナ追加時のコールバックを登録

**サンプルコード**:
```go
func (d *Discovery) OnAdd(callback func(ContainerInfo)) {
    d.onAdd = callback
}
```

---

### `OnRemove(callback func(containerID string))`

コンテナ削除時のコールバックを登録

**サンプルコード**:
```go
func (d *Discovery) OnRemove(callback func(containerID string)) {
    d.onRemove = callback
}
```

---

### `Close() error`

Dockerクライアントを閉じる

**サンプルコード**:
```go
func (d *Discovery) Close() error {
    if d.client != nil {
        return d.client.Close()
    }
    return nil
}
```

---

## LocalProxyとの統合

```go
// agent/internal/proxy/local.go

type LocalProxy struct {
    tunnels       map[string]*TunnelConfig
    dockerTunnels map[string]string // containerID -> domain
    // ...
}

func (p *LocalProxy) AddDockerTunnel(info docker.ContainerInfo) {
    p.logger.Info("Adding Docker tunnel",
        "domain", info.Domain,
        "target", fmt.Sprintf("localhost:%d", info.Port),
    )

    tunnel := TunnelConfig{
        ID:      info.ID,
        Domain:  info.Domain,
        Target:  fmt.Sprintf("localhost:%d", info.Port),
        Enabled: true,
    }

    p.tunnels[info.Domain] = &tunnel
    p.dockerTunnels[info.ID] = info.Domain
}

func (p *LocalProxy) RemoveDockerTunnel(containerID string) {
    domain, exists := p.dockerTunnels[containerID]
    if !exists {
        return
    }

    p.logger.Info("Removing Docker tunnel", "domain", domain)

    delete(p.tunnels, domain)
    delete(p.dockerTunnels, containerID)
}
```

---

## Agentメインロジックとの統合

```go
// agent/cmd/agent/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // Docker Discovery作成
    dockerDiscovery, err := docker.NewDiscovery(docker.Config{
        DockerSocket: "/var/run/docker.sock",
        Enabled:      true,
    }, logger)
    if err != nil {
        logger.Error("Failed to create Docker discovery", "error", err)
        // Docker無効の場合は続行
    }

    // LocalProxy作成
    localProxy := proxy.NewLocalProxy(...)

    if dockerDiscovery != nil {
        // コールバック登録
        dockerDiscovery.OnAdd(func(info docker.ContainerInfo) {
            localProxy.AddDockerTunnel(info)
        })

        dockerDiscovery.OnRemove(func(containerID string) {
            localProxy.RemoveDockerTunnel(containerID)
        })

        // 既存コンテナを検出
        ctx := context.Background()
        containers, _ := dockerDiscovery.DiscoverContainers(ctx)
        for _, container := range containers {
            localProxy.AddDockerTunnel(container)
        }

        // イベント監視開始
        go func() {
            if err := dockerDiscovery.WatchEvents(ctx); err != nil {
                logger.Error("Docker event watcher error", "error", err)
            }
        }()
    }

    // ...
}
```

---

## 使用例

### docker-compose.yml

```yaml
version: '3.8'

services:
  # アプリケーション
  web:
    image: nginx:latest
    labels:
      - "kakuremichi.enabled=true"
      - "kakuremichi.domain=web.example.com"
      - "kakuremichi.port=80"
      - "kakuremichi.description=Nginx web server"

  api:
    image: my-api:latest
    labels:
      - "kakuremichi.enabled=true"
      - "kakuremichi.domain=api.example.com"
      - "kakuremichi.port=3000"
      - "kakuremichi.description=REST API"

  # Agent
  kakuremichi-agent:
    image: kakuremichi/agent:latest
    environment:
      - CONTROL_URL=wss://control.example.com/ws
      - API_KEY=agt_xxx
      - DOCKER_ENABLED=true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    network_mode: host
```

---

## 動作フロー

1. **Agent起動**:
   - Docker Discoveryが既存コンテナをスキャン
   - `kakuremichi.enabled=true`のコンテナを検出
   - LocalProxyに自動追加

2. **新しいコンテナ起動**:
   - Dockerイベントで`start`を検出
   - コンテナのラベルをパース
   - LocalProxyにトンネル追加
   - Controlにトンネル作成リクエスト（オプション）

3. **コンテナ停止**:
   - Dockerイベントで`stop`を検出
   - LocalProxyからトンネル削除
   - Controlにトンネル削除リクエスト（オプション）

---

## セキュリティ考慮事項

### Dockerソケットのアクセス権限

Dockerソケットへのアクセスには注意が必要：

```bash
# 読み取り専用でマウント（推奨）
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### Agentの実行権限

Dockerソケットにアクセスするため、Agentはroot権限または`docker`グループで実行する必要がある：

```yaml
services:
  agent:
    user: "0:0"  # root
    # または
    group_add:
      - docker
```

---

## エラーハンドリング

```go
func (d *Discovery) DiscoverContainers(ctx context.Context) ([]ContainerInfo, error) {
    containers, err := d.client.ContainerList(ctx, types.ContainerListOptions{
        Filters: filterArgs,
    })
    if err != nil {
        // Dockerデーモンが応答しない場合
        if client.IsErrConnectionFailed(err) {
            d.logger.Error("Docker daemon not available", "error", err)
            return nil, err
        }
        return nil, fmt.Errorf("failed to list containers: %w", err)
    }

    // 個別のコンテナのパースエラーは無視して続行
    for _, container := range containers {
        info, err := d.parseContainer(container)
        if err != nil {
            d.logger.Warn("Skipping invalid container",
                "id", container.ID[:12],
                "error", err,
            )
            continue
        }
        result = append(result, info)
    }

    return result, nil
}
```

---

## テスト

```go
// agent/internal/docker/discovery_test.go

func TestDiscovery_DiscoverContainers(t *testing.T) {
    // モックDockerクライアント作成
    // または実際のDockerコンテナでテスト

    discovery, err := NewDiscovery(Config{
        DockerSocket: "/var/run/docker.sock",
        Enabled:      true,
    }, slog.Default())
    if err != nil {
        t.Skip("Docker not available")
    }
    defer discovery.Close()

    ctx := context.Background()
    containers, err := discovery.DiscoverContainers(ctx)
    if err != nil {
        t.Fatalf("Failed to discover: %v", err)
    }

    t.Logf("Found %d containers", len(containers))
}
```

---

## 将来の拡張

### 1. Kubernetes統合（Phase 2）

同様のアプローチでKubernetesのPodを検出：

```go
// agent/internal/kubernetes/discovery.go

type Discovery struct {
    clientset *kubernetes.Clientset
    // ...
}

func (d *Discovery) DiscoverPods(ctx context.Context) ([]PodInfo, error) {
    // Annotationベースでトンネル設定を読み取り
}
```

### 2. 自動DNS設定

Controlに自動的にトンネルを登録：

```go
dockerDiscovery.OnAdd(func(info docker.ContainerInfo) {
    // LocalProxyに追加
    localProxy.AddDockerTunnel(info)

    // Controlにも登録（オプション）
    wsClient.Send("create_tunnel", map[string]interface{}{
        "domain": info.Domain,
        "target": fmt.Sprintf("localhost:%d", info.Port),
    })
})
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
