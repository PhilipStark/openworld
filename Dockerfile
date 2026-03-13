FROM node:22-alpine AS builder

WORKDIR /app

# Install server deps
COPY server/package*.json ./server/
RUN cd server && npm ci --production

# Install client deps and build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Production image
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/server/ ./server/
COPY --from=builder /app/client/dist/ ./client/dist/
COPY skill/ ./skill/
COPY package.json ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/src/index.js"]
