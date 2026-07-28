# ────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the Vite frontend
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run server:typecheck && npx tsc -p tsconfig.server.json

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime — Node/Express serves the frontend and API
# ────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# Install only production server dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the built frontend
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy the compiled Express server
COPY --from=builder --chown=node:node /app/dist-server ./dist-server

# Copy the startup script
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

EXPOSE 8080

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["/start.sh"]
