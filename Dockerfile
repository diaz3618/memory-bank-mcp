# Memory Bank MCP Server - Node.js Docker Image
# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy application source
COPY . .

# Build the project
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built output from builder
COPY --from=builder /app/build ./build

# Start the MCP server
CMD ["node", "build/index.js"]
