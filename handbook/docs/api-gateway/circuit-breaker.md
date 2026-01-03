---
sidebar_position: 7
---
# Circuit Breaker Pattern

## Overview

The Circuit Breaker pattern prevents cascading failures by detecting when a service is unhealthy and temporarily blocking requests to it, allowing the service time to recover.

## The Problem

Without a circuit breaker:

```
API Gateway → Failing Service (5s timeout)
Request 1: Wait 5s → Fail
Request 2: Wait 5s → Fail
Request 3: Wait 5s → Fail
...
Result: All requests slow, resources exhausted
```

With a circuit breaker:

```
API Gateway → Circuit Breaker → Service
Request 1: Try → Fail (5s)
Request 2: Try → Fail (5s)
Request 3: Circuit OPEN → Fail Fast (1ms) 
Request 4: Circuit OPEN → Fail Fast (1ms) 
...
After timeout: Circuit HALF-OPEN → Try again
```

## Circuit States

```
         Success
    ┌──────────────┐
    │              │
    │   CLOSED     │◄─────┐
    │  (Normal)    │      │
    │              │      │ Success
    └───────┬──────┘      │ threshold
            │             │
     Failure threshold    │
            │             │
            ▼             │
    ┌──────────────┐      │
    │              │      │
    │    OPEN      │      │
    │  (Failing)   │      │
    │              │      │
    └───────┬──────┘      │
            │             │
     After timeout        │
            │             │
            ▼             │
    ┌──────────────┐      │
    │              │      │
    │  HALF-OPEN   │──────┘
    │  (Testing)   │
    │              │
    └──────────────┘
```

**States:**

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Service failing, fail fast without calling service
- **HALF-OPEN**: Testing if service recovered

## Implementation

### Basic Circuit Breaker

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly successThreshold: number = 2,
    private readonly timeout: number = 60000, // 60 seconds
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      // Check if timeout elapsed
      if (Date.now() - this.lastFailureTime! >= this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.successThreshold) {
        this.state = CircuitState.CLOSED;
        console.log('Circuit breaker CLOSED - service recovered');
      }
    }
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      console.log('Circuit breaker OPEN - too many failures');
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
  }
}
```

### NestJS Interceptor

```typescript
// circuit-breaker.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class CircuitBreakerInterceptor implements NestInterceptor {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const key = `${request.method}:${request.url}`;

    // Get or create circuit breaker for this endpoint
    if (!this.circuitBreakers.has(key)) {
      this.circuitBreakers.set(key, new CircuitBreaker(5, 2, 60000));
    }

    const breaker = this.circuitBreakers.get(key)!;

    // Check if circuit is open
    if (breaker.getState() === CircuitState.OPEN) {
      return throwError(() => new ServiceUnavailableException(
        'Service temporarily unavailable (circuit breaker open)'
      ));
    }

    return next.handle().pipe(
      tap(() => breaker.onSuccess()),
      catchError((error) => {
        breaker.onFailure();
        return throwError(() => error);
      })
    );
  }
}
```

**Usage:**

```typescript
@Controller('api')
@UseInterceptors(CircuitBreakerInterceptor)
export class GatewayController {
  @Get('users')
  async getUsers() {
    // If user service is down, circuit opens after 5 failures
    return this.userService.getUsers();
  }
}
```

### Service-Specific Circuit Breaker

```typescript
@Injectable()
export class UserServiceClient {
  private circuitBreaker: CircuitBreaker;

  constructor(private httpService: HttpService) {
    this.circuitBreaker = new CircuitBreaker(
      5,     // failure threshold
      2,     // success threshold
      60000  // timeout (1 minute)
    );
  }

  async getUsers(): Promise<User[]> {
    return this.circuitBreaker.execute(async () => {
      const response = await this.httpService.axiosRef.get(
        'http://user-service:3001/users',
        { timeout: 5000 }
      );
      return response.data;
    });
  }

  async getUser(id: string): Promise<User> {
    return this.circuitBreaker.execute(async () => {
      const response = await this.httpService.axiosRef.get(
        `http://user-service:3001/users/${id}`,
        { timeout: 5000 }
      );
      return response.data;
    });
  }
}
```

## Advanced Features

### Fallback Response

Return cached or default data when circuit is open.

```typescript
export class CircuitBreakerWithFallback<T> extends CircuitBreaker {
  constructor(
    private fallback: () => Promise<T> | T,
    failureThreshold?: number,
    successThreshold?: number,
    timeout?: number
  ) {
    super(failureThreshold, successThreshold, timeout);
  }

  async execute(fn: () => Promise<T>): Promise<T> {
    try {
      return await super.execute(fn);
    } catch (error) {
      if (this.getState() === CircuitState.OPEN) {
        console.log('Circuit open, using fallback');
        return this.fallback();
      }
      throw error;
    }
  }
}
```

**Usage:**

```typescript
@Injectable()
export class UserServiceClient {
  private circuitBreaker: CircuitBreakerWithFallback<User[]>;

  constructor(
    private httpService: HttpService,
    private cache: CacheService
  ) {
    this.circuitBreaker = new CircuitBreakerWithFallback(
      // Fallback function
      async () => {
        const cached = await this.cache.get('users');
        return cached || [];
      },
      5, 2, 60000
    );
  }

  async getUsers(): Promise<User[]> {
    return this.circuitBreaker.execute(async () => {
      const response = await this.httpService.axiosRef.get(
        'http://user-service:3001/users'
      );
      
      // Cache successful response
      await this.cache.set('users', response.data, 300);
      
      return response.data;
    });
  }
}
```

### Error Rate-Based Circuit Breaker

Open circuit based on error percentage, not just count.

```typescript
export class ErrorRateCircuitBreaker extends CircuitBreaker {
  private window: Array<{ success: boolean; timestamp: number }> = [];
  private readonly windowSize = 100; // Last 100 requests
  private readonly errorThresholdPercentage = 50; // 50% errors

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime! >= this.timeout) {
        this.state = CircuitState.HALF_OPEN;
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.recordResult(true);
      return result;
    } catch (error) {
      this.recordResult(false);
      throw error;
    }
  }

  private recordResult(success: boolean) {
    this.window.push({ success, timestamp: Date.now() });

    // Keep only last N requests
    if (this.window.length > this.windowSize) {
      this.window.shift();
    }

    // Calculate error rate
    if (this.window.length >= 10) { // Minimum sample size
      const errors = this.window.filter(r => !r.success).length;
      const errorRate = (errors / this.window.length) * 100;

      if (errorRate >= this.errorThresholdPercentage) {
        this.state = CircuitState.OPEN;
        this.lastFailureTime = Date.now();
        console.log(`Circuit OPEN - error rate: ${errorRate.toFixed(1)}%`);
      } else if (this.state === CircuitState.HALF_OPEN && success) {
        this.state = CircuitState.CLOSED;
        this.window = [];
        console.log('Circuit CLOSED - service recovered');
      }
    }
  }
}
```

### Multiple Circuit Breakers

Manage circuit breakers for multiple services.

```typescript
@Injectable()
export class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  getBreaker(serviceName: string): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      const config = this.getConfig(serviceName);
      this.breakers.set(
        serviceName,
        new CircuitBreaker(
          config.failureThreshold,
          config.successThreshold,
          config.timeout
        )
      );
    }

    return this.breakers.get(serviceName)!;
  }

  private getConfig(serviceName: string) {
    // Service-specific configurations
    const configs = {
      'user-service': { failureThreshold: 5, successThreshold: 2, timeout: 60000 },
      'order-service': { failureThreshold: 3, successThreshold: 2, timeout: 30000 },
      'payment-service': { failureThreshold: 2, successThreshold: 3, timeout: 120000 }
    };

    return configs[serviceName] || { failureThreshold: 5, successThreshold: 2, timeout: 60000 };
  }

  getStatus() {
    const status = {};
    this.breakers.forEach((breaker, name) => {
      status[name] = breaker.getState();
    });
    return status;
  }
}
```

## Monitoring

```typescript
@Injectable()
export class MonitoredCircuitBreaker extends CircuitBreaker {
  constructor(
    private serviceName: string,
    private metrics: MetricsService,
    failureThreshold?: number,
    successThreshold?: number,
    timeout?: number
  ) {
    super(failureThreshold, successThreshold, timeout);
  }

  protected onSuccess() {
    super.onSuccess();
    
    this.metrics.increment('circuit_breaker_success', {
      service: this.serviceName,
      state: this.getState()
    });
  }

  protected onFailure() {
    const previousState = this.getState();
    super.onFailure();
    const newState = this.getState();

    this.metrics.increment('circuit_breaker_failure', {
      service: this.serviceName,
      state: previousState
    });

    if (previousState !== newState && newState === CircuitState.OPEN) {
      this.metrics.increment('circuit_breaker_opened', {
        service: this.serviceName
      });

      // Alert on circuit open
      this.alerting.send({
        severity: 'warning',
        message: `Circuit breaker opened for ${this.serviceName}`,
        service: this.serviceName
      });
    }
  }
}
```

## Dashboard Endpoint

```typescript
@Controller('admin')
export class CircuitBreakerController {
  constructor(private breakerManager: CircuitBreakerManager) {}

  @Get('circuit-breakers')
  getStatus() {
    return this.breakerManager.getStatus();
  }

  @Post('circuit-breakers/:service/reset')
  resetBreaker(@Param('service') service: string) {
    const breaker = this.breakerManager.getBreaker(service);
    breaker.reset();
    return { message: `Circuit breaker for ${service} reset` };
  }
}
```

## Best Practices

### 1. Set Appropriate Thresholds

```typescript
// Critical services - open quickly
const paymentBreaker = new CircuitBreaker(2, 3, 120000);

// Non-critical services - more tolerant
const recommendationBreaker = new CircuitBreaker(10, 2, 60000);
```

### 2. Provide Fallbacks

```typescript
//  GOOD: Graceful degradation
async getRecommendations(): Promise<Product[]> {
  try {
    return await this.circuitBreaker.execute(() =>
      this.recommendationService.get()
    );
  } catch (error) {
    // Return popular products as fallback
    return this.getPopularProducts();
  }
}
```

### 3. Monitor State Changes

```typescript
breaker.on('stateChange', (from, to) => {
  console.log(`Circuit breaker: ${from} → ${to}`);
  
  if (to === CircuitState.OPEN) {
    this.alerting.send({
      severity: 'critical',
      message: 'Service degraded - circuit breaker open'
    });
  }
});
```

### 4. Test Circuit Breaker

```typescript
describe('Circuit Breaker', () => {
  it('should open after threshold failures', async () => {
    const breaker = new CircuitBreaker(3, 2, 60000);
    const failingFn = jest.fn().mockRejectedValue(new Error('Failed'));

    // First 3 failures
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it('should use fallback when open', async () => {
    const breaker = new CircuitBreakerWithFallback(
      () => 'fallback',
      1, 1, 1000
    );

    await expect(
      breaker.execute(() => Promise.reject('error'))
    ).rejects.toThrow();

    // Circuit is now open, should use fallback
    const result = await breaker.execute(() => Promise.reject('error'));
    expect(result).toBe('fallback');
  });
});
```

## Integration with Hystrix

For advanced features, use Netflix Hystrix (via opossum library):

```typescript
import CircuitBreaker from 'opossum';

const options = {
  timeout: 3000,                  // If function takes longer, trigger fallback
  errorThresholdPercentage: 50,   // Open circuit if 50% errors
  resetTimeout: 30000             // Try again after 30s
};

const breaker = new CircuitBreaker(asyncFunction, options);

breaker.fallback(() => 'Fallback response');

breaker.on('open', () => console.log('Circuit opened'));
breaker.on('halfOpen', () => console.log('Circuit half-open'));
breaker.on('close', () => console.log('Circuit closed'));

// Execute
const result = await breaker.fire(arg1, arg2);
```

## Next Steps

- Learn about [Retry & Backoff](./retry-backoff.md)
- Explore [Service Mesh](./service-mesh.md)
- Check [Observability](../observability/index.md)
