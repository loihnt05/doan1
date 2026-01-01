/**
 * Connection Pool Usage Examples
 *
 * This file demonstrates various usage patterns for the connection pool
 */

import { DemoConnection } from './connection/demo-connection';
import { ConnectionPoolManager } from './pool/pool-manager.service';

/**
 * Example 1: Basic Query Execution
 * The simplest way to use the pool
 */
export async function example1_basicQuery(poolManager: ConnectionPoolManager) {
  console.log('=== Example 1: Basic Query Execution ===');

  const result = await poolManager.executeWithConnection(async (connection) => {
    return await connection.executeQuery('SELECT * FROM users WHERE id = 1');
  });

  console.log('Query result:', result);
  console.log('Pool stats:', poolManager.getStats());
}

/**
 * Example 2: Manual Connection Management
 * When you need more control over connection lifecycle
 */
export async function example2_manualManagement(
  poolManager: ConnectionPoolManager,
) {
  console.log('\n=== Example 2: Manual Connection Management ===');

  let connection: DemoConnection | null = null;

  try {
    // Acquire connection
    console.log('Acquiring connection...');
    connection = await poolManager.acquire();
    console.log(`Acquired connection: ${connection.id}`);

    // Use connection
    const result = await connection.executeQuery('SELECT COUNT(*) FROM users');
    console.log('Query result:', result);

    // Do more work with the same connection
    const result2 = await connection.executeQuery('SELECT * FROM settings');
    console.log('Second query result:', result2);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Always release the connection
    if (connection) {
      console.log(`Releasing connection: ${connection.id}`);
      await poolManager.release(connection);
    }
  }
}

/**
 * Example 3: Concurrent Operations
 * Demonstrates how the pool handles multiple concurrent requests
 */
export async function example3_concurrentOperations(
  poolManager: ConnectionPoolManager,
) {
  console.log('\n=== Example 3: Concurrent Operations ===');

  const queries = [
    'SELECT * FROM users',
    'SELECT * FROM orders',
    'SELECT * FROM products',
    'SELECT * FROM categories',
    'SELECT * FROM reviews',
  ];

  console.log(`Executing ${queries.length} queries concurrently...`);
  const startTime = Date.now();

  const promises = queries.map((query, index) =>
    poolManager.executeWithConnection(async (connection) => {
      console.log(`Query ${index + 1} using connection ${connection.id}`);
      return await connection.executeQuery(query);
    }),
  );

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;

  console.log(`All queries completed in ${duration}ms`);
  console.log('Pool stats:', poolManager.getStats());

  return results;
}

/**
 * Example 4: Transaction Pattern
 * Execute multiple operations with the same connection
 */
export async function example4_transaction(poolManager: ConnectionPoolManager) {
  console.log('\n=== Example 4: Transaction Pattern ===');

  try {
    await poolManager.executeWithConnection(async (connection) => {
      console.log(`Starting transaction with connection ${connection.id}`);

      // Begin transaction
      await connection.executeQuery('BEGIN TRANSACTION');

      try {
        // Multiple operations within transaction
        await connection.executeQuery(
          'INSERT INTO users (name, email) VALUES ("Alice", "alice@example.com")',
        );
        await connection.executeQuery(
          'UPDATE accounts SET balance = balance + 100 WHERE user_id = 1',
        );
        await connection.executeQuery(
          'INSERT INTO audit_log (action) VALUES ("user_created")',
        );

        // Commit transaction
        await connection.executeQuery('COMMIT');
        console.log('Transaction committed successfully');
      } catch (error) {
        // Rollback on error
        await connection.executeQuery('ROLLBACK');
        console.error('Transaction rolled back:', error.message);
        throw error;
      }
    });
  } catch (error) {
    console.error('Transaction failed:', error.message);
  }
}

/**
 * Example 5: Handling Backpressure
 * Demonstrates queue overflow and backpressure handling
 */
export async function example5_backpressure(
  poolManager: ConnectionPoolManager,
) {
  console.log('\n=== Example 5: Backpressure Handling ===');

  const config = poolManager.getConfig();
  console.log(
    `Pool config: max=${config.maxConnections}, queue=${config.maxQueueSize}`,
  );

  // Generate more requests than the pool can handle
  const requestCount = config.maxConnections + config.maxQueueSize + 10;
  console.log(`Generating ${requestCount} requests...`);

  const results: Array<{ success: boolean; data?: any; error?: string }> = [];

  const promises = Array.from({ length: requestCount }, async (_, i) => {
    try {
      const result = await poolManager.executeWithConnection(
        async (connection) => {
          // Simulate some work
          await new Promise((resolve) => setTimeout(resolve, 100));
          return await connection.executeQuery(`Query ${i + 1}`);
        },
      );

      results.push({ success: true, data: result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  });

  await Promise.allSettled(promises);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Results: ${successful} succeeded, ${failed} failed`);
  console.log('Pool stats:', poolManager.getStats());

  // Show sample errors
  const errors = results.filter((r) => !r.success).slice(0, 3);
  console.log('Sample errors:', errors);
}

/**
 * Example 6: Connection Timeout
 * Demonstrates timeout behavior when pool is exhausted
 */
export async function example6_timeout(poolManager: ConnectionPoolManager) {
  console.log('\n=== Example 6: Connection Timeout ===');

  const config = poolManager.getConfig();
  const maxConnections = config.maxConnections;
  const connections: DemoConnection[] = [];

  try {
    // Acquire all available connections
    console.log(`Acquiring all ${maxConnections} connections...`);
    for (let i = 0; i < maxConnections; i++) {
      const conn = await poolManager.acquire();
      connections.push(conn);
      console.log(`Acquired connection ${i + 1}/${maxConnections}`);
    }

    console.log('All connections acquired, attempting one more...');

    // Try to acquire one more - should timeout
    try {
      const conn = await poolManager.acquire();
      console.log('Unexpected: Got a connection!');
      connections.push(conn);
    } catch (error) {
      console.log(`Expected timeout occurred: ${error.message}`);
    }
  } finally {
    // Release all connections
    console.log('Releasing all connections...');
    for (const conn of connections) {
      await poolManager.release(conn);
    }
    console.log('All connections released');
  }
}

/**
 * Example 7: Monitoring and Metrics
 * Demonstrates how to monitor pool health and performance
 */
export async function example7_monitoring(poolManager: ConnectionPoolManager) {
  console.log('\n=== Example 7: Monitoring and Metrics ===');

  // Get current stats
  const stats = poolManager.getStats();
  const config = poolManager.getConfig();

  console.log('Current Pool State:');
  console.log(`  Total connections: ${stats.totalConnections}`);
  console.log(`  Idle connections: ${stats.idleConnections}`);
  console.log(`  Active connections: ${stats.activeConnections}`);
  console.log(`  Pending requests: ${stats.pendingRequests}`);

  console.log('\nLifetime Statistics:');
  console.log(`  Total acquired: ${stats.totalAcquired}`);
  console.log(`  Total released: ${stats.totalReleased}`);
  console.log(`  Total created: ${stats.totalCreated}`);
  console.log(`  Total destroyed: ${stats.totalDestroyed}`);
  console.log(`  Failed connections: ${stats.failedConnections}`);
  console.log(`  Queue overflows: ${stats.queueOverflows}`);

  console.log('\nUtilization Metrics:');
  const utilization = (stats.activeConnections / stats.totalConnections) * 100;
  console.log(`  Connection utilization: ${utilization.toFixed(1)}%`);
  console.log(
    `  Pool capacity: ${stats.totalConnections}/${config.maxConnections}`,
  );
  console.log(
    `  Queue capacity: ${stats.pendingRequests}/${config.maxQueueSize}`,
  );

  // Calculate efficiency
  const efficiency =
    stats.totalReleased > 0
      ? (stats.totalAcquired / stats.totalCreated).toFixed(2)
      : 'N/A';
  console.log(`  Reuse efficiency: ${efficiency}x`);
}

/**
 * Example 8: Health Check and Recovery
 * Demonstrates health check and automatic recovery
 */
export async function example8_healthCheck(poolManager: ConnectionPoolManager) {
  console.log('\n=== Example 8: Health Check and Recovery ===');

  console.log('Performing manual health check...');
  await poolManager.performHealthChecks();

  const stats = poolManager.getStats();
  console.log(`Health check completed`);
  console.log(`  Failed connections: ${stats.failedConnections}`);
  console.log(`  Total connections: ${stats.totalConnections}`);

  // Note: In a real scenario with actual connection failures,
  // you would see reconnection attempts and recovery
  console.log(
    '\nNote: Health checks run automatically every',
    poolManager.getConfig().healthCheckIntervalMs / 1000,
    'seconds',
  );
}

/**
 * Example 9: Batch Processing
 * Process a batch of items with connection reuse
 */
export async function example9_batchProcessing(
  poolManager: ConnectionPoolManager,
) {
  console.log('\n=== Example 9: Batch Processing ===');

  const items = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    name: `Item ${i + 1}`,
  }));
  const batchSize = 10;

  console.log(`Processing ${items.length} items in batches of ${batchSize}...`);

  const startTime = Date.now();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    await poolManager.executeWithConnection(async (connection) => {
      console.log(
        `Processing batch ${Math.floor(i / batchSize) + 1} with connection ${connection.id}`,
      );

      for (const item of batch) {
        await connection.executeQuery(
          `INSERT INTO items VALUES (${item.id}, "${item.name}")`,
        );
      }
    });
  }

  const duration = Date.now() - startTime;
  console.log(`Batch processing completed in ${duration}ms`);
  console.log('Pool stats:', poolManager.getStats());
}

/**
 * Example 10: Error Handling and Retry
 * Demonstrates proper error handling patterns
 */
export async function example10_errorHandling(
  poolManager: ConnectionPoolManager,
) {
  console.log('\n=== Example 10: Error Handling and Retry ===');

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`Attempt ${attempt}/${maxRetries}`);

      await poolManager.executeWithConnection(async (connection) => {
        // Simulate an operation that might fail
        const result = await connection.executeQuery(
          'SELECT * FROM users WHERE id = 1',
        );
        console.log('Operation succeeded:', result);
        return result;
      });

      break; // Success, exit loop
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);

      if (attempt >= maxRetries) {
        console.error('Max retries reached, giving up');
        throw error;
      }

      // Wait before retrying
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Run all examples
 */
export async function runAllExamples(poolManager: ConnectionPoolManager) {
  console.log('========================================');
  console.log('CONNECTION POOL DEMO - ALL EXAMPLES');
  console.log('========================================\n');

  try {
    await example1_basicQuery(poolManager);
    await example2_manualManagement(poolManager);
    await example3_concurrentOperations(poolManager);
    await example4_transaction(poolManager);
    await example5_backpressure(poolManager);
    await example6_timeout(poolManager);
    await example7_monitoring(poolManager);
    await example8_healthCheck(poolManager);
    await example9_batchProcessing(poolManager);
    await example10_errorHandling(poolManager);

    console.log('\n========================================');
    console.log('ALL EXAMPLES COMPLETED');
    console.log('========================================');
  } catch (error) {
    console.error('Example execution failed:', error);
  }
}
