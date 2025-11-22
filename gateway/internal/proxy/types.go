package proxy

// TunnelRoute represents a tunnel routing configuration
type TunnelRoute struct {
	ID       string
	Domain   string
	AgentIP  string // Agent's virtual IP (e.g., "10.1.0.100")
	Enabled  bool
}

// HTTPProxy represents the HTTP reverse proxy for Gateway
type HTTPProxy struct {
	routes     map[string]*TunnelRoute // domain -> route
	httpAddr   string                  // HTTP listen address
	httpsAddr  string                  // HTTPS listen address (for future)
}
