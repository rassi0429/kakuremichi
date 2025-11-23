#!/usr/bin/env tsx

import { spawn } from 'child_process';
import path from 'path';

console.log('Starting kakuremichi Control Server (HTTP + WebSocket)...');

const server = spawn('npx', ['tsx', path.join(__dirname, '../server.ts')], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    PORT: process.env.PORT || '3000',
    WS_PATH: process.env.WS_PATH || '/ws',
  },
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  server.kill('SIGTERM');
  process.exit(0);
});

// Handle server exit
server.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code || 1);
});
