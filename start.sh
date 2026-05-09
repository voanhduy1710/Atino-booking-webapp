#!/bin/sh
# start.sh — run inside Docker: start Express then nginx (foreground)
# nginx must be last (keeps the container alive)

echo "[start] Starting Express server on port 3001..."
node --import tsx/esm /app/server/index.ts &

echo "[start] Starting nginx on port 8080..."
exec nginx -g "daemon off;"
