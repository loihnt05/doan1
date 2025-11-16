import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { RedisModule } from './cache/redis/redis.module';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    UserModule,
    RedisModule,
    CacheModule.register({
      isGlobal: true,
      ttl: 60000,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
