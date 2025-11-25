import { ControlWebSocketServer } from './server';
import type { Server as HTTPServer } from 'http';

// Use global to persist WebSocket server across HMR and API route contexts
const globalForWs = globalThis as unknown as {
  wsServer: ControlWebSocketServer | null;
};

/**
 * Initialize and cache a singleton WebSocket server.
 * Should be called from the custom server bootstrap (src/server.ts).
 * If httpServer is undefined, creates server in noServer mode for manual upgrade handling.
 */
export function initWebSocketServer(
  httpServer?: HTTPServer,
  path: string = process.env.WS_PATH || '/ws'
): ControlWebSocketServer {
  console.log(`Initializing WebSocket server on path: ${path}`);
  if (!globalForWs.wsServer) {
    globalForWs.wsServer = new ControlWebSocketServer(
      Number(process.env.WS_PORT || process.env.PORT || 3000),
      httpServer,
      path
    );
  }
  return globalForWs.wsServer;
}

/**
 * Get the initialized WebSocket server.
 * Returns null if not initialized; API routes should check for this.
 */
export function getWebSocketServer(): ControlWebSocketServer | null {
  return globalForWs.wsServer ?? null;
}

export * from './types';
export * from './server';
