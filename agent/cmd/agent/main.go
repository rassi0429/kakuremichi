package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"os/signal"
	"syscall"

	"github.com/yourorg/kakuremichi/agent/internal/config"
	"github.com/yourorg/kakuremichi/agent/internal/proxy"
	"github.com/yourorg/kakuremichi/agent/internal/wireguard"
	"github.com/yourorg/kakuremichi/agent/internal/ws"
)

func main() {
	// Initialize logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	slog.Info("Starting kakuremichi Agent")

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	slog.Info("Configuration loaded",
		"control_url", cfg.ControlURL,
		"docker_enabled", cfg.DockerEnabled,
	)

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Prevent "declared and not used" error
	_ = ctx

	// Generate or load WireGuard keys (persist locally to keep stable identity)
	privateKey, publicKey, err := loadOrCreateKeys(cfg.WireguardPrivateKey)
	if err != nil {
		log.Fatalf("Failed to prepare WireGuard keys: %v", err)
	}
	slog.Info("WireGuard keys ready", "public_key", publicKey)

	// WireGuard device will be initialized after receiving config from Control
	var wgDevice *wireguard.Device

	// Local proxy will be initialized after receiving virtual IP from Control
	var localProxy *proxy.LocalProxy

	// Initialize WebSocket client (Control connection)
	// Pass public key and private key to the client
	wsClient := ws.NewClient(cfg, publicKey, privateKey)
	wsClient.SetConfigUpdateCallback(func(config ws.AgentConfig) {
		slog.Info("Received configuration update",
			"gateways_count", len(config.Gateways),
			"tunnels_count", len(config.Tunnels),
			"virtual_ip", config.Agent.VirtualIP,
			"subnet", config.Agent.Subnet,
		)

		// Initialize or update WireGuard device
		if wgDevice == nil {
			// First time initialization
			var gateways []wireguard.GatewayPeer
			for _, gw := range config.Gateways {
				peer := wireguard.GatewayPeer{
					PublicKey: gw.WireguardPublicKey,
					Endpoint:  gw.Endpoint,
					AllowedIP: "", // Will be set based on subnet
				}
				gateways = append(gateways, peer)
			}

			wgConfig := &wireguard.DeviceConfig{
				PrivateKey: privateKey, // Use locally generated private key
				VirtualIP:  config.Agent.VirtualIP,
				Subnet:     config.Agent.Subnet,
				Gateways:   gateways,
			}

			device, err := wireguard.NewDevice(wgConfig)
			if err != nil {
				slog.Error("Failed to create WireGuard device", "error", err)
			} else {
				wgDevice = device
				slog.Info("WireGuard device initialized", "public_key", wgDevice.PublicKey())
			}
		} else {
			// Update existing device
			var gateways []wireguard.GatewayPeer
			for _, gw := range config.Gateways {
				peer := wireguard.GatewayPeer{
					PublicKey: gw.WireguardPublicKey,
					Endpoint:  gw.Endpoint,
					AllowedIP: "",
				}
				gateways = append(gateways, peer)
			}

			if err := wgDevice.UpdateGateways(gateways); err != nil {
				slog.Error("Failed to update WireGuard gateways", "error", err)
			} else {
				slog.Info("Updated WireGuard gateways", "count", len(gateways))
			}
		}

		// Initialize or update local proxy (only if WireGuard device was successfully created)
		if localProxy == nil && config.Agent.VirtualIP != "" && wgDevice != nil {
			// First time initialization - wait a bit for WireGuard to be ready
			proxyAddr := config.Agent.VirtualIP + ":80"
			localProxy = proxy.NewLocalProxy(wgDevice.Net(), proxyAddr)

			// Start proxy in background
			go func() {
				if err := localProxy.Start(ctx); err != nil {
					slog.Error("Local proxy stopped", "error", err)
				}
			}()

			slog.Info("Local proxy started", "addr", proxyAddr)
		}

		// Update tunnel mappings
		if localProxy != nil {
			var tunnels []proxy.TunnelMapping
			for _, t := range config.Tunnels {
				tunnel := proxy.TunnelMapping{
					ID:      t.ID,
					Domain:  t.Domain,
					Target:  t.Target,
					Enabled: t.Enabled,
				}
				tunnels = append(tunnels, tunnel)
			}
			localProxy.UpdateTunnels(tunnels)
		}
	})

	// Connect to Control server
	if err := wsClient.Connect(); err != nil {
		log.Fatalf("Failed to connect to Control: %v", err)
	}
	defer wsClient.Close()

	// TODO: Initialize WireGuard + netstack
	// wg, err := wireguard.NewDevice(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create WireGuard device: %v", err)
	// }
	// defer wg.Close()

	// TODO: Initialize local proxy
	// proxy, err := proxy.NewLocalProxy(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create local proxy: %v", err)
	// }

	// TODO: Initialize Docker integration (if enabled)
	// if cfg.DockerEnabled {
	// 	dockerClient, err := docker.NewClient(cfg)
	// 	if err != nil {
	// 		slog.Warn("Failed to create Docker client", "error", err)
	// 	} else {
	// 		go dockerClient.Watch(ctx)
	// 	}
	// }

	slog.Info("Agent started successfully")

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("Shutting down Agent")
	cancel()

	// Graceful shutdown
	if wgDevice != nil {
		wgDevice.Close()
	}
	if localProxy != nil {
		localProxy.Shutdown()
	}

fmt.Println("Agent stopped")
}

// loadOrCreateKeys returns (private, public) WireGuard keys.
// Priority: env/flag -> persisted file -> new generate (and persist).
func loadOrCreateKeys(privateFromConfig string) (string, string, error) {
	const keyFile = "wireguard.key"

	// 1) Use provided private key if set
	if strings.TrimSpace(privateFromConfig) != "" {
		pub, err := wireguard.DerivePublicKey(strings.TrimSpace(privateFromConfig))
		if err != nil {
			return "", "", fmt.Errorf("invalid provided private key: %w", err)
		}
		return strings.TrimSpace(privateFromConfig), pub, nil
	}

	// 2) Try to load from file
	if data, err := os.ReadFile(keyFile); err == nil {
		priv := strings.TrimSpace(string(data))
		pub, err := wireguard.DerivePublicKey(priv)
		if err == nil {
			slog.Info("Loaded WireGuard key from file", "path", filepath.Clean(keyFile))
			return priv, pub, nil
		}
		slog.Warn("Existing key file is invalid, regenerating", "path", filepath.Clean(keyFile), "error", err)
	}

	// 3) Generate new and persist
	priv, pub, err := wireguard.GenerateKeyPair()
	if err != nil {
		return "", "", err
	}
	if writeErr := os.WriteFile(keyFile, []byte(priv+"\n"), 0600); writeErr != nil {
		slog.Warn("Failed to persist WireGuard key", "path", filepath.Clean(keyFile), "error", writeErr)
	} else {
		slog.Info("Generated new WireGuard key and saved", "path", filepath.Clean(keyFile))
	}
	return priv, pub, nil
}
