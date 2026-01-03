import { Module, Global } from '@nestjs/common';
import { HealthService } from './health';
import { HealthController } from './health.controller';

/**
 * Global observability module
 * Provides health checks and metrics endpoints
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class ObservabilityModule {}
