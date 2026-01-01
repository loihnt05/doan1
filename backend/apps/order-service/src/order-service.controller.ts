import { Controller, Get } from '@nestjs/common';
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
}
