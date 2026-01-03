---
sidebar_position: 2
---

# Prometheus Metrics

Prometheus là hệ thống giám sát mã nguồn mở thu thập **chỉ số chuỗi thời gian** từ các ứng dụng được đo lường.

## Why Prometheus?

### Vấn đề

Không có chỉ số:
```
Quản lý: "Chúng ta đã xử lý bao nhiêu đơn hàng hôm nay?"
Bạn: "Ừm... để tôi truy vấn cơ sở dữ liệu..."

Quản lý: "Lưu lượng truy cập đỉnh của chúng ta là gì?"
Bạn: "Tôi không biết..."

Quản lý: "Việc triển khai đó có phá vỡ gì không?"
Bạn: "Để tôi kiểm tra log..." *tìm kiếm hàng giờ*
```

### Giải pháp

Với Prometheus:
```promql
# Đơn hàng trong 24h qua
sum(increase(orders_created_total[24h]))

# RPS đỉnh hôm nay
max_over_time(rate(http_requests_total[5m])[24h:])

# Tỷ lệ lỗi sau triển khai (15 phút qua)
rate(http_requests_total{status_code=~"5.."}[15m])
/ rate(http_requests_total[15m]) * 100
```

---

## Các loại chỉ số

### 1. Counter (Chỉ tăng lên)

Theo dõi các giá trị tích lũy **chỉ tăng** (hoặc đặt lại về không).

```typescript
import { Counter } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

// Tăng counter
httpRequestsTotal.inc({ 
  method: 'POST', 
  route: '/orders', 
  status_code: 200,
  service: 'order-service'
});
```

**Các trường hợp sử dụng:**
- Yêu cầu HTTP
- Sự kiện được xử lý
- Lỗi gặp phải
- Sự kiện kinh doanh (đơn hàng, thanh toán)

**Truy vấn PromQL:**
```promql
# Tổng yêu cầu
http_requests_total

# Yêu cầu mỗi giây (rate)
rate(http_requests_total[5m])

# Tổng đơn hàng trong 24h qua
sum(increase(orders_created_total[24h]))
```

### 2. Gauge (Có thể tăng hoặc giảm)

Theo dõi các giá trị có thể **tăng hoặc giảm**.

```typescript
import { Gauge } from 'prom-client';

const activeConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Currently active HTTP connections',
  labelNames: ['service'],
});

// Đặt giá trị
activeConnections.set({ service: 'api-gateway' }, 42);

// Tăng/giảm
activeConnections.inc({ service: 'api-gateway' });
activeConnections.dec({ service: 'api-gateway' });
```

**Các trường hợp sử dụng:**
- Yêu cầu đang bay
- Độ sâu hàng đợi
- Sử dụng bộ nhớ
- Độ trễ consumer Kafka

**Truy vấn PromQL:**
```promql
# Giá trị hiện tại
http_active_connections

# Trung bình theo thời gian
avg_over_time(http_active_connections[5m])

# Tối đa trong giờ qua
max_over_time(kafka_consumer_lag[1h])
```

### 3. Histogram (Phân phối giá trị)

Theo dõi **phân phối** của các giá trị với các bucket có thể cấu hình.

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

**Điều nó theo dõi:**
```
_bucket{le="0.01"}    142  # 142 yêu cầu < 10ms
_bucket{le="0.05"}    378  # 378 yêu cầu < 50ms
_bucket{le="0.1"}     1203 # 1203 yêu cầu < 100ms
_bucket{le="+Inf"}    1524 # Tất cả yêu cầu
_sum                  45.23 # Tổng thời lượng
_count                1524  # Tổng số
```

**Các trường hợp sử dụng:**
- Độ trễ yêu cầu
- Thời lượng xử lý
- Thời gian truy vấn cơ sở dữ liệu

**Truy vấn PromQL:**
```promql
# Độ trễ P50 (trung vị)
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))

# Độ trễ P95
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Độ trễ P99
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# Độ trễ trung bình
rate(http_request_duration_seconds_sum[5m])
/ rate(http_request_duration_seconds_count[5m])
```

### 4. Summary (Quantiles phía client)

Tương tự Histogram nhưng tính toán quantiles **trên client**.

```typescript
import { Summary } from 'prom-client';

const dbQueryDuration = new Summary({
  name: 'db_query_duration_seconds',
  help: 'Database query duration',
  percentiles: [0.5, 0.9, 0.95, 0.99],
});

// Ghi nhận quan sát
dbQueryDuration.observe(0.042); // 42ms
```

**Histogram so với Summary:**

| Khía cạnh | Histogram | Summary |
|-----------|-----------|---------|
| **Tính toán quantile** | Server-side (Prometheus) | Client-side (app) |
| **Cấu hình bucket** | Bắt buộc | Không bắt buộc |
| **Tổng hợp trên các instance** |  Có |  Không |
| **Sử dụng bộ nhớ** | Thấp hơn | Cao hơn |
| **Khuyến nghị** |  Sử dụng histogram |  Chỉ sử dụng khi cần |

---

## 🛠️ Triển khai chỉ số của chúng ta

### Chỉ số HTTP

```typescript
// libs/observability/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

// Tổng yêu cầu
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});

// Thời lượng yêu cầu
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5],
});

// Yêu cầu đang bay
export const httpRequestsInFlight = new Gauge({
  name: 'http_requests_in_flight',
  help: 'Currently processing HTTP requests',
  labelNames: ['service'],
});
```

### Middleware để theo dõi chỉ số

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

    // Tăng đang bay
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

## 🎯 Các thực hành tốt nhất

### 1. Sử dụng nhãn một cách khôn ngoan

 **Tốt:**
```typescript
httpRequestsTotal.inc({ method: 'POST', route: '/orders', status_code: 200 });
```

 **Tệ (cardinality cao):**
```typescript
httpRequestsTotal.inc({ method: 'POST', route: '/orders', user_id: 'user-12345' });
```

**Tại sao?** Mỗi tổ hợp nhãn duy nhất tạo ra một chuỗi thời gian mới. Với hàng triệu người dùng, điều này làm nổ bộ nhớ.

### 2. Chọn bucket Histogram cẩn thận

```typescript
// Web API (milliseconds quan trọng)
buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2.5, 5]

// Xử lý batch (seconds quan trọng)
buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120]

// Công việc nền (minutes quan trọng)
buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600]
```

### 3. Sử dụng hàm helper

```typescript
// Helper: Bắt đầu timer
export function startTimer(histogram: Histogram) {
  const start = Date.now();
  return (labels?: Record<string, string>) => {
    histogram.observe(labels || {}, (Date.now() - start) / 1000);
  };
}

// Sử dụng
const endTimer = startTimer(httpRequestDuration);
// ... làm việc ...
endTimer({ method: 'POST', route: '/orders' });
```

### 4. Thêm nhãn mặc định

```typescript
import { register } from 'prom-client';

register.setDefaultLabels({
  service: process.env.SERVICE_NAME,
  environment: process.env.NODE_ENV,
  version: process.env.npm_package_version,
});
```

---

## 🎯 Điểm chính

1. **Counter** → Chỉ tăng lên (yêu cầu, sự kiện)
2. **Gauge** → Giá trị hiện tại (kết nối hoạt động, lag)
3. **Histogram** → Phân phối (phân vị độ trễ)
4. **Summary** → Tránh (sử dụng histogram thay thế)

5. **Cardinality thấp** → Nhãn với ít giá trị duy nhất
6. **Cardinality cao** → Nhãn với nhiều giá trị duy nhất (tránh!)

7. **Histogram mạnh mẽ** → Tính bất kỳ phân vị nào (P50, P95, P99)
8. **Rate() thiết yếu** → Chuyển counter thành giá trị mỗi giây

9. **Endpoint /metrics** → Phải truy cập được cho Prometheus
10. **Giám sát 4 tín hiệu vàng** → Độ trễ, Lưu lượng, Lỗi, Độ bão hòa

---

## 📚 Đọc thêm

- [Các loại chỉ số Prometheus](https://prometheus.io/docs/concepts/metric_types/)
- [Histogram so với Summary](https://prometheus.io/docs/practices/histograms/)
- [Cơ bản PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Các thực hành tốt nhất](https://prometheus.io/docs/practices/naming/)
