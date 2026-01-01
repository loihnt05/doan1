import { Module } from '@nestjs/common';
import { CloudCacheController } from './cloud-cache.controller';
import { CloudCacheService } from './cloud-cache.service';

@Module({
  controllers: [CloudCacheController],
  providers: [CloudCacheService],
  exports: [CloudCacheService],
})
export class CloudCacheModule {}
