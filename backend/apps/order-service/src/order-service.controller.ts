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
}
