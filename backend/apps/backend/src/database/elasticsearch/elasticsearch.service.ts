import { Client } from '@elastic/elasticsearch';
import { Injectable, OnModuleInit } from '@nestjs/common';

export interface CreateArticleDto {
  title: string;
  content: string;
  author: string;
  category: string;
  tags?: string[];
  publishedDate?: Date;
}

export interface UpdateArticleDto {
  title?: string;
  content?: string;
  author?: string;
  category?: string;
  tags?: string[];
  publishedDate?: Date;
}

@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private client: Client;
  private readonly indexName = 'articles';

  async onModuleInit() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
    });

    try {
      await this.createIndexIfNotExists();
      console.log('Elasticsearch connection established');
    } catch (error) {
      console.error('Elasticsearch connection failed:', error);
    }
  }

  private async createIndexIfNotExists() {
    const exists = await this.client.indices.exists({ index: this.indexName });

    if (!exists) {
      await this.client.indices.create({
        index: this.indexName,
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard' },
            content: { type: 'text', analyzer: 'standard' },
            author: { type: 'keyword' },
            category: { type: 'keyword' },
            tags: { type: 'keyword' },
            publishedDate: { type: 'date' },
            createdAt: { type: 'date' },
          },
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      });
    }
  }

  // CREATE - Index a new article
  async indexArticle(createArticleDto: CreateArticleDto): Promise<any> {
    const response = await this.client.index({
      index: this.indexName,
      document: {
        ...createArticleDto,
        publishedDate: createArticleDto.publishedDate || new Date(),
        createdAt: new Date(),
      },
    });

    return {
      id: response._id,
      result: response.result,
    };
  }

  // READ - Get article by ID
  async getArticleById(id: string): Promise<any> {
    try {
      const response = await this.client.get({
        index: this.indexName,
        id,
      });

      return {
        id: response._id,
        ...(response._source as any),
      };
    } catch (error) {
      return null;
    }
  }

  // UPDATE - Update article
  async updateArticle(
    id: string,
    updateArticleDto: UpdateArticleDto,
  ): Promise<any> {
    const response = await this.client.update({
      index: this.indexName,
      id,
      doc: updateArticleDto,
    });

    return {
      id: response._id,
      result: response.result,
    };
  }

  // DELETE - Delete article
  async deleteArticle(id: string): Promise<any> {
    const response = await this.client.delete({
      index: this.indexName,
      id,
    });

    return {
      id: response._id,
      result: response.result,
    };
  }

  // SEARCH - Full-text match query
  async searchByMatch(field: string, query: string): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      query: {
        match: {
          [field]: query,
        },
      },
    });

    return {
      total: response.hits.total,
      hits: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
    };
  }

  // SEARCH - Multi-match query (search across multiple fields)
  async searchMultiMatch(query: string, fields: string[]): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      query: {
        multi_match: {
          query,
          fields,
        },
      },
    });

    return {
      total: response.hits.total,
      hits: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
    };
  }

  // SEARCH - Range query
  async searchByDateRange(startDate: Date, endDate: Date): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      query: {
        range: {
          publishedDate: {
            gte: startDate.toISOString(),
            lte: endDate.toISOString(),
          },
        },
      },
      sort: [{ publishedDate: { order: 'desc' } }],
    });

    return {
      total: response.hits.total,
      hits: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
    };
  }

  // SEARCH - Bool query (combining multiple conditions)
  async searchWithBoolQuery(params: {
    mustMatch?: { field: string; value: string }[];
    shouldMatch?: { field: string; value: string }[];
    mustNotMatch?: { field: string; value: string }[];
    filterTerms?: { field: string; value: string }[];
  }): Promise<any> {
    const boolQuery: any = {};

    if (params.mustMatch) {
      boolQuery.must = params.mustMatch.map((item) => ({
        match: { [item.field]: item.value },
      }));
    }

    if (params.shouldMatch) {
      boolQuery.should = params.shouldMatch.map((item) => ({
        match: { [item.field]: item.value },
      }));
    }

    if (params.mustNotMatch) {
      boolQuery.must_not = params.mustNotMatch.map((item) => ({
        match: { [item.field]: item.value },
      }));
    }

    if (params.filterTerms) {
      boolQuery.filter = params.filterTerms.map((item) => ({
        term: { [item.field]: item.value },
      }));
    }

    const response = await this.client.search({
      index: this.indexName,
      query: {
        bool: boolQuery,
      },
    });

    return {
      total: response.hits.total,
      hits: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
    };
  }

  // SEARCH - Term query (exact match on keyword fields)
  async searchByTerm(field: string, value: string): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      query: {
        term: {
          [field]: value,
        },
      },
    });

    return {
      total: response.hits.total,
      hits: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
    };
  }

  // AGGREGATION - Get statistics by category
  async aggregateByCategory(): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      size: 0,
      aggs: {
        categories: {
          terms: {
            field: 'category',
            size: 10,
          },
        },
      },
    });

    return response.aggregations;
  }

  // AGGREGATION - Get statistics by author
  async aggregateByAuthor(): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      size: 0,
      aggs: {
        authors: {
          terms: {
            field: 'author',
            size: 10,
          },
        },
      },
    });

    return response.aggregations;
  }

  // AGGREGATION - Date histogram (articles by month)
  async aggregateByMonth(): Promise<any> {
    const response = await this.client.search({
      index: this.indexName,
      size: 0,
      aggs: {
        articles_over_time: {
          date_histogram: {
            field: 'publishedDate',
            calendar_interval: 'month',
          },
        },
      },
    });

    return response.aggregations;
  }

  // SEARCH - Complex query with filters, aggregations, and sorting
  async advancedSearch(params: {
    searchText?: string;
    category?: string;
    author?: string;
    startDate?: Date;
    endDate?: Date;
    tags?: string[];
    page?: number;
    pageSize?: number;
  }): Promise<any> {
    const must: any[] = [];
    const filter: any[] = [];

    if (params.searchText) {
      must.push({
        multi_match: {
          query: params.searchText,
          fields: ['title^2', 'content'],
        },
      });
    }

    if (params.category) {
      filter.push({ term: { category: params.category } });
    }

    if (params.author) {
      filter.push({ term: { author: params.author } });
    }

    if (params.startDate || params.endDate) {
      const rangeQuery: any = {};
      if (params.startDate) {
        rangeQuery.gte = params.startDate.toISOString();
      }
      if (params.endDate) {
        rangeQuery.lte = params.endDate.toISOString();
      }
      filter.push({ range: { publishedDate: rangeQuery } });
    }

    if (params.tags && params.tags.length > 0) {
      filter.push({ terms: { tags: params.tags } });
    }

    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const from = (page - 1) * pageSize;

    const response = await this.client.search({
      index: this.indexName,
      from,
      size: pageSize,
      query: {
        bool: {
          must: must.length > 0 ? must : undefined,
          filter: filter.length > 0 ? filter : undefined,
        },
      },
      sort: [{ publishedDate: { order: 'desc' } }],
      aggs: {
        categories: {
          terms: { field: 'category' },
        },
        authors: {
          terms: { field: 'author' },
        },
      },
    });

    return {
      total: response.hits.total,
      page,
      pageSize,
      hits: response.hits.hits.map((hit: any) => ({
        id: hit._id,
        score: hit._score,
        ...hit._source,
      })),
      aggregations: response.aggregations,
    };
  }

  // Bulk index multiple articles
  async bulkIndexArticles(articles: CreateArticleDto[]): Promise<any> {
    const body = articles.flatMap((article) => [
      { index: { _index: this.indexName } },
      {
        ...article,
        publishedDate: article.publishedDate || new Date(),
        createdAt: new Date(),
      },
    ]);

    const response = await this.client.bulk({ body });

    return {
      took: response.took,
      errors: response.errors,
      items: response.items.length,
    };
  }
}
