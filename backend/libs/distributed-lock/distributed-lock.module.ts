import { Module, Global } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';

@Global()
@Module({
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class DistributedLockModule {}
