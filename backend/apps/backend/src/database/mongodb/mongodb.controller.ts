import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Patch,
} from '@nestjs/common';
import { MongodbService } from './mongodb.service';
import type { CreateArticleDto, UpdateArticleDto } from './mongodb.service';

@Controller('mongodb/articles')
export class MongodbController {
  constructor(private readonly mongodbService: MongodbService) {}

  @Post()
  async createArticle(@Body() createArticleDto: CreateArticleDto) {
    return this.mongodbService.createArticle(createArticleDto);
  }

  @Get()
  async getAllArticles() {
    return this.mongodbService.findAllArticles();
  }

  @Get('category/:category')
  async getArticlesByCategory(@Param('category') category: string) {
    return this.mongodbService.findArticlesByCategory(category);
  }

  @Get('published')
  async getPublishedArticles() {
    return this.mongodbService.findPublishedArticles();
  }

  @Get('top')
  async getTopArticles(@Query('limit') limit?: string) {
    return this.mongodbService.getTopArticles(limit ? parseInt(limit) : 10);
  }

  @Get('search')
  async searchArticles(@Query('q') searchTerm: string) {
    return this.mongodbService.searchArticles(searchTerm);
  }

  @Get('filter')
  async filterArticles(
    @Query('category') category?: string,
    @Query('minViews') minViews?: string,
    @Query('tags') tags?: string,
  ) {
    const tagsArray = tags ? tags.split(',') : undefined;
    return this.mongodbService.findArticlesWithFilters(
      category,
      minViews ? parseInt(minViews) : undefined,
      tagsArray,
    );
  }

  @Get('aggregate/by-category')
  async aggregateByCategory() {
    return this.mongodbService.aggregateArticlesByCategory();
  }

  @Get('aggregate/by-month')
  async aggregateByMonth() {
    return this.mongodbService.getArticleStatsByMonth();
  }

  @Get('aggregate/count-by-category')
  async countByCategory() {
    return this.mongodbService.getArticleCountByCategory();
  }

  @Get(':id')
  async getArticleById(@Param('id') id: string) {
    return this.mongodbService.findArticleById(id);
  }

  @Put(':id')
  async updateArticle(
    @Param('id') id: string,
    @Body() updateArticleDto: UpdateArticleDto,
  ) {
    return this.mongodbService.updateArticle(id, updateArticleDto);
  }

  @Delete(':id')
  async deleteArticle(@Param('id') id: string) {
    return this.mongodbService.deleteArticle(id);
  }

  @Patch(':id/increment-views')
  async incrementViews(@Param('id') id: string) {
    return this.mongodbService.incrementViews(id);
  }

  @Patch(':id/tags/add')
  async addTag(@Param('id') id: string, @Body('tag') tag: string) {
    return this.mongodbService.addTag(id, tag);
  }

  @Patch(':id/tags/remove')
  async removeTag(@Param('id') id: string, @Body('tag') tag: string) {
    return this.mongodbService.removeTag(id, tag);
  }
}
