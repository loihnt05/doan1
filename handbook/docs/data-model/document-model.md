---
sidebar_position: 3
---
# Document Model (MongoDB + Mongoose)

The document model stores data in flexible, JSON-like documents. Each document can have its own structure, making it ideal for evolving schemas and hierarchical data.

## When to Use

-  Flexible or evolving schemas
-  Hierarchical or nested data structures
-  High write throughput requirements
-  Horizontal scaling needs
-  Rapid development and iteration

## Example: Article Management

### Schema Definition

```typescript
import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Article {
  @Prop({ required: true, trim: true, minlength: 5, maxlength: 200 })
  title: string;

  @Prop({
    required: true,
    enum: ['Technology', 'Health', 'Finance', 'Education', 'Entertainment'],
  })
  category: string;

  @Prop({ default: '' })
  content: string;

  @Prop({ default: 0, min: 0 })
  views: number;

  @Prop({ default: true })
  published: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ArticleSchema = SchemaFactory.createForClass(Article);
```

## Key Concepts

### 1. Validation Rules

Mongoose provides built-in validation:

```typescript
@Prop({ 
  required: true,           // Field is mandatory
  trim: true,              // Remove whitespace
  minlength: 5,            // Minimum length
  maxlength: 200,          // Maximum length
})
title: string;

@Prop({
  required: true,
  enum: ['Technology', 'Health', 'Finance', 'Education', 'Entertainment'],
})
category: string;

@Prop({ 
  default: 0,              // Default value
  min: 0,                  // Minimum value
})
views: number;
```

### 2. Default Values

```typescript
@Prop({ default: '' })
content: string;

@Prop({ default: 0, min: 0 })
views: number;

@Prop({ default: true })
published: boolean;

@Prop({ type: [String], default: [] })
tags: string[];

@Prop({ type: Date, default: Date.now })
createdAt: Date;
```

### 3. Indexes

Multiple types of indexes for optimization:

```typescript
// Single field index
ArticleSchema.index({ category: 1 });

// Descending index
ArticleSchema.index({ createdAt: -1 });

// Full-text search index
ArticleSchema.index({ title: 'text' });

// Compound index
ArticleSchema.index({ category: 1, createdAt: -1 });
```

### 4. Virtual Fields (Computed Properties)

```typescript
ArticleSchema.virtual('summary').get(function () {
  return this.content ? this.content.substring(0, 100) + '...' : '';
});

// Enable in JSON output
ArticleSchema.set('toJSON', { virtuals: true });
ArticleSchema.set('toObject', { virtuals: true });
```

### 5. NoSQL Query Patterns

**Simple queries:**

```typescript
// Find by category
async findArticlesByCategory(category: string): Promise<Article[]> {
  return this.articleModel
    .find({ category })
    .sort({ createdAt: -1 })
    .exec();
}

// Find published articles
async findPublishedArticles(): Promise<Article[]> {
  return this.articleModel
    .find({ published: true })
    .sort({ views: -1 })
    .exec();
}
```

**Complex queries with multiple conditions:**

```typescript
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
```

**Full-text search:**

```typescript
async searchArticles(searchTerm: string): Promise<Article[]> {
  return this.articleModel
    .find({ $text: { $search: searchTerm } })
    .exec();
}
```

### 6. Aggregation Pipeline

Powerful data processing and transformation:

```typescript
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
```

**Advanced aggregation - Statistics by month:**

```typescript
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
      },
    },
  ]);
}
```

### 7. Update Operators

MongoDB provides powerful update operators:

**$inc - Increment a value:**

```typescript
async incrementViews(id: string): Promise<Article | null> {
  return this.articleModel
    .findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true },
    )
    .exec();
}
```

**$addToSet - Add to array (if not exists):**

```typescript
async addTag(id: string, tag: string): Promise<Article | null> {
  return this.articleModel
    .findByIdAndUpdate(
      id,
      { $addToSet: { tags: tag } },
      { new: true },
    )
    .exec();
}
```

**$pull - Remove from array:**

```typescript
async removeTag(id: string, tag: string): Promise<Article | null> {
  return this.articleModel
    .findByIdAndUpdate(
      id,
      { $pull: { tags: tag } },
      { new: true },
    )
    .exec();
}
```

## API Endpoints

```
POST   /mongodb/articles                     - Create article
GET    /mongodb/articles                     - Get all articles
GET    /mongodb/articles/:id                 - Get article by ID
PUT    /mongodb/articles/:id                 - Update article
DELETE /mongodb/articles/:id                 - Delete article
GET    /mongodb/articles/category/:category  - Get by category
GET    /mongodb/articles/published           - Get published articles
GET    /mongodb/articles/search?q=...        - Full-text search
GET    /mongodb/articles/aggregate/by-category - Group by category
GET    /mongodb/articles/top?limit=10        - Top articles by views
PATCH  /mongodb/articles/:id/increment-views - Increment view count
PATCH  /mongodb/articles/:id/tags/add        - Add tag
PATCH  /mongodb/articles/:id/tags/remove     - Remove tag
```

## Best Practices

1. **Design for your queries** - Structure documents based on how you'll query them
2. **Embed related data** - Store frequently accessed data together
3. **Use indexes strategically** - Index fields used in queries and sorts
4. **Validate data** - Use schema validation to ensure data quality
5. **Limit document size** - Keep documents under 16MB
6. **Use aggregation pipeline** - For complex data transformations
7. **Handle arrays carefully** - Avoid unbounded array growth

## Indexing Strategy

```typescript
// Single field - for exact match queries
ArticleSchema.index({ category: 1 });

// Compound - for multi-field queries
ArticleSchema.index({ category: 1, createdAt: -1 });

// Text - for full-text search
ArticleSchema.index({ title: 'text', content: 'text' });

// Descending - for reverse sorted queries
ArticleSchema.index({ createdAt: -1 });
```
