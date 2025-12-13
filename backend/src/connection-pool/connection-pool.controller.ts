import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import * as Examples from './connection-pool.examples';
import { DemoConnection } from './connection/demo-connection';
import { ConnectionPoolManager } from './pool/pool-manager.service';

/**
 * Connection Pool Demo Controller
 * Demonstrates various connection pool features
 */
@Controller('connection-pool')
export class ConnectionPoolController {
  constructor(private readonly poolManager: ConnectionPoolManager) {}

  /**
   * Get pool statistics
   */
  @Get('stats')
  async getStats() {
    return {
      message: 'Connection pool statistics',
      stats: this.poolManager.getStats(),
      config: this.poolManager.getConfig(),
    };
  }

  /**
   * Execute a simple query using the pool
   */
  @Post('query')
  async executeQuery(@Body('query') query: string) {
    if (!query) {
      throw new HttpException('Query is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.poolManager.executeWithConnection(
        async (connection) => {
          return await connection.executeQuery(query);
        },
      );

      return {
        message: 'Query executed successfully',
        result,
        stats: this.poolManager.getStats(),
      };
    } catch (error) {
      throw new HttpException(
        `Query execution failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test concurrent connections
   */
  @Post('test-concurrent')
  async testConcurrent(@Query('count') count: string = '5') {
    const requestCount = parseInt(count, 10);

    if (isNaN(requestCount) || requestCount < 1 || requestCount > 50) {
      throw new HttpException(
        'Count must be between 1 and 50',
        HttpStatus.BAD_REQUEST,
      );
    }

    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    for (let i = 0; i < requestCount; i++) {
      promises.push(
        this.poolManager.executeWithConnection(async (connection) => {
          const result = await connection.executeQuery(
            `Concurrent query ${i + 1}`,
          );
          return {
            queryNumber: i + 1,
            connectionId: connection.id,
            result: result.data,
          };
        }),
      );
    }

    try {
      const results = await Promise.all(promises);
      const endTime = Date.now();

      return {
        message: `Successfully executed ${requestCount} concurrent queries`,
        duration: `${endTime - startTime}ms`,
        results,
        stats: this.poolManager.getStats(),
      };
    } catch (error) {
      throw new HttpException(
        `Concurrent test failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test backpressure handling
   */
  @Post('test-backpressure')
  async testBackpressure(@Query('count') count: string = '60') {
    const requestCount = parseInt(count, 10);

    if (isNaN(requestCount) || requestCount < 1) {
      throw new HttpException(
        'Count must be a positive number',
        HttpStatus.BAD_REQUEST,
      );
    }

    const startTime = Date.now();
    const results: any[] = [];
    const errors: any[] = [];

    // Create many requests to trigger backpressure
    const promises = Array.from({ length: requestCount }, async (_, i) => {
      try {
        const result = await this.poolManager.executeWithConnection(
          async (connection) => {
            // Add some delay to simulate work
            await this.delay(100);
            return await connection.executeQuery(`Backpressure query ${i + 1}`);
          },
        );
        results.push({
          queryNumber: i + 1,
          success: true,
          connectionId: result.connectionId,
        });
      } catch (error) {
        errors.push({ queryNumber: i + 1, error: error.message });
      }
    });

    await Promise.allSettled(promises);
    const endTime = Date.now();

    return {
      message: 'Backpressure test completed',
      duration: `${endTime - startTime}ms`,
      requested: requestCount,
      succeeded: results.length,
      failed: errors.length,
      stats: this.poolManager.getStats(),
      sampleErrors: errors.slice(0, 3),
    };
  }

  /**
   * Manually trigger health checks
   */
  @Post('health-check')
  async triggerHealthCheck() {
    try {
      await this.poolManager.performHealthChecks();

      return {
        message: 'Health check completed',
        stats: this.poolManager.getStats(),
      };
    } catch (error) {
      throw new HttpException(
        `Health check failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test connection acquisition timeout
   */
  @Post('test-timeout')
  async testTimeout() {
    const connections: DemoConnection[] = [];

    try {
      // Acquire all possible connections
      const maxConnections = this.poolManager.getConfig().maxConnections;

      for (let i = 0; i < maxConnections; i++) {
        const conn = await this.poolManager.acquire();
        connections.push(conn);
      }

      // Try to acquire one more, which should timeout
      try {
        const conn = await this.poolManager.acquire();
        connections.push(conn);

        return {
          message: 'Unexpected: Connection acquired without timeout',
          stats: this.poolManager.getStats(),
        };
      } catch (timeoutError) {
        return {
          message: 'Timeout test successful',
          error: timeoutError.message,
          stats: this.poolManager.getStats(),
        };
      }
    } finally {
      // Release all acquired connections
      for (const conn of connections) {
        await this.poolManager.release(conn);
      }
    }
  }

  /**
   * Demo of using connections with proper error handling
   */
  @Post('demo-transaction')
  async demoTransaction(@Body('operations') operations: string[]) {
    if (!operations || !Array.isArray(operations)) {
      throw new HttpException(
        'Operations array is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const results: any[] = [];

    try {
      // Execute multiple operations with the same connection
      const finalResult = await this.poolManager.executeWithConnection(
        async (connection) => {
          for (const operation of operations) {
            const result = await connection.executeQuery(operation);
            results.push(result);
          }
          return results;
        },
      );

      return {
        message: 'Transaction completed successfully',
        operationCount: operations.length,
        results: finalResult,
        stats: this.poolManager.getStats(),
      };
    } catch (error) {
      throw new HttpException(
        `Transaction failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get detailed pool information
   */
  @Get('info')
  async getPoolInfo() {
    const stats = this.poolManager.getStats();
    const config = this.poolManager.getConfig();

    return {
      message: 'Connection pool information',
      config: {
        minConnections: config.minConnections,
        maxConnections: config.maxConnections,
        idleTimeoutMs: config.idleTimeoutMs,
        acquireTimeoutMs: config.acquireTimeoutMs,
        healthCheckIntervalMs: config.healthCheckIntervalMs,
        maxQueueSize: config.maxQueueSize,
        maxRetries: config.maxRetries,
      },
      currentState: {
        totalConnections: stats.totalConnections,
        idleConnections: stats.idleConnections,
        activeConnections: stats.activeConnections,
        pendingRequests: stats.pendingRequests,
        failedConnections: stats.failedConnections,
      },
      lifetimeStats: {
        totalAcquired: stats.totalAcquired,
        totalReleased: stats.totalReleased,
        totalCreated: stats.totalCreated,
        totalDestroyed: stats.totalDestroyed,
        queueOverflows: stats.queueOverflows,
      },
      utilization: {
        connectionUtilization: `${((stats.activeConnections / stats.totalConnections) * 100).toFixed(1)}%`,
        poolCapacity: `${stats.totalConnections}/${config.maxConnections}`,
        queueCapacity: `${stats.pendingRequests}/${config.maxQueueSize}`,
      },
    };
  }

  /**
   * Run a specific example
   */
  @Get('examples/:exampleNumber')
  async runExample(@Query('exampleNumber') exampleNumber: string) {
    const num = parseInt(exampleNumber, 10);

    if (isNaN(num) || num < 1 || num > 10) {
      throw new HttpException(
        'Example number must be between 1 and 10',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      let result;

      switch (num) {
        case 1:
          await Examples.example1_basicQuery(this.poolManager);
          result = 'Basic query example completed';
          break;
        case 2:
          await Examples.example2_manualManagement(this.poolManager);
          result = 'Manual management example completed';
          break;
        case 3:
          result = await Examples.example3_concurrentOperations(
            this.poolManager,
          );
          break;
        case 4:
          await Examples.example4_transaction(this.poolManager);
          result = 'Transaction example completed';
          break;
        case 5:
          await Examples.example5_backpressure(this.poolManager);
          result = 'Backpressure example completed';
          break;
        case 6:
          await Examples.example6_timeout(this.poolManager);
          result = 'Timeout example completed';
          break;
        case 7:
          await Examples.example7_monitoring(this.poolManager);
          result = 'Monitoring example completed';
          break;
        case 8:
          await Examples.example8_healthCheck(this.poolManager);
          result = 'Health check example completed';
          break;
        case 9:
          await Examples.example9_batchProcessing(this.poolManager);
          result = 'Batch processing example completed';
          break;
        case 10:
          await Examples.example10_errorHandling(this.poolManager);
          result = 'Error handling example completed';
          break;
      }

      return {
        message: `Example ${num} executed successfully`,
        result,
        stats: this.poolManager.getStats(),
      };
    } catch (error) {
      throw new HttpException(
        `Example ${num} failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Run all examples sequentially
   */
  @Post('examples/run-all')
  async runAllExamples() {
    try {
      await Examples.runAllExamples(this.poolManager);

      return {
        message: 'All examples completed successfully',
        stats: this.poolManager.getStats(),
      };
    } catch (error) {
      throw new HttpException(
        `Examples execution failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Utility delay method
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
