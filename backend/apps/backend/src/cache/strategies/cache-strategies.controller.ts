import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CacheStrategiesService } from './cache-strategies.service';

@Controller('cache-strategies')
export class CacheStrategiesController {
  private readonly logger = new Logger(CacheStrategiesController.name);

  constructor(
    private readonly cacheStrategiesService: CacheStrategiesService,
  ) {}

  // ==================== CACHE ASIDE ====================

  @Get('cache-aside/:id')
  async cacheAsideRead(@Param('id') id: string) {
    this.logger.log(`Cache Aside READ request for product ${id}`);
    return this.cacheStrategiesService.cacheAside(parseInt(id));
  }

  @Put('cache-aside/:id')
  async cacheAsideUpdate(
    @Param('id') id: string,
    @Body() updates: { name?: string; price?: number; stock?: number },
  ) {
    this.logger.log(`Cache Aside UPDATE request for product ${id}`);
    return this.cacheStrategiesService.cacheAsideUpdate(parseInt(id), updates);
  }

  // ==================== WRITE THROUGH ====================

  @Put('write-through/:id')
  async writeThrough(
    @Param('id') id: string,
    @Body() updates: { name?: string; price?: number; stock?: number },
  ) {
    this.logger.log(`Write Through UPDATE request for product ${id}`);
    return this.cacheStrategiesService.writeThrough(parseInt(id), updates);
  }

  @Get('write-through/:id')
  async writeThroughRead(@Param('id') id: string) {
    this.logger.log(`Write Through READ request for product ${id}`);
    return this.cacheStrategiesService.writeThroughRead(parseInt(id));
  }

  // ==================== WRITE BEHIND ====================

  @Put('write-behind/:id')
  async writeBehind(
    @Param('id') id: string,
    @Body() updates: { name?: string; price?: number; stock?: number },
  ) {
    this.logger.log(`Write Behind UPDATE request for product ${id}`);
    return this.cacheStrategiesService.writeBehind(parseInt(id), updates);
  }

  @Get('write-behind/queue/status')
  getWriteBehindQueueStatus() {
    this.logger.log('Write Behind QUEUE STATUS request');
    return this.cacheStrategiesService.getWriteBehindQueueStatus();
  }

  // ==================== READ THROUGH ====================

  @Get('read-through/:id')
  async readThrough(@Param('id') id: string) {
    this.logger.log(`Read Through request for product ${id}`);
    return this.cacheStrategiesService.readThrough(parseInt(id));
  }

  // ==================== DISTRIBUTED LOCK + CACHE ====================

  @Get('distributed-lock/:id')
  async distributedLockCache(@Param('id') id: string) {
    this.logger.log(`Distributed Lock Cache request for product ${id}`);
    return this.cacheStrategiesService.distributedLockCache(parseInt(id));
  }

  @Post('distributed-lock/:id/stampede')
  async simulateCacheStampede(@Param('id') id: string) {
    this.logger.log(`Cache Stampede SIMULATION request for product ${id}`);
    return this.cacheStrategiesService.simulateCacheStampede(parseInt(id));
  }

  // ==================== UTILITY ENDPOINTS ====================

  @Delete('clear')
  async clearAllCaches() {
    this.logger.log('Clear all caches request');
    return this.cacheStrategiesService.clearAllCaches();
  }

  @Post('reset-database')
  resetDatabase() {
    this.logger.log('Reset database request');
    return this.cacheStrategiesService.resetDatabase();
  }

  // ==================== COMPARISON ENDPOINT ====================

  @Get('compare/:id')
  async compareStrategies(@Param('id') id: string) {
    this.logger.log(`Comparing all strategies for product ${id}`);
    const productId = parseInt(id);

    // Clear caches before comparison
    await this.cacheStrategiesService.clearAllCaches();

    // Test each strategy
    const cacheAside = await this.cacheStrategiesService.cacheAside(productId);
    const writeThrough =
      await this.cacheStrategiesService.writeThroughRead(productId);
    const readThrough =
      await this.cacheStrategiesService.readThrough(productId);
    const distributedLock =
      await this.cacheStrategiesService.distributedLockCache(productId);

    return {
      productId,
      comparison: {
        cacheAside: {
          latency: cacheAside.latency,
          source: cacheAside.source,
        },
        writeThrough: {
          latency: writeThrough.latency,
          source: writeThrough.source,
        },
        readThrough: {
          latency: readThrough.latency,
          source: readThrough.source,
        },
        distributedLock: {
          latency: distributedLock.latency,
          source: distributedLock.source,
          lockAcquired: distributedLock.lockAcquired,
        },
      },
      note: 'First read from each strategy (cache miss scenario)',
    };
  }

  @Get('benchmark/:id')
  async benchmarkStrategies(@Param('id') id: string) {
    this.logger.log(`Benchmarking all strategies for product ${id}`);
    const productId = parseInt(id);

    // Benchmark function
    const benchmark = async (
      fn: () => Promise<{ latency: number }>,
      iterations: number = 10,
    ) => {
      const latencies: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const result = await fn();
        latencies.push(result.latency);
      }
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const min = Math.min(...latencies);
      const max = Math.max(...latencies);
      return { avg, min, max, latencies };
    };

    // Clear and warm up
    await this.cacheStrategiesService.clearAllCaches();
    await this.cacheStrategiesService.cacheAside(productId);
    await this.cacheStrategiesService.writeThroughRead(productId);
    await this.cacheStrategiesService.readThrough(productId);

    // Benchmark reads (cache hit scenario)
    const cacheAsideStats = await benchmark(() =>
      this.cacheStrategiesService.cacheAside(productId),
    );
    const writeThroughStats = await benchmark(() =>
      this.cacheStrategiesService.writeThroughRead(productId),
    );
    const readThroughStats = await benchmark(() =>
      this.cacheStrategiesService.readThrough(productId),
    );
    const distributedLockStats = await benchmark(() =>
      this.cacheStrategiesService.distributedLockCache(productId),
    );

    return {
      productId,
      iterations: 10,
      scenario: 'Cache hit (warm cache)',
      results: {
        cacheAside: cacheAsideStats,
        writeThrough: writeThroughStats,
        readThrough: readThroughStats,
        distributedLock: distributedLockStats,
      },
    };
  }
}
