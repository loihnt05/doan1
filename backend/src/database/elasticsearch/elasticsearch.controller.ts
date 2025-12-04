import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  CreateArticleDto,
  UpdateArticleDto,
} from './elasticsearch.service';
import { ElasticsearchService } from './elasticsearch.service';

@Controller('elasticsearch/articles')
export class ElasticsearchController {
  constructor(private readonly elasticsearchService: ElasticsearchService) {}

  @Post()
  async indexArticle(@Body() createArticleDto: CreateArticleDto) {
    return this.elasticsearchService.indexArticle(createArticleDto);
  }

  @Post('bulk')
  async bulkIndexArticles(@Body() articles: CreateArticleDto[]) {
    return this.elasticsearchService.bulkIndexArticles(articles);
  }

  @Get(':id')
  async getArticleById(@Param('id') id: string) {
    return this.elasticsearchService.getArticleById(id);
  }

  @Put(':id')
  async updateArticle(
    @Param('id') id: string,
    @Body() updateArticleDto: UpdateArticleDto,
  ) {
    return this.elasticsearchService.updateArticle(id, updateArticleDto);
  }

  @Delete(':id')
  async deleteArticle(@Param('id') id: string) {
    return this.elasticsearchService.deleteArticle(id);
  }

  @Get('search/match')
  async searchByMatch(
    @Query('field') field: string,
    @Query('query') query: string,
  ) {
    return this.elasticsearchService.searchByMatch(field, query);
  }

  @Get('search/multi-match')
  async searchMultiMatch(
    @Query('query') query: string,
    @Query('fields') fields: string,
  ) {
    const fieldsArray = fields.split(',');
    return this.elasticsearchService.searchMultiMatch(query, fieldsArray);
  }

  @Get('search/range')
  async searchByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.elasticsearchService.searchByDateRange(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('search/term')
  async searchByTerm(
    @Query('field') field: string,
    @Query('value') value: string,
  ) {
    return this.elasticsearchService.searchByTerm(field, value);
  }

  @Post('search/bool')
  async searchWithBoolQuery(
    @Body()
    params: {
      mustMatch?: { field: string; value: string }[];
      shouldMatch?: { field: string; value: string }[];
      mustNotMatch?: { field: string; value: string }[];
      filterTerms?: { field: string; value: string }[];
    },
  ) {
    return this.elasticsearchService.searchWithBoolQuery(params);
  }

  @Get('search/advanced')
  async advancedSearch(
    @Query('searchText') searchText?: string,
    @Query('category') category?: string,
    @Query('author') author?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.elasticsearchService.advancedSearch({
      searchText,
      category,
      author,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      tags: tags ? tags.split(',') : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  @Get('aggregate/by-category')
  async aggregateByCategory() {
    return this.elasticsearchService.aggregateByCategory();
  }

  @Get('aggregate/by-author')
  async aggregateByAuthor() {
    return this.elasticsearchService.aggregateByAuthor();
  }

  @Get('aggregate/by-month')
  async aggregateByMonth() {
    return this.elasticsearchService.aggregateByMonth();
  }
}
