import { Module } from '@nestjs/common';
import { ConnectionPoolController } from './connection-pool.controller';
import { ConnectionPoolManager } from './pool/pool-manager.service';
import { PoolConfig } from './types/pool-config.interface';

/**
 * Connection Pool Module
 * Provides connection pooling functionality with all features:
 * - Pool Manager
 * - Connection Objects
 * - Acquisition/Release Logic
 * - Queue / Request Handling
 * - Idle timeout
 * - Max connections / Min connections
 * - Health Check & Reconnect
 * - Configuration Options
 * - Backpressure handling
 */
@Module({
  controllers: [ConnectionPoolController],
  providers: [
    {
      provide: ConnectionPoolManager,
      useFactory: () => {
        // Custom configuration for the pool
        const config: Partial<PoolConfig> = {
          minConnections: 3,
          maxConnections: 10,
          idleTimeoutMs: 30000, // 30 seconds
          acquireTimeoutMs: 5000, // 5 seconds
          healthCheckIntervalMs: 60000, // 1 minute
          maxRetries: 3,
          retryDelayMs: 1000,
          maxQueueSize: 50,
          validateBeforeUse: true,
          connectionTimeoutMs: 5000,
        };

        return new ConnectionPoolManager(config);
      },
    },
  ],
  exports: [ConnectionPoolManager],
})
export class ConnectionPoolModule {}
