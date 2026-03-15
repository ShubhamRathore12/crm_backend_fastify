# ============================================================
# Multi-stage Dockerfile for CRM Backend
# ============================================================

# --- Base stage ---
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# --- Dependencies stage ---
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# --- Development stage ---
FROM base AS development
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
EXPOSE 3000
CMD ["node", "src/app.js"]

# --- Production stage ---
FROM base AS production
ENV NODE_ENV=production

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S crm -u 1001 -G nodejs && \
    mkdir -p /app/logs && \
    chown -R crm:nodejs /app

USER crm

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
