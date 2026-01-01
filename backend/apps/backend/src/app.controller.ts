import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  health() {
    return { status: 'ok', service: 'user-service' };
  }

  @Get('/users')
  findAll() {
    return [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
