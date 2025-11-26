import type { Agent, Gateway, Tunnel } from '../db';

/**
 * WebSocket message types
 */
export enum MessageType {
  // Auth
  AUTH = 'auth',
  AUTH_SUCCESS = 'auth_success',
  AUTH_ERROR = 'auth_error',

  // Heartbeat
  PING = 'ping',
  PONG = 'pong',

  // Configuration
  CONFIG_UPDATE = 'config_update',
  CONFIG_ACK = 'config_ack',

  // Tunnel management
  TUNNEL_CREATE = 'tunnel_create',
  TUNNEL_UPDATE = 'tunnel_update',
  TUNNEL_DELETE = 'tunnel_delete',

  // Status updates
  STATUS_UPDATE = 'status_update',

  // Errors
  ERROR = 'error',
}

/**
 * Base message structure
 */
export interface BaseMessage {
  type: MessageType;
  timestamp: number;
}

/**
 * Auth message (sent by Gateway/Agent)
 */
export interface AuthMessage extends BaseMessage {
  type: MessageType.AUTH;
  apiKey: string;
  clientType: 'gateway' | 'agent';
  publicKey?: string; // WireGuard public key
  publicIp?: string; // Public IP address
}

/**
 * Auth success message (sent by Control)
 */
export interface AuthSuccessMessage extends BaseMessage {
  type: MessageType.AUTH_SUCCESS;
  clientId: string;
  clientType: 'gateway' | 'agent';
}

/**
 * Auth error message (sent by Control)
 */
export interface AuthErrorMessage extends BaseMessage {
  type: MessageType.AUTH_ERROR;
  error: string;
}

/**
 * Ping message
 */
export interface PingMessage extends BaseMessage {
  type: MessageType.PING;
}

/**
 * Pong message
 */
export interface PongMessage extends BaseMessage {
  type: MessageType.PONG;
}

/**
 * Config update message (sent by Control to Gateway/Agent)
 */
export interface ConfigUpdateMessage extends BaseMessage {
  type: MessageType.CONFIG_UPDATE;
  config: GatewayConfig | AgentConfig;
}

/**
 * Config acknowledgment message
 */
export interface ConfigAckMessage extends BaseMessage {
  type: MessageType.CONFIG_ACK;
  success: boolean;
  error?: string;
}

/**
 * Status update message (sent by Gateway/Agent)
 */
export interface StatusUpdateMessage extends BaseMessage {
  type: MessageType.STATUS_UPDATE;
  status: 'online' | 'offline' | 'error';
  metadata?: Record<string, unknown>;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR;
  error: string;
}

/**
 * Gateway configuration
 */
export interface GatewayConfig {
  gateway: Gateway;
  agents: Array<{
    id: string;
    name: string;
    wireguardPublicKey: string;
    subnet: string;
    virtualIp: string;
  }>;
  tunnels: Array<Tunnel & { agentId: string }>;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  agent: Agent;
  gateways: Array<{
    id: string;
    name: string;
    wireguardPublicKey: string;
    publicIp: string;
  }>;
  tunnels: Array<Tunnel>;
}

/**
 * Union type of all messages
 */
export type WSMessage =
  | AuthMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | PingMessage
  | PongMessage
  | ConfigUpdateMessage
  | ConfigAckMessage
  | StatusUpdateMessage
  | ErrorMessage;

/**
 * Connected client info
 */
export interface ConnectedClient {
  id: string;
  type: 'gateway' | 'agent';
  ws: any; // WebSocket instance
  lastSeen: Date;
  authenticated: boolean;
}
