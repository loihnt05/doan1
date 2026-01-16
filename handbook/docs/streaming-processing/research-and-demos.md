# Research và Demos về Streaming Processing

## Tổng quan

Các demo về Streaming Processing bao gồm xử lý luồng dữ liệu thời gian thực, windowing, aggregation, stateful processing, và các pattern xử lý luồng khác nhau.

## Công nghệ sử dụng

- **Apache Kafka Streams**: Stream processing library
- **Apache Flink**: Distributed stream processing framework
- **Redis Streams**: Lightweight stream processing
- **Node.js Streams**: Native streaming API
- **RxJS**: Reactive programming library
- **KafkaJS**: Kafka client với stream support
- **Transform Streams**: Data transformation pipelines

## Các Demo

### Demo 1: Basic Stream Processing - Real-time Counting

**Công nghệ:** Kafka Consumer, in-memory state

**Cách triển khai:**
- Consumer lắng nghe events liên tục từ Kafka topic
- Mỗi event đến, tăng counter (stateful processing)
- Không phải chỉ nhận message rồi xử lý xong (messaging), mà duy trì state và tính toán liên tục
- Giống như người bán hàng đếm số khách trong đầu: khách 1, khách 2, khách 3...
- State được lưu trong memory, cập nhật real-time
- Giống như đếm số người qua cổng, cứ có người đi qua là cộng thêm 1

**Cách test:**
```bash
# Start analytics service (stream processor)
cd backend/apps/analytics-service
pnpm run start:dev

# Consumer logs: "Total orders: 0"

# Gửi events
curl -X POST http://localhost:3000/api/orders -d '{"amount": 100}'
# Logs: "Total orders: 1"

curl -X POST http://localhost:3000/api/orders -d '{"amount": 200}'
# Logs: "Total orders: 2"

curl -X POST http://localhost:3000/api/orders -d '{"amount": 150}'
# Logs: "Total orders: 3"

# Xem real-time analytics
curl http://localhost:3001/analytics
# Response: { totalOrders: 3, totalRevenue: 450 }
```

### Demo 2: Windowing - Time-based Aggregation

**Công nghệ:** Tumbling window, sliding window

**Cách triển khai:**
- Chia time thành các windows (cửa sổ thời gian): ví dụ mỗi window 1 phút
- Tumbling window: Không overlap, window 1 (0-60s), window 2 (60-120s)
- Sliding window: Có overlap, window cứ 10s lại tạo mới, mỗi window kéo dài 60s
- Tính metrics cho mỗi window (số orders/phút, revenue/phút)
- Sau khi window đóng, emit kết quả
- Dùng để phát hiện patterns: peak hours, traffic spikes
- Giống như đếm số xe qua ngã tư mỗi phút để biết giờ cao điểm

**Cách test:**
```bash
# Tạo stream processor với tumbling window (60 giây)
class TumblingWindowProcessor {
  private currentWindow = {
    start: Date.now(),
    count: 0,
    revenue: 0
  };

  handleEvent(event) {
    const now = Date.now();
    
    // Check if window expired
    if (now - this.currentWindow.start > 60000) {
      this.emitWindow(this.currentWindow);
      this.currentWindow = { start: now, count: 0, revenue: 0 };
    }
    
    // Add to current window
    this.currentWindow.count++;
    this.currentWindow.revenue += event.amount;
  }
}

# Gửi nhiều events trong 2 phút
for i in {1..30}; do
  curl -X POST http://localhost:3000/api/orders -d '{"amount": 100}'
  sleep 2
done

# Output sau 60s: "Window [0-60s]: 30 orders, $3000"
# Output sau 120s: "Window [60-120s]: 30 orders, $3000"
```

### Demo 3: Stateful Aggregation - Running Totals

**Công nghệ:** In-memory state, Redis for persistence

**Cách triển khai:**
- Duy trì state liên tục: tổng revenue, trung bình order value, min/max
- Mỗi event mới, cập nhật tất cả metrics
- State không reset sau mỗi event (khác với stateless)
- Cần lưu state để recover khi restart (dùng Redis hoặc Kafka state stores)
- Tính toán incremental: không cần query lại toàn bộ data
- Giống như số dư tài khoản: cứ có giao dịch là cập nhật ngay

**Cách test:**
```bash
# Analytics service duy trì running state
class StatefulAggregator {
  private state = {
    totalRevenue: 0,
    orderCount: 0,
    minOrder: Infinity,
    maxOrder: 0
  };

  handlePayment(event) {
    this.state.totalRevenue += event.amount;
    this.state.orderCount++;
    this.state.minOrder = Math.min(this.state.minOrder, event.amount);
    this.state.maxOrder = Math.max(this.state.maxOrder, event.amount);
    
    // Log running state
    console.log('Running Total:', this.state.totalRevenue);
    console.log('Avg Order:', this.state.totalRevenue / this.state.orderCount);
  }
}

# Gửi orders với amounts khác nhau
curl -X POST http://localhost:3000/api/orders -d '{"amount": 100}'
# Running Total: 100, Avg: 100

curl -X POST http://localhost:3000/api/orders -d '{"amount": 500}'
# Running Total: 600, Avg: 300

curl -X POST http://localhost:3000/api/orders -d '{"amount": 200}'
# Running Total: 800, Avg: 267
```

### Demo 4: Stream Joining - Combine Multiple Streams

**Công nghệ:** Kafka Streams, join operations

**Cách triển khai:**
- Có 2 streams riêng biệt: orders stream và payments stream
- Join 2 streams dựa trên key chung (orderId)
- Tạo enriched stream chứa thông tin từ cả 2
- Có thể inner join (cả 2 phải có), left join (order có, payment có thể không)
- Time window cho join: join events trong cùng khoảng thời gian (ví dụ 5 phút)
- Giống như ghép 2 mảnh giấy: đơn hàng + hóa đơn để có thông tin đầy đủ

**Cách test:**
```bash
# Stream join processor
class StreamJoiner {
  private orders = new Map();
  private payments = new Map();

  handleOrder(order) {
    this.orders.set(order.id, order);
    this.tryJoin(order.id);
  }

  handlePayment(payment) {
    this.payments.set(payment.orderId, payment);
    this.tryJoin(payment.orderId);
  }

  tryJoin(orderId) {
    const order = this.orders.get(orderId);
    const payment = this.payments.get(orderId);
    
    if (order && payment) {
      const enriched = { ...order, ...payment };
      this.emit('order-payment-complete', enriched);
      
      // Cleanup
      this.orders.delete(orderId);
      this.payments.delete(orderId);
    }
  }
}

# Gửi order
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-1", "amount": 100}'
# Chưa có output (chờ payment)

# Gửi payment
curl -X POST http://localhost:3000/api/payments \
  -d '{"orderId": "order-1", "paymentId": "pay-1"}'
# Output: "Enriched: {id: order-1, amount: 100, paymentId: pay-1}"
```

### Demo 5: Event Time vs Processing Time

**Công nghệ:** Kafka timestamp, watermarks

**Cách triển khai:**
- Event time: Thời gian event thực sự xảy ra (trong event payload)
- Processing time: Thời gian hệ thống xử lý event (có thể chậm do network, lag)
- Events có thể đến không đúng thứ tự (out-of-order)
- Dùng watermarks để biết events cũ đã đến hết chưa
- Xử lý theo event time chính xác hơn (dùng cho billing, analytics)
- Giống như sắp xếp thư theo ngày gửi (event time), không phải ngày nhận (processing time)

**Cách test:**
```bash
# Processor với event time
class EventTimeProcessor {
  handleEvent(event) {
    const eventTime = new Date(event.timestamp);
    const processingTime = new Date();
    const lag = processingTime - eventTime;
    
    console.log(`Event time: ${eventTime}`);
    console.log(`Processing time: ${processingTime}`);
    console.log(`Lag: ${lag}ms`);
    
    // Use event time for windowing
    this.addToWindow(event, eventTime);
  }
}

# Gửi events với timestamps khác nhau
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-1", "timestamp": "2026-01-16T10:00:00Z", "amount": 100}'
# Event time: 10:00:00, Processing time: 10:00:05, Lag: 5000ms

# Gửi event cũ (out of order)
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-2", "timestamp": "2026-01-16T09:59:00Z", "amount": 200}'
# Event time: 09:59:00 (cũ hơn order-1), Processing time: 10:00:10
# Processor vẫn xử lý đúng theo event time
```

### Demo 6: Backpressure Handling

**Công nghệ:** Node.js Streams, buffering

**Cách triển khai:**
- Producer tạo events nhanh hơn consumer xử lý (consumer bị quá tải)
- Backpressure: Consumer báo hiệu "chậm lại, tôi chưa kịp xử lý"
- Buffer để lưu events tạm thời khi consumer chậm
- Nếu buffer đầy, có thể drop events (at-most-once) hoặc chặn producer
- Node.js Streams tự động handle backpressure với pause/resume
- Giống như đường ống nước: nếu dòng chảy mạnh quá, cần giảm áp lực

**Cách test:**
```bash
# Consumer chậm với backpressure
const { Transform } = require('stream');

const slowProcessor = new Transform({
  objectMode: true,
  highWaterMark: 5,  // Buffer tối đa 5 items
  
  async transform(event, encoding, callback) {
    // Giả lập xử lý chậm
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('Processed:', event);
    callback(null, event);
  }
});

// Producer gửi nhanh
for (let i = 0; i < 100; i++) {
  const canContinue = slowProcessor.write({ id: i });
  
  if (!canContinue) {
    console.log('Backpressure! Pausing producer...');
    await new Promise(resolve => slowProcessor.once('drain', resolve));
  }
}

# Output:
# Processed: {id: 0}
# Processed: {id: 1}
# ...
# Backpressure! Pausing producer... (khi buffer đầy)
# Processed: {id: 5}
# Backpressure! Pausing producer...
```

### Demo 7: Real-time Filtering và Transformation

**Công nghệ:** RxJS operators, Kafka Streams

**Cách triển khai:**
- Nhận stream events, lọc ra những events quan tâm (filter)
- Transform data: thay đổi format, enrich với thông tin thêm, tính toán
- Chain nhiều operations: filter → map → reduce → output
- Declarative style với RxJS operators
- Ví dụ: Chỉ quan tâm high-value orders (> $1000), chuyển đổi currency, tính tax
- Giống như dây chuyền sản xuất: lọc, chế biến, đóng gói

**Cách test:**
```bash
# RxJS stream pipeline
import { from } from 'rxjs';
import { filter, map, reduce } from 'rxjs/operators';

const orderStream$ = from(kafkaConsumer);

orderStream$
  .pipe(
    // Filter: chỉ lấy high-value orders
    filter(order => order.amount > 1000),
    
    // Transform: convert USD to VND
    map(order => ({
      ...order,
      amountVND: order.amount * 24000
    })),
    
    // Aggregate: tính tổng high-value orders
    reduce((total, order) => total + order.amountVND, 0)
  )
  .subscribe(total => {
    console.log('Total high-value orders (VND):', total);
  });

# Gửi mixed orders
curl -X POST http://localhost:3000/api/orders -d '{"amount": 500}'   # Filtered out
curl -X POST http://localhost:3000/api/orders -d '{"amount": 1500}'  # Accepted
curl -X POST http://localhost:3000/api/orders -d '{"amount": 800}'   # Filtered out
curl -X POST http://localhost:3000/api/orders -d '{"amount": 2000}'  # Accepted

# Output: "Total high-value orders (VND): 84,000,000"
# (1500 + 2000) * 24000
```

### Demo 8: Stream Deduplication

**Công nghệ:** Redis Set, Kafka exactly-once

**Cách triển khai:**
- Trong hệ thống phân tán, events có thể bị duplicate (network retry, producer retry)
- Cần phát hiện và loại bỏ duplicates để không xử lý 2 lần
- Dùng unique event ID, lưu trong Set (Redis hoặc in-memory)
- Check mỗi event: đã thấy ID này chưa? Nếu rồi thì skip
- Set có TTL để không tốn memory mãi (giữ 1 giờ hoặc 1 ngày)
- Giống như đóng dấu "Đã xử lý" trên giấy tờ để không làm lại

**Cách test:**
```bash
# Deduplication processor
class DeduplicationProcessor {
  private seenIds = new Set();

  async handleEvent(event) {
    // Check if already seen
    if (this.seenIds.has(event.id)) {
      console.log('Duplicate detected:', event.id);
      return; // Skip
    }
    
    // Mark as seen
    this.seenIds.add(event.id);
    
    // Process
    await this.process(event);
  }
}

# Gửi event
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-123", "amount": 100}'
# Output: "Processing order-123"

# Gửi duplicate
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-123", "amount": 100}'
# Output: "Duplicate detected: order-123" (not processed)

# Gửi new event
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-456", "amount": 200}'
# Output: "Processing order-456"
```

### Demo 9: Complex Event Processing (CEP)

**Công nghệ:** Pattern matching, temporal queries

**Cách triển khai:**
- Phát hiện patterns phức tạp trong stream events
- Ví dụ: Phát hiện fraud - 3 lần payment failed trong 5 phút từ cùng 1 user
- Duy trì state của events gần đây trong window
- Khi pattern match, trigger action (alert, block user)
- Temporal queries: "A followed by B within 10 seconds"
- Giống như trinh sát phát hiện hành vi đáng ngờ từ chuỗi hành động

**Cách test:**
```bash
# Fraud detection với CEP
class FraudDetector {
  private failedAttempts = new Map(); // userId -> [timestamps]

  async handlePaymentFailed(event) {
    const userId = event.userId;
    const now = Date.now();
    
    // Get recent failures
    const attempts = this.failedAttempts.get(userId) || [];
    
    // Remove old attempts (> 5 minutes)
    const recentAttempts = attempts.filter(t => now - t < 300000);
    
    // Add current attempt
    recentAttempts.push(now);
    this.failedAttempts.set(userId, recentAttempts);
    
    // Check pattern: 3 failures in 5 minutes
    if (recentAttempts.length >= 3) {
      await this.triggerFraudAlert(userId);
      console.log('🚨 FRAUD ALERT: User', userId, 'has 3 failed payments in 5 min');
    }
  }
}

# Simulate fraud pattern
curl -X POST http://localhost:3000/api/payments \
  -d '{"userId": "user-1", "status": "failed"}'
# Attempt 1

sleep 30
curl -X POST http://localhost:3000/api/payments \
  -d '{"userId": "user-1", "status": "failed"}'
# Attempt 2

sleep 30
curl -X POST http://localhost:3000/api/payments \
  -d '{"userId": "user-1", "status": "failed"}'
# Attempt 3 → 🚨 FRAUD ALERT
```

### Demo 10: Lambda Architecture - Batch + Stream

**Công nghệ:** Batch processing (Spark) + Stream processing (Kafka)

**Cách triển khai:**
- Batch layer: Xử lý toàn bộ historical data mỗi ngày (chính xác nhưng chậm)
- Speed layer: Xử lý real-time data (nhanh nhưng có thể thiếu)
- Serving layer: Merge kết quả từ cả 2 layers
- Query = Batch results (đến hôm qua) + Stream results (từ hôm qua đến giờ)
- Đảm bảo vừa có accuracy (batch) vừa có low latency (stream)
- Giống như báo cáo tài chính: có báo cáo tháng (batch) và số dư hiện tại (stream)

**Cách test:**
```bash
# Batch layer (chạy daily)
@Cron('0 0 * * *')  // Midnight
async batchProcess() {
  const yesterday = new Date(Date.now() - 86400000);
  
  const orders = await this.db.query(`
    SELECT SUM(amount) as total
    FROM orders
    WHERE date < ?
  `, [yesterday]);
  
  await this.cache.set('batch_total', orders.total);
  console.log('Batch processed:', orders.total);
}

# Speed layer (real-time)
@EventPattern('order-created')
async streamProcess(order) {
  const realtimeTotal = await this.cache.get('realtime_total') || 0;
  await this.cache.set('realtime_total', realtimeTotal + order.amount);
}

# Serving layer (merge)
@Get('total-revenue')
async getTotalRevenue() {
  const batchTotal = await this.cache.get('batch_total') || 0;
  const realtimeTotal = await this.cache.get('realtime_total') || 0;
  
  return {
    total: batchTotal + realtimeTotal,
    batch: batchTotal,
    realtime: realtimeTotal
  };
}

# Test
curl http://localhost:3000/api/total-revenue
# Response:
# {
#   "total": 125000,
#   "batch": 100000,    // From yesterday
#   "realtime": 25000   // Today so far
# }
```

## Cách chạy các demo

### 1. Start Kafka

```bash
cd backend
docker-compose up -d kafka zookeeper
```

### 2. Start Analytics Service (Stream Processor)

```bash
cd backend/apps/analytics-service
pnpm run start:dev

# Service sẽ bắt đầu consume events và xử lý streaming
```

### 3. Gửi events để xem stream processing

```bash
# Gửi orders
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"user-$i\", \"amount\": $((RANDOM % 1000 + 100))}"
  sleep 1
done

# Xem analytics service logs để thấy real-time processing
docker logs -f analytics-service
```

### 4. Query streaming analytics

```bash
# Get current analytics
curl http://localhost:3001/analytics

# Response:
# {
#   "totalOrders": 10,
#   "totalRevenue": 5487,
#   "avgOrderValue": 548.7,
#   "successRate": 90.0,
#   "ordersPerMinute": [10]
# }
```

### 5. Test windowing

```bash
# Script gửi events đều đặn mỗi 5 giây trong 3 phút
for i in {1..36}; do
  curl -X POST http://localhost:3000/api/orders \
    -d '{"amount": 100}'
  sleep 5
done

# Xem window aggregations mỗi phút
# Minute 1: 12 orders
# Minute 2: 12 orders
# Minute 3: 12 orders
```

### 6. Test stream joins

```bash
# Terminal 1: Monitor joined stream
node stream-join-monitor.js

# Terminal 2: Send order
curl -X POST http://localhost:3000/api/orders \
  -d '{"id": "order-1", "amount": 100}'

# Terminal 3: Send payment
curl -X POST http://localhost:3000/api/payments \
  -d '{"orderId": "order-1", "paymentId": "pay-1"}'

# Terminal 1 shows: "Joined: {orderId: order-1, amount: 100, paymentId: pay-1}"
```

### 7. Load testing stream processing

```bash
# Gửi high volume events
npm install -g artillery

artillery quick \
  --count 1000 \
  --num 100 \
  -p http://localhost:3000/api/orders

# Monitor analytics service
docker stats analytics-service
watch -n 1 'curl -s http://localhost:3001/analytics'
```

### 8. Test backpressure

```bash
# Script với slow consumer
node slow-consumer.js &

# Fast producer
for i in {1..1000}; do
  curl -X POST http://localhost:3000/api/orders -d "{\"id\": $i}"
done

# Xem logs: "Backpressure detected, pausing..."
```

### 9. Monitor Kafka consumer lag

```bash
# Check stream processing lag
docker exec kafka kafka-consumer-groups.sh \
  --describe \
  --group analytics-service-group \
  --bootstrap-server localhost:9092

# Output:
# TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# order-created   0          1000            1050            50
# payment-completed 0        950             1000            50

# Lag > 0 nghĩa là stream processor đang chậm hơn producer
```

### 10. Visualize stream metrics (optional)

```bash
# Start Grafana + Prometheus
docker-compose up -d grafana prometheus

# Import dashboard
open http://localhost:3000/grafana

# Dashboards show:
# - Events per second
# - Processing latency
# - Throughput
# - Consumer lag
# - Error rates
```

## Tài liệu tham khảo

- [Kafka Streams Documentation](https://kafka.apache.org/documentation/streams/)
- [Apache Flink](https://flink.apache.org/)
- [Stream Processing 101](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/)
- [RxJS Operators](https://rxjs.dev/guide/operators)
- [Node.js Streams](https://nodejs.org/api/stream.html)
- [Lambda Architecture](http://lambda-architecture.net/)
- [Designing Data-Intensive Applications](https://dataintensive.net/)
