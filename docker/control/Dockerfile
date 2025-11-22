FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY control/package.json control/package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY control/ .

# Generate Drizzle migrations
RUN npm run db:generate || true

# Build Next.js application
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy WebSocket server source
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder /app/node_modules ./node_modules

# Copy startup script
COPY --from=builder --chown=nextjs:nodejs /app/start.sh ./start.sh
RUN chmod +x start.sh

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

# Expose both HTTP and WebSocket ports
EXPOSE 3000 3001

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV WS_PORT=3001

CMD ["./start.sh"]
