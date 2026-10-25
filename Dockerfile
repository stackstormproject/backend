# Stage 1: Build & Dependencies
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies only, excluding devDependencies
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Install dumb-init for proper PID 1 signal forwarding and graceful SIGTERM handling
RUN apk add --no-cache dumb-init

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy application artifacts and dependencies from builder stage
COPY --chown=node:node --from=builder /usr/src/app ./

# Enforce non-root security execution
USER node

# Expose backend application port 5000
EXPOSE 5000

# Healthcheck auto-probing backend health status
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
