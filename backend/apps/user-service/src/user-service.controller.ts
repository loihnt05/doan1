import { Controller, Get } from '@nestjs/common';
import { UserServiceService } from './user-service.service';

@Controller()
export class UserServiceController {
  constructor(private readonly userServiceService: UserServiceService) {}

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
}
