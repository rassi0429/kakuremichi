package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/gorilla/websocket"
	"github.com/yourorg/kakuremichi/agent/internal/config"
)

// Client represents a WebSocket client for Agent
type Client struct {
	cfg        *config.Config
	conn       *websocket.Conn
	ctx        context.Context
	cancel     context.CancelFunc
	publicKey  string // WireGuard public key
	privateKey string // WireGuard private key (not sent to server)

	// Channels
	send chan []byte
	recv chan []byte

	// Callbacks
	onConfigUpdate func(config AgentConfig)
}

// NewClient creates a new WebSocket client
func NewClient(cfg *config.Config, publicKey, privateKey string) *Client {
	ctx, cancel := context.WithCancel(context.Background())

	return &Client{
		cfg:        cfg,
		ctx:        ctx,
		cancel:     cancel,
		publicKey:  publicKey,
		privateKey: privateKey,
		send:       make(chan []byte, 256),
		recv:       make(chan []byte, 256),
	}
}

// Connect establishes WebSocket connection to Control server
func (c *Client) Connect() error {
	slog.Info("Connecting to Control server", "url", c.cfg.ControlURL)

	conn, _, err := websocket.DefaultDialer.Dial(c.cfg.ControlURL, nil)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.conn = conn
	slog.Info("Connected to Control server")

	// Send authentication message
	if err := c.authenticate(); err != nil {
		return fmt.Errorf("authentication failed: %w", err)
	}

	// Start message handlers
	go c.readPump()
	go c.writePump()
	go c.handleMessages()
	go c.heartbeat()

	return nil
}

// authenticate sends authentication message
func (c *Client) authenticate() error {
	authMsg := AuthMessage{
		BaseMessage: BaseMessage{
			Type:      TypeAuth,
			Timestamp: time.Now().UnixMilli(),
		},
		APIKey:     c.cfg.APIKey,
		ClientType: "agent",
		PublicKey:  c.publicKey, // Send WireGuard public key
	}

	data, err := json.Marshal(authMsg)
	if err != nil {
		return err
	}

	// Send auth message directly (writePump not started yet)
	if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return fmt.Errorf("failed to send auth: %w", err)
	}

	// Wait for auth response (with timeout)
	c.conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, message, err := c.conn.ReadMessage()
	if err != nil {
		return fmt.Errorf("failed to read auth response: %w", err)
	}
	c.conn.SetReadDeadline(time.Time{}) // Clear deadline

	var baseMsg BaseMessage
	if err := json.Unmarshal(message, &baseMsg); err != nil {
		return err
	}

	if baseMsg.Type == TypeAuthSuccess {
		slog.Info("Authentication successful")
		return nil
	} else if baseMsg.Type == TypeAuthError {
		var errMsg AuthErrorMessage
		json.Unmarshal(message, &errMsg)
		return fmt.Errorf("auth error: %s", errMsg.Error)
	}

	return fmt.Errorf("unexpected message type: %s", baseMsg.Type)
}

// readPump reads messages from WebSocket
func (c *Client) readPump() {
	defer func() {
		c.conn.Close()
		c.cancel()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Error("WebSocket read error", "error", err)
			}
			return
		}

		select {
		case c.recv <- message:
		case <-c.ctx.Done():
			return
		}
	}
}

// writePump writes messages to WebSocket
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				slog.Error("WebSocket write error", "error", err)
				return
			}

		case <-ticker.C:
			// Keep-alive ping
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-c.ctx.Done():
			return
		}
	}
}

// handleMessages processes received messages
func (c *Client) handleMessages() {
	for {
		select {
		case msg := <-c.recv:
			c.handleMessage(msg)

		case <-c.ctx.Done():
			return
		}
	}
}

// handleMessage processes a single message
func (c *Client) handleMessage(data []byte) {
	var baseMsg BaseMessage
	if err := json.Unmarshal(data, &baseMsg); err != nil {
		slog.Error("Failed to parse message", "error", err)
		return
	}

	slog.Debug("Received message", "type", baseMsg.Type)

	switch baseMsg.Type {
	case TypePing:
		c.handlePing()

	case TypeConfigUpdate:
		c.handleConfigUpdate(data)

	case TypeError:
		var errMsg ErrorMessage
		json.Unmarshal(data, &errMsg)
		slog.Error("Received error from Control", "error", errMsg.Error)

	default:
		slog.Warn("Unknown message type", "type", baseMsg.Type)
	}
}

// handlePing responds to ping with pong
func (c *Client) handlePing() {
	pongMsg := PongMessage{
		BaseMessage: BaseMessage{
			Type:      TypePong,
			Timestamp: time.Now().UnixMilli(),
		},
	}

	data, _ := json.Marshal(pongMsg)
	c.send <- data
}

// handleConfigUpdate processes configuration update
func (c *Client) handleConfigUpdate(data []byte) {
	var configMsg ConfigUpdateMessage
	if err := json.Unmarshal(data, &configMsg); err != nil {
		slog.Error("Failed to parse config update", "error", err)
		return
	}

	slog.Info("Received configuration update")

	// Call callback if set
	if c.onConfigUpdate != nil {
		c.onConfigUpdate(configMsg.Config)
	}

	// Send acknowledgment
	ackMsg := ConfigAckMessage{
		BaseMessage: BaseMessage{
			Type:      TypeConfigAck,
			Timestamp: time.Now().UnixMilli(),
		},
		Success: true,
	}

	data, _ = json.Marshal(ackMsg)
	c.send <- data
}

// heartbeat sends periodic status updates
func (c *Client) heartbeat() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			statusMsg := StatusUpdateMessage{
				BaseMessage: BaseMessage{
					Type:      TypeStatusUpdate,
					Timestamp: time.Now().UnixMilli(),
				},
				Status: "online",
			}

			data, _ := json.Marshal(statusMsg)
			c.send <- data

		case <-c.ctx.Done():
			return
		}
	}
}

// SetConfigUpdateCallback sets the callback for configuration updates
func (c *Client) SetConfigUpdateCallback(callback func(AgentConfig)) {
	c.onConfigUpdate = callback
}

// Close closes the WebSocket connection
func (c *Client) Close() {
	c.cancel()
	if c.conn != nil {
		c.conn.Close()
	}
}

// Wait waits for the client to finish
func (c *Client) Wait() {
	<-c.ctx.Done()
}
