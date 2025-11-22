package proxy

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
)

// NewHTTPProxy creates a new HTTP reverse proxy
func NewHTTPProxy(httpAddr, httpsAddr string) *HTTPProxy {
	return &HTTPProxy{
		routes:    make(map[string]*TunnelRoute),
		httpAddr:  httpAddr,
		httpsAddr: httpsAddr,
	}
}

// UpdateRoutes updates the tunnel routes
func (p *HTTPProxy) UpdateRoutes(routes []TunnelRoute) {
	slog.Info("Updating tunnel routes", "count", len(routes))

	newRoutes := make(map[string]*TunnelRoute)
	for i := range routes {
		route := &routes[i]
		if route.Enabled {
			newRoutes[route.Domain] = route
			slog.Info("Added route",
				"domain", route.Domain,
				"agent_ip", route.AgentIP,
			)
		}
	}

	p.routes = newRoutes
}

// Start starts the HTTP proxy server
func (p *HTTPProxy) Start(ctx context.Context) error {
	slog.Info("Starting HTTP proxy", "http_addr", p.httpAddr)

	mux := http.NewServeMux()
	mux.HandleFunc("/", p.handleRequest)

	server := &http.Server{
		Addr:    p.httpAddr,
		Handler: mux,
	}

	// Start server in goroutine
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP proxy server error", "error", err)
		}
	}()

	// Wait for context cancellation
	<-ctx.Done()
	slog.Info("Shutting down HTTP proxy")
	return server.Shutdown(context.Background())
}

// handleRequest handles incoming HTTP requests
func (p *HTTPProxy) handleRequest(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	slog.Debug("Received request", "host", host, "path", r.URL.Path, "method", r.Method)

	// Find route for this domain
	route, exists := p.routes[host]
	if !exists {
		slog.Warn("No route found for domain", "domain", host)
		http.Error(w, "No tunnel configured for this domain", http.StatusNotFound)
		return
	}

	if !route.Enabled {
		slog.Warn("Route is disabled", "domain", host)
		http.Error(w, "Tunnel is disabled", http.StatusServiceUnavailable)
		return
	}

	// Build target URL (Agent's virtual IP)
	targetURL, err := url.Parse("http://" + route.AgentIP + ":80")
	if err != nil {
		slog.Error("Invalid agent IP", "agent_ip", route.AgentIP, "error", err)
		http.Error(w, "Invalid target configuration", http.StatusInternalServerError)
		return
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Customize the director
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = host // Preserve original Host header
		req.Header.Set("X-Forwarded-Host", host)
		req.Header.Set("X-Forwarded-Proto", r.Header.Get("X-Forwarded-Proto"))
		if req.Header.Get("X-Forwarded-Proto") == "" {
			req.Header.Set("X-Forwarded-Proto", "http") // Will be https when SSL is added
		}
	}

	// Error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("Proxy error", "error", err, "agent_ip", route.AgentIP)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}

	slog.Info("Proxying request",
		"domain", host,
		"agent_ip", route.AgentIP,
		"path", r.URL.Path,
	)

	// Proxy the request
	proxy.ServeHTTP(w, r)
}

// Shutdown gracefully shuts down the proxy
func (p *HTTPProxy) Shutdown() error {
	slog.Info("HTTP proxy shutdown complete")
	return nil
}

// GetRoutes returns current routes (for testing/debugging)
func (p *HTTPProxy) GetRoutes() map[string]*TunnelRoute {
	result := make(map[string]*TunnelRoute)
	for k, v := range p.routes {
		result[k] = v
	}
	return result
}
