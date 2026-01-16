# Research và Demos về Message Dispatcher

## Tổng quan

Các demo về Message Dispatcher (Message Broker) bao gồm event-driven architecture, producer-consumer patterns, consumer groups, delivery semantics, và các loại message brokers khác nhau.

## Công nghệ sử dụng

- **Apache Kafka**: Distributed streaming platform
- **RabbitMQ**: Traditional message queue
- **Redis Streams**: Lightweight message broker
- **AWS SQS/SNS**: Cloud-based message services
- **NestJS @nestjs/microservices**: Framework integration
- **KafkaJS**: Node.js Kafka client
- **amqplib**: RabbitMQ client cho Node.js

## Các Demo

### Demo 1: Basic Producer-Consumer Pattern

**Công nghệ:** Kafka, NestJS EventPattern

**Cách triển khai:**
- Producer là service gửi messages (events) vào Kafka topic
- Consumer là service lắng nghe và xử lý messages từ topic đó
- Messages được lưu trong Kafka, không mất nếu consumer tạm thời offline
- Producer không cần biết ai sẽ xử lý message (decoupled)
- Consumer xử lý bất đồng bộ, không block producer
- Giống như gửi thư qua bưu điện: người gửi bỏ thư vào hòm, bưu điện lưu giữ, người nhận lấy khi rảnh

**Cách test:**
```bash
# Start Kafka
docker-compose up -d kafka

# Start consumer service (lắng nghe events)
cd backend/apps/order-service
pnpm run start:dev

# Producer gửi event
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "items": [{"productId": "prod1", "quantity": 2}],
    "amount": 100
  }'

# Xem consumer logs - message được xử lý
docker logs order-service
# Output: "Received order-created event: {...}"
```

### Demo 2: Multiple Consumers - Broadcast Pattern

**Công nghệ:** Kafka consumer groups, multiple services

**Cách triển khai:**
- Một event được gửi vào topic (ví dụ: order-created)
- Nhiều services khác nhau đều lắng nghe cùng event này
- Mỗi service có consumer group ID khác nhau
- Tất cả các services đều nhận được message (broadcast)
- Mỗi service xử lý theo logic riêng: payment xử lý thanh toán, notification gửi email, analytics ghi log
- Giống như phát thanh: 1 người nói, nhiều người nghe cùng lúc

**Cách test:**
```bash
# Start multiple services với groupId khác nhau
# Service 1: Payment
docker-compose up -d payment-service
# groupId: payment-service-group

# Service 2: Notification
docker-compose up -d notification-service
# groupId: notification-service-group

# Service 3: Analytics
docker-compose up -d analytics-service
# groupId: analytics-service-group

# Producer gửi 1 event
curl -X POST http://localhost:3000/api/orders -d '{...}'

# Tất cả 3 services đều nhận và xử lý
docker logs payment-service      # "Processing payment..."
docker logs notification-service # "Sending email..."
docker logs analytics-service    # "Recording analytics..."
```

### Demo 3: Consumer Group - Parallel Processing

**Công nghệ:** Kafka consumer group, partitions

**Cách triển khai:**
- Topic có nhiều partitions (ví dụ: 3 partitions)
- Nhiều consumers cùng groupId (ví dụ: 3 consumers trong payment-service-group)
- Mỗi consumer xử lý 1 partition riêng (partition assignment)
- Messages được phân phối đều: partition 0 → consumer 1, partition 1 → consumer 2, partition 2 → consumer 3
- Xử lý song song tăng throughput nhưng mỗi message chỉ được xử lý 1 lần
- Khi có consumer mới join/leave, partitions được phân lại (rebalance)
- Giống như 3 nhân viên xử lý 3 quầy riêng, mỗi người lo 1 hàng

**Cách test:**
```bash
# Tạo topic với 3 partitions
docker exec kafka kafka-topics.sh --create \
  --topic order-created \
  --partitions 3 \
  --replication-factor 1 \
  --bootstrap-server localhost:9092

# Scale consumer lên 3 instances (cùng groupId)
docker-compose up -d --scale payment-service=3

# Gửi 9 messages
for i in {1..9}; do
  curl -X POST http://localhost:3000/api/orders -d "{\"orderId\": $i}"
done

# Mỗi consumer xử lý 3 messages
docker logs payment-service-1 | grep "Processing" | wc -l  # 3
docker logs payment-service-2 | grep "Processing" | wc -l  # 3
docker logs payment-service-3 | grep "Processing" | wc -l  # 3
```

### Demo 4: At-Least-Once Delivery

**Công nghệ:** Kafka manual commit, idempotency

**Cách triển khai:**
- Consumer xử lý message trước, commit offset sau
- Nếu xử lý thành công nhưng crash trước khi commit, message sẽ được xử lý lại
- Đảm bảo message không bao giờ bị mất (tin cậy)
- Nhược điểm: message có thể được xử lý nhiều lần (duplicate)
- Cần làm xử lý idempotent (xử lý nhiều lần cũng chỉ có hiệu ứng 1 lần)
- Ví dụ: Lưu với unique key, check trước khi insert
- Giống như gửi thư bảo đảm: chắc chắn đến nơi, có thể nhận 2 lần

**Cách test:**
```bash
# Cấu hình consumer manual commit
# consumer.ts
@EventPattern('order-created')
async handleOrder(event, context: KafkaContext) {
  // Xử lý trước
  await this.orderService.process(event);
  
  // Commit sau
  await context.commit();
}

# Gửi message
curl -X POST http://localhost:3000/api/orders -d '{...}'

# Giả lập crash sau khi xử lý, trước khi commit
# Kill consumer process
docker kill -s SIGKILL payment-service

# Restart consumer
docker start payment-service

# Message được xử lý lại (duplicate)
docker logs payment-service
# "Processing order 123"
# "Processing order 123" (lặp lại)
```

### Demo 5: Exactly-Once Semantics

**Công nghệ:** Kafka Transactions, Idempotent Producer

**Cách triển khai:**
- Kafka transaction API đảm bảo message được xử lý đúng 1 lần
- Producer gửi với idempotent mode (Kafka tự động deduplicate)
- Consumer xử lý và commit trong 1 transaction
- Nếu transaction fail, toàn bộ rollback, message chưa được coi là consumed
- Chỉ dùng khi thực sự cần (có performance overhead)
- Phù hợp với financial transactions, billing, critical business logic
- Giống như giao dịch ngân hàng: hoặc thành công hoàn toàn, hoặc không có gì xảy ra

**Cách test:**
```bash
# Cấu hình producer idempotent
const producer = kafka.producer({
  idempotent: true,
  transactionalId: 'payment-service-tx',
});

# Cấu hình consumer isolation level
const consumer = kafka.consumer({
  groupId: 'payment-group',
  isolationLevel: 'read_committed',
});

# Transaction processing
await producer.transaction({
  async send({ topic, messages }) {
    await topic.send({ messages });
  },
  async commit() {
    await consumer.commitOffsets([...]);
  }
});

# Test: Gửi duplicate messages
curl -X POST http://localhost:3000/api/payment -d '{"id": "pay-123"}'
curl -X POST http://localhost:3000/api/payment -d '{"id": "pay-123"}'

# Check database: chỉ có 1 record (không duplicate)
SELECT * FROM payments WHERE id = 'pay-123';
# 1 row only
```

### Demo 6: Dead Letter Queue (DLQ)

**Công nghệ:** Kafka topic, RabbitMQ DLX

**Cách triển khai:**
- Consumer xử lý message, nếu lỗi thì retry một số lần (ví dụ: 3 lần)
- Sau khi retry hết, message vẫn lỗi thì chuyển vào Dead Letter Queue (DLQ)
- DLQ là topic/queue riêng để lưu các messages xử lý thất bại
- Có thể xem log, debug, fix lỗi, sau đó replay messages từ DLQ
- Tránh block main queue vì messages lỗi
- Giống như thư gửi không đến được đưa vào kho thư lỗi

**Cách test:**
```bash
# Consumer với retry và DLQ logic
@EventPattern('order-created')
async handleOrder(event, context: KafkaContext) {
  const retries = event.retries || 0;
  
  try {
    await this.orderService.process(event);
    await context.commit();
  } catch (error) {
    if (retries < 3) {
      // Retry
      await this.kafka.emit('order-created', {
        ...event,
        retries: retries + 1
      });
    } else {
      // Move to DLQ
      await this.kafka.emit('order-created.dlq', {
        ...event,
        error: error.message,
        timestamp: Date.now()
      });
    }
    await context.commit();
  }
}

# Gửi message sẽ lỗi (ví dụ: invalid data)
curl -X POST http://localhost:3000/api/orders \
  -d '{"amount": -100}'  # Invalid amount

# Check DLQ topic
docker exec kafka kafka-console-consumer.sh \
  --topic order-created.dlq \
  --bootstrap-server localhost:9092 \
  --from-beginning
```

### Demo 7: Message Priority Queue

**Công nghệ:** RabbitMQ priority queue

**Cách triển khai:**
- Một số messages quan trọng hơn và cần xử lý trước (ví dụ: VIP orders)
- Gán priority cho mỗi message khi gửi (số càng cao càng ưu tiên)
- Queue xử lý theo thứ tự priority thay vì FIFO thông thường
- Message priority cao được consume trước dù gửi sau
- RabbitMQ hỗ trợ tốt, Kafka không có built-in (phải dùng multiple topics)
- Giống như hàng ưu tiên cho người già, trẻ em được phục vụ trước

**Cách test:**
```bash
# Cấu hình RabbitMQ priority queue
await channel.assertQueue('orders', {
  maxPriority: 10,  // Priority từ 0-10
});

# Gửi messages với priority khác nhau
await channel.sendToQueue('orders', 
  Buffer.from(JSON.stringify({ orderId: 'order-1' })),
  { priority: 5 }
);

await channel.sendToQueue('orders', 
  Buffer.from(JSON.stringify({ orderId: 'order-2' })),
  { priority: 10 }  // VIP order - priority cao
);

await channel.sendToQueue('orders', 
  Buffer.from(JSON.stringify({ orderId: 'order-3' })),
  { priority: 1 }
);

# Consumer consume theo thứ tự priority
# Xử lý: order-2 (priority 10) → order-1 (priority 5) → order-3 (priority 1)
```

### Demo 8: Pub/Sub Pattern với RabbitMQ Fanout Exchange

**Công nghệ:** RabbitMQ Fanout Exchange

**Cách triển khai:**
- Producer gửi message vào Exchange (không phải trực tiếp vào queue)
- Fanout Exchange broadcast message đến TẤT CẢ queues được bind với nó
- Mỗi service có queue riêng, tất cả đều nhận message
- Thêm service mới chỉ cần tạo queue và bind vào exchange
- Producer không cần biết có bao nhiêu consumers
- Giống như phát thanh trên loa: nói 1 lần, tất cả nghe được

**Cách test:**
```bash
# Tạo exchange và queues
# exchange: order-events (fanout)
# queues: payment-queue, notification-queue, analytics-queue

await channel.assertExchange('order-events', 'fanout', { durable: true });

await channel.assertQueue('payment-queue');
await channel.assertQueue('notification-queue');
await channel.assertQueue('analytics-queue');

await channel.bindQueue('payment-queue', 'order-events', '');
await channel.bindQueue('notification-queue', 'order-events', '');
await channel.bindQueue('analytics-queue', 'order-events', '');

# Producer gửi vào exchange
await channel.publish('order-events', '', 
  Buffer.from(JSON.stringify({ orderId: '123' }))
);

# Tất cả 3 queues đều nhận message
docker logs payment-service      # Nhận message
docker logs notification-service # Nhận message
docker logs analytics-service    # Nhận message
```

### Demo 9: Topic Routing với RabbitMQ Topic Exchange

**Công nghệ:** RabbitMQ Topic Exchange, routing keys

**Cách triển khai:**
- Producer gửi message với routing key (ví dụ: order.created, order.cancelled, payment.succeeded)
- Topic Exchange dùng pattern matching để route message
- Consumers bind queue với pattern: `order.*` (tất cả order events), `*.created` (tất cả created events)
- Consumers chỉ nhận messages matching với pattern
- Linh hoạt hơn fanout (selective consumption)
- Giống như bộ lọc thư: chỉ nhận thư có chủ đề quan tâm

**Cách test:**
```bash
# Tạo topic exchange
await channel.assertExchange('events', 'topic', { durable: true });

# Consumers bind với patterns khác nhau
// Order service - quan tâm tất cả order events
await channel.bindQueue('order-queue', 'events', 'order.*');

// Payment service - quan tâm order.created và payment.*
await channel.bindQueue('payment-queue', 'events', 'order.created');
await channel.bindQueue('payment-queue', 'events', 'payment.*');

// Analytics - quan tâm tất cả
await channel.bindQueue('analytics-queue', 'events', '#');

# Producer gửi với routing keys
await channel.publish('events', 'order.created', 
  Buffer.from(JSON.stringify({ orderId: '123' }))
);
// → order-queue, payment-queue, analytics-queue nhận

await channel.publish('events', 'order.cancelled', 
  Buffer.from(JSON.stringify({ orderId: '456' }))
);
// → order-queue, analytics-queue nhận (payment-queue KHÔNG nhận)

await channel.publish('events', 'payment.succeeded', 
  Buffer.from(JSON.stringify({ paymentId: '789' }))
);
// → payment-queue, analytics-queue nhận
```

### Demo 10: Event Sourcing Pattern

**Công nghệ:** Kafka log compaction, event store

**Cách triển khai:**
- Thay vì lưu state hiện tại, lưu tất cả events đã xảy ra
- Ví dụ: Thay vì lưu "balance = 1000", lưu "deposited 500", "withdrew 200", "deposited 700"
- State hiện tại = replay tất cả events từ đầu
- Kafka lưu events vĩnh viễn (log retention = forever)
- Có thể rebuild state bất kỳ lúc nào, audit trail hoàn chỉnh
- Có thể time-travel: xem state tại thời điểm bất kỳ trong quá khứ
- Giống như sổ nhật ký: ghi tất cả hành động, muốn biết hiện tại thì đọc lại từ đầu

**Cách test:**
```bash
# Events cho bank account
curl -X POST http://localhost:3000/api/events \
  -d '{"type": "AccountCreated", "accountId": "acc-1", "balance": 0}'

curl -X POST http://localhost:3000/api/events \
  -d '{"type": "MoneyDeposited", "accountId": "acc-1", "amount": 500}'

curl -X POST http://localhost:3000/api/events \
  -d '{"type": "MoneyWithdrawn", "accountId": "acc-1", "amount": 200}'

curl -X POST http://localhost:3000/api/events \
  -d '{"type": "MoneyDeposited", "accountId": "acc-1", "amount": 700}'

# Rebuild state từ events
@EventPattern('bank-events')
async rebuildState(event) {
  switch(event.type) {
    case 'AccountCreated':
      this.state[event.accountId] = { balance: 0 };
      break;
    case 'MoneyDeposited':
      this.state[event.accountId].balance += event.amount;
      break;
    case 'MoneyWithdrawn':
      this.state[event.accountId].balance -= event.amount;
      break;
  }
}

# Query current state
curl http://localhost:3000/api/accounts/acc-1/balance
# Response: { balance: 1000 }

# Replay từ offset cụ thể để xem state trong quá khứ
curl http://localhost:3000/api/accounts/acc-1/balance?offset=2
# Response: { balance: 300 } (sau 2 events đầu)
```

## Cách chạy các demo

### 1. Start Kafka cluster

```bash
cd backend
docker-compose up -d kafka zookeeper
```

### 2. Start RabbitMQ (nếu test RabbitMQ demos)

```bash
docker run -d -p 5672:5672 -p 15672:15672 \
  --name rabbitmq \
  rabbitmq:3-management

# Truy cập UI: http://localhost:15672
# Username: guest, Password: guest
```

### 3. Start microservices

```bash
# Start tất cả services
docker-compose up -d

# Hoặc start từng service riêng
pnpm run start:dev order-service
pnpm run start:dev payment-service
pnpm run start:dev notification-service
pnpm run start:dev analytics-service
```

### 4. Kiểm tra Kafka topics

```bash
# List topics
docker exec kafka kafka-topics.sh \
  --list \
  --bootstrap-server localhost:9092

# Describe topic (xem partitions, replicas)
docker exec kafka kafka-topics.sh \
  --describe \
  --topic order-created \
  --bootstrap-server localhost:9092

# Create topic với custom config
docker exec kafka kafka-topics.sh \
  --create \
  --topic order-events \
  --partitions 3 \
  --replication-factor 1 \
  --bootstrap-server localhost:9092
```

### 5. Consume messages từ command line

```bash
# Consume từ beginning
docker exec kafka kafka-console-consumer.sh \
  --topic order-created \
  --from-beginning \
  --bootstrap-server localhost:9092

# Consume với consumer group
docker exec kafka kafka-console-consumer.sh \
  --topic order-created \
  --group test-consumer-group \
  --bootstrap-server localhost:9092
```

### 6. Produce messages từ command line

```bash
# Produce messages interactively
docker exec -it kafka kafka-console-producer.sh \
  --topic order-created \
  --bootstrap-server localhost:9092

# Nhập messages (mỗi line là 1 message)
{"orderId": "123", "amount": 100}
{"orderId": "456", "amount": 200}
```

### 7. Monitor consumer groups

```bash
# List consumer groups
docker exec kafka kafka-consumer-groups.sh \
  --list \
  --bootstrap-server localhost:9092

# Describe consumer group (xem offset, lag)
docker exec kafka kafka-consumer-groups.sh \
  --describe \
  --group payment-service-group \
  --bootstrap-server localhost:9092

# Output:
# GROUP                TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
# payment-service-group order-created  0          100             120             20
# payment-service-group order-created  1          95              110             15
# payment-service-group order-created  2          105             105             0
```

### 8. Test RabbitMQ exchanges

```bash
# Truy cập RabbitMQ Management UI
open http://localhost:15672

# Xem:
# - Exchanges và bindings
# - Queues và messages
# - Consumer connections
# - Message rates (publish/consume)

# Test publish message từ UI
# Exchanges → [exchange-name] → Publish message
```

### 9. Load testing với nhiều messages

```bash
# Script gửi 1000 messages
for i in {1..1000}; do
  curl -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -d "{\"orderId\": \"order-$i\", \"amount\": 100}"
done

# Monitor consumer processing
docker logs -f payment-service | grep "Processing"

# Check lag
docker exec kafka kafka-consumer-groups.sh \
  --describe \
  --group payment-service-group \
  --bootstrap-server localhost:9092
```

### 10. Test failure scenarios

```bash
# Test consumer failure
docker stop payment-service
# Messages vẫn được lưu trong Kafka

# Gửi messages
curl -X POST http://localhost:3000/api/orders -d '{...}'

# Start lại consumer
docker start payment-service
# Consumer xử lý messages đã lưu

# Test rebalancing
docker-compose up -d --scale payment-service=3
# Kafka tự động phân lại partitions cho 3 consumers
```

## Tài liệu tham khảo

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [RabbitMQ Tutorials](https://www.rabbitmq.com/getstarted.html)
- [NestJS Microservices](https://docs.nestjs.com/microservices/basics)
- [Event-Driven Architecture - Martin Fowler](https://martinfowler.com/articles/201701-event-driven.html)
- [Kafka: The Definitive Guide](https://www.confluent.io/resources/kafka-the-definitive-guide/)
- [Understanding Message Brokers](https://www.cloudamqp.com/blog/part1-rabbitmq-for-beginners-what-is-rabbitmq.html)
