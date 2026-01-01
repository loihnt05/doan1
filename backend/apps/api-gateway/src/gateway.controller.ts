import { Controller, Get, UseGuards, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Throttle } from '@nestjs/throttler';
import { GatewayService } from './gateway.service';
import { FakeJwtGuard } from './guards/fake-jwt.guard';
import CircuitBreaker from 'opossum';

@Controller()
export class GatewayController {
  private paymentBreaker: CircuitBreaker;

  constructor(
    private readonly gatewayService: GatewayService,
    private readonly http: HttpService,
  ) {
    // Initialize circuit breaker for payment service
    this.paymentBreaker = new CircuitBreaker(
      () => this.http.axiosRef.get('http://payment-service:3003/pay'),
      {
        timeout: 3000,
        errorThresholdPercentage: 50,
        resetTimeout: 10000,
      },
    );

    // Circuit breaker event listeners
    this.paymentBreaker.on('open', () => console.log('Circuit breaker OPEN'));
    this.paymentBreaker.on('halfOpen', () =>
      console.log('Circuit breaker HALF-OPEN'),
    );
    this.paymentBreaker.on('close', () => console.log('Circuit breaker CLOSED'));
  }

  @Get()
  getHello(): string {
    return this.gatewayService.getHello();
  }

  @Get('/health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }

  // Route forwarding to user-service
  @Get('/users')
  async users() {
    const res = await this.http.axiosRef.get('http://user-service:3001/users');
    return res.data;
  }

  // Route forwarding to order-service
  @Get('/orders')
  async orders() {
    const res = await this.http.axiosRef.get(
      'http://order-service:3002/orders',
    );
    return res.data;
  }

  // Request aggregation - combines data from multiple services
  @Get('/dashboard')
  async dashboard() {
    const [users, orders] = await Promise.all([
      this.http.axiosRef.get('http://user-service:3001/users'),
      this.http.axiosRef.get('http://order-service:3002/orders'),
    ]);

    return {
      users: users.data,
      orders: orders.data,
      timestamp: new Date().toISOString(),
    };
  }

  // Protected route with fake JWT guard
  @UseGuards(FakeJwtGuard)
  @Get('/secure')
  secure() {
    return { message: 'Authorized - You have valid token!' };
  }

  // Rate limiting demo - 2 requests per 10 seconds
  @Throttle({ default: { limit: 2, ttl: 10000 } })
  @Get('/limited')
  limited() {
    return { message: 'This endpoint is rate limited: 2 req/10s' };
  }

  // Circuit breaker demo for payment service
  @Get('/pay')
  async pay() {
    try {
      const result = await this.paymentBreaker.fire();
      return result.data;
    } catch (error) {
      return {
        error: 'Payment service unavailable',
        message: 'Circuit breaker is open or service is down',
      };
    }
  }

  // Retry with backoff demo
  @Get('/pay-with-retry')
  async payWithRetry() {
    return this.gatewayService.retry(
      () => this.http.axiosRef.get('http://payment-service:3003/pay'),
      3,
    );
  }

  // Blocking demo (bad practice)
  @Get('/blocking')
  blocking() {
    const start = Date.now();
    while (Date.now() - start < 3000) {
      // Blocks event loop for 3 seconds
    }
    return { message: 'blocked for 3 seconds' };
  }

  // Non-blocking demo (good practice)
  @Get('/non-blocking')
  async nonBlocking() {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return { message: 'waited 3 seconds without blocking' };
  }
}
