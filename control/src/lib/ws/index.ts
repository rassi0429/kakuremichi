import { ControlWebSocketServer } from './server';
import type { Server as HTTPServer } from 'http';

// Use a symbol key on globalThis to ensure the singleton survives HMR and is shared across modules
const WS_SERVER_KEY = Symbol.for('kakuremichi.wsServer');

interface GlobalWithWsServer {
  [WS_SERVER_KEY]?: ControlWebSocketServer;
}

const globalForWs = globalThis as GlobalWithWsServer;

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
  if (!globalForWs[WS_SERVER_KEY]) {
    console.log('Creating new WebSocket server instance');
    globalForWs[WS_SERVER_KEY] = new ControlWebSocketServer(
      Number(process.env.WS_PORT || process.env.PORT || 3000),
      httpServer,
      path
    );
  } else {
    console.log('Reusing existing WebSocket server instance');
  }
  return globalForWs[WS_SERVER_KEY];
}

/**
 * Get the initialized WebSocket server.
 * Returns null if not initialized; API routes should check for this.
 */
export function getWebSocketServer(): ControlWebSocketServer | null {
  const server = globalForWs[WS_SERVER_KEY];
  if (!server) {
    console.warn('getWebSocketServer called but server not initialized');
  }
  return server ?? null;
}

export * from './types';
export * from './server';
