import { Module } from '@nestjs/common';
import { HazelcastController } from './hazelcast.controller';
import { HazelcastService } from './hazelcast.service';
import { hazelcastProvider } from './hazelcast.provider';

@Module({
  controllers: [HazelcastController],
  providers: [hazelcastProvider, HazelcastService],
  exports: [HazelcastService],
})
export class HazelcastModule {}
