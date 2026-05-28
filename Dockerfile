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
# Stage 2: Runtime — nginx (frontend) + Node/Express (backend API)
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only production server dependencies
COPY package*.json ./
RUN npm ci

# Copy the built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy the compiled Express server
COPY --from=builder /app/dist-server ./dist-server

# Copy nginx config
COPY nginx.conf /etc/nginx/sites-available/default

# Copy the startup script
COPY start.sh /start.sh
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
