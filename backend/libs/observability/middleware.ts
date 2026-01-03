import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { httpRequestsTotal, httpRequestDuration, httpRequestsInFlight } from './metrics';
import { logHttpRequest } from './logger';

/**
 * Middleware to track HTTP metrics
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const serviceName = process.env.SERVICE_NAME || 'unknown';
    const startTime = Date.now();

    // Add trace ID to request
    const traceId = req.headers['x-trace-id'] as string || uuidv4();
    req['traceId'] = traceId;
    res.setHeader('X-Trace-Id', traceId);

    // Increment in-flight requests
    httpRequestsInFlight.inc({ service: serviceName });

    // On response finish
    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000; // seconds
      const route = req.route?.path || req.path;
      const method = req.method;
      const statusCode = res.statusCode;

      // Record metrics
      httpRequestsTotal.inc({
        method,
        route,
        status_code: statusCode,
        service: serviceName,
      });

      httpRequestDuration.observe(
        {
          method,
          route,
          status_code: statusCode,
          service: serviceName,
        },
        duration
      );

      // Decrement in-flight requests
      httpRequestsInFlight.dec({ service: serviceName });

      // Log request
      logHttpRequest(method, route, statusCode, duration * 1000, traceId);
    });

    next();
  }
}
