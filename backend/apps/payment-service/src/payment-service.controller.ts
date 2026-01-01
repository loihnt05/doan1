import { Controller, Get } from '@nestjs/common';
import { PaymentServiceService } from './payment-service.service';

@Controller()
export class PaymentServiceController {
  constructor(private readonly paymentServiceService: PaymentServiceService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'payment-service' };
  }

  @Get('/pay')
  pay() {
    return {
      status: 'PAID',
      transactionId: Math.random().toString(36).slice(2),
    };
  }
}
