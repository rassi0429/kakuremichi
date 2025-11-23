#!/usr/bin/env tsx

import http from 'http';
import next from 'next';
import { initWebSocketServer } from './lib/ws';

const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PATH = process.env.WS_PATH || '/ws';
const dev = process.env.NODE_ENV !== 'production';

async function start() {
  const app = next({ dev });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  // Attach WebSocket server to the same HTTP server
  const wsServer = initWebSocketServer(server, WS_PATH);

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
