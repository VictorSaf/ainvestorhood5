# Multi-stage build pentru aplicația AIInvestorHood5
FROM node:18-alpine AS client-build

# Set working directory pentru client
WORKDIR /app/client

# Copy package files pentru client
COPY client/package*.json ./

# Install dependencies pentru client
RUN npm ci --only=production

# Copy client source code
COPY client/ ./

# Build aplicația React
RUN npm run build

# Server stage
FROM node:18-alpine AS server-build

# Install Python și dependințe pentru Scrapy
RUN apk add --no-cache \
    python3 \
    py3-pip \
    python3-dev \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    libxml2-dev \
    libxslt-dev

# Set working directory pentru server
WORKDIR /app/server

# Copy package files pentru server
COPY server/package*.json ./

# Install server dependencies
RUN npm ci --only=production

# Copy server source code
COPY server/ ./

# Setup Scrapy environment
WORKDIR /app/scrapy_news_collector

# Copy Scrapy requirements
COPY scrapy_news_collector/requirements.txt ./

# Create Python virtual environment și install dependencies
RUN python3 -m venv venv && \
    source venv/bin/activate && \
    pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy Scrapy source code
COPY scrapy_news_collector/ ./

# Final production stage
FROM node:18-alpine

# Install Python și runtime dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    sqlite \
    curl

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy built client from client-build stage
COPY --from=client-build --chown=nextjs:nodejs /app/client/build ./client/build

# Copy server files from server-build stage
COPY --from=server-build --chown=nextjs:nodejs /app/server ./server

# Copy Scrapy environment from server-build stage
COPY --from=server-build --chown=nextjs:nodejs /app/scrapy_news_collector ./scrapy_news_collector

# Create data directory pentru database
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/ainvestorhood.db

# Expose port
EXPOSE 8080

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/setup-status || exit 1

# Start command
CMD ["node", "server/index.js"]