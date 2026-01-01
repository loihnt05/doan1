import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';

@Module({
  imports: [
    HttpModule,
    ThrottlerModule.forRoot([
      {
        ttl: 10000, // 10 seconds
        limit: 5, // 5 requests per ttl
      },
    ]),
  ],
  controllers: [GatewayController],
  providers: [GatewayService],
})
export class AppModule {}
