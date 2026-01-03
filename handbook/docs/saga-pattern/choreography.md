# Mẫu Choreography

## Choreography là gì?

**Choreography** là mẫu saga phi tập trung nơi mỗi dịch vụ phản ứng với sự kiện và phát ra sự kiện mới. Không có **coordinator trung tâm**.

Hãy nghĩ về nó như một điệu nhảy: mỗi người nhảy (dịch vụ) biết bước của họ và phản ứng với những người nhảy khác mà không có nhạc trưởng.

## Kiến trúc

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Order     │       │  Payment    │       │  Inventory  │
│  Service    │       │   Service   │       │   Service   │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ OrderCreated        │                     │
       ├────────────────────▶│                     │
       │                     │ PaymentCompleted    │
       │                     ├────────────────────▶│
       │                     │                     │
       │                     │◀────────────────────┤
       │                     │   InventoryReserved │
       │                     │                     │
```

Mỗi dịch vụ:
1. Lắng nghe sự kiện cụ thể
2. Thực hiện giao dịch cục bộ
3. Phát ra sự kiện tiếp theo
4. Các dịch vụ khác phản ứng

## Triển khai

### 1. Các loại sự kiện

Đầu tiên, định nghĩa tất cả sự kiện trong saga:

```typescript
// libs/kafka/events.types.ts

export interface OrderCreatedEvent {
  eventType: 'OrderCreated';
  data: {
    orderId: string;
    userId: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
    total: number;
  };
}

export interface PaymentCompletedEvent {
  eventType: 'PaymentCompleted';
  data: {
    orderId: string;
    paymentId: string;
    amount: number;
    transactionId: string;
  };
}

export interface PaymentFailedEvent {
  eventType: 'PaymentFailed';
  data: {
    orderId: string;
    reason: string;
    errorCode: string;
  };
}

export interface InventoryReservedEvent {
  eventType: 'InventoryReserved';
  data: {
    orderId: string;
    reservationId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
}

export interface InventoryFailedEvent {
  eventType: 'InventoryFailed';
  data: {
    orderId: string;
    reason: string;
    items: Array<{ productId: string; availableQuantity: number }>;
  };
}

export interface OrderCancelledEvent {
  eventType: 'OrderCancelled';
  data: {
    orderId: string;
    reason: string;
    cancelledAt: string;
  };
}
```

### 2. Saga Initiator (Order Service)

Dịch vụ đơn hàng bắt đầu saga và xử lý bồi thường:

```typescript
// apps/order-service/src/order-service.service.ts

@Injectable()
export class OrderServiceService implements OnModuleInit {
  private orders: Map<string, any> = new Map();

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    // Subscribe to compensation events
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.ORDER_SERVICE,
      [Topics.PAYMENT_FAILED, Topics.INVENTORY_FAILED],
      this.handleCompensationEvent.bind(this),
    );
  }

  // SAGA START: Create order and emit event
  async createOrder(orderDto: any) {
    const order = {
      id: uuidv4(),
      ...orderDto,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Store order locally
    this.orders.set(order.id, order);

    // Emit event to start saga
    const event: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      data: order,
    };

    await this.kafkaProducer.send(Topics.ORDER_CREATED, event, order.id);
    
    return order;
  }

  // COMPENSATION: Handle payment or inventory failure
  private async handleCompensationEvent(event: PaymentFailedEvent | InventoryFailedEvent) {
    const order = this.orders.get(event.data.orderId);
    
    if (!order) {
      console.error('Order not found:', event.data.orderId);
      return;
    }

    // Update order status
    order.status = 'cancelled';
    order.cancellationReason = event.data.reason;
    order.cancelledAt = new Date().toISOString();

    // Emit cancellation event
    const cancelledEvent: OrderCancelledEvent = {
      eventType: 'OrderCancelled',
      data: {
        orderId: order.id,
        reason: event.data.reason,
        cancelledAt: order.cancelledAt,
      },
    };

    await this.kafkaProducer.send(Topics.ORDER_CANCELLED, cancelledEvent, order.id);

    console.log(`[COMPENSATION] Order ${order.id} cancelled: ${event.data.reason}`);
  }

  // Query order status
  async getOrder(orderId: string) {
    return this.orders.get(orderId);
  }
}
```

### 3. Saga Participant (Payment Service)

Dịch vụ thanh toán lắng nghe OrderCreated và phát ra thành công/thất bại:

```typescript
// apps/payment-service/src/payment-service.service.ts

@Injectable()
export class PaymentServiceService implements OnModuleInit {
  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.PAYMENT_SERVICE,
      [Topics.ORDER_CREATED],
      this.handleOrderCreated.bind(this),
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent) {
    console.log('[Payment Service] Processing payment for order:', event.data.orderId);

    // Simulate payment processing (30% failure rate for demo)
    const paymentSucceeds = Math.random() > 0.3;

    if (paymentSucceeds) {
      // SUCCESS PATH
      await this.handlePaymentSuccess(event);
    } else {
      // FAILURE PATH - Trigger compensation
      await this.handlePaymentFailure(event);
    }
  }

  private async handlePaymentSuccess(event: OrderCreatedEvent) {
    const completedEvent: PaymentCompletedEvent = {
      eventType: 'PaymentCompleted',
      data: {
        orderId: event.data.orderId,
        paymentId: uuidv4(),
        amount: event.data.total,
        transactionId: `txn_${uuidv4()}`,
      },
    };

    await this.kafkaProducer.send(
      Topics.PAYMENT_COMPLETED,
      completedEvent,
      event.data.orderId,
    );

    console.log('[Payment Service] Payment completed:', event.data.orderId);
  }

  private async handlePaymentFailure(event: OrderCreatedEvent) {
    const failedEvent: PaymentFailedEvent = {
      eventType: 'PaymentFailed',
      data: {
        orderId: event.data.orderId,
        reason: 'Insufficient funds',
        errorCode: 'PAYMENT_DECLINED',
      },
    };

    await this.kafkaProducer.send(
      Topics.PAYMENT_FAILED,
      failedEvent,
      event.data.orderId,
    );

    console.log('[Payment Service] Payment failed:', event.data.orderId);
  }
}
```

### 4. Saga Participant (Inventory Service)

Dịch vụ hàng tồn kho lắng nghe PaymentCompleted và phát ra thành công/thất bại:

```typescript
// apps/inventory-service/src/inventory-service.service.ts

@Injectable()
export class InventoryServiceService implements OnModuleInit {
  private inventory: Map<string, number> = new Map([
    ['prod-1', 100],
    ['prod-2', 50],
    ['prod-3', 25],
  ]);

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.INVENTORY_SERVICE,
      [Topics.PAYMENT_COMPLETED],
      this.handlePaymentCompleted.bind(this),
    );
  }

  private async handlePaymentCompleted(event: PaymentCompletedEvent) {
    console.log('[Inventory Service] Reserving inventory for order:', event.data.orderId);

    // Simulate inventory check (20% failure rate for demo)
    const inventoryAvailable = Math.random() > 0.2;

    if (inventoryAvailable) {
      await this.handleInventorySuccess(event);
    } else {
      await this.handleInventoryFailure(event);
    }
  }

  private async handleInventorySuccess(event: PaymentCompletedEvent) {
    const reservedEvent: InventoryReservedEvent = {
      eventType: 'InventoryReserved',
      data: {
        orderId: event.data.orderId,
        reservationId: uuidv4(),
        items: [{ productId: 'prod-1', quantity: 2 }],
      },
    };

    await this.kafkaProducer.send(
      Topics.INVENTORY_RESERVED,
      reservedEvent,
      event.data.orderId,
    );

    console.log('[Inventory Service] Inventory reserved:', event.data.orderId);
  }

  private async handleInventoryFailure(event: PaymentCompletedEvent) {
    const failedEvent: InventoryFailedEvent = {
      eventType: 'InventoryFailed',
      data: {
        orderId: event.data.orderId,
        reason: 'Insufficient stock',
        items: [{ productId: 'prod-1', availableQuantity: 0 }],
      },
    };

    await this.kafkaProducer.send(
      Topics.INVENTORY_FAILED,
      failedEvent,
      event.data.orderId,
    );

    console.log('[Inventory Service] Inventory failed:', event.data.orderId);
  }
}
```

## Sơ đồ luồng sự kiện

### Đường thành công

```
Order Service          Payment Service       Inventory Service
     │                        │                      │
     │  1. Tạo đơn hàng       │                      │
     ├─────────────────────┐  │                      │
     │ OrderCreatedEvent   │  │                      │
     │                     └─▶│  2. Xử lý thanh toán │
     │                        ├──────────────────┐   │
     │                        │ PaymentCompleted │   │
     │                        │                  └──▶│  3. Dự trữ hàng
     │                        │                      ├──────────────────┐
     │                        │                      │ InventoryReserved│
     │                        │                      │                  │
     ✓ Saga Hoàn thành        ✓                      ✓                  │
```

### Đường bồi thường (Thanh toán thất bại)

```
Order Service          Payment Service
     │                        │
     │  1. Tạo đơn hàng       │
     ├─────────────────────┐  │
     │ OrderCreatedEvent   │  │
     │                     └─▶│  2. Thanh toán thất bại
     │                        ├──────────────────┐
     │                        │ PaymentFailedEvent│
     │  3. Bồi thường      ◀──┘                  │
     ├─────────────────────┐  │
     │ OrderCancelledEvent │  │
     │                     │  │
     ✗ Saga Hủy              │
```

## Ưu và nhược điểm

### Ưu điểm

1. **Ghép lỏng**
   - Các dịch vụ không biết về nhau
   - Dễ thêm người tham gia mới
   - Không có phụ thuộc trực tiếp

2. **Không có điểm thất bại duy nhất**
   - Không có orchestrator trung tâm để thất bại
   - Mỗi dịch vụ độc lập
   - Bền vững với các thất bại một phần

3. **Khả năng mở rộng**
   - Các dịch vụ có thể mở rộng độc lập
   - Hướng sự kiện theo bản chất
   - Kafka xử lý phân phối tải

4. **Tính linh hoạt**
   - Dễ thêm trình xử lý sự kiện mới
   - Nhiều dịch vụ có thể phản ứng với cùng sự kiện
   - Ví dụ: Dịch vụ Analytics đăng ký tất cả sự kiện

### Nhược điểm

1. **Hiểu luồng phức tạp**
   - Khó thấy luồng saga tổng thể
   - Phải theo dõi sự kiện trên các dịch vụ
   - Không có nơi duy nhất hiển thị quy trình hoàn chỉnh

2. **Phụ thuộc vòng tròn**
   - Các dịch vụ phản ứng với sự kiện từ nhau
   - Có thể tạo chuỗi sự kiện vòng tròn
   - Ví dụ: A → B → C → A (vòng lặp!)

3. **Khó debug**
   - Sự kiện phân tán trên các dịch vụ
   - Phải kiểm tra log của tất cả dịch vụ
   - Không có trạng thái saga trung tâm

4. **Độ phức tạp kiểm thử**
   - Phải kiểm thử toàn bộ chuỗi sự kiện
   - Cần kiểm thử tích hợp
   - Khó mock luồng sự kiện

## Các thực hành tốt nhất

### 1. Quy ước đặt tên sự kiện

Sử dụng tên sự kiện rõ ràng, hướng miền:

```typescript
//  Tốt
OrderCreated
PaymentCompleted
InventoryReserved

//  Tệ
OrderEvent
PaymentDone
StockChecked
```

### 2. Idempotency

Luôn xử lý sự kiện trùng lặp:

```typescript
private processedEvents = new Set<string>();

async handleEvent(event: any) {
  // Check if already processed
  if (this.processedEvents.has(event.id)) {
    console.log('Event already processed:', event.id);
    return;
  }

  // Process event
  await this.process(event);

  // Mark as processed
  this.processedEvents.add(event.id);
}
```

### 3. Correlation ID

Theo dõi saga trên các dịch vụ:

```typescript
const event = {
  eventType: 'OrderCreated',
  correlationId: uuidv4(), // Same across all events in saga
  data: { ... },
};
```

### 4. Xử lý timeout

Triển khai timeout saga:

```typescript
const sagaTimeout = setTimeout(() => {
  if (order.status === 'pending') {
    this.cancelOrder(order.id, 'Saga timeout');
  }
}, 30000); // 30 seconds
```

### 5. Dead Letter Queue

Xử lý sự kiện thất bại:

```typescript
try {
  await this.handleEvent(event);
} catch (error) {
  // Send to DLQ for manual review
  await this.kafkaProducer.send(Topics.DEAD_LETTER_QUEUE, event);
}
```

## Khi nào sử dụng Choreography

### Các trường hợp tốt

- **Luồng công việc đơn giản** (2-4 bước)
- **Dịch vụ độc lập** (thực sự tự trị)
- **Kiến trúc hướng sự kiện** (đã sử dụng sự kiện)
- **Không có logic kinh doanh phức tạp** trong phối hợp

### Khi nào sử dụng Orchestration thay thế

- **Luồng công việc phức tạp** (5+ bước)
- **Cần theo dõi trạng thái saga**
- **Logic phân nhánh phức tạp**
- **Cần quyền sở hữu rõ ràng**

## Tóm tắt

Choreography lý tưởng cho:
- Luồng công việc tuyến tính đơn giản
- Microservices hướng sự kiện
- Khi bạn muốn ghép lỏng
- Khi các dịch vụ thực sự độc lập

Điểm chính:
- Mỗi dịch vụ phản ứng với sự kiện
- Không có coordinator trung tâm
- Bồi thường qua sự kiện
- Nhất quán cuối cùng

Tiếp theo: So sánh với mẫu orchestration để kiểm soát trung tâm
