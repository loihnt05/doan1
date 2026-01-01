import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Article, ArticleSchema } from './article.schema';
import { MongodbService } from './mongodb.service';
import { MongodbController } from './mongodb.controller';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/nestjs_demo',
      {
        // Connection options
      },
    ),
    MongooseModule.forFeature([{ name: Article.name, schema: ArticleSchema }]),
  ],
  controllers: [MongodbController],
  providers: [MongodbService],
  exports: [MongodbService],
})
export class MongodbModule {}
