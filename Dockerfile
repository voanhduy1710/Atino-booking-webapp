# ────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the Vite frontend
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run server:typecheck && npx tsc -p tsconfig.server.json

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime — Node/Express serves the frontend and API
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

# Install only production server dependencies
COPY package*.json ./
RUN npm ci

# Copy the built frontend
COPY --from=builder /app/dist ./dist

# Copy the compiled Express server
COPY --from=builder /app/dist-server ./dist-server

# Copy the startup script
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
