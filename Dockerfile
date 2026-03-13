FROM node:22-alpine AS builder

WORKDIR /app

# Install server deps
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server/ ./server/

# Install client deps and build
COPY client/package*.json ./client/
RUN cd client && npm ci --legacy-peer-deps
COPY client/ ./client/
RUN cd client && npm run build

# Production image
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/server/ ./server/
COPY --from=builder /app/client/dist/ ./client/dist/
COPY skill/ ./skill/
COPY package.json ./

RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/openworld.db
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server/src/index.js"]
