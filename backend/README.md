# Microservices Architecture with NestJS - Complete Guide

## Project Overview

This project demonstrates a complete microservices architecture implementation using NestJS, progressing through five phases:

- **Phase 0**: Foundation - Independent microservices
- **Phase 1**: API Gateway - Routing, aggregation, and cross-cutting concerns  
- **Phase 2**: Scaling - Vertical and horizontal scaling demonstrations
- **Phase 3**: Load Balancer & Kubernetes - Advanced load balancing algorithms, K8s networking
- **Phase 4**: Message Dispatcher - Event-driven architecture with Apache Kafka
- **Phase 5**: Saga Pattern & Streaming - Distributed transactions with compensation and real-time analytics

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client Requests                       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ HTTP (Port 80)
                       │
          ┌────────────▼────────────┐
          │   Nginx Load Balancer   │
          │    (Round Robin)         │
          └────────────┬────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │ Gateway │   │ Gateway │   │ Gateway │
   │Instance1│   │Instance2│   │Instance3│
   └────┬────┘   └────┬────┘   └────┬────┘
        │              │              │
        └──────────────┼──────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │  User   │   │ Order   │   │Payment  │
   │ Service │   │ Service │   │ Service │
   │  :3001  │   │  :3002  │   │  :3003  │
   └─────────┘   └─────────┘   └─────────┘
```

## Quick Start

### Prerequisites
- Node.js v23.7.0+
- Docker & Docker Compose
- pnpm

### Run the Project

```bash
cd backend

# Build and start with 3 API Gateway instances
docker-compose up --build --scale api-gateway=3

# Or run the automated test suite
./test-scaling.sh
```

### Access Points
- API Gateway (via nginx): http://localhost/api/*
- User Service: http://localhost:3001
- Order Service: http://localhost:3002
- Payment Service: http://localhost:3003

## Testing & Validation

### Automated Test Suite

Run the comprehensive test script:

```bash
cd backend
./test-scaling.sh
```

This tests:
1.  Basic routing through nginx
2.  Stateful counter problem demonstration
3.  CPU blocking with multiple instances (NOT blocked)
4.  CPU blocking with single instance (**53 seconds delay!**)
5.  Load distribution across instances
6.  Circuit breaker functionality
7.  Data aggregation from multiple services

**Key Test Result**: Single instance took **53,364ms** to respond during CPU-bound operation, while 3 instances responded in only **116ms**!

## Phase 2 Highlights: Scaling Demonstrations

### Problem 1: CPU-Bound Blocking

**Demonstration**:
```bash
# Single instance - DISASTER
docker-compose up --scale api-gateway=1
curl http://localhost/api/cpu-bound &  # Blocks for 3 seconds
curl http://localhost/api/users         # Takes 53+ seconds!

# Multiple instances - WORKS
docker-compose up --scale api-gateway=3  
curl http://localhost/api/cpu-bound &  # One instance blocked
curl http://localhost/api/users         # Other instance responds in 116ms
```

### Problem 2: Stateful Design

**Demonstration**:
```bash
# Each instance maintains its own counter
for i in {1..9}; do curl http://localhost/api/count; done

# Output shows per-instance state:
{"count":1}  # Instance 1
{"count":1}  # Instance 2
{"count":1}  # Instance 3
{"count":2}  # Instance 1 again
{"count":2}  # Instance 2 again
{"count":2}  # Instance 3 again
```

**Solution**: Use Redis or database for shared state.

## API Endpoints Reference

### Scaling Demonstration Endpoints

| Endpoint | Description | Purpose |
|----------|-------------|---------|
| `/api/cpu-bound` | 3s CPU calculation | Show event loop blocking |
| `/api/count` | In-memory counter | Show stateful problem |
| `/api/metrics` | Process stats | Show load distribution |

### Gateway Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | Proxy to user-service |
| `/api/orders` | GET | Proxy to order-service |
| `/api/pay` | POST | Proxy to payment-service |
| `/api/dashboard` | GET | Aggregate users + orders |
| `/api/secure` | GET | Requires Auth (Bearer demo-token) |
| `/api/limited` | GET | Rate-limited (5 req/10s) |
| `/api/blocking` | GET | 2s simulated delay |
| `/api/non-blocking` | GET | Immediate response |

## Key Concepts Demonstrated

### 1. Horizontal Scaling
- Multiple instances behind load balancer
- Nginx round-robin distribution
- Better fault tolerance and throughput

### 2. Blocking vs Non-Blocking
- **Blocking**: Synchronous CPU work blocks event loop
- **Impact**: 53 seconds delay with single instance!
- **Solution**: Horizontal scaling or worker threads

### 3. Stateless vs Stateful
- **Stateful**: In-memory state per instance (doesn't work)
- **Stateless**: External state store (Redis, DB)
- **Demo**: Counter endpoint shows per-instance state

### 4. Load Balancing
- Nginx distributes requests across instances
- Round-robin algorithm
- Health checks (future enhancement)

### 5. Circuit Breaker
- Prevents cascading failures
- Opens after 3 failed requests
- Auto-recovers after timeout

## Performance Results

| Scenario | Single Instance | 3 Instances | Improvement |
|----------|----------------|-------------|-------------|
| Normal Request | 50ms | 50ms | - |
| **During CPU-Bound** | **53,000ms** | **116ms** | **457x faster!** |
| Requests/sec | ~150 | ~450 | 3x |

## Project Structure

```
backend/
├── apps/
│   ├── api-gateway/          # API Gateway with scaling demos
│   │   └── src/
│   │       ├── main.ts       # Event loop monitoring
│   │       ├── cluster.ts    # Vertical scaling (excluded from build)
│   │       ├── gateway.controller.ts  # All endpoints including /cpu-bound, /count
│   │       └── gateway.service.ts
│   ├── user-service/         # Port 3001
│   ├── order-service/        # Port 3002
│   └── payment-service/      # Port 3003
├── docker-compose.yml        # Multi-instance orchestration
├── nginx.conf                # Load balancer config
├── test-scaling.sh          # ⭐ Automated test suite
├── SCALING-DEMO.md          # Detailed scaling documentation
└── README.md                # This file
```

## Documentation

- **[SCALING-DEMO.md](SCALING-DEMO.md)** - Comprehensive scaling guide with manual test instructions
- **[README.nest.md](README.nest.md)** - Original NestJS README

## Troubleshooting

### Services Won't Start
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### Port 80 Already in Use
```bash
# Find and kill process
sudo lsof -i :80
sudo kill -9 <PID>
```

### High Event Loop Delay
```bash
# Check logs
docker-compose logs api-gateway | grep "Event loop"

# Scale up
docker-compose up --scale api-gateway=5
```

## Next Steps

### Phase 5: Observability
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] Distributed tracing with OpenTelemetry
- [ ] Log aggregation with ELK stack

### Phase 6: Production
- [ ] Kubernetes deployment manifests
- [ ] Helm charts
- [ ] Auto-scaling policies (HPA, VPA)
- [ ] Blue-green deployments
- [ ] CI/CD pipelines

## Phase 4: Message Dispatcher (Kafka) 

Event-driven architecture implementation with Apache Kafka for asynchronous, decoupled communication between microservices.

### Architecture

```
┌──────────────┐      ┌─────────────────────────────────┐
│Order Service │─────▶│         Kafka Cluster           │
│  (Producer)  │      │  ┌──────────┐  ┌──────────┐    │
└──────────────┘      │  │Zookeeper │  │  Broker  │    │
                      │  │  :2181   │  │:9092/29092    │
                      │  └──────────┘  └──────────┘    │
                      └───────────┬─────────────────────┘
                                  │
                      ┌───────────┼────────────┐
                      │           │            │
              ┌───────▼──┐   ┌───▼─────┐  ┌──▼────────┐
              │Payment   │   │Notif.   │  │Analytics  │
              │Service   │   │Service  │  │Service    │
              │(Consumer)│   │(Consumer)   │(Consumer) │
              └──────────┘   └─────────┘  └───────────┘
```

### Key Features

**Event-Driven Communication:**
- Asynchronous messaging (no blocking)
- Loose coupling between services
- Events stored durably in Kafka
- Multiple consumers per event (pub/sub)

**Consumer Groups:**
- Load balancing across instances
- Automatic rebalancing
- Independent consumer groups for different services

**Fault Tolerance:**
- Dead Letter Queue (DLQ) for failed messages
- Automatic retries with exponential backoff
- Idempotency handling

**Performance:**
- Response time: 2000ms (HTTP) → 100ms (Kafka) = **20x faster**
- Throughput: 50 req/s → 1000+ req/s

### Running Phase 4

```bash
# Start Kafka infrastructure
docker-compose -f docker-compose.kafka.yml up -d

# Run comprehensive test suite
./test-kafka.sh
```

**Kafka UI**: http://localhost:8080

### Documentation

- **[PHASE4-MESSAGE-DISPATCHER.md](PHASE4-MESSAGE-DISPATCHER.md)** - Complete Kafka guide with concepts, patterns, and CLI cheatsheet
- **[Handbook: Event-Driven Architecture](../handbook/docs/phase4-message-dispatcher/event-driven-architecture.md)** - Educational content with diagrams

### Test Script Features

The `test-kafka.sh` script demonstrates:
1.  Kafka infrastructure startup (Zookeeper, Broker, UI)
2.  Topic creation with partitions
3.  Event production (OrderCreated)
4.  Event consumption (PaymentService)
5.  Consumer groups load balancing (2 instances)
6.  Offset management and replay
7.  Dead Letter Queue handling
8.  Real-time monitoring via Kafka UI

## Phase 3: Load Balancer & Kubernetes 

Advanced load balancing algorithms and Kubernetes networking concepts.

### Load Balancing Algorithms

**Multiple nginx configurations demonstrating:**
- **Round Robin** (default): Even distribution
- **Least Connections**: Dynamic load-aware routing
- **IP Hash**: Sticky sessions per client IP
- **Health Checks**: Passive failure detection

### Kubernetes Concepts

**Service types** with full YAML examples:
- **ClusterIP**: Internal service discovery
- **NodePort**: External access for development
- **LoadBalancer**: Cloud provider integration
- **Ingress**: Layer 7 routing with path/host rules

### Documentation

- **[PHASE3-LOAD-BALANCER.md](PHASE3-LOAD-BALANCER.md)** - Comprehensive load balancer guide
- **[Handbook: Load Balancing](../handbook/docs/phase3-load-balancer.md)** - Educational content
- **[infra/nginx/](infra/nginx/)** - Multiple nginx configs
- **[infra/k8s/](infra/k8s/)** - Kubernetes manifests with detailed comments

## Phase 5: Saga Pattern & Streaming Processing

**Location**: `backend/PHASE5-STREAMING-SAGA.md`

### Features Implemented

 **Saga Choreography Pattern**
- Order Service (saga initiator + compensation handler)
- Payment Service (saga participant, 30% failure rate)
- Inventory Service (saga participant, 20% failure rate)
- Event-driven coordination (no central orchestrator)

 **Compensation Actions**
- Payment failure → Cancel order
- Inventory failure → Refund payment + Cancel order
- Forward actions (not rollbacks)

 **Streaming Analytics**
- Real-time revenue aggregation
- Order success rate calculation
- Time-windowing (orders per minute)
- Periodic reporting every 10 seconds

 **Event-Driven Patterns**
- Pub/Sub: Analytics subscribes to all events
- Event Splitter: Payment → Success/Failure events
- Idempotency: Duplicate event handling
- Correlation IDs: Track saga across services

### Saga Flow

**Success Path:**
```
Order Service → Payment Service → Inventory Service → Complete
     │               │                   │
  OrderCreated  PaymentCompleted  InventoryReserved
```

**Compensation Path (Payment Fails):**
```
Order Service → Payment Service ✗
     │               │
  OrderCreated  PaymentFailed
     │
  OrderCancelled (COMPENSATION)
```

**Compensation Path (Inventory Fails):**
```
Order Service → Payment Service → Inventory Service ✗
     │               │                   │
  OrderCreated  PaymentCompleted  InventoryFailed
     │               │                   │
OrderCancelled  PaymentRefunded (COMPENSATION)
```

### Running Phase 5

```bash
# 1. Start Kafka
docker-compose -f docker-compose.kafka.yml up -d

# 2. Start services in separate terminals
cd backend

# Terminal 1: Order Service
PORT=3002 npm run start order-service

# Terminal 2: Payment Service  
PORT=3003 npm run start payment-service

# Terminal 3: Inventory Service
PORT=3004 npm run start inventory-service

# Terminal 4: Analytics Service
PORT=3005 npm run start analytics-service

# 3. Run test script
./test-saga.sh
```

### Testing Saga

```bash
# Create order (saga starts)
curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "items": [{"productId": "prod-1", "quantity": 2, "price": 50}],
    "total": 100
  }'

# Check order status
curl http://localhost:3002/orders/{orderId}

# View analytics
curl http://localhost:3005/analytics
```

### Documentation

- **[PHASE5-STREAMING-SAGA.md](PHASE5-STREAMING-SAGA.md)** - Complete implementation guide
- **[Handbook: Saga Pattern](../handbook/docs/saga-pattern/)** - Educational content
  - Introduction to Saga Pattern
  - Choreography Pattern (implemented)
  - Streaming vs Messaging
  - Compensation strategies
  - Lambda vs Kappa architecture

### Key Concepts

**Saga Pattern:**
- Solves distributed transaction problem
- Local transactions + event coordination
- Compensation instead of rollback
- Eventually consistent

**Choreography vs Orchestration:**
- Choreography: Event-driven, no central coordinator (our implementation)
- Orchestration: Central controller calls services
- Choreography better for simple workflows
- Orchestration better for complex workflows

**Streaming Processing:**
- Stateful event processing
- Real-time aggregation (sum, count, average)
- Time windowing (minute, hour, day)
- Different from messaging (task execution)

**Lambda vs Kappa:**
- Lambda: Batch + Speed layers (complex)
- Kappa: Single streaming layer (simple, modern)
- Our implementation uses Kappa architecture

## Technologies Used

- **NestJS** v11.1.11 - Progressive Node.js framework
- **Node.js** v23.7.0 - JavaScript runtime
- **Docker** - Containerization
- **Nginx** - Load balancer
- **Apache Kafka** - Event streaming platform
- **pnpm** - Package manager
- **@nestjs/axios** - HTTP client
- **@nestjs/throttler** - Rate limiting
- **opossum** - Circuit breaker
- **kafkajs** - Kafka client for Node.js

## License

MIT - See [LICENSE](../LICENSE)

---

**🎯 Run `./test-saga.sh` to see saga pattern and streaming analytics in action!**

**Built by**: [Your Name]  
**Course**: [Course Name]  
**Date**: January 2026
