package wireguard

import (
	"fmt"
	"log/slog"
	"net/netip"

	"golang.zx2c4.com/wireguard/conn"
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun/netstack"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

// NewDevice creates a new WireGuard device with netstack
func NewDevice(config *DeviceConfig) (*Device, error) {
	slog.Info("Creating WireGuard device",
		"virtual_ip", config.VirtualIP,
		"subnet", config.Subnet,
		"gateways", len(config.Gateways),
	)

	d := &Device{
		config: config,
	}

	// Parse private key
	privateKey, err := wgtypes.ParseKey(config.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}
	d.privateKey = config.PrivateKey
	d.publicKey = privateKey.PublicKey().String()

	// Parse virtual IP and subnet
	addr, err := netip.ParsePrefix(config.Subnet)
	if err != nil {
		return nil, fmt.Errorf("invalid subnet: %w", err)
	}

	// Create netstack TUN device
	tun, tnet, err := netstack.CreateNetTUN(
		[]netip.Addr{addr.Addr()},
		[]netip.Addr{}, // DNS servers (empty for now)
		1420,           // MTU
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create netstack TUN: %w", err)
	}
	d.tun = tun
	d.net = tnet

	// Create WireGuard device
	logger := device.NewLogger(
		device.LogLevelError,
		fmt.Sprintf("[WG-%s] ", config.VirtualIP),
	)

	wgDevice := device.NewDevice(tun, conn.NewDefaultBind(), logger)
	d.device = wgDevice

	// Configure WireGuard device
	if err := d.configureDevice(); err != nil {
		tun.Close()
		return nil, fmt.Errorf("failed to configure device: %w", err)
	}

	// Bring device up
	wgDevice.Up()

	slog.Info("WireGuard device created successfully",
		"public_key", d.publicKey,
		"virtual_ip", config.VirtualIP,
		"subnet", config.Subnet,
	)

	return d, nil
}

// configureDevice configures the WireGuard device with initial settings
func (d *Device) configureDevice() error {
	// Build IPC configuration string
	config := fmt.Sprintf("private_key=%s\n", d.privateKey)

	// Add peers (Gateways)
	for _, gw := range d.config.Gateways {
		config += fmt.Sprintf("public_key=%s\n", gw.PublicKey)
		if gw.Endpoint != "" {
			config += fmt.Sprintf("endpoint=%s\n", gw.Endpoint)
		}

		// Calculate AllowedIP based on subnet
		// For subnet 10.1.0.0/24, Gateway IP would be 10.1.0.X/32
		subnet, err := netip.ParsePrefix(d.config.Subnet)
		if err != nil {
			return fmt.Errorf("invalid subnet: %w", err)
		}

		// Extract the third octet from subnet (e.g., "10.1.0.0/24" -> 1)
		subnetIP := subnet.Addr().As4()
		gatewayIP := fmt.Sprintf("10.%d.0.%d/32", subnetIP[1], getGatewayIndex(gw))
		config += fmt.Sprintf("allowed_ip=%s\n", gatewayIP)

		// Persistent keepalive
		config += "persistent_keepalive_interval=25\n"
	}

	// Apply configuration via IPC
	if err := d.device.IpcSet(config); err != nil {
		return fmt.Errorf("failed to set IPC config: %w", err)
	}

	slog.Info("WireGuard device configured", "peers", len(d.config.Gateways))
	return nil
}

// getGatewayIndex extracts gateway index from endpoint or public key
func getGatewayIndex(gw GatewayPeer) int {
	// For now, simple implementation: parse from endpoint port or default to 1
	// In production, this should come from the config
	return 1
}

// UpdateGateways updates the Gateway peers
func (d *Device) UpdateGateways(gateways []GatewayPeer) error {
	slog.Info("Updating Gateway peers", "count", len(gateways))

	d.config.Gateways = gateways

	// Reconfigure device with new peer list
	return d.configureDevice()
}

// Close closes the WireGuard device
func (d *Device) Close() error {
	slog.Info("Closing WireGuard device")

	if d.device != nil {
		d.device.Close()
	}
	if d.tun != nil {
		d.tun.Close()
	}

	return nil
}

// PublicKey returns the device's public key
func (d *Device) PublicKey() string {
	return d.publicKey
}

// VirtualIP returns the device's virtual IP
func (d *Device) VirtualIP() string {
	return d.config.VirtualIP
}

// Subnet returns the device's subnet
func (d *Device) Subnet() string {
	return d.config.Subnet
}
