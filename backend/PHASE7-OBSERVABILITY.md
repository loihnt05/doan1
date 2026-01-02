# 🎯 PHASE 7 – OBSERVABILITY, METRICS & FINAL ARCHITECTURE

**"If you can't measure it, you can't improve it"**

This phase transforms our distributed system from "it works" to "it's production-ready" by implementing the **3 pillars of observability**:

1. **📊 Metrics** – Quantitative data (counters, histograms, gauges)
2. **📝 Logs** – Qualitative event records with context
3. **🔍 Traces** – Request flow across distributed services

---

## 📚 Table of Contents

- [Why Observability Matters](#why-observability-matters)
- [Three Pillars Explained](#three-pillars-explained)
- [Prometheus Metrics](#prometheus-metrics)
- [Structured Logging](#structured-logging)
- [Distributed Tracing](#distributed-tracing)
- [Health Checks](#health-checks)
- [Integration Guide](#integration-guide)
- [Monitoring Setup](#monitoring-setup)
- [Alerting Rules](#alerting-rules)
- [Production Checklist](#production-checklist)

---

## 🤔 Why Observability Matters

### The Production Problem

Without observability:
```
User: "The app is slow!"
You: "Uhh... let me SSH into servers and check logs..."
```

With observability:
```
User: "The app is slow!"
You: *Opens Grafana dashboard*
"P95 latency is 2.5s on payment service, Kafka consumer lag is 10k messages,
Redis lock contentions increased by 300% in the last hour"
```

### Key Concepts

| Concept | Definition | Example |
|---------|-----------|---------|
| **Observability** | How well you can understand internal system state from external outputs | Can you debug production issues without deploying new code? |
| **Monitoring** | Collecting and alerting on predefined metrics | CPU > 80% → alert |
| **SLI** | Service Level Indicator (what you measure) | Request latency, error rate |
| **SLO** | Service Level Objective (target value) | 99.9% requests < 500ms |
| **SLA** | Service Level Agreement (contract) | 99.95% uptime or money back |
| **Error Budget** | Allowed downtime before violating SLO | 0.1% = 43 minutes/month |

---

## 🧱 Three Pillars Explained

### 1️⃣ Metrics – The "What"

**Quantitative time-series data**

```typescript
// Counter - only goes up
httpRequestsTotal.inc({ method: 'POST', route: '/orders', status_code: 200 });

// Histogram - distribution of values
httpRequestDuration.observe({ route: '/orders' }, 0.245); // 245ms

// Gauge - can go up/down
httpRequestsInFlight.set(42);
```

**When to use:**
- Track trends over time (RPS, latency, errors)
- Set up alerts (error rate > 5%)
- Calculate SLOs (99% of requests < 500ms)

### 2️⃣ Logs – The "Why"

**Qualitative event records with context**

```json
{
  "level": "ERROR",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "service": "payment-service",
  "traceId": "a1b2c3d4",
  "message": "Payment processing failed",
  "error": "InsufficientFundsError",
  "userId": "user-123",
  "orderId": "order-456",
  "amount": 99.99,
  "stack": "..."
}
```

**When to use:**
- Debug specific request failures
- Investigate user-reported issues
- Audit trail (who did what when)

### 3️⃣ Traces – The "Where"

**Request journey across services**

```
[API Gateway] --150ms--> [Order Service] --200ms--> [Payment Service] --50ms--> [Kafka]
                                   |
                                   +--100ms--> [Inventory Service]
```

**When to use:**
- Find bottlenecks in distributed flows
- Understand service dependencies
- Measure end-to-end latency

---

## 📊 Prometheus Metrics

### Our Metrics Registry

```typescript
// libs/observability/metrics.ts
import { Counter, Histogram, Gauge, register } from 'prom-client';

// HTTP Metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5], // 1ms to 5s
});

// Kafka Metrics
export const kafkaMessagesProduced = new Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total Kafka messages produced',
  labelNames: ['topic', 'event_type', 'service'],
});

export const kafkaMessagesConsumed = new Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total Kafka messages consumed',
  labelNames: ['topic', 'event_type', 'consumer_group', 'service'],
});

export const kafkaConsumerLag = new Gauge({
  name: 'kafka_consumer_lag',
  help: 'Kafka consumer lag (messages)',
  labelNames: ['topic', 'consumer_group', 'partition', 'service'],
});

// Distributed Lock Metrics
export const lockAcquisitionsTotal = new Counter({
  name: 'lock_acquisitions_total',
  help: 'Total lock acquisition attempts',
  labelNames: ['resource', 'status', 'service'], // status: success, failure
});

export const lockHoldDuration = new Histogram({
  name: 'lock_hold_duration_seconds',
  help: 'Time lock was held',
  labelNames: ['resource', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10], // 10ms to 10s
});

export const lockContentions = new Counter({
  name: 'lock_contentions_total',
  help: 'Lock contention events (failed to acquire)',
  labelNames: ['resource', 'service'],
});

export const fencedTokenRejections = new Counter({
  name: 'fenced_token_rejections_total',
  help: 'Stale write attempts blocked by fenced tokens',
  labelNames: ['resource', 'service'],
});

// Saga Metrics
export const sagaExecutions = new Counter({
  name: 'saga_executions_total',
  help: 'Total saga executions',
  labelNames: ['saga_type', 'status', 'service'], // status: success, failed, compensated
});

export const sagaDuration = new Histogram({
  name: 'saga_duration_seconds',
  help: 'Saga execution duration',
  labelNames: ['saga_type', 'service'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // 100ms to 30s
});

export const sagaCompensationExecutions = new Counter({
  name: 'saga_compensation_executions_total',
  help: 'Saga compensation step executions',
  labelNames: ['saga_type', 'step', 'service'],
});

// Business Metrics
export const ordersCreated = new Counter({
  name: 'orders_created_total',
  help: 'Total orders created',
  labelNames: ['service'],
});

export const paymentsProcessed = new Counter({
  name: 'payments_processed_total',
  help: 'Total payments processed',
  labelNames: ['status', 'service'], // status: success, failed
});

export const revenue = new Counter({
  name: 'revenue_total',
  help: 'Total revenue (USD)',
  labelNames: ['service'],
});

// Node.js Metrics
export const eventLoopLag = new Gauge({
  name: 'nodejs_eventloop_lag_seconds',
  help: 'Event loop lag',
  labelNames: ['service'],
});

export const activeHandles = new Gauge({
  name: 'nodejs_active_handles',
  help: 'Active handles',
  labelNames: ['service'],
});

export const activeRequests = new Gauge({
  name: 'nodejs_active_requests',
  help: 'Active requests',
  labelNames: ['service'],
});
```

### Metrics Endpoint

Every service exposes:

```bash
GET /metrics
```

Response (Prometheus format):
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/orders",status_code="200",service="order-service"} 1524

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/orders",status_code="200",service="order-service",le="0.005"} 142
http_request_duration_seconds_bucket{method="POST",route="/orders",status_code="200",service="order-service",le="0.01"} 378
http_request_duration_seconds_bucket{method="POST",route="/orders",status_code="200",service="order-service",le="0.05"} 1203
http_request_duration_seconds_sum{method="POST",route="/orders",status_code="200",service="order-service"} 45.23
http_request_duration_seconds_count{method="POST",route="/orders",status_code="200",service="order-service"} 1524

# HELP kafka_consumer_lag Kafka consumer lag
# TYPE kafka_consumer_lag gauge
kafka_consumer_lag{topic="orders",consumer_group="analytics-service",partition="0",service="analytics-service"} 342

# HELP lock_contentions_total Lock contentions
# TYPE lock_contentions_total counter
lock_contentions_total{resource="inventory:item-123",service="order-service"} 28
```

---

## 📝 Structured Logging

### Why JSON Logs?

**Bad (unstructured):**
```
2024-01-15 10:30:45 ERROR Payment failed for user user-123 order order-456 amount 99.99
```

Can you:
- Filter by userId programmatically? 
- Aggregate errors by error type? 
- Count failures per hour? 

**Good (structured):**
```json
{
  "level": "ERROR",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "service": "payment-service",
  "traceId": "a1b2c3d4",
  "message": "Payment processing failed",
  "userId": "user-123",
  "orderId": "order-456",
  "amount": 99.99,
  "error": {
    "type": "InsufficientFundsError",
    "code": "PAYMENT_001",
    "stack": "..."
  }
}
```

Now you can:
```bash
# Count errors by type
cat logs.json | jq -r 'select(.level=="ERROR") | .error.type' | sort | uniq -c

# Find all logs for a specific trace
cat logs.json | jq 'select(.traceId=="a1b2c3d4")'

# Average payment amount for failed transactions
cat logs.json | jq -r 'select(.error.type=="InsufficientFundsError") | .amount' | awk '{s+=$1} END {print s/NR}'
```

### Our Logger Implementation

```typescript
// libs/observability/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: process.env.SERVICE_NAME || 'unknown',
    environment: process.env.NODE_ENV || 'development',
  },
  // Pretty print in development
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

// Helper: Log with trace ID
export function logWithTrace(
  level: 'info' | 'error' | 'warn' | 'debug',
  message: string,
  traceId: string,
  meta?: Record<string, any>
) {
  logger[level]({ traceId, ...meta }, message);
}

// Helper: Log HTTP request
export function logHttpRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  traceId?: string
) {
  logger.info({
    type: 'http_request',
    method,
    url,
    statusCode,
    duration,
    traceId,
  }, `${method} ${url} ${statusCode} - ${duration}ms`);
}

// Helper: Log Kafka event
export function logKafkaEvent(
  type: 'produced' | 'consumed',
  topic: string,
  eventType: string,
  eventId: string,
  meta?: Record<string, any>
) {
  logger.info({
    type: 'kafka_event',
    kafkaType: type,
    topic,
    eventType,
    eventId,
    ...meta,
  }, `Kafka ${type}: ${topic} - ${eventType}`);
}

// Helper: Log saga execution
export function logSagaExecution(
  sagaType: string,
  step: string,
  status: 'started' | 'completed' | 'failed' | 'compensating' | 'compensated',
  meta?: Record<string, any>
) {
  const level = status === 'failed' ? 'error' : 'info';
  logger[level]({
    type: 'saga',
    sagaType,
    step,
    status,
    ...meta,
  }, `Saga ${sagaType} - ${step}: ${status}`);
}

// Helper: Log lock operation
export function logLockOperation(
  operation: 'acquire' | 'release' | 'contention',
  resource: string,
  success: boolean,
  duration?: number,
  meta?: Record<string, any>
) {
  logger.info({
    type: 'lock',
    operation,
    resource,
    success,
    duration,
    ...meta,
  }, `Lock ${operation}: ${resource} - ${success ? 'success' : 'failure'}`);
}

// Helper: Log error with stack trace
export function logError(
  error: Error,
  context: string,
  meta?: Record<string, any>
) {
  logger.error({
    type: 'error',
    context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...meta,
  }, `Error in ${context}: ${error.message}`);
}
```

### Log Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| **ERROR** | Unrecoverable failures | Payment processing failed |
| **WARN** | Recoverable issues | Retry attempt 3/5 |
| **INFO** | Important events | Order created, payment processed |
| **DEBUG** | Detailed flow | Lock acquired, Kafka message consumed |
| **TRACE** | Very verbose | Function entry/exit |

---

## 🔍 Distributed Tracing

### The Problem

```
User reports: "Order creation is slow"

Which part is slow?
- API Gateway?
- Order Service?
- Payment Service?
- Inventory Service?
- Kafka?
- Database?
```

### The Solution: Trace ID

```typescript
// 1️⃣ API Gateway generates trace ID
const traceId = uuidv4(); // "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
req.headers['X-Trace-Id'] = traceId;

// 2️⃣ Order Service receives and propagates
const traceId = req.headers['x-trace-id'];
kafkaProducer.send({
  topic: 'orders',
  messages: [{
    headers: { traceId },
    value: JSON.stringify(order),
  }],
});

// 3️⃣ Payment Service receives via Kafka
const traceId = message.headers.traceId;
logger.info({ traceId }, 'Processing payment');

// 4️⃣ All logs have the same trace ID
// Now you can filter logs by trace ID to see the full flow!
```

### Example: Full Request Trace

```json
// API Gateway
{"level":"INFO","traceId":"a1b2c3d4","service":"api-gateway","message":"POST /orders - 200ms"}

// Order Service
{"level":"INFO","traceId":"a1b2c3d4","service":"order-service","message":"Order created","orderId":"order-123"}
{"level":"INFO","traceId":"a1b2c3d4","service":"order-service","message":"Kafka produced: orders - ORDER_CREATED"}

// Payment Service
{"level":"INFO","traceId":"a1b2c3d4","service":"payment-service","message":"Kafka consumed: orders - ORDER_CREATED"}
{"level":"INFO","traceId":"a1b2c3d4","service":"payment-service","message":"Payment processed","paymentId":"pay-456"}

// Inventory Service
{"level":"INFO","traceId":"a1b2c3d4","service":"inventory-service","message":"Inventory reserved","items":[{"id":"item-789","qty":2}]}
```

### OpenTelemetry (Future Enhancement)

For full distributed tracing with visual flamegraphs:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/instrumentation-http
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const sdk = new NodeSDK({
  traceExporter: new JaegerExporter({ endpoint: 'http://jaeger:14268/api/traces' }),
  serviceName: 'order-service',
});

sdk.start();
```

Tools: **Jaeger**, **Zipkin**, **Grafana Tempo**

---

## 🏥 Health Checks

### Kubernetes Probes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  template:
    spec:
      containers:
      - name: order-service
        image: order-service:latest
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

### Health Endpoints

**`GET /health` - Liveness Probe**

"Is the service alive?"

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "uptime": 3600
}
```

If this fails → **K8s restarts the pod**

**`GET /ready` - Readiness Probe**

"Is the service ready to serve traffic?"

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "checks": {
    "nodejs": { "status": "ok", "version": "v20.11.0" },
    "eventLoop": { "status": "ok", "lag": 5 },
    "redis": { "status": "ok", "latency": 2 },
    "kafka": { "status": "ok", "connected": true },
    "database": { "status": "ok", "latency": 10 }
  }
}
```

If this fails → **K8s removes pod from service endpoints** (no new traffic)

**`GET /info` - System Info**

```json
{
  "service": "order-service",
  "version": "1.0.0",
  "environment": "production",
  "node": { "version": "v20.11.0", "platform": "linux" },
  "system": { "hostname": "order-service-7d9f8b-abc12", "cpus": 4, "totalMemory": 8589934592 },
  "process": { "pid": 1, "uptime": 3600, "memoryUsage": { "rss": 125829120, "heapUsed": 87654321 } }
}
```

---

## 🔧 Integration Guide

### 1. Add to NestJS Service

```typescript
// apps/backend/src/app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ObservabilityModule, MetricsMiddleware } from '../../../libs/observability';

@Module({
  imports: [
    ObservabilityModule, // Health checks + metrics endpoints
    // ... other modules
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Add metrics middleware to all routes
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
```

### 2. Track Custom Metrics

```typescript
import { ordersCreated, paymentsProcessed, revenue } from '../../../libs/observability';

// In OrderService
async createOrder(order: CreateOrderDto) {
  const result = await this.orderRepository.save(order);
  
  // Track business metric
  ordersCreated.inc({ service: 'order-service' });
  revenue.inc({ service: 'order-service' }, order.totalAmount);
  
  return result;
}

// In PaymentService
async processPayment(payment: Payment) {
  try {
    const result = await this.paymentGateway.charge(payment);
    
    // Track success
    paymentsProcessed.inc({ status: 'success', service: 'payment-service' });
    
    return result;
  } catch (error) {
    // Track failure
    paymentsProcessed.inc({ status: 'failed', service: 'payment-service' });
    throw error;
  }
}
```

### 3. Add Logging

```typescript
import { logger, logWithTrace, logError } from '../../../libs/observability';

async handleOrderCreated(message: KafkaMessage) {
  const traceId = message.headers.traceId as string;
  
  try {
    logWithTrace('info', 'Processing order', traceId, { orderId: message.value.orderId });
    
    // ... business logic
    
    logWithTrace('info', 'Order processed successfully', traceId, { orderId: message.value.orderId });
  } catch (error) {
    logError(error, 'handleOrderCreated', { traceId, orderId: message.value.orderId });
    throw error;
  }
}
```

---

## 📈 Monitoring Setup

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'order-service'
    static_configs:
      - targets: ['order-service:3001']
  
  - job_name: 'payment-service'
    static_configs:
      - targets: ['payment-service:3002']
  
  - job_name: 'inventory-service'
    static_configs:
      - targets: ['inventory-service:3003']
  
  - job_name: 'analytics-service'
    static_configs:
      - targets: ['analytics-service:3004']
```

### Grafana Dashboard

**Key Metrics to Monitor:**

1. **Golden Signals** (Google SRE):
   - **Latency**: How long requests take
   - **Traffic**: Requests per second
   - **Errors**: Error rate
   - **Saturation**: Resource utilization

2. **RED Method** (for services):
   - **Rate**: Requests per second
   - **Errors**: Error rate
   - **Duration**: Latency distribution

3. **USE Method** (for resources):
   - **Utilization**: % time resource is busy
   - **Saturation**: Queue depth
   - **Errors**: Error count

**Example PromQL Queries:**

```promql
# Request rate (per second)
rate(http_requests_total[5m])

# Error rate (%)
rate(http_requests_total{status_code=~"5.."}[5m]) 
/ 
rate(http_requests_total[5m]) * 100

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Kafka consumer lag
kafka_consumer_lag

# Lock contention rate
rate(lock_contentions_total[5m])

# Saga failure rate
rate(saga_executions_total{status="failed"}[5m])
/ 
rate(saga_executions_total[5m]) * 100
```

---

## 🚨 Alerting Rules

```yaml
# prometheus-alerts.yml
groups:
  - name: service_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(http_requests_total{status_code=~"5.."}[5m]) 
          / 
          rate(http_requests_total[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.service }}"
          description: "Error rate is {{ $value }}% (threshold: 5%)"
      
      # High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High P95 latency on {{ $labels.service }}"
          description: "P95 latency is {{ $value }}s (threshold: 1s)"
      
      # Kafka consumer lag
      - alert: KafkaConsumerLag
        expr: kafka_consumer_lag > 1000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Kafka consumer lag on {{ $labels.topic }}"
          description: "Lag is {{ $value }} messages (threshold: 1000)"
      
      # Lock contentions
      - alert: HighLockContentions
        expr: rate(lock_contentions_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High lock contention on {{ $labels.resource }}"
          description: "Contention rate is {{ $value }}/s (threshold: 10/s)"
      
      # Saga failures
      - alert: HighSagaFailureRate
        expr: |
          rate(saga_executions_total{status="failed"}[5m])
          /
          rate(saga_executions_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High saga failure rate"
          description: "Saga failure rate is {{ $value }}% (threshold: 10%)"
```

---

##  Production Checklist

### Metrics
- [ ] All services expose `/metrics` endpoint
- [ ] Prometheus scraping all services
- [ ] Grafana dashboards created
- [ ] Alerting rules configured
- [ ] On-call rotation set up

### Logging
- [ ] All logs are structured JSON
- [ ] Trace IDs propagated across services
- [ ] Log aggregation tool configured (ELK, Loki)
- [ ] Log retention policy defined
- [ ] PII data redacted from logs

### Tracing
- [ ] Trace IDs generated at API gateway
- [ ] Trace IDs propagated via HTTP headers and Kafka headers
- [ ] (Optional) OpenTelemetry instrumentation added
- [ ] (Optional) Jaeger/Zipkin deployed

### Health Checks
- [ ] `/health` endpoint returns liveness
- [ ] `/ready` endpoint checks dependencies
- [ ] Kubernetes probes configured
- [ ] Health check alerts configured

### Capacity Planning
- [ ] Load testing performed
- [ ] Baseline metrics captured (RPS, latency, CPU, memory)
- [ ] Autoscaling rules configured
- [ ] Resource limits set (CPU, memory)

### Incident Response
- [ ] Runbooks created for common issues
- [ ] Incident response process documented
- [ ] Postmortem template created
- [ ] Game days scheduled (chaos testing)

---

## 🎯 Key Takeaways

1. **Metrics** = Quantitative data → Set up alerts, calculate SLOs
2. **Logs** = Qualitative context → Debug specific failures
3. **Traces** = Request flow → Find bottlenecks in distributed systems

4. **Always add trace IDs** to correlate logs across services
5. **Monitor the 4 Golden Signals**: Latency, Traffic, Errors, Saturation
6. **Alert on symptoms, not causes** (high error rate, not CPU usage)
7. **Log levels matter**: ERROR for failures, INFO for business events, DEBUG for troubleshooting

8. Without observability → "It works on my machine" 🤷
9. With observability → "P95 latency is 2.5s on payment service due to database connection pool exhaustion" 🎯

---

## 📚 Further Reading

- [Google SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [The RED Method](https://www.weave.works/blog/the-red-method-key-metrics-for-microservices-architecture/)
- [The USE Method](http://www.brendangregg.com/usemethod.html)
