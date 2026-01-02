---
sidebar_position: 1
---

# Three Pillars of Observability

**"If you can't measure it, you can't improve it"**

Observability is the ability to understand the internal state of a system by examining its external outputs. For distributed systems, this requires three complementary approaches:

## 🎯 The Three Pillars

### 1️⃣ Metrics – The "What"

**Quantitative time-series data**

Metrics tell you **what** is happening in your system through numbers:

```
- Requests per second: 1,524 RPS
- P95 latency: 245ms
- Error rate: 0.03% (3 errors per 10,000 requests)
- Kafka consumer lag: 342 messages
```

**Types of Metrics:**

| Type | Behavior | Example | Use Case |
|------|----------|---------|----------|
| **Counter** | Only increases | `http_requests_total` | Track events |
| **Gauge** | Can go up/down | `active_connections` | Track current state |
| **Histogram** | Distribution | `http_request_duration` | Track latency percentiles |
| **Summary** | Distribution (client-side) | `api_call_duration` | Track quantiles |

**When to use metrics:**
- Set up alerts (error rate > 5%)
- Track trends over time
- Calculate SLOs (99% of requests < 500ms)
- Dashboard visualizations

### 2️⃣ Logs – The "Why"

**Qualitative event records with context**

Logs tell you **why** something happened by providing detailed context:

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

**Structured vs Unstructured:**

❌ **Unstructured (Bad):**
```
2024-01-15 10:30:45 ERROR Payment failed for user user-123 order order-456 amount 99.99
```

✅ **Structured (Good):**
```json
{"level":"ERROR","userId":"user-123","orderId":"order-456","amount":99.99}
```

Why structured is better:
- Can filter by any field programmatically
- Can aggregate errors by type
- Can query with JSON tools (jq, grep)
- Machine-readable for analysis

**When to use logs:**
- Debug specific request failures
- Investigate user-reported issues
- Audit trail (who did what when)
- Root cause analysis

### 3️⃣ Traces – The "Where"

**Request journey across services**

Traces tell you **where** time is spent in distributed requests:

```
[API Gateway] --150ms--> [Order Service] --200ms--> [Payment Service]
                                   |
                                   +--100ms--> [Inventory Service]
```

**Example: Trace ID propagation**

```typescript
// 1. API Gateway generates trace ID
const traceId = uuidv4(); // "a1b2c3d4"
req.headers['X-Trace-Id'] = traceId;

// 2. Order Service receives and propagates
const traceId = req.headers['x-trace-id'];
logger.info({ traceId }, 'Processing order');

// 3. Payment Service logs with same trace ID
logger.info({ traceId }, 'Processing payment');

// Now you can filter all logs by trace ID!
```

**When to use traces:**
- Find bottlenecks in distributed flows
- Understand service dependencies
- Measure end-to-end latency
- Debug timeout issues

## 🔄 How They Work Together

**Scenario: "Orders are slow today"**

1. **Start with Metrics** (Dashboard)
   ```
   - Order endpoint P95 latency: 2,500ms (usually 200ms)
   - Payment service error rate: 15% (usually <1%)
   ```
   **Insight:** Payment service is slow and failing

2. **Drill down with Logs** (Search)
   ```json
   {"service":"payment-service","level":"ERROR","error":"ConnectionTimeout"}
   ```
   **Insight:** Database connections timing out

3. **Trace specific request** (Follow trace ID)
   ```
   [Order] 50ms → [Payment] 2,400ms (DB query) → [Confirm] 50ms
   ```
   **Insight:** Database query taking 2.4s (should be <100ms)

4. **Root Cause:** Database connection pool exhausted
   **Fix:** Increase connection pool size

---

## 🎯 Key Concepts

### Observability vs Monitoring

| Aspect | Monitoring | Observability |
|--------|-----------|---------------|
| **Definition** | Watching predefined metrics | Understanding unknown unknowns |
| **Questions** | "Is CPU > 80%?" | "Why is this request slow?" |
| **Approach** | Dashboards + alerts | Exploration + debugging |
| **Scope** | Known failure modes | Any failure mode |

**Example:**
- **Monitoring:** Alert when error rate > 5%
- **Observability:** Debug why specific request failed using logs/traces

### SLI, SLO, SLA

| Term | Definition | Example |
|------|-----------|---------|
| **SLI** | Service Level Indicator (what you measure) | Request latency, error rate |
| **SLO** | Service Level Objective (target value) | 99.9% requests < 500ms |
| **SLA** | Service Level Agreement (contract) | 99.95% uptime or refund |
| **Error Budget** | Allowed downtime | 0.1% = 43 minutes/month |

**Example:**
```
SLI:  Request success rate
SLO:  99.9% of requests succeed (3 nines)
SLA:  99.95% uptime guaranteed (contract)

Error Budget: 0.1% failure allowed
  = 43 minutes downtime per month
  = 525 minutes downtime per year
```

### The Four Golden Signals (Google SRE)

| Signal | Definition | Example Metric |
|--------|-----------|----------------|
| **Latency** | How long requests take | P95 latency: 245ms |
| **Traffic** | How many requests | 1,524 requests/sec |
| **Errors** | How many failures | 0.03% error rate |
| **Saturation** | How full resources are | CPU: 65%, Memory: 78% |

**Why these 4?**
- **Latency + Errors** → User experience
- **Traffic + Saturation** → Capacity planning

---

## 🛠️ Implementation in Our System

### Prometheus Metrics

```typescript
// Counter - only goes up
httpRequestsTotal.inc({ 
  method: 'POST', 
  route: '/orders', 
  status_code: 200 
});

// Histogram - distribution
httpRequestDuration.observe(
  { route: '/orders' }, 
  0.245  // 245ms
);

// Gauge - current value
kafkaConsumerLag.set(
  { topic: 'orders', partition: 0 }, 
  342  // 342 messages behind
);
```

### Structured Logging with Pino

```typescript
import { logger } from './observability';

logger.info({
  type: 'order_created',
  orderId: 'order-123',
  userId: 'user-456',
  amount: 99.99,
  traceId: 'a1b2c3d4',
}, 'Order created successfully');
```

### Distributed Tracing

```typescript
// Middleware adds trace ID to all requests
const traceId = req.headers['x-trace-id'] || uuidv4();
req['traceId'] = traceId;
res.setHeader('X-Trace-Id', traceId);

// All logs include trace ID
logger.info({ traceId }, 'Processing request');

// Propagate to Kafka
producer.send({
  topic: 'orders',
  messages: [{
    headers: { traceId },
    value: JSON.stringify(order),
  }],
});
```

---

## 📊 Dashboards & Alerts

### Grafana Dashboard Layout

**Row 1: Golden Signals**
- Request Rate (RPS)
- P50/P95/P99 Latency
- Error Rate (%)
- CPU/Memory Usage

**Row 2: Business Metrics**
- Orders Created
- Payments Processed
- Revenue

**Row 3: Infrastructure**
- Kafka Consumer Lag
- Lock Contentions
- Saga Failures

### Example Prometheus Queries

```promql
# Request rate (per second)
rate(http_requests_total[5m])

# Error rate (%)
rate(http_requests_total{status_code=~"5.."}[5m]) 
/ 
rate(http_requests_total[5m]) * 100

# P95 latency
histogram_quantile(0.95, 
  rate(http_request_duration_seconds_bucket[5m])
)

# Kafka consumer lag
kafka_consumer_lag{topic="orders"}
```

### Alerting Rules

```yaml
# High error rate
- alert: HighErrorRate
  expr: |
    rate(http_requests_total{status_code=~"5.."}[5m])
    / rate(http_requests_total[5m]) > 0.05
  for: 5m
  annotations:
    summary: "Error rate > 5% for 5 minutes"

# High latency
- alert: HighLatency
  expr: |
    histogram_quantile(0.95, 
      rate(http_request_duration_seconds_bucket[5m])
    ) > 1
  for: 5m
  annotations:
    summary: "P95 latency > 1 second"
```

---

## ✅ Production Checklist

### Metrics
- [ ] All services expose `/metrics` endpoint
- [ ] Prometheus scraping configured
- [ ] Grafana dashboards created
- [ ] Alert rules defined
- [ ] On-call rotation set up

### Logging
- [ ] All logs are structured JSON
- [ ] Trace IDs propagated across services
- [ ] Log aggregation configured (ELK, Loki)
- [ ] PII data redacted
- [ ] Log retention policy defined

### Tracing
- [ ] Trace IDs generated at entry point
- [ ] Trace IDs propagated via headers
- [ ] Trace ID included in all logs
- [ ] (Optional) OpenTelemetry instrumented

### Health Checks
- [ ] `/health` endpoint (liveness)
- [ ] `/ready` endpoint (readiness)
- [ ] Kubernetes probes configured

---

## 🎯 Key Takeaways

1. **Metrics** = Quantitative → Dashboards & alerts
2. **Logs** = Qualitative → Debug specific failures
3. **Traces** = Flow → Find distributed bottlenecks

4. **Always add trace IDs** to correlate logs across services
5. **Monitor the 4 Golden Signals**: Latency, Traffic, Errors, Saturation
6. **Alert on symptoms, not causes** (high error rate, not CPU)
7. **Observability is non-negotiable** for production systems

**Without observability:**
> "It's slow... I don't know why" 🤷

**With observability:**
> "P95 latency is 2.5s on payment service due to database connection pool exhaustion" 🎯

---

## 📚 Further Reading

- [Google SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)
- [The Three Pillars of Observability](https://www.oreilly.com/library/view/distributed-systems-observability/9781492033431/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
