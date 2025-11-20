import { Module } from '@nestjs/common';
import { MemcachedService } from './memcached.service';
import { MemcachedController } from './memcached.controller';

@Module({
  controllers: [MemcachedController],
  providers: [MemcachedService],
  exports: [MemcachedService],
})
export class MemcachedModule {}
