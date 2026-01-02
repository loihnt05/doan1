# Phase 0 - NestJS Monorepo Foundation

##  Phase 0 Completed

This phase implements a basic NestJS monorepo with 3 independent microservices running in Docker.

### Architecture

```
[ user-service ]      [ order-service ]      [ payment-service ]
       :3001                 :3002                   :3003
            \                   |                    /
             \                  |                   /
              -------- (internal Docker network) -----
```

### Services

#### 1. User Service (Port 3001)
- **Health Check**: `GET /health`
- **Users Endpoint**: `GET /users` - Returns fake user data

#### 2. Order Service (Port 3002)
- **Health Check**: `GET /health`
- **Orders Endpoint**: `GET /orders` - Returns fake order data

#### 3. Payment Service (Port 3003)
- **Health Check**: `GET /health`
- **Payment Endpoint**: `GET /pay` - Returns fake payment transaction

### Technology Stack

- **Runtime**: Node.js v23.7.0
- **Framework**: NestJS
- **Package Manager**: pnpm
- **Container**: Docker with Docker Compose
- **Build Tool**: Webpack (via NestJS CLI)

### Project Structure

```
backend/
├── apps/
│   ├── backend/           # Main backend app
│   ├── user-service/      # User microservice
│   ├── order-service/     # Order microservice
│   └── payment-service/   # Payment microservice
├── docker-compose.yml     # Docker services configuration
├── Dockerfile             # Shared Dockerfile for all services
├── nest-cli.json          # NestJS monorepo configuration
└── package.json           # Dependencies
```

### Running the Project

#### Local Development

```bash
# Install dependencies
pnpm install

# Build all services
pnpm run build user-service
pnpm run build order-service
pnpm run build payment-service

# Run services individually
pnpm run start user-service
pnpm run start order-service
pnpm run start payment-service
```

#### Docker Compose

```bash
# Build and start all services
docker compose up --build -d

# Check service status
docker compose ps

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

### Testing Endpoints

```bash
# User Service
curl localhost:3001/health
curl localhost:3001/users

# Order Service
curl localhost:3002/health
curl localhost:3002/orders

# Payment Service
curl localhost:3003/health
curl localhost:3003/pay
```

### Phase 0 Checklist

 NestJS monorepo setup
 3 independent microservices created
 Each service has health check endpoint
 Each service has one business endpoint returning fake data
 Services run on separate ports (3001, 3002, 3003)
 Dockerfile using Node.js v23.7.0
 Docker Compose configuration
 Services communicate via internal Docker network
 All services tested and working

### What's NOT in Phase 0

 API Gateway
 Authentication/Authorization
 Apache Kafka message broker
 Redis caching
 Service-to-service HTTP communication
 Database connections
 Environment configuration

These will be added in subsequent phases.

### Next Steps

Phase 1 will introduce:
- API Gateway
- Internal service-to-service HTTP communication
- Centralized routing
