import { ControlWebSocketServer } from './server';
import type { Server as HTTPServer } from 'http';

let wsServer: ControlWebSocketServer | null = null;

/**
 * Initialize and cache a singleton WebSocket server.
 * Should be called from the custom server bootstrap (src/server.ts).
 */
export function initWebSocketServer(
  httpServer: HTTPServer,
  path: string = process.env.WS_PATH || '/ws'
): ControlWebSocketServer {
  if (!wsServer) {
    wsServer = new ControlWebSocketServer(
      Number(process.env.WS_PORT || process.env.PORT || 3000),
      httpServer,
      path
    );
  }
  return wsServer;
}

/**
 * Get the initialized WebSocket server.
 * Throws if not initialized; API routes should catch and log.
 */
export function getWebSocketServer(): ControlWebSocketServer {
  if (!wsServer) {
    throw new Error('WebSocket server is not initialized');
  }
  return wsServer;
}

export { wsServer };
export * from './types';
export * from './server';
