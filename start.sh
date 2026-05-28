#!/bin/sh
# start.sh - run inside Docker: start nginx for static files, then keep
# Express as the foreground process so API crashes stop the revision.

set -e

echo "[start] Starting nginx on port 8080..."
nginx

echo "[start] Starting Express server on port 3001..."
exec node /app/dist-server/index.js
