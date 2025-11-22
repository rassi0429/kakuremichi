import { ControlWebSocketServer } from './server';

const PORT = parseInt(process.env.WS_PORT || '3001', 10);

const wsServer = new ControlWebSocketServer(PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down WebSocket server...');
  wsServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down WebSocket server...');
  wsServer.close();
  process.exit(0);
});

export { wsServer };
export * from './types';
export * from './server';
