---
sidebar_position: 2
---
## Vertical Scaling

Thêm nhiều tài nguyên hơn (CPU, RAM, disk) vào một máy duy nhất.

### Các Trường Hợp Sử Dụng

1. **Các ứng dụng single-threaded**: Các ứng dụng không thể song song hóa
2. **Databases**: Thường được hưởng lợi từ nhiều bộ nhớ/CPU hơn
3. **Cache servers**: Redis, Memcached
4. **Khắc phục nhanh**: Giải pháp tạm thời trong khi lập kế hoạch horizontal scaling

### Ưu điểm

 Đơn giản - không cần thay đổi code
 Không có độ phức tạp của hệ thống phân tán
 Độ trễ thấp hơn (mọi thứ ở một nơi)
 Dễ bảo trì hơn

### Nhược điểm

 Giới hạn phần cứng - không thể scale vô hạn
 Đắt đỏ - máy lớn hơn tốn kém không tỷ lệ thuận
 Điểm lỗi duy nhất
 Thời gian downtime trong quá trình nâng cấp

### Ví dụ

```typescript
// Before: 2 CPU cores, event loop can get blocked
@Get('cpu-intensive')
heavyComputation() {
  // This blocks the single thread!
  for (let i = 0; i < 10_000_000_000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

// Solution 1: Cluster module (vertical scaling)
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length; // Use all 8 cores!
  
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // Each worker handles requests
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}
```