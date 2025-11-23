import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

import { AppService } from './app.service';
import { CloudCacheModule } from './cache/cloud-cache/cloud-cache.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [CloudCacheModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
