---
sidebar_position: 1
---

# Ba Trụ Cột của Khả Năng Quan Sát

**"Nếu bạn không thể đo lường nó, bạn không thể cải thiện nó"**

Khả năng quan sát là khả năng hiểu trạng thái bên trong của hệ thống bằng cách kiểm tra các đầu ra bên ngoài. Đối với các hệ thống phân tán, điều này yêu cầu ba cách tiếp cận bổ sung cho nhau:

## 🎯 Ba Trụ Cột

### 1️⃣ Metrics – "Cái gì"

**Dữ liệu chuỗi thời gian định lượng**

Metrics cho bạn biết **cái gì** đang xảy ra trong hệ thống của bạn thông qua các con số:

```
- Requests per second: 1,524 RPS
- P95 latency: 245ms
- Error rate: 0.03% (3 errors per 10,000 requests)
- Kafka consumer lag: 342 messages
```

**Các loại Metrics:**

| Loại | Hành vi | Ví dụ | Trường hợp sử dụng |
|------|----------|---------|----------|
| **Counter** | Chỉ tăng | `http_requests_total` | Theo dõi sự kiện |
| **Gauge** | Có thể tăng/giảm | `active_connections` | Theo dõi trạng thái hiện tại |
| **Histogram** | Phân phối | `http_request_duration` | Theo dõi phần trăm độ trễ |
| **Summary** | Phân phối (client-side) | `api_call_duration` | Theo dõi quantiles |

**Khi nào sử dụng metrics:**
- Thiết lập cảnh báo (error rate > 5%)
- Theo dõi xu hướng theo thời gian
- Tính toán SLOs (99% requests &lt; 500ms)
- Trực quan hóa dashboard

### 2️⃣ Logs – "Tại sao"

**Bản ghi sự kiện định tính với ngữ cảnh**

Logs cho bạn biết **tại sao** điều gì đó xảy ra bằng cách cung cấp ngữ cảnh chi tiết:

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

**Cấu trúc vs Không cấu trúc:**

 **Không cấu trúc (Tệ):**
```
2024-01-15 10:30:45 ERROR Payment failed for user user-123 order order-456 amount 99.99
```

 **Cấu trúc (Tốt):**
```json
{"level":"ERROR","userId":"user-123","orderId":"order-456","amount":99.99}
```

Tại sao cấu trúc tốt hơn:
- Có thể lọc theo bất kỳ trường nào theo chương trình
- Có thể tổng hợp lỗi theo loại
- Có thể truy vấn với công cụ JSON (jq, grep)
- Có thể đọc được bằng máy để phân tích

**Khi nào sử dụng logs:**
- Debug các lỗi request cụ thể
- Điều tra các vấn đề được báo cáo bởi người dùng
- Dấu vết kiểm toán (ai đã làm gì khi nào)
- Phân tích nguyên nhân gốc

### 3️⃣ Traces – "Ở đâu"

**Hành trình request qua các dịch vụ**

Traces cho bạn biết **ở đâu** thời gian được dành trong các request phân tán:

```
[API Gateway] --150ms--> [Order Service] --200ms--> [Payment Service]
                                   |
                                   +--100ms--> [Inventory Service]
```

**Ví dụ: Trace ID propagation**

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

**Khi nào sử dụng traces:**
- Tìm nút thắt trong luồng phân tán
- Hiểu phụ thuộc dịch vụ
- Đo độ trễ end-to-end
- Debug các vấn đề timeout

## 🔄 Cách Chúng Hoạt Động Cùng Nhau

**Kịch bản: "Đơn hàng chậm hôm nay"**

1. **Bắt đầu với Metrics** (Dashboard)
```
- Order endpoint P95 latency: 2,500ms (thường 200ms)
- Payment service error rate: 15% (thường &lt;1%)
```
**Sự hiểu biết:** Payment service chậm và thất bại

2. **Đào sâu với Logs** (Tìm kiếm)
```json
{"service":"payment-service","level":"ERROR","error":"ConnectionTimeout"}
```
**Sự hiểu biết:** Kết nối database timeout

3. **Trace request cụ thể** (Theo dõi trace ID)
```
Order: 50ms → Payment: 2,400ms (DB query) → Confirm: 50ms
```
**Sự hiểu biết:** Database query mất 2.4s (nên &lt;100ms)

4. **Nguyên nhân gốc:** Database connection pool kiệt sức
   **Khắc phục:** Tăng kích thước connection pool

---

## 🎯 Khái Niệm Chính

### Observability vs Monitoring

| Khía cạnh | Monitoring | Observability |
|--------|-----------|---------------|
| **Định nghĩa** | Theo dõi các metrics được định nghĩa trước | Hiểu những điều chưa biết |
| **Câu hỏi** | "CPU > 80%?" | "Tại sao request này chậm?" |
| **Cách tiếp cận** | Dashboards + cảnh báo | Khám phá + debugging |
| **Phạm vi** | Các chế độ thất bại đã biết | Bất kỳ chế độ thất bại nào |

**Ví dụ:**
- **Monitoring:** Cảnh báo khi error rate > 5%
- **Observability:** Debug tại sao request cụ thể thất bại sử dụng logs/traces

### SLI, SLO, SLA

| Thuật ngữ | Định nghĩa | Ví dụ |
|------|-----------|---------|
| **SLI** | Service Level Indicator (cái bạn đo lường) | Request latency, error rate |
| **SLO** | Service Level Objective (giá trị mục tiêu) | 99.9% requests &lt; 500ms |
| **SLA** | Service Level Agreement (hợp đồng) | 99.95% uptime hoặc hoàn tiền |
| **Error Budget** | Thời gian downtime được phép | 0.1% = 43 phút/tháng |

**Ví dụ:**
```
SLI:  Request success rate
SLO:  99.9% of requests succeed (3 nines)
SLA:  99.95% uptime guaranteed (contract)

Error Budget: 0.1% failure allowed
  = 43 minutes downtime per month
  = 525 minutes downtime per year
```

### The Four Golden Signals (Google SRE)

| Tín hiệu | Định nghĩa | Ví dụ Metric |
|--------|-----------|----------------|
| **Latency** | Request mất bao lâu | P95 latency: 245ms |
| **Traffic** | Bao nhiêu request | 1,524 requests/sec |
| **Errors** | Bao nhiêu thất bại | 0.03% error rate |
| **Saturation** | Tài nguyên đầy bao nhiêu | CPU: 65%, Memory: 78% |

**Tại sao 4 cái này?**
- **Latency + Errors** → Trải nghiệm người dùng
- **Traffic + Saturation** → Lập kế hoạch dung lượng

---

## 🛠️ Triển Khai Trong Hệ Thống Của Chúng Ta

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

##  Danh Sách Kiểm Tra Production

### Metrics
- [ ] Tất cả services expose `/metrics` endpoint
- [ ] Prometheus scraping được cấu hình
- [ ] Grafana dashboards được tạo
- [ ] Alert rules được định nghĩa
- [ ] On-call rotation được thiết lập

### Logging
- [ ] Tất cả logs là structured JSON
- [ ] Trace IDs được propagate qua các services
- [ ] Log aggregation được cấu hình (ELK, Loki)
- [ ] PII data được redact
- [ ] Log retention policy được định nghĩa

### Tracing
- [ ] Trace IDs được generate tại entry point
- [ ] Trace IDs được propagate qua headers
- [ ] Trace ID được include trong tất cả logs
- [ ] (Tùy chọn) OpenTelemetry được instrument

### Health Checks
- [ ] `/health` endpoint (liveness)
- [ ] `/ready` endpoint (readiness)
- [ ] Kubernetes probes được cấu hình

---

## 🎯 Những Điểm Chính

1. **Metrics** = Định lượng → Dashboards & cảnh báo
2. **Logs** = Định tính → Debug các thất bại cụ thể
3. **Traces** = Luồng → Tìm nút thắt phân tán

4. **Luôn thêm trace IDs** để correlate logs qua các services
5. **Monitor 4 Golden Signals**: Latency, Traffic, Errors, Saturation
6. **Cảnh báo trên triệu chứng, không phải nguyên nhân** (high error rate, không phải CPU)
7. **Observability là không thể thương lượng** cho các hệ thống production

**Không có observability:**
> "Nó chậm... Tôi không biết tại sao" 🤷

**Có observability:**
> "P95 latency là 2.5s trên payment service do database connection pool exhaustion" 🎯

---

## 📚 Đọc Thêm

- [Google SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)
- [The Three Pillars of Observability](https://www.oreilly.com/library/view/distributed-systems-observability/9781492033431/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
