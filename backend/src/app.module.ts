import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { RedisModule } from './cache/redis/redis.module';

@Module({
  imports: [UserModule, RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
