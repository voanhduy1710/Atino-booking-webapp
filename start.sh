#!/bin/sh
# start.sh - run Express as the single Cloud Run process.

set -e

echo "[start] Starting Express server..."
exec node /app/dist-server/index.js
