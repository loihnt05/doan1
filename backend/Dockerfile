FROM node:23.7.0-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json ./

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Build all applications
RUN pnpm run build user-service && \
    pnpm run build order-service && \
    pnpm run build payment-service

# Default command (will be overridden in docker-compose)
CMD ["node", "dist/apps/user-service/main.js"]
