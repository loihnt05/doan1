import { Injectable } from '@nestjs/common';

@Injectable()
export class RedisService {
  sayHi(): string {
    return 'Hi from Redis Service';
  }
}
