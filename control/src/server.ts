#!/usr/bin/env tsx

import http from 'http';
import { parse } from 'url';
import next from 'next';
import { initWebSocketServer } from './lib/ws';

const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PATH = process.env.WS_PATH || '/ws';
const dev = process.env.NODE_ENV !== 'production';

async function start() {
  const app = next({ dev });
  const handle = app.getRequestHandler();

  await app.prepare();

  const upgrade = app.getUpgradeHandler();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  // Initialize WebSocket server in noServer mode
  const wsServer = initWebSocketServer(undefined, WS_PATH);

  // Handle upgrade requests manually
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '/', true);

    if (pathname === WS_PATH) {
      // Our custom WebSocket endpoint
      wsServer.handleUpgrade(req, socket, head);
    } else {
      // Let Next.js handle HMR and other upgrades
      upgrade(req, socket, head);
    }
  });

  server.listen(PORT, () => {
    console.log(`HTTP/Next server ready on http://localhost:${PORT}`);
    console.log(`WebSocket endpoint served at ws://localhost:${PORT}${WS_PATH}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down servers...');
    wsServer.close();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
