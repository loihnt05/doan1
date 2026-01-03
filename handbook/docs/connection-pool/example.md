---
sidebar_position: 2
---
# Example

## 10 Ví Dụ Thực Tế

### Ví Dụ 1: Truy Vấn Cơ Bản

```typescript
async function example1_basicQuery(poolManager: ConnectionPoolManager) {
  const result = await poolManager.executeWithConnection(async (connection) => {
    return await connection.executeQuery('SELECT * FROM users WHERE id = 1');
  });
  
  console.log('Query result:', result);
}
```

### Ví Dụ 2: Quản Lý Thủ Công

```typescript
async function example2_manualManagement(poolManager: ConnectionPoolManager) {
  let connection = null;
  
  try {
    connection = await poolManager.acquire();
    console.log(`Acquired connection: ${connection.id}`);
    
    const result = await connection.executeQuery('SELECT COUNT(*) FROM users');
    console.log('Result:', result);
    
  } finally {
    if (connection) {
      await poolManager.release(connection);
    }
  }
}
```

### Ví Dụ 3: Xử Lý Đồng Thời

```typescript
async function example3_concurrent(poolManager: ConnectionPoolManager) {
  const queries = [
    'SELECT * FROM users',
    'SELECT * FROM orders',
    'SELECT * FROM products',
  ];
  
  const promises = queries.map((query, index) => 
    poolManager.executeWithConnection(async (connection) => {
      console.log(`Query ${index + 1} using connection ${connection.id}`);
      return await connection.executeQuery(query);
    })
  );
  
  const results = await Promise.all(promises);
  return results;
}
```

### Ví Dụ 4: Transaction

```typescript
async function example4_transaction(poolManager: ConnectionPoolManager) {
  await poolManager.executeWithConnection(async (connection) => {
    await connection.executeQuery('BEGIN TRANSACTION');
    
    try {
      await connection.executeQuery('INSERT INTO users VALUES (...)');
      await connection.executeQuery('UPDATE accounts SET ...');
      await connection.executeQuery('COMMIT');
      console.log('Transaction completed successfully');
    } catch (error) {
      await connection.executeQuery('ROLLBACK');
      throw error;
    }
  });
}
```

### Ví Dụ 5: Xử Lý Backpressure

```typescript
async function example5_backpressure(poolManager: ConnectionPoolManager) {
  const config = poolManager.getConfig();
  const requestCount = config.maxConnections + config.maxQueueSize + 10;
  
  const results = [];
  const errors = [];
  
  const promises = Array.from({ length: requestCount }, async (_, i) => {
    try {
      const result = await poolManager.executeWithConnection(async (conn) => {
        await delay(100);
        return await conn.executeQuery(`Query ${i + 1}`);
      });
      results.push({ success: true, data: result });
    } catch (error) {
      errors.push({ success: false, error: error.message });
    }
  });
  
  await Promise.allSettled(promises);
  
  console.log(`Succeeded: ${results.length}, Failed: ${errors.length}`);
}
```

### Ví Dụ 6: Test Timeout

```typescript
async function example6_timeout(poolManager: ConnectionPoolManager) {
  const connections = [];
  
  try {
    // Lấy hết tất cả kết nối
    for (let i = 0; i < poolManager.getConfig().maxConnections; i++) {
      const conn = await poolManager.acquire();
      connections.push(conn);
    }
    
    // Thử lấy thêm 1 kết nối → Timeout
    try {
      await poolManager.acquire();
    } catch (error) {
      console.log(`Expected timeout: ${error.message}`);
    }
    
  } finally {
    // Trả lại tất cả kết nối
    for (const conn of connections) {
      await poolManager.release(conn);
    }
  }
}
```

### Ví Dụ 7: Giám Sát & Metrics

```typescript
async function example7_monitoring(poolManager: ConnectionPoolManager) {
  const stats = poolManager.getStats();
  const config = poolManager.getConfig();
  
  console.log('=== Trạng thái hiện tại ===');
  console.log(`Tổng kết nối: ${stats.totalConnections}`);
  console.log(`Kết nối rảnh: ${stats.idleConnections}`);
  console.log(`Kết nối đang dùng: ${stats.activeConnections}`);
  console.log(`Request đợi: ${stats.pendingRequests}`);
  
  console.log('\n=== Thống kê ===');
  console.log(`Tổng lần lấy: ${stats.totalAcquired}`);
  console.log(`Tổng lần trả: ${stats.totalReleased}`);
  console.log(`Số lần queue đầy: ${stats.queueOverflows}`);
  
  const utilization = (stats.activeConnections / stats.totalConnections) * 100;
  console.log(`\nTỷ lệ sử dụng: ${utilization.toFixed(1)}%`);
}
```

### Ví Dụ 8: Health Check

```typescript
async function example8_healthCheck(poolManager: ConnectionPoolManager) {
  console.log('Thực hiện health check...');
  await poolManager.performHealthChecks();
  
  const stats = poolManager.getStats();
  console.log(`Kết nối lỗi: ${stats.failedConnections}`);
  console.log(`Tổng kết nối: ${stats.totalConnections}`);
}
```

### Ví Dụ 9: Batch Processing

```typescript
async function example9_batchProcessing(poolManager: ConnectionPoolManager) {
  const items = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`
  }));
  
  const batchSize = 10;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    await poolManager.executeWithConnection(async (connection) => {
      for (const item of batch) {
        await connection.executeQuery(
          `INSERT INTO items VALUES (${item.id}, '${item.name}')`
        );
      }
    });
  }
  
  console.log(`Processed ${items.length} items in batches of ${batchSize}`);
}
```

### Ví Dụ 10: Error Handling & Retry

```typescript
async function example10_errorHandling(poolManager: ConnectionPoolManager) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`Attempt ${attempt}/${maxRetries}`);
      
      await poolManager.executeWithConnection(async (connection) => {
        return await connection.executeQuery('SELECT * FROM users');
      });
      
      break; // Thành công
      
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt >= maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```


## Best Practices 

### Nên Làm

1. **Luôn trả lại kết nối**
   ```typescript
   // Dùng try-finally
   const conn = await pool.acquire();
   try {
     // Sử dụng connection
   } finally {
     await pool.release(conn); // Đảm bảo luôn chạy
   }
   
   // Hoặc dùng wrapper
   await pool.executeWithConnection(async (conn) => {
     // Tự động release
   });
   ```

2. **Cấu hình phù hợp**
   ```typescript
   // Development
   minConnections: 2
   maxConnections: 5
   
   // Production
   minConnections: 5
   maxConnections: 20
   ```

3. **Theo dõi metrics**
   ```typescript
   setInterval(() => {
     const stats = pool.getStats();
     logger.info('Pool stats', stats);
   }, 60000);
   ```

### Không Nên Làm

1. **Không trả lại kết nối**
   ```typescript
   // Sai - Leak connection
   const conn = await pool.acquire();
   await conn.executeQuery('...');
   // Quên release!
   ```

2. **Giữ kết nối quá lâu**
   ```typescript
   // Sai - Block connection
   const conn = await pool.acquire();
   await doSomethingLong(); // 10 phút
   await conn.executeQuery('...');
   await pool.release(conn);
   ```

3. **Không xử lý lỗi**
   ```typescript
   // Sai - Không catch error
   const conn = await pool.acquire();
   await conn.executeQuery('...'); // Có thể lỗi
   await pool.release(conn);
   ```
## Tài Liệu Tham Khảo

- Source code examples available in the backend repository
- Configuration interfaces for pool settings
- Connection pool implementation examples
