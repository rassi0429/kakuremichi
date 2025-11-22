package wireguard

import (
	"net"
)

// PeerConfig represents a WireGuard peer configuration
type PeerConfig struct {
	PublicKey           string
	AllowedIPs          []string
	Endpoint            string
	PersistentKeepalive int
}

// InterfaceConfig represents WireGuard interface configuration
type InterfaceConfig struct {
	PrivateKey string
	ListenPort int
	Addresses  []string // Virtual IP addresses for this interface
	Peers      []PeerConfig
}

// Interface represents a WireGuard interface manager
type Interface struct {
	name       string
	config     *InterfaceConfig
	privateKey string
	publicKey  string
}

// PeerInfo contains information about a connected peer
type PeerInfo struct {
	PublicKey      string
	AllowedIPs     []net.IPNet
	Endpoint       *net.UDPAddr
	LastHandshake  int64
	ReceiveBytes   int64
	TransmitBytes  int64
}
