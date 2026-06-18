# Use Node.js 22 Alpine for a lightweight base image
FROM node:22-alpine AS base

# Install build dependencies for better-sqlite3 and node-canvas
# Canvas on Alpine requires: build-base, g++, cairo-dev, jpeg-dev, pango-dev, giflib-dev
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    fontconfig \
    ttf-dejavu \
    font-noto \
    font-noto-cjk \
    font-noto-emoji \
    sqlite-dev \
    musl-dev

# Set working directory
WORKDIR /usr/src/app

# Copy package manifest files
COPY package*.json ./

# Set environment to production before installing dependencies
ENV NODE_ENV=production

# Install all dependencies (including dev) needed for native builds
RUN npm ci --omit=dev --unsafe-perm

# Copy the rest of the application code
COPY . .

# Create data directory for SQLite persistence
RUN mkdir -p /usr/src/app/data

# Environment variables
ENV DATABASE_PATH=/usr/src/app/data/state.db

# Define volume for database persistence
VOLUME [ "/usr/src/app/data" ]

# Command to run the bot
CMD [ "node", "index.js" ]
