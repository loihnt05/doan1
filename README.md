# doan1 - Microservices Architecture Learning Project

> A complete microservices demonstration with NestJS, Docker, and Nginx showcasing scaling patterns, API Gateway, and distributed system concepts.

## 🎯 Project Status: Phase 7 Complete ✅ - PRODUCTION READY

### What's Been Built:
- ✅ **Phase 0**: 3 independent microservices (user, order, payment)
- ✅ **Phase 1**: API Gateway with routing, aggregation, auth, rate limiting, circuit breaker
- ✅ **Phase 2**: Horizontal scaling with load balancing + performance demonstrations
- ✅ **Phase 3**: Load balancing algorithms, Kubernetes networking, proxy types explained
- ✅ **Phase 4**: Event-driven architecture with Kafka (async communication, saga orchestration)
- ✅ **Phase 5**: Saga pattern for distributed transactions (choreography + compensation)
- ✅ **Phase 6**: Distributed locking with Redis (race condition prevention, fenced tokens)
- ✅ **Phase 7**: Observability & metrics (Prometheus, structured logging, distributed tracing)

### 🚀 Key Achievements:
- **Phase 2**: 457x performance improvement with horizontal scaling
- **Phase 3**: Complete understanding of LB algorithms, K8s Services, and service mesh concepts
- **Phase 5**: Automatic rollback with saga compensations - no manual intervention
- **Phase 6**: Zero race conditions - distributed locks prevent overselling, double-booking, double-charging
- **Phase 7**: Production-ready observability - "If you can't measure it, you can't improve it"

## 🚀 Quick Start

**Run the complete scaling demonstration:**

```bash
cd backend
./test-scaling.sh
```

This automated test demonstrates:
1. Load balancing across 3 API Gateway instances
2. Stateful design problems (in-memory counters)
3. CPU-bound blocking issues
4. Performance comparison: 1 vs 3 instances
5. Circuit breaker functionality
6. Data aggregation patterns

**Or start services manually:**

```bash
# Build and run with horizontal scaling
cd backend
docker-compose up --build --scale api-gateway=3

# Access the API
curl http://localhost/api/users
curl http://localhost/api/dashboard
curl http://localhost/api/count  # See load balancing in action!
```

## 📁 Project Structure

```
doan1/
├── backend/              # ⭐ Microservices Architecture (NestJS)
│   ├── apps/
│   │   ├── api-gateway/      # API Gateway with load balancing
│   │   ├── user-service/     # User microservice (port 3001)
│   │   ├── order-service/    # Order microservice (port 3002)
│   │   ├── payment-service/  # Payment microservice (port 3003)
│   │   ├── inventory-service/ # Inventory microservice (port 3004)
│   │   └── analytics-service/ # Analytics microservice (port 3005)
│   ├── libs/
│   │   ├── observability/    # Metrics, logging, health checks ⭐
│   │   ├── distributed-lock/ # Redis-based distributed locking
│   │   ├── reliability/      # Circuit breaker, retry, rate limiter
│   │   └── saga/             # Saga orchestration patterns
│   ├── docker-compose.yml    # Multi-container orchestration + Kafka + Redis
│   ├── nginx.conf           # Load balancer configuration
│   ├── test-scaling.sh      # Automated test suite
│   ├── test-race-condition.sh # Race condition demo
│   ├── test-fenced-tokens.sh  # Fenced token demo
│   ├── README.md            # Complete backend documentation
│   └── SCALING-DEMO.md      # Detailed scaling guide
├── handbook/            # Documentation site (Docusaurus)
│   └── docs/
│       ├── distributed-cache/
│       ├── distributed-locking/ # ⭐ Phase 6 documentation
│       ├── connection-pool/
│       └── data-model/
├── PHASE1-API-GATEWAY.md
├── PHASE2-SCALING.md
├── PHASE3-LOAD-BALANCING.md
├── PHASE4-KAFKA-EVENTS.md
├── PHASE5-SAGA-PATTERN.md
├── PHASE6-DISTRIBUTED-LOCKING.md
├── PHASE7-OBSERVABILITY.md    # ⭐ NEW
├── FINAL-ARCHITECTURE.md      # ⭐ NEW - Complete system overview
└── README.md                  # You are here
```

## 🎓 What You'll Learn

### Phase 0: Microservices Foundation
- Independent service architecture
- Docker containerization
- Service-to-service communication
- Health check patterns

### Phase 1: API Gateway Pattern
- **Request Routing**: Single entry point for all clients
- **Data Aggregation**: Combining data from multiple services
- **Authentication**: Centralized JWT validation
- **Rate Limiting**: Throttling with @nestjs/throttler (5 req/10s)
- **Circuit Breaker**: Fault tolerance with opossum
- **Retry Logic**: Exponential backoff for failed requests

### Phase 2: Scaling Strategies
- **Horizontal Scaling**: Multiple instances + Nginx load balancer
- **Load Distribution**: Round-robin across 3 instances
- **CPU-Bound Problems**: Demonstrated 457x performance improvement
- **Stateful vs Stateless**: In-memory state issues with scaling
- **Event Loop Monitoring**: Tracking Node.js performance
- **Performance Testing**: Before/after scaling comparisons

### Phase 3: Load Balancing & Kubernetes
- **LB Algorithms**: Round-robin, least connections, IP hash demonstrations
- **Health Checks**: Passive (Nginx) and active (K8s probes)
- **Proxy Types**: Clear distinctions between reverse proxy, forward proxy, LB, API gateway
- **K8s Networking**: ClusterIP, NodePort, LoadBalancer, Ingress with real YAML
- **Service Discovery**: Static vs dynamic patterns, K8s DNS
- **Service Mesh**: Istio/Linkerd concepts, when to use
- **Performance Testing**: Before/after scaling comparisons

### Phase 4: Event-Driven Architecture with Kafka
- **Async Communication**: Services communicate via events, not direct calls
- **Event Schemas**: OrderCreated, PaymentProcessed, InventoryReserved, etc.
- **Consumer Groups**: Multiple consumers for parallel processing
- **Dead Letter Queue**: Failed message handling
- **Event Sourcing Foundation**: All state changes captured as events
- **Loose Coupling**: Add/remove consumers without changing producers

### Phase 5: Saga Pattern (Distributed Transactions)
- **Choreography-Based Saga**: No central coordinator
- **Automatic Rollback**: Compensation handlers for each step
- **Eventual Consistency**: ACID impossible, saga pattern provides guarantees
- **Idempotency**: Duplicate event handling with idempotency keys
- **State Machine**: Track saga progress (PENDING → CONFIRMED/CANCELLED)
- **Real Example**: Order → Reserve Inventory → Process Payment → Confirm (or rollback)

### Phase 6: Distributed Locking & Reliability Patterns
- **Redis Distributed Locks**: `SET resource NX PX 30000` for mutual exclusion
- **Fenced Tokens**: Monotonic counters prevent stale writes after lock expiry
- **Race Condition Prevention**: No overselling, no double-booking, no double-charging
- **Reliability Patterns**: Retry with exponential backoff, circuit breaker, bulkhead, rate limiter
- **Real Scenarios**: Inventory management, payment processing, ticket booking
- **Test Scripts**: `test-race-condition.sh`, `test-fenced-tokens.sh`

### Phase 7: Observability, Metrics & Production Readiness ⭐ (Current)
- **3 Pillars**: Metrics (quantitative), Logs (qualitative), Traces (flow)
- **Prometheus Metrics**: HTTP, Kafka, locks, sagas, business metrics (orders, payments, revenue)
- **Structured Logging**: JSON logs with trace IDs using Pino
- **Distributed Tracing**: Trace ID propagation across services via HTTP/Kafka headers
- **Health Checks**: `/health` (liveness), `/ready` (readiness), `/metrics` (Prometheus)
- **Alerting**: High error rate, latency spikes, Kafka lag, lock contentions
- **Production Checklist**: Complete with SLO/SLA concepts, error budgets

## 🛠️ Technologies & Patterns

### Core Stack
| Technology | Purpose | Phase |
|------------|---------|-------|
| **NestJS** | Backend framework | 0 |
| **TypeScript** | Type safety | 0 |
| **Docker** | Containerization | 0 |
| **Nginx** | Load balancer | 2-3 |
| **Kafka** | Event streaming | 4 |
| **Redis** | Distributed locks + cache | 6 |
| **MongoDB** | Database | 4-5 |
| **Prometheus** | Metrics | 7 |
| **Pino** | Structured logging | 7 |

### Enterprise Patterns
| Pattern | Description | Benefit |
|---------|-------------|---------|
| **API Gateway** | Single entry point | Decouples clients from services |
| **Horizontal Scaling** | Run multiple instances | Linear scalability |
| **Load Balancing** | Distribute traffic | Even resource utilization |
| **Event-Driven Architecture** | Async via Kafka | Loose coupling |
| **Saga (Choreography)** | Distributed transactions | Eventual consistency |
| **Distributed Lock** | Redis-based mutual exclusion | Prevent race conditions |
| **Fenced Tokens** | Monotonic counters | Prevent stale writes |
| **Circuit Breaker** | Fail fast | Prevent cascading failures |
| **Retry + Backoff** | Handle transient failures | Resilience |
| **Observability (3 Pillars)** | Metrics, logs, traces | Production readiness |

### Performance Metrics
- **Horizontal Scaling**: 457x improvement (53s → 116ms)
- **Load Balancing**: Even distribution across 3+ instances
- **Kafka Throughput**: 10k+ messages/sec per partition
- **Lock Acquisition**: <1ms average latency (Redis)
- **P95 HTTP Latency**: <100ms (target)

## 📚 Complete Documentation

| Document | Description | Lines |
|----------|-------------|-------|
| **[README.md](./README.md)** | Project overview (you are here) | 350+ |
| **[PHASE1-API-GATEWAY.md](./PHASE1-API-GATEWAY.md)** | API Gateway pattern explained | 400+ |
| **[PHASE2-SCALING.md](./PHASE2-SCALING.md)** | Horizontal scaling guide | 450+ |
| **[PHASE3-LOAD-BALANCING.md](./PHASE3-LOAD-BALANCING.md)** | Load balancing algorithms | 500+ |
| **[PHASE4-KAFKA-EVENTS.md](./PHASE4-KAFKA-EVENTS.md)** | Event-driven architecture | 550+ |
| **[PHASE5-SAGA-PATTERN.md](./PHASE5-SAGA-PATTERN.md)** | Distributed transactions | 600+ |
| **[PHASE6-DISTRIBUTED-LOCKING.md](./PHASE6-DISTRIBUTED-LOCKING.md)** | Race condition prevention | 650+ |
| **[PHASE7-OBSERVABILITY.md](./PHASE7-OBSERVABILITY.md)** | Metrics, logs, traces | 700+ |
| **[FINAL-ARCHITECTURE.md](./FINAL-ARCHITECTURE.md)** | Complete system overview | 800+ |
| **[handbook/docs/](./handbook/docs/)** | Interactive documentation site | 2000+ |

**Total Documentation: 5000+ lines** 📖

## 🚀 Quick Start Examples

### 1. Run Complete System

```bash
cd backend
docker-compose up --build

# Access services
curl http://localhost/api/orders    # API Gateway → Order Service
curl http://localhost:3001/metrics  # Prometheus metrics
curl http://localhost:3001/health   # Health check
```

### 2. Test Horizontal Scaling

```bash
cd backend
./test-scaling.sh  # Automated 457x performance demo
```

### 3. Test Race Condition Prevention

```bash
cd backend
./test-race-condition.sh  # 10 concurrent requests, only 1 succeeds
```

### 4. Test Saga Compensation

```bash
# Create order with invalid payment
curl -X POST http://localhost/api/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","items":[{"id":"item-456","qty":999}]}'

# Watch logs - saga will automatically rollback
docker logs order-service | grep "saga"
```

### 5. View Metrics

```bash
# Prometheus metrics
curl http://localhost:3001/metrics

# Example output:
# http_requests_total{method="POST",route="/orders",status_code="200"} 1524
# kafka_consumer_lag{topic="orders",consumer_group="payment-service"} 0
# lock_contentions_total{resource="inventory:item-123"} 5
```

### 6. View Distributed Traces

```bash
# All logs for a specific request
TRACE_ID="a1b2c3d4"
docker logs order-service | grep $TRACE_ID
docker logs payment-service | grep $TRACE_ID
docker logs inventory-service | grep $TRACE_ID
```

### CPU-Bound Operation Impact

| Scenario | Configuration | Response Time | Result |
|----------|--------------|---------------|--------|
| Blocking CPU Work | 1 Instance | **53,364ms** | 😱 Disaster |
| Blocking CPU Work | 3 Instances | **116ms** | ⚡ Success |
| Normal Request | Any | ~50ms | ✅ Good |

**Conclusion**: Horizontal scaling is critical for handling CPU-intensive operations without blocking other requests.

### Stateful Counter Test

```bash
# Demonstrates per-instance state problem
curl http://localhost/api/count  # {"count":1, "processId":1}
curl http://localhost/api/count  # {"count":1, "processId":1}  <- Different instance!
curl http://localhost/api/count  # {"count":1, "processId":1}  <- Another instance!
```

Each instance maintains its own counter, proving the need for external state stores (Redis) in distributed systems.

- **[backend/](./backend)** - NestJS API (Node.js v23.7.0)
  - Distributed caching with Redis
  - User management
  - RESTful API endpoints
  
- **[handbook/](./handbook)** - Docusaurus documentation site
  - Project documentation
  - Technical guides
  - Tutorial content

For detailed monorepo setup and commands, see **[MONOREPO.md](./MONOREPO.md)**.

---

# Backend: Genesis Node · Design & Build System (Node.js v23.7.0)

The goal of this document is to capture how the Node.js v23.7.0 stack in this repository is designed, how it is built, and the tooling expectations for contributors. It focuses on the backend NestJS service that lives in `./backend` and highlights the Node 23.7–specific nuances you need to be aware of when developing or deploying.

## Quick facts

- **Runtime:** Node.js v23.7.0 (Current release line)
- **Package manager:** `pnpm` (managed through Node Corepack)
- **Framework:** NestJS 11 on top of TypeScript 5.7
- **Testing:** Jest 30 with Supertest for e2e coverage
- **Linting & formatting:** ESLint 9 + Prettier 3

## Table of contents

1. [Repository layout](#repository-layout)
2. [System architecture](#system-architecture)
3. [Build & tooling pipeline](#build--tooling-pipeline)
4. [Local development workflow](#local-development-workflow)
5. [Testing strategy](#testing-strategy)
6. [Production build & deployment](#production-build--deployment)
7. [Node.js v23.7.0 considerations](#nodejs-v2370-considerations)
8. [Troubleshooting](#troubleshooting)
9. [Contributing & next steps](#contributing--next-steps)
10. [Reference resources](#reference-resources)

## Repository layout

```
├── backend/                 # NestJS service (core of the system)
│   ├── src/
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   └── app.module.ts
│   ├── test/                # e2e & unit tests
│   ├── package.json         # scripts & dependency manifest
│   └── tsconfig*.json       # TypeScript build configuration
└── README.md                # You're here – design & build system overview
```

At the moment the project exposes a single NestJS application. Future services or clients can live alongside `backend/` and consume the same Node 23.7 toolchain.

## System architecture

### High-level flow

```
HTTP request → NestJS Controller → Service layer → Response DTO → HTTP response
```

- **Entry point:** `backend/src/main.ts` bootstraps the Nest application using `AppModule`.
- **Controllers:** handle transport concerns (routing, validation) and delegate to services.
- **Services:** encapsulate domain logic and can later depend on repositories or external providers.
- **Dependency injection:** Nest’s IoC container wires controllers, services, and any providers you declare inside modules.
- **Modules:** `AppModule` is the current root module; add feature modules as functionality grows to keep boundaries clear.

### Configuration & environment

- Use Node 23.7’s native `.env` loading via libraries such as `@nestjs/config` when configuration needs arise.
- Split environment variables into profiles (`.env.local`, `.env.test`, `.env.production`) once secrets or per-environment values are required.
- Prefer typed configuration objects to keep parity with TypeScript’s compile-time guarantees.

### Future expansion guidelines

- Introduce `DomainModule`s (e.g., `UsersModule`, `AuthModule`) to maintain a clean modular architecture.
- Wrap external integrations (databases, queues, third-party APIs) behind provider tokens to preserve testability.
- Use Nest’s pipes, filters, and interceptors for cross-cutting concerns (validation, error mapping, logging, caching).

## Build & tooling pipeline

### Prerequisites

- **Node.js v23.7.0** – install via `nvm install 23.7.0` (or your preferred version manager).
- **Corepack** – ships with Node 23; enable it with `corepack enable` to pin `pnpm` versions per project.
- **pnpm** – automatically provisioned once Corepack is enabled (`corepack use pnpm@latest` if needed).
- **Optional tools:** Docker (for container builds), VS Code + NestJS/TypeScript extensions for best DX.

### Installation

```bash
# enable Corepack once per machine
corepack enable

# ensure the runtime matches the project target
node --version  # should print v23.7.0

# install dependencies from the repository root
cd backend
pnpm install
```

### Build stages

1. **TypeScript compile:** `pnpm run build` invokes the Nest CLI which transpiles `src/**/*.ts` using `tsconfig.build.json`, emitting artifacts into `dist/`.
2. **Bundled assets (optional):** For advanced scenarios you can enable SWC or webpack via Nest CLI configuration – not needed for the current footprint.
3. **Runtime launch:** `pnpm run start:prod` executes `node dist/main.js` on Node 23.7 in production mode.

### Toolchain summary

| Stage              | Command                     | Notes |
| ------------------ | --------------------------- | ----- |
| Format             | `pnpm run format`           | Prettier 3.4 with project-internal rules.
| Lint               | `pnpm run lint`             | ESLint 9 + `typescript-eslint` v8; auto-fix enabled by default flag.
| Build              | `pnpm run build`            | Uses Nest CLI with incremental TypeScript compilation.
| Start (dev)        | `pnpm run start:dev`        | Leverages Nest’s hot reload + Node 23 watch mode.
| Start (prod)       | `pnpm run start:prod`       | Runs compiled output with `node dist/main`.
| Unit tests         | `pnpm run test`             | Jest 30 in single-run mode.
| Watch tests        | `pnpm run test:watch`       | Useful for TDD loops.
| e2e tests          | `pnpm run test:e2e`         | Bootstraps app against Supertest harness.

## Local development workflow

1. **Install dependencies** – see [Installation](#installation).
2. **Start the dev server** – run `pnpm run start:dev` to boot Nest in watch mode; Node 23.7’s file system watcher keeps restarts responsive even on large codebases.
3. **Code with confidence** – rely on TypeScript’s strictness and Nest’s DI to keep modules isolated. Introduce DTOs and validation pipes early.
4. **Run quality gates frequently** – `pnpm run lint` and `pnpm run test` should pass before every commit. For deep debugging, `pnpm run start:debug` opens the inspector.
5. **Commit using conventional messages** (recommended) so CI pipelines can auto-generate changelogs later on.

### Suggested VS Code setup

- Install the **NestJS Files** and **ESLint** extensions.
- Enable format-on-save to take advantage of Prettier.
- Configure the TypeScript SDK to use the workspace version (`typescript.tsdk`).

## Testing strategy

- **Unit tests:** co-locate `.spec.ts` files with their implementation to keep context tight. Use Nest’s `TestingModule` to instantiate providers with mocked dependencies.
- **Integration/E2E tests:** `backend/test/app.e2e-spec.ts` demonstrates how to spin up the HTTP server and assert against real routes using Supertest.
- **Coverage:** `pnpm run test:cov` outputs a coverage report into `coverage/`. Aim to keep critical paths ≥80% as the project grows.
- **Node 23 test runner:** When desired, experiment with Node’s built-in test runner (`node --test`) for ultra-lightweight suites; Jest remains the default until parity is proven.

## Production build & deployment

1. **Compile:** `pnpm run build`
2. **Package artifacts:** ship the `dist/` output together with `package.json`, `pnpm-lock.yaml`, and production dependencies. Consider `pnpm install --prod --frozen-lockfile` in the deployment environment.
3. **Configure environment variables:** set runtime secrets (ports, database URLs, keys) via process environment.
4. **Launch:** `pnpm run start:prod`
5. **Observe:** integrate your preferred logging & metrics stack (e.g., OpenTelemetry, Prometheus) through Nest interceptors or middleware.

For containerized deployments, create a multi-stage Dockerfile that installs dependencies using `pnpm fetch`/`pnpm install --offline` during the build layer to leverage pnpm’s content-addressable store.

## Node.js v23.7.0 considerations

- **File watching:** Node 23’s stable `--watch` flag underpins Nest’s `start:dev` experience—no need for `nodemon`.
- **Permission model (experimental):** if you enable `--experimental-permission`, remember to whitelist the file system/network capabilities Nest requires.
- **Runtime flags:** 23.7 supports the `--experimental-strip-types` pipeline; this repo relies on TypeScript compiler output instead.
- **Release channel:** Node 23 is a non-LTS “Current” release. Plan to retest on the next LTS (Node 24) before promoting to mission-critical workloads.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `Command 'pnpm' not found` | Run `corepack enable` or install pnpm globally (`npm install -g pnpm`). |
| Node version mismatch | `nvm install 23.7.0 && nvm use 23.7.0` or `asdf install nodejs 23.7.0`. |
| TypeScript decorator metadata errors | Ensure `reflect-metadata` is imported once at the app entry point (`main.ts`). |
| Tests can’t find Nest providers | Double-check module imports in your `TestingModule` and ensure providers are registered with matching tokens. |

## Contributing & next steps

- Follow the local workflow described above and open PRs against `main`.
- Add descriptive README sections for new modules (e.g., database, messaging) as they appear.
- Automate lint/test in CI (GitHub Actions or the platform of your choice) targeting Node 23.7 first, then the latest LTS for forward-compatibility.
- Document any environment variables or secrets as soon as they’re introduced.

## Reference resources

- [Node.js 23 release notes](https://nodejs.org/en/blog/) – keep track of changes impacting the runtime.
- [NestJS Documentation](https://docs.nestjs.com/) – official guides and recipes.
- [pnpm Docs](https://pnpm.io/motivation) – details on workspace features and deployment best practices.
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) – language reference used by the project.

---

_Assumptions:_ at the time of writing, only the backend service exists. Whenever additional services are added, mirror this document’s structure for each component or introduce a docs/ directory with service-specific READMEs.
