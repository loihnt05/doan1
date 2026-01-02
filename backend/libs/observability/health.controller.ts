import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health';
import { register } from './metrics';

/**
 * Health and metrics controller
 */
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe - K8s uses this to check if service is alive
   * If this fails, K8s will restart the pod
   */
  @Get('/health')
  getLiveness() {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness probe - K8s uses this to check if service is ready for traffic
   * If this fails, K8s will remove pod from service endpoints
   */
  @Get('/ready')
  async getReadiness() {
    return this.healthService.getReadiness();
  }

  /**
   * System info endpoint
   */
  @Get('/info')
  getInfo() {
    return this.healthService.getInfo();
  }

  /**
   * Prometheus metrics endpoint
   */
  @Get('/metrics')
  async getMetrics() {
    return register.metrics();
  }
}
