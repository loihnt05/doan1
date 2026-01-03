import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { OrderServiceService } from './order-service.service';

@Controller()
export class OrderServiceController {
  constructor(private readonly orderServiceService: OrderServiceService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'order-service' };
  }

  @Get('/orders')
  findAll() {
    return [
      { id: 101, userId: 1, total: 100 },
      { id: 102, userId: 2, total: 200 },
    ];
  }

  /**
   * Create a new order and publish event to Kafka
   */
  @Post('/orders')
  async createOrder(
    @Body() orderDto: { userId: string; items: Array<{ productId: string; quantity: number; price: number }> },
  ) {
    return this.orderServiceService.createOrder(orderDto);
  }

  /**
   * Get order status (for saga demo)
   */
  @Get('/orders/:orderId')
  getOrder(@Param('orderId') orderId: string) {
    return this.orderServiceService.getOrder(orderId);
  }

  // ==================== PHASE 6: RACE CONDITION DEMO ====================

  /**
   * DEMO: Race condition - NO LOCK (UNSAFE)
   * Concurrent requests will cause inconsistent state
   * 
   * Try: Send 10 concurrent requests → balance will be wrong!
   */
  @Post('/demo/race-condition/no-lock')
  async raceConditionNoLock() {
    return this.orderServiceService.processPaymentNoLock();
  }

  /**
   * DEMO: Race condition SOLVED - WITH DISTRIBUTED LOCK (SAFE)
   * Only one request processes at a time
   * 
   * Try: Send 10 concurrent requests → balance will be correct!
   */
  @Post('/demo/race-condition/with-lock')
  async raceConditionWithLock() {
    return this.orderServiceService.processPaymentWithLock();
  }

  /**
   * DEMO: Fenced tokens to prevent stale writes
   * Shows how old operations are rejected
   */
  @Post('/demo/fenced-token/:orderId')
  async demoFencedToken(@Param('orderId') orderId: string) {
    return this.orderServiceService.processOrderWithFencedToken(orderId);
  }

  /**
   * Get current balance (for race condition demo)
   */
  @Get('/demo/balance')
  getBalance() {
    return this.orderServiceService.getBalance();
  }

  /**
   * Reset balance (for race condition demo)
   */
  @Post('/demo/balance/reset')
  resetBalance() {
    return this.orderServiceService.resetBalance();
  }
}
