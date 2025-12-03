import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Article, ArticleDocument } from './article.schema';

export interface CreateArticleDto {
  title: string;
  category: string;
  content?: string;
  tags?: string[];
  published?: boolean;
}

export interface UpdateArticleDto {
  title?: string;
  category?: string;
  content?: string;
  tags?: string[];
  published?: boolean;
}

@Injectable()
export class MongodbService {
  constructor(
    @InjectModel(Article.name)
    private articleModel: Model<ArticleDocument>,
  ) {}

  // CREATE - Create a new article
  async createArticle(createArticleDto: CreateArticleDto): Promise<Article> {
    const article = new this.articleModel(createArticleDto);
    return article.save();
  }

  // READ - Get all articles
  async findAllArticles(): Promise<Article[]> {
    return this.articleModel.find().exec();
  }

  // READ - Get article by ID
  async findArticleById(id: string): Promise<Article | null> {
    return this.articleModel.findById(id).exec();
  }

  // UPDATE - Update article
  async updateArticle(
    id: string,
    updateArticleDto: UpdateArticleDto,
  ): Promise<Article | null> {
    return this.articleModel
      .findByIdAndUpdate(id, updateArticleDto, { new: true })
      .exec();
  }

  // DELETE - Delete article
  async deleteArticle(id: string): Promise<Article | null> {
    return this.articleModel.findByIdAndDelete(id).exec();
  }

  // NOSQL QUERY EXAMPLES

  // Find articles by category
  async findArticlesByCategory(category: string): Promise<Article[]> {
    return this.articleModel.find({ category }).sort({ createdAt: -1 }).exec();
  }

  // Find published articles
  async findPublishedArticles(): Promise<Article[]> {
    return this.articleModel
      .find({ published: true })
      .sort({ views: -1 })
      .exec();
  }

  // Full-text search
  async searchArticles(searchTerm: string): Promise<Article[]> {
    return this.articleModel.find({ $text: { $search: searchTerm } }).exec();
  }

  // Complex query with multiple conditions
  async findArticlesWithFilters(
    category?: string,
    minViews?: number,
    tags?: string[],
  ): Promise<Article[]> {
    const query: any = {};

    if (category) {
      query.category = category;
    }

    if (minViews !== undefined) {
      query.views = { $gte: minViews };
    }

    if (tags && tags.length > 0) {
      query.tags = { $in: tags };
    }

    return this.articleModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  // AGGREGATION PIPELINE - Group articles by category
  async aggregateArticlesByCategory(): Promise<any[]> {
    return this.articleModel.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          avgViews: { $avg: '$views' },
          articles: { $push: { title: '$title', views: '$views' } },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);
  }

  // Advanced aggregation - Get statistics by category and month
  async getArticleStatsByMonth(): Promise<any[]> {
    return this.articleModel.aggregate([
      {
        $match: { published: true },
      },
      {
        $group: {
          _id: {
            category: '$category',
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
        },
      },
      {
        $sort: {
          '_id.year': -1,
          '_id.month': -1,
          '_id.category': 1,
        },
      },
    ]);
  }

  // Get top articles by views
  async getTopArticles(limit: number = 10): Promise<Article[]> {
    return this.articleModel
      .find({ published: true })
      .sort({ views: -1 })
      .limit(limit)
      .exec();
  }

  // Get articles count by category (using aggregation)
  async getArticleCountByCategory(): Promise<any[]> {
    return this.articleModel.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          _id: 0,
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);
  }

  // Increment view count
  async incrementViews(id: string): Promise<Article | null> {
    return this.articleModel
      .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
      .exec();
  }

  // Add tag to article
  async addTag(id: string, tag: string): Promise<Article | null> {
    return this.articleModel
      .findByIdAndUpdate(id, { $addToSet: { tags: tag } }, { new: true })
      .exec();
  }

  // Remove tag from article
  async removeTag(id: string, tag: string): Promise<Article | null> {
    return this.articleModel
      .findByIdAndUpdate(id, { $pull: { tags: tag } }, { new: true })
      .exec();
  }
}
