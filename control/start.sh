#!/bin/sh
set -e

echo "Starting kakuremichi Control Server..."

# Start WebSocket server in background
echo "Starting WebSocket server on port ${WS_PORT:-3001}..."
npx tsx src/lib/ws/index.ts &
WS_PID=$!

# Start Next.js server
echo "Starting Next.js server on port ${PORT:-3000}..."
node server.js &
NEXT_PID=$!

# Handle shutdown gracefully
trap "echo 'Shutting down...'; kill $WS_PID $NEXT_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
