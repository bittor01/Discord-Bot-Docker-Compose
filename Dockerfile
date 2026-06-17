# Use Node.js 22 Alpine for a lightweight base image
FROM node:22-alpine AS base

# Install build dependencies for better-sqlite3 (requires python, make, g++)
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /usr/src/app

# Copy package manifest files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create data directory for SQLite persistence
RUN mkdir -p /usr/src/app/data

# Environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/usr/src/app/data/state.db

# Define volume for database persistence
VOLUME [ "/usr/src/app/data" ]

# Command to run the bot
CMD [ "node", "index.js" ]
