package wireguard

import (
	"fmt"
	"log/slog"
	"net"
	"time"

	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

// NewInterface creates a new WireGuard interface
func NewInterface(name string, config *InterfaceConfig) (*Interface, error) {
	slog.Info("Creating WireGuard interface", "name", name, "port", config.ListenPort)

	iface := &Interface{
		name:   name,
		config: config,
	}

	// Parse private key
	privateKey, err := wgtypes.ParseKey(config.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}
	iface.privateKey = config.PrivateKey
	iface.publicKey = privateKey.PublicKey().String()

	// Apply initial configuration
	if err := iface.applyConfig(); err != nil {
		return nil, fmt.Errorf("failed to apply config: %w", err)
	}

	slog.Info("WireGuard interface created successfully",
		"name", name,
		"public_key", iface.publicKey,
		"listen_port", config.ListenPort,
	)

	return iface, nil
}

// applyConfig applies the current configuration to the WireGuard interface
func (i *Interface) applyConfig() error {
	client, err := wgctrl.New()
	if err != nil {
		return fmt.Errorf("failed to create wgctrl client: %w", err)
	}
	defer client.Close()

	// Parse private key
	privateKey, err := wgtypes.ParseKey(i.config.PrivateKey)
	if err != nil {
		return fmt.Errorf("invalid private key: %w", err)
	}

	// Build peer configs
	var peers []wgtypes.PeerConfig
	for _, peerCfg := range i.config.Peers {
		peer, err := i.buildPeerConfig(peerCfg)
		if err != nil {
			slog.Warn("Failed to build peer config", "error", err)
			continue
		}
		peers = append(peers, peer)
	}

	// Configure interface
	port := i.config.ListenPort
	cfg := wgtypes.Config{
		PrivateKey:   &privateKey,
		ListenPort:   &port,
		ReplacePeers: true,
		Peers:        peers,
	}

	if err := client.ConfigureDevice(i.name, cfg); err != nil {
		return fmt.Errorf("failed to configure device: %w", err)
	}

	slog.Info("WireGuard configuration applied", "peers", len(peers))
	return nil
}

// buildPeerConfig converts PeerConfig to wgtypes.PeerConfig
func (i *Interface) buildPeerConfig(cfg PeerConfig) (wgtypes.PeerConfig, error) {
	publicKey, err := wgtypes.ParseKey(cfg.PublicKey)
	if err != nil {
		return wgtypes.PeerConfig{}, fmt.Errorf("invalid public key: %w", err)
	}

	var allowedIPs []net.IPNet
	for _, ipStr := range cfg.AllowedIPs {
		_, ipNet, err := net.ParseCIDR(ipStr)
		if err != nil {
			return wgtypes.PeerConfig{}, fmt.Errorf("invalid allowed IP %s: %w", ipStr, err)
		}
		allowedIPs = append(allowedIPs, *ipNet)
	}

	peerCfg := wgtypes.PeerConfig{
		PublicKey:  publicKey,
		AllowedIPs: allowedIPs,
	}

	// Parse endpoint if provided
	if cfg.Endpoint != "" {
		endpoint, err := net.ResolveUDPAddr("udp", cfg.Endpoint)
		if err != nil {
			return wgtypes.PeerConfig{}, fmt.Errorf("invalid endpoint: %w", err)
		}
		peerCfg.Endpoint = endpoint
	}

	// Set persistent keepalive if specified
	if cfg.PersistentKeepalive > 0 {
		keepalive := time.Duration(cfg.PersistentKeepalive) * time.Second
		peerCfg.PersistentKeepaliveInterval = &keepalive
	}

	return peerCfg, nil
}

// AddPeer adds a new peer to the WireGuard interface
func (i *Interface) AddPeer(peer PeerConfig) error {
	slog.Info("Adding WireGuard peer", "public_key", peer.PublicKey)

	// Add to config
	i.config.Peers = append(i.config.Peers, peer)

	// Apply updated config
	return i.applyConfig()
}

// RemovePeer removes a peer from the WireGuard interface
func (i *Interface) RemovePeer(publicKey string) error {
	slog.Info("Removing WireGuard peer", "public_key", publicKey)

	// Remove from config
	var newPeers []PeerConfig
	for _, p := range i.config.Peers {
		if p.PublicKey != publicKey {
			newPeers = append(newPeers, p)
		}
	}
	i.config.Peers = newPeers

	// Apply updated config
	return i.applyConfig()
}

// UpdatePeers replaces all peers with the new list
func (i *Interface) UpdatePeers(peers []PeerConfig) error {
	slog.Info("Updating WireGuard peers", "count", len(peers))

	i.config.Peers = peers
	return i.applyConfig()
}

// GetPeers returns information about all connected peers
func (i *Interface) GetPeers() ([]PeerInfo, error) {
	client, err := wgctrl.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create wgctrl client: %w", err)
	}
	defer client.Close()

	device, err := client.Device(i.name)
	if err != nil {
		return nil, fmt.Errorf("failed to get device: %w", err)
	}

	var peers []PeerInfo
	for _, peer := range device.Peers {
		info := PeerInfo{
			PublicKey:     peer.PublicKey.String(),
			AllowedIPs:    peer.AllowedIPs,
			Endpoint:      peer.Endpoint,
			LastHandshake: peer.LastHandshakeTime.Unix(),
			ReceiveBytes:  peer.ReceiveBytes,
			TransmitBytes: peer.TransmitBytes,
		}
		peers = append(peers, info)
	}

	return peers, nil
}

// Close closes the WireGuard interface
func (i *Interface) Close() error {
	slog.Info("Closing WireGuard interface", "name", i.name)
	// Note: Actual interface deletion would require platform-specific code
	// For now, just log the closure
	return nil
}

// Name returns the interface name
func (i *Interface) Name() string {
	return i.name
}

// PublicKey returns the interface's public key
func (i *Interface) PublicKey() string {
	return i.publicKey
}
