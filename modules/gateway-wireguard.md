# Gateway - WireGuard管理

## 概要

GatewayのWireGuardインターフェース管理モジュール。複数のAgentとのトンネルを確立・維持。

**パス**: `gateway/internal/wireguard/`

---

## 責務

1. WireGuardインターフェースの作成・設定
2. Peerの追加・削除（Agent）
3. 複数サブネットへの参加（各Agentのサブネット）
4. 仮想IPアドレスの管理
5. トンネルの監視

---

## 依存パッケージ

```go
import (
    "golang.zx2c4.com/wireguard/device"
    "golang.zx2c4.com/wireguard/tun"
    "golang.zx2c4.com/wireguard/conn"
    "golang.zx2c4.com/wireguard/wgctrl"
    "golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)
```

---

## 構造体定義

```go
// gateway/internal/wireguard/manager.go

type Config struct {
    InterfaceName string        // wg0
    PrivateKey    string        // Base64エンコード
    ListenPort    int           // 51820
    VirtualIPs    []string      // ["10.1.0.1/24", "10.2.0.1/24", ...]
}

type Peer struct {
    PublicKey  string   // Agent公開鍵
    AllowedIPs []string // Agent サブネット ["10.1.0.0/24"]
}

type Manager struct {
    config    Config
    device    *device.Device
    tunDev    tun.Device
    peers     map[string]*Peer // key: Agent ID
    logger    *slog.Logger
}
```

---

## 主要メソッド

### `NewManager(config Config) (*Manager, error)`

**処理フロー**:
1. TUNデバイスを作成
2. WireGuardデバイスを作成
3. 秘密鍵を設定
4. リスニングポートを設定
5. 仮想IPアドレスを設定（複数）
6. デバイスをUp

**サンプルコード**:
```go
func NewManager(config Config, logger *slog.Logger) (*Manager, error) {
    // TUNデバイス作成
    tunDev, err := tun.CreateTUN(config.InterfaceName, device.DefaultMTU)
    if err != nil {
        return nil, fmt.Errorf("failed to create TUN device: %w", err)
    }

    // WireGuardデバイス作成
    logger.Info("Creating WireGuard device", "interface", config.InterfaceName)
    wgDevice := device.NewDevice(tunDev, conn.NewDefaultBind(), device.NewLogger(
        device.LogLevelDebug,
        fmt.Sprintf("[%s] ", config.InterfaceName),
    ))

    // IPC設定文字列を生成
    ipcConfig := fmt.Sprintf(
        "private_key=%s\nlisten_port=%d\n",
        config.PrivateKey,
        config.ListenPort,
    )

    // 設定を適用
    if err := wgDevice.IpcSet(ipcConfig); err != nil {
        tunDev.Close()
        return nil, fmt.Errorf("failed to configure device: %w", err)
    }

    // 仮想IPアドレスを設定（ネットワークインターフェースに）
    if err := setIPAddresses(config.InterfaceName, config.VirtualIPs); err != nil {
        tunDev.Close()
        return nil, fmt.Errorf("failed to set IP addresses: %w", err)
    }

    // インターフェースをUp
    if err := bringUp(config.InterfaceName); err != nil {
        tunDev.Close()
        return nil, fmt.Errorf("failed to bring up interface: %w", err)
    }

    wgDevice.Up()

    logger.Info("WireGuard device created successfully",
        "interface", config.InterfaceName,
        "port", config.ListenPort,
        "ips", config.VirtualIPs,
    )

    return &Manager{
        config:  config,
        device:  wgDevice,
        tunDev:  tunDev,
        peers:   make(map[string]*Peer),
        logger:  logger,
    }, nil
}
```

---

### `AddPeer(agentID string, peer Peer) error`

**処理フロー**:
1. Peerが既に存在するかチェック
2. IPC設定文字列を生成
3. デバイスに適用
4. peersマップに追加

**サンプルコード**:
```go
func (m *Manager) AddPeer(agentID string, peer Peer) error {
    m.logger.Info("Adding peer",
        "agentID", agentID,
        "publicKey", peer.PublicKey[:16]+"...",
        "allowedIPs", peer.AllowedIPs,
    )

    // 既存チェック
    if _, exists := m.peers[agentID]; exists {
        return fmt.Errorf("peer %s already exists", agentID)
    }

    // IPC設定文字列
    ipcConfig := fmt.Sprintf(
        "public_key=%s\nallowed_ip=%s\n",
        peer.PublicKey,
        strings.Join(peer.AllowedIPs, ","),
    )

    // 適用
    if err := m.device.IpcSet(ipcConfig); err != nil {
        return fmt.Errorf("failed to add peer: %w", err)
    }

    m.peers[agentID] = &peer
    m.logger.Info("Peer added successfully", "agentID", agentID)

    return nil
}
```

---

### `RemovePeer(agentID string) error`

**処理フロー**:
1. Peerの存在確認
2. IPC設定文字列を生成（public_key + remove=true）
3. デバイスに適用
4. peersマップから削除

**サンプルコード**:
```go
func (m *Manager) RemovePeer(agentID string) error {
    peer, exists := m.peers[agentID]
    if !exists {
        return fmt.Errorf("peer %s not found", agentID)
    }

    m.logger.Info("Removing peer", "agentID", agentID)

    // IPC設定文字列
    ipcConfig := fmt.Sprintf(
        "public_key=%s\nremove=true\n",
        peer.PublicKey,
    )

    // 適用
    if err := m.device.IpcSet(ipcConfig); err != nil {
        return fmt.Errorf("failed to remove peer: %w", err)
    }

    delete(m.peers, agentID)
    m.logger.Info("Peer removed successfully", "agentID", agentID)

    return nil
}
```

---

### `UpdatePeers(agents []AgentInfo) error`

ControlからのconfigメッセージでAgent一覧を受け取った際に呼び出す。
差分を検出して追加・削除を行う。

**サンプルコード**:
```go
type AgentInfo struct {
    ID              string
    PublicKey       string
    Subnet          string
}

func (m *Manager) UpdatePeers(agents []AgentInfo) error {
    m.logger.Info("Updating peers", "count", len(agents))

    // 現在のPeerのマップ
    currentPeers := make(map[string]bool)
    for id := range m.peers {
        currentPeers[id] = true
    }

    // 新しいPeerを追加
    for _, agent := range agents {
        if _, exists := m.peers[agent.ID]; !exists {
            peer := Peer{
                PublicKey:  agent.PublicKey,
                AllowedIPs: []string{agent.Subnet},
            }
            if err := m.AddPeer(agent.ID, peer); err != nil {
                m.logger.Error("Failed to add peer", "agentID", agent.ID, "error", err)
            }
        }
        delete(currentPeers, agent.ID)
    }

    // 残ったPeerを削除（もう存在しないAgent）
    for agentID := range currentPeers {
        if err := m.RemovePeer(agentID); err != nil {
            m.logger.Error("Failed to remove peer", "agentID", agentID, "error", err)
        }
    }

    m.logger.Info("Peers updated successfully")
    return nil
}
```

---

### `GetStats() (map[string]Stats, error)`

各Peerの統計情報を取得（受信/送信バイト数、最終ハンドシェイク時刻）

**サンプルコード**:
```go
type Stats struct {
    PublicKey          string
    RxBytes            int64
    TxBytes            int64
    LastHandshakeTime  time.Time
}

func (m *Manager) GetStats() (map[string]Stats, error) {
    // wgctrlを使ってデバイス情報を取得
    client, err := wgctrl.New()
    if err != nil {
        return nil, err
    }
    defer client.Close()

    device, err := client.Device(m.config.InterfaceName)
    if err != nil {
        return nil, err
    }

    stats := make(map[string]Stats)
    for agentID, peer := range m.peers {
        for _, p := range device.Peers {
            if p.PublicKey.String() == peer.PublicKey {
                stats[agentID] = Stats{
                    PublicKey:         p.PublicKey.String(),
                    RxBytes:           p.ReceiveBytes,
                    TxBytes:           p.TransmitBytes,
                    LastHandshakeTime: p.LastHandshakeTime,
                }
                break
            }
        }
    }

    return stats, nil
}
```

---

### `Close() error`

**処理フロー**:
1. デバイスをDown
2. TUNデバイスをClose

**サンプルコード**:
```go
func (m *Manager) Close() error {
    m.logger.Info("Closing WireGuard manager")

    m.device.Down()
    if err := m.tunDev.Close(); err != nil {
        return fmt.Errorf("failed to close TUN device: %w", err)
    }

    m.logger.Info("WireGuard manager closed")
    return nil
}
```

---

## ヘルパー関数

### `setIPAddresses(interfaceName string, ips []string) error`

ネットワークインターフェースに複数のIPアドレスを設定

**サンプルコード**:
```go
func setIPAddresses(interfaceName string, ips []string) error {
    for _, ip := range ips {
        cmd := exec.Command("ip", "addr", "add", ip, "dev", interfaceName)
        if err := cmd.Run(); err != nil {
            return fmt.Errorf("failed to add IP %s: %w", ip, err)
        }
    }
    return nil
}
```

---

### `bringUp(interfaceName string) error`

ネットワークインターフェースをUp

**サンプルコード**:
```go
func bringUp(interfaceName string) error {
    cmd := exec.Command("ip", "link", "set", "up", "dev", interfaceName)
    return cmd.Run()
}
```

---

## 使用例

```go
// gateway/cmd/gateway/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // WireGuard設定（Controlから受信したconfig）
    wgConfig := wireguard.Config{
        InterfaceName: "wg0",
        PrivateKey:    "base64-encoded-private-key",
        ListenPort:    51820,
        VirtualIPs:    []string{"10.1.0.1/24", "10.2.0.1/24"},
    }

    wgManager, err := wireguard.NewManager(wgConfig, logger)
    if err != nil {
        logger.Error("Failed to create WireGuard manager", "error", err)
        os.Exit(1)
    }
    defer wgManager.Close()

    // Agentを追加
    agents := []wireguard.AgentInfo{
        {
            ID:        "agent-1",
            PublicKey: "agent-1-public-key",
            Subnet:    "10.1.0.0/24",
        },
        {
            ID:        "agent-2",
            PublicKey: "agent-2-public-key",
            Subnet:    "10.2.0.0/24",
        },
    }

    if err := wgManager.UpdatePeers(agents); err != nil {
        logger.Error("Failed to update peers", "error", err)
    }

    // 統計情報取得
    stats, _ := wgManager.GetStats()
    for agentID, stat := range stats {
        logger.Info("Peer stats",
            "agentID", agentID,
            "rx", stat.RxBytes,
            "tx", stat.TxBytes,
            "lastHandshake", stat.LastHandshakeTime,
        )
    }
}
```

---

## テスト

```go
// gateway/internal/wireguard/manager_test.go

func TestNewManager(t *testing.T) {
    // root権限が必要なのでスキップ可能
    if os.Getuid() != 0 {
        t.Skip("Skipping test: requires root privileges")
    }

    config := Config{
        InterfaceName: "wg-test",
        PrivateKey:    generatePrivateKey(),
        ListenPort:    51821,
        VirtualIPs:    []string{"10.100.0.1/24"},
    }

    manager, err := NewManager(config, slog.Default())
    if err != nil {
        t.Fatalf("Failed to create manager: %v", err)
    }
    defer manager.Close()

    // インターフェースが作成されたか確認
    // ...
}
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
