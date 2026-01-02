---
sidebar_position: 2
---

# Prometheus Metrics

Prometheus is an open-source monitoring system that collects **time-series metrics** from instrumented applications.

## 🎯 Why Prometheus?

### The Problem

Without metrics:
```
Manager: "How many orders did we process today?"
You: "Uhh... let me query the database..."

Manager: "What was our peak traffic?"
You: "I don't know..."

Manager: "Did that deploy break anything?"
You: "Let me check logs..." *searches for hours*
```

### The Solution

With Prometheus:
```promql
# Orders in last 24h
sum(increase(orders_created_total[24h]))

# Peak RPS today
max_over_time(rate(http_requests_total[5m])[24h:])

# Error rate after deploy (last 15 minutes)
rate(http_requests_total{status_code=~"5.."}[15m])
/ rate(http_requests_total[15m]) * 100
```

---

## 📊 Metric Types

### 1. Counter (Only Goes Up)

Tracks cumulative values that **only increase** (or reset to zero).

```typescript
import { Counter } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

// Increment counter
httpRequestsTotal.inc({ 
  method: 'POST', 
  route: '/orders', 
  status_code: 200,
  service: 'order-service'
});
```

**Use cases:**
- HTTP requests
- Events processed
- Errors encountered
- Business events (orders, payments)

**PromQL queries:**
```promql
# Total requests
http_requests_total

# Requests per second (rate)
rate(http_requests_total[5m])

# Total orders in last 24h
sum(increase(orders_created_total[24h]))
```

### 2. Gauge (Can Go Up or Down)

Tracks values that can **increase or decrease**.

```typescript
import { Gauge } from 'prom-client';

const activeConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Currently active HTTP connections',
  labelNames: ['service'],
});

// Set value
activeConnections.set({ service: 'api-gateway' }, 42);

// Increment/decrement
activeConnections.inc({ service: 'api-gateway' });
activeConnections.dec({ service: 'api-gateway' });
```

**Use cases:**
- In-flight requests
- Queue depth
- Memory usage
- Kafka consumer lag

**PromQL queries:**
```promql
# Current value
http_active_connections

# Average over time
avg_over_time(http_active_connections[5m])

# Max in last hour
max_over_time(kafka_consumer_lag[1h])
```

### 3. Histogram (Distribution of Values)

Tracks the **distribution** of values with configurable buckets.

```typescript
import { Histogram } from 'prom-client';

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5], // 1ms to 5s
});

// Record observation
httpRequestDuration.observe(
  { method: 'POST', route: '/orders', service: 'order-service' },
  0.245  // 245ms
);
```

**What it tracks:**
```
_bucket{le="0.01"}    142  # 142 requests < 10ms
_bucket{le="0.05"}    378  # 378 requests < 50ms
_bucket{le="0.1"}     1203 # 1203 requests < 100ms
_bucket{le="+Inf"}    1524 # All requests
_sum                  45.23 # Total duration
_count                1524  # Total count
```

**Use cases:**
- Request latency
- Processing duration
- Database query time

**PromQL queries:**
```promql
# P50 latency (median)
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# P99 latency
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Average latency
rate(http_request_duration_seconds_sum[5m])
/ rate(http_request_duration_seconds_count[5m])
```

### 4. Summary (Client-Side Quantiles)

Similar to Histogram but calculates quantiles **on the client**.

```typescript
import { Summary } from 'prom-client';

const dbQueryDuration = new Summary({
  name: 'db_query_duration_seconds',
  help: 'Database query duration',
  percentiles: [0.5, 0.9, 0.95, 0.99],
});

// Record observation
dbQueryDuration.observe(0.042); // 42ms
```

**Histogram vs Summary:**

| Aspect | Histogram | Summary |
|--------|-----------|---------|
| **Quantile calculation** | Server-side (Prometheus) | Client-side (app) |
| **Bucket configuration** | Required | Not required |
| **Aggregation across instances** |  Yes |  No |
| **Memory usage** | Lower | Higher |
| **Recommended** |  Use histograms |  Use only if needed |

---

## 🛠️ Our Metrics Implementation

### HTTP Metrics

```typescript
// libs/observability/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

// Total requests
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

// Request duration
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5],
});

// In-flight requests
export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Currently processing HTTP requests',
  labelNames: ['service'],
});
```

### Middleware to Track Metrics

```typescript
// libs/observability/middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { httpRequestsTotal, httpRequestDuration, httpRequestsInFlight } from './metrics';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const serviceName = process.env.SERVICE_NAME || 'unknown';
    const startTime = Date.now();

    // Increment in-flight
    httpRequestsInFlight.inc({ service: serviceName });

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000; // seconds
      const route = req.route?.path || req.path;
      const method = req.method;
      const statusCode = res.statusCode;

      // Track total requests
      httpRequestsTotal.inc({
        method,
        route,
        status_code: statusCode,
        service: serviceName,
      });

      // Track duration
      httpRequestDuration.observe(
        { method, route, status_code: statusCode, service: serviceName },
        duration
      );

      // Decrement in-flight
      httpRequestsInFlight.dec({ service: serviceName });
    });

    next();
  }
}
```

### Kafka Metrics

```typescript
// Kafka producer
export const kafkaMessagesProduced = new Counter({
  name: 'kafka_messages_produced_total',
  help: 'Total Kafka messages produced',
  labelNames: ['topic', 'event_type', 'service'],
});

// Kafka consumer
export const kafkaMessagesConsumed = new Counter({
  name: 'kafka_messages_consumed_total',
  help: 'Total Kafka messages consumed',
  labelNames: ['topic', 'event_type', 'consumer_group', 'service'],
});

// Consumer lag
export const kafkaConsumerLag = new Gauge({
  name: 'kafka_consumer_lag',
  help: 'Kafka consumer lag (messages)',
  labelNames: ['topic', 'consumer_group', 'partition', 'service'],
});

// Usage
kafkaMessagesProduced.inc({
  topic: 'orders',
  event_type: 'ORDER_CREATED',
  service: 'order-service',
});
```

### Distributed Lock Metrics

```typescript
// Lock acquisitions
export const lockAcquisitionsTotal = new Counter({
  name: 'lock_acquisitions_total',
  help: 'Total lock acquisition attempts',
  labelNames: ['resource', 'status', 'service'], // status: success, failure
});

// Lock hold duration
export const lockHoldDuration = new Histogram({
  name: 'lock_hold_duration_seconds',
  help: 'Time lock was held',
  labelNames: ['resource', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

// Lock contentions
export const lockContentions = new Counter({
  name: 'lock_contentions_total',
  help: 'Lock contention events',
  labelNames: ['resource', 'service'],
});

// Usage
const startTime = Date.now();
const acquired = await distributedLock.acquire('inventory:item-123');

lockAcquisitionsTotal.inc({
  resource: 'inventory:item-123',
  status: acquired ? 'success' : 'failure',
  service: 'order-service',
});

if (!acquired) {
  lockContentions.inc({ resource: 'inventory:item-123', service: 'order-service' });
}

// ... do work ...

await distributedLock.release('inventory:item-123');
lockHoldDuration.observe(
  { resource: 'inventory:item-123', service: 'order-service' },
  (Date.now() - startTime) / 1000
);
```

### Business Metrics

```typescript
// Orders created
export const ordersCreated = new Counter({
  name: 'orders_created_total',
  help: 'Total orders created',
  labelNames: ['service'],
});

// Payments processed
export const paymentsProcessed = new Counter({
  name: 'payments_processed_total',
  help: 'Total payments processed',
  labelNames: ['status', 'service'], // status: success, failed
});

// Revenue
export const revenue = new Counter({
  name: 'revenue_total',
  help: 'Total revenue (USD)',
  labelNames: ['service'],
});

// Usage
ordersCreated.inc({ service: 'order-service' });
revenue.inc({ service: 'order-service' }, order.totalAmount);
```

---

## 📈 Metrics Endpoint

Every service exposes Prometheus metrics:

```typescript
// libs/observability/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { register } from './metrics';

@Controller()
export class HealthController {
  @Get('/metrics')
  async getMetrics() {
    return register.metrics();
  }
}
```

**Access metrics:**
```bash
curl http://localhost:3001/metrics
```

**Response (Prometheus format):**
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",route="/orders",status_code="200",service="order-service"} 1524

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="POST",route="/orders",status_code="200",service="order-service",le="0.005"} 142
http_request_duration_seconds_bucket{method="POST",route="/orders",status_code="200",service="order-service",le="0.01"} 378
http_request_duration_seconds_sum{method="POST",route="/orders",status_code="200",service="order-service"} 45.23
http_request_duration_seconds_count{method="POST",route="/orders",status_code="200",service="order-service"} 1524
```

---

## 🔍 Essential PromQL Queries

### HTTP Metrics

```promql
# Requests per second
rate(http_requests_total[5m])

# Error rate (%)
rate(http_requests_total{status_code=~"5.."}[5m])
/ rate(http_requests_total[5m]) * 100

# P50/P95/P99 latency
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Top 5 slowest routes (P95)
topk(5, 
  histogram_quantile(0.95, 
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

### Kafka Metrics

```promql
# Messages produced per second
rate(kafka_messages_produced_total[5m])

# Consumer lag (by topic)
sum(kafka_consumer_lag) by (topic)

# Consumers with high lag (>1000 messages)
kafka_consumer_lag > 1000
```

### Business Metrics

```promql
# Orders in last 24h
sum(increase(orders_created_total[24h]))

# Revenue in last hour
sum(increase(revenue_total[1h]))

# Payment success rate
rate(payments_processed_total{status="success"}[5m])
/ rate(payments_processed_total[5m]) * 100
```

---

## 🎯 Best Practices

### 1. Use Labels Wisely

 **Good:**
```typescript
httpRequestsTotal.inc({ method: 'POST', route: '/orders', status_code: 200 });
```

 **Bad (high cardinality):**
```typescript
httpRequestsTotal.inc({ method: 'POST', route: '/orders', user_id: 'user-12345' });
```

**Why?** Each unique label combination creates a new time series. With millions of users, this explodes memory.

### 2. Choose Histogram Buckets Carefully

```typescript
// Web API (milliseconds matter)
buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5]

// Batch processing (seconds matter)
buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]

// Background jobs (minutes matter)
buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600]
```

### 3. Use Helper Functions

```typescript
// Helper: Start timer
export function startTimer(histogram: Histogram) {
  const start = Date.now();
  return (labels?: Record<string, string>) => {
    histogram.observe(labels || {}, (Date.now() - start) / 1000);
  };
}

// Usage
const endTimer = startTimer(httpRequestDuration);
// ... do work ...
endTimer({ method: 'POST', route: '/orders' });
```

### 4. Add Default Labels

```typescript
import { register } from 'prom-client';

register.setDefaultLabels({
  service: process.env.SERVICE_NAME,
  environment: process.env.NODE_ENV,
  version: process.env.npm_package_version,
});
```

---

## 🎯 Key Takeaways

1. **Counter** → Only goes up (requests, events)
2. **Gauge** → Current value (active connections, lag)
3. **Histogram** → Distribution (latency percentiles)
4. **Summary** → Avoid (use histogram instead)

5. **Low cardinality** → Labels with few unique values
6. **High cardinality** → Labels with many unique values (avoid!)

7. **Histograms are powerful** → Calculate any percentile (P50, P95, P99)
8. **Rate() is essential** → Convert counters to per-second values

9. **/metrics endpoint** → Must be accessible to Prometheus
10. **Monitor the 4 Golden Signals** → Latency, Traffic, Errors, Saturation

---

## 📚 Further Reading

- [Prometheus Metric Types](https://prometheus.io/docs/concepts/metric_types/)
- [Histogram vs Summary](https://prometheus.io/docs/practices/histograms/)
- [PromQL Basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Best Practices](https://prometheus.io/docs/practices/naming/)
