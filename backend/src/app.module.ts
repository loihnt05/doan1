import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

import { AppService } from './app.service';
import { HazelcastModule } from './cache/hazelcast/hazelcast.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [HazelcastModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
