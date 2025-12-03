import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CacheInvalidationInterceptor } from './cache/interceptors/cache-invalidation.interceptor';
import { CacheInterceptor } from './cache/interceptors/cache.interceptor';
import { CacheStrategiesModule } from './cache/strategies/cache-strategies.module';
import { ConfigModule } from './config/config.module';
import { UserModule } from './user/user.module';
import { PostgresModule } from './database/postgres/postgres.module';
import { MongodbModule } from './database/mongodb/mongodb.module';
import { Neo4jModule } from './database/neo4j/neo4j.module';
import { ElasticsearchModule } from './database/elasticsearch/elasticsearch.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    ConfigModule,
    UserModule,
    CacheStrategiesModule,
    CacheModule.register({
      isGlobal: true,
    }),
    // Database modules demonstrating different data models
    PostgresModule,    // Relational Model
    MongodbModule,     // Document Model
    Neo4jModule,       // Graph Model
    ElasticsearchModule, // Search Model
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInvalidationInterceptor,
    },
  ],
})
export class AppModule {}
