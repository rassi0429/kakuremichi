package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"net"

	"github.com/yourorg/kakuremichi/gateway/internal/config"
	"github.com/yourorg/kakuremichi/gateway/internal/proxy"
	"github.com/yourorg/kakuremichi/gateway/internal/wireguard"
	"github.com/yourorg/kakuremichi/gateway/internal/ws"
)

func main() {
	// Initialize logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	slog.Info("Starting kakuremichi Gateway")

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	slog.Info("Configuration loaded",
		"control_url", cfg.ControlURL,
		"wireguard_port", cfg.WireguardPort,
		"http_port", cfg.HTTPPort,
		"https_port", cfg.HTTPSPort,
	)

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Prevent "declared and not used" error
	_ = ctx

	// Generate WireGuard keys if not provided
	if cfg.WireguardPrivateKey == "" {
		privateKey, publicKey, err := wireguard.GenerateKeyPair()
		if err != nil {
			log.Fatalf("Failed to generate WireGuard keys: %v", err)
		}
		cfg.WireguardPrivateKey = privateKey
		slog.Info("Generated WireGuard keys", "public_key", publicKey)
	}

	// Initialize WireGuard interface
	wgConfig := &wireguard.InterfaceConfig{
		PrivateKey: cfg.WireguardPrivateKey,
		ListenPort: cfg.WireguardPort,
		Addresses:  []string{}, // Will be populated from agent configs
		Peers:      []wireguard.PeerConfig{},
	}

	wg, err := wireguard.NewInterface(cfg.WireguardInterface, wgConfig)
	if err != nil {
		slog.Warn("Failed to create WireGuard interface (may require privileges)", "error", err)
		// Don't fail, just log warning - WireGuard might not be available on all systems
	} else {
		defer wg.Close()
		slog.Info("WireGuard interface initialized", "public_key", wg.PublicKey())
	}

	// Initialize HTTP proxy with ACME configuration
	httpAddr := fmt.Sprintf(":%d", cfg.HTTPPort)
	httpsAddr := fmt.Sprintf(":%d", cfg.HTTPSPort)

	// Configure ACME (enabled if email is provided and not default)
	acmeEnabled := cfg.ACMEEmail != "" && cfg.ACMEEmail != "admin@example.com"
	acmeConfig := proxy.ACMEConfig{
		Email:    cfg.ACMEEmail,
		Staging:  cfg.ACMEStaging,
		CacheDir: cfg.ACMECacheDir,
		Enabled:  acmeEnabled,
	}

	if acmeEnabled {
		slog.Info("ACME/TLS enabled",
			"email", cfg.ACMEEmail,
			"staging", cfg.ACMEStaging,
			"cache_dir", cfg.ACMECacheDir,
		)
	} else {
		slog.Info("ACME/TLS disabled, HTTP-only mode")
	}

	httpProxy := proxy.NewHTTPProxy(httpAddr, httpsAddr, acmeConfig)

	// Start HTTP proxy in background
	go func() {
		if err := httpProxy.Start(ctx); err != nil {
			slog.Error("HTTP proxy stopped", "error", err)
		}
	}()

	// Initialize WebSocket client (Control connection) with public key
	var publicKey string
	if wg != nil {
		publicKey = wg.PublicKey()
	}
	wsClient := ws.NewClient(cfg, publicKey)
	wsClient.SetConfigUpdateCallback(func(config ws.GatewayConfig) {
		slog.Info("Received configuration update",
			"agents_count", len(config.Agents),
			"tunnels_count", len(config.Tunnels),
		)

		// Update WireGuard peers
		if wg != nil {
			var peers []wireguard.PeerConfig
			for _, agent := range config.Agents {
				peer := wireguard.PeerConfig{
					PublicKey:           agent.WireguardPublicKey,
					AllowedIPs:          []string{agent.Subnet},
					PersistentKeepalive: 25,
				}
				peers = append(peers, peer)
			}

			if err := wg.UpdatePeers(peers); err != nil {
				slog.Error("Failed to update WireGuard peers", "error", err)
			} else {
				slog.Info("Updated WireGuard peers", "count", len(peers))
			}
		}

		// Update HTTP proxy routes
		var routes []proxy.TunnelRoute
		for _, tunnel := range config.Tunnels {
			// Find the agent for this tunnel
			var agentIP string
			for _, agent := range config.Agents {
				if agent.ID == tunnel.AgentID {
					agentIP = agent.VirtualIP
					break
				}
			}

			if agentIP != "" {
				route := proxy.TunnelRoute{
					ID:      tunnel.ID,
					Domain:  tunnel.Domain,
					AgentIP: agentIP,
					Enabled: tunnel.Enabled,
				}
				routes = append(routes, route)
			} else {
				slog.Warn("Agent not found for tunnel", "tunnel_id", tunnel.ID, "agent_id", tunnel.AgentID)
			}
		}

		httpProxy.UpdateRoutes(routes)

		// Ensure WireGuard interface has IP addresses for each agent subnet (for routing)
		if wg != nil {
			ensureGatewayIPs(cfg.WireguardInterface, config.Agents)
		}
	})

	// Connect to Control server
	if err := wsClient.Connect(); err != nil {
		log.Fatalf("Failed to connect to Control: %v", err)
	}
	defer wsClient.Close()

	slog.Info("Gateway started successfully")

	// TODO: Initialize HTTP proxy
	// proxy, err := proxy.NewHTTPProxy(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create HTTP proxy: %v", err)
	// }

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("Shutting down Gateway")
	cancel()

	// Graceful shutdown
	httpProxy.Shutdown()
	if wg != nil {
		wg.Close()
	}

	fmt.Println("Gateway stopped")
}

// ensureGatewayIPs adds a /24 IP (x.y.0.1) for each agent subnet to the WireGuard interface.
// This lets the kernel select a proper source address when proxying to agent virtual IPs.
func ensureGatewayIPs(iface string, agents []struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	WireguardPublicKey string `json:"wireguardPublicKey"`
	Subnet             string `json:"subnet"`
	VirtualIP          string `json:"virtualIp"`
}) {
	// Bring interface up (ignore errors)
	_ = exec.Command("ip", "link", "set", iface, "up").Run()

	seen := make(map[string]struct{})
	for _, ag := range agents {
		_, ipnet, err := net.ParseCIDR(ag.Subnet)
		if err != nil || ipnet == nil {
			continue
		}
		// Compute gateway IP = network with last octet 1 (for /24)
		ip := ipnet.IP.To4()
		if ip == nil {
			continue
		}
		ip[3] = 1
		addr := fmt.Sprintf("%s/%d", ip.String(), maskToPrefix(ipnet.Mask))
		if _, ok := seen[addr]; ok {
			continue
		}
		seen[addr] = struct{}{}

		cmd := exec.Command("ip", "address", "add", addr, "dev", iface)
		if out, err := cmd.CombinedOutput(); err != nil {
			// Ignore if already exists
			if !strings.Contains(string(out), "File exists") && !strings.Contains(err.Error(), "File exists") {
				slog.Warn("Failed to add IP to WireGuard interface", "addr", addr, "iface", iface, "error", err, "out", string(out))
			}
		} else {
			slog.Info("Added IP to WireGuard interface", "addr", addr, "iface", iface)
		}

		// Ensure route to agent subnet via wg interface
		routeCmd := exec.Command("ip", "route", "add", ipnet.String(), "dev", iface)
		if out, err := routeCmd.CombinedOutput(); err != nil {
			if !strings.Contains(string(out), "File exists") && !strings.Contains(err.Error(), "File exists") {
				slog.Warn("Failed to add route for agent subnet", "subnet", ipnet.String(), "iface", iface, "error", err, "out", string(out))
			}
		} else {
			slog.Info("Added route for agent subnet", "subnet", ipnet.String(), "iface", iface)
		}
	}
}

// maskToPrefix converts a net.IPMask to CIDR prefix length.
func maskToPrefix(mask net.IPMask) int {
	ones, _ := mask.Size()
	return ones
}
