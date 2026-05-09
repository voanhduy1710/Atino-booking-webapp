# ────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the Vite frontend
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime — nginx (frontend) + Node/Express (backend API)
# ────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install nginx
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install only production server dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the built frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy the Express server source
COPY server ./server

# Copy nginx config
COPY nginx.conf /etc/nginx/sites-available/default

# Copy the startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
