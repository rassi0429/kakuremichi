package proxy

// TunnelMapping represents a tunnel configuration
type TunnelMapping struct {
	ID      string
	Domain  string
	Target  string // e.g., "localhost:8080"
	Enabled bool
}

// LocalProxy represents the local HTTP proxy for Agent
type LocalProxy struct {
	tunnels map[string]*TunnelMapping // domain -> tunnel
	addr    string                    // Listen address (e.g., "10.1.0.100:80")
}
