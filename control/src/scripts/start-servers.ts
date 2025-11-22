#!/usr/bin/env tsx

import { spawn } from 'child_process';
import path from 'path';

console.log('Starting kakuremichi Control Server...');

// Start WebSocket server
console.log('Starting WebSocket server on port 3001...');
const wsServer = spawn('npx', ['tsx', path.join(__dirname, '../lib/ws/index.ts')], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, WS_PORT: process.env.WS_PORT || '3001' }
});

// Start Next.js server
console.log('Starting Next.js server on port 3000...');
const nextServer = spawn('npx', ['next', 'start'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: process.env.PORT || '3000' }
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down servers...');
  wsServer.kill('SIGTERM');
  nextServer.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down servers...');
  wsServer.kill('SIGTERM');
  nextServer.kill('SIGTERM');
  process.exit(0);
});

// Handle server exits
wsServer.on('exit', (code) => {
  console.log(`WebSocket server exited with code ${code}`);
  nextServer.kill('SIGTERM');
  process.exit(code || 1);
});

nextServer.on('exit', (code) => {
  console.log(`Next.js server exited with code ${code}`);
  wsServer.kill('SIGTERM');
  process.exit(code || 1);
});
