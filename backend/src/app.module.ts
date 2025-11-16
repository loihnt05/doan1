import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisModule } from './cache/redis/redis.module';
import { redisStore } from 'cache-manager-redis-yet';

@Module({
  imports: [
    RedisModule,
    UserModule,
    CacheModule.register({
      isGlobal: true,
      ttl: 600,
      store: redisStore({
        socket: {
          host: '127.0.0.1',
          port: 6379,
        },
        password: 'mypassword',
      }),
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
