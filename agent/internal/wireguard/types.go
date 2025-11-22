package wireguard

import (
	"golang.zx2c4.com/wireguard/device"
	"golang.zx2c4.com/wireguard/tun"
	"golang.zx2c4.com/wireguard/tun/netstack"
)

// GatewayPeer represents a Gateway peer configuration
type GatewayPeer struct {
	PublicKey string
	Endpoint  string
	AllowedIP string // Gateway's virtual IP in this agent's subnet
}

// DeviceConfig represents WireGuard device configuration for Agent
type DeviceConfig struct {
	PrivateKey string
	VirtualIP  string // Agent's virtual IP (e.g., 10.1.0.100)
	Subnet     string // Agent's subnet (e.g., 10.1.0.0/24)
	Gateways   []GatewayPeer
}

// Device represents a WireGuard device manager for Agent
type Device struct {
	config     *DeviceConfig
	privateKey string
	publicKey  string
	device     *device.Device
	tun        tun.Device
	net        *netstack.Net
}
