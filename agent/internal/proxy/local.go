package proxy

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sync"
)

// NewLocalProxy creates a new local proxy server
func NewLocalProxy(addr string) *LocalProxy {
	return &LocalProxy{
		tunnels: make(map[string]*TunnelMapping),
		addr:    addr,
	}
}

// UpdateTunnels updates the tunnel mappings
func (p *LocalProxy) UpdateTunnels(tunnels []TunnelMapping) {
	slog.Info("Updating tunnel mappings", "count", len(tunnels))

	newTunnels := make(map[string]*TunnelMapping)
	for i := range tunnels {
		tunnel := &tunnels[i]
		if tunnel.Enabled {
			newTunnels[tunnel.Domain] = tunnel
			slog.Info("Added tunnel mapping",
				"domain", tunnel.Domain,
				"target", tunnel.Target,
			)
		}
	}

	p.tunnels = newTunnels
}

// Start starts the local proxy server
func (p *LocalProxy) Start(ctx context.Context) error {
	slog.Info("Starting local proxy", "addr", p.addr)

	mux := http.NewServeMux()
	mux.HandleFunc("/", p.handleRequest)

	server := &http.Server{
		Addr:    p.addr,
		Handler: mux,
	}

	// Start server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Local proxy server error", "error", err)
		}
	}()

	// Wait for context cancellation
	<-ctx.Done()
	slog.Info("Shutting down local proxy")
	return server.Shutdown(context.Background())
}

// handleRequest handles incoming HTTP requests
func (p *LocalProxy) handleRequest(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	slog.Debug("Received request", "host", host, "path", r.URL.Path, "method", r.Method)

	// Find tunnel for this domain
	tunnel, exists := p.tunnels[host]
	if !exists {
		slog.Warn("No tunnel found for domain", "domain", host)
		http.Error(w, "No tunnel configured for this domain", http.StatusNotFound)
		return
	}

	if !tunnel.Enabled {
		slog.Warn("Tunnel is disabled", "domain", host)
		http.Error(w, "Tunnel is disabled", http.StatusServiceUnavailable)
		return
	}

	// Parse target URL
	targetURL, err := url.Parse("http://" + tunnel.Target)
	if err != nil {
		slog.Error("Invalid target URL", "target", tunnel.Target, "error", err)
		http.Error(w, "Invalid target configuration", http.StatusInternalServerError)
		return
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Customize the director to preserve the original request
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host
		req.Header.Set("X-Forwarded-Host", host)
		req.Header.Set("X-Forwarded-Proto", "https") // Gateway terminates HTTPS
	}

	// Error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("Proxy error", "error", err, "target", tunnel.Target)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}

	slog.Info("Proxying request",
		"domain", host,
		"target", tunnel.Target,
		"path", r.URL.Path,
	)

	// Proxy the request
	proxy.ServeHTTP(w, r)
}

// Shutdown gracefully shuts down the proxy
func (p *LocalProxy) Shutdown() error {
	slog.Info("Local proxy shutdown complete")
	return nil
}

// GetTunnels returns current tunnel mappings (for testing/debugging)
func (p *LocalProxy) GetTunnels() map[string]*TunnelMapping {
	result := make(map[string]*TunnelMapping)
	for k, v := range p.tunnels {
		result[k] = v
	}
	return result
}

// LocalProxyManager manages multiple local proxies (if needed for different interfaces)
type LocalProxyManager struct {
	proxies map[string]*LocalProxy
	mu      sync.RWMutex
}

// NewLocalProxyManager creates a new proxy manager
func NewLocalProxyManager() *LocalProxyManager {
	return &LocalProxyManager{
		proxies: make(map[string]*LocalProxy),
	}
}

// AddProxy adds a proxy to the manager
func (m *LocalProxyManager) AddProxy(name string, proxy *LocalProxy) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.proxies[name] = proxy
}

// GetProxy retrieves a proxy by name
func (m *LocalProxyManager) GetProxy(name string) (*LocalProxy, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	proxy, exists := m.proxies[name]
	return proxy, exists
}
