import { Injectable } from '@nestjs/common';
import * as os from 'os';

/**
 * Health check service
 */
@Injectable()
export class HealthService {
  /**
   * Liveness probe - is the service alive?
   * Returns 200 if service is running
   */
  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness probe - is the service ready to serve traffic?
   * Checks external dependencies
   */
  async getReadiness() {
    const checks: Record<string, any> = {};

    // Check Node.js health
    checks.nodejs = {
      status: 'ok',
      version: process.version,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };

    // Check event loop lag
    const eventLoopLag = await this.measureEventLoopLag();
    checks.eventLoop = {
      status: eventLoopLag < 100 ? 'ok' : 'degraded',
      lag: eventLoopLag,
    };

    // Overall status
    const allOk = Object.values(checks).every((check: any) => check.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Detailed system info
   */
  getInfo() {
    return {
      service: process.env.SERVICE_NAME || 'unknown',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      system: {
        hostname: os.hostname(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
        loadAverage: os.loadavg(),
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };
  }

  /**
   * Measure event loop lag
   */
  private measureEventLoopLag(): Promise<number> {
    return new Promise((resolve) => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        resolve(lag);
      });
    });
  }
}
