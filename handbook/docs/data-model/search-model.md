# Search Model (Elasticsearch)

Elasticsearch is a distributed search and analytics engine built on Apache Lucene. It excels at full-text search, real-time analytics, and handling large volumes of data.

## When to Use

- ✅ Full-text search requirements
- ✅ Real-time analytics and aggregations
- ✅ Log and event data analysis
- ✅ Complex filtering and faceting
- ✅ Autocomplete and suggestions
- ✅ Geospatial queries

## Example: Article Search

### Index Mapping

```typescript
await this.client.indices.create({
  index: 'articles',
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
```

## Key Concepts

### 1. Field Types

**Text vs Keyword:**
- `text`: Analyzed, for full-text search
- `keyword`: Not analyzed, for exact matches, aggregations, sorting

```typescript
title: { type: 'text', analyzer: 'standard' },     // Full-text search
author: { type: 'keyword' },                        // Exact match
publishedDate: { type: 'date' },                    // Date operations
```

### 2. Indexing Documents

**Single document:**

```typescript
async indexArticle(createArticleDto: CreateArticleDto): Promise<any> {
  const response = await this.client.index({
    index: 'articles',
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
```

**Bulk indexing:**

```typescript
async bulkIndexArticles(articles: CreateArticleDto[]): Promise<any> {
  const body = articles.flatMap((article) => [
    { index: { _index: 'articles' } },
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
```

### 3. Match Query (Full-Text Search)

Search with relevance scoring:

```typescript
async searchByMatch(field: string, query: string): Promise<any> {
  const response = await this.client.search({
    index: 'articles',
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
```

**Example:**
```json
{
  "query": {
    "match": {
      "title": "elasticsearch tutorial"
    }
  }
}
```

### 4. Multi-Match Query

Search across multiple fields:

```typescript
async searchMultiMatch(query: string, fields: string[]): Promise<any> {
  const response = await this.client.search({
    index: 'articles',
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
```

**Example:**
```json
{
  "query": {
    "multi_match": {
      "query": "database",
      "fields": ["title^2", "content"]  // title has 2x boost
    }
  }
}
```

### 5. Range Query

Filter by date or numeric ranges:

```typescript
async searchByDateRange(startDate: Date, endDate: Date): Promise<any> {
  const response = await this.client.search({
    index: 'articles',
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
      ...hit._source,
    })),
  };
}
```

**Example:**
```json
{
  "query": {
    "range": {
      "publishedDate": {
        "gte": "2024-01-01",
        "lte": "2024-12-31"
      }
    }
  }
}
```

### 6. Bool Query

Combine multiple conditions:

```typescript
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
    index: 'articles',
    query: {
      bool: boolQuery,
    },
  });

  return response;
}
```

**Bool query structure:**
- `must`: Documents MUST match (affects score)
- `should`: Documents SHOULD match (affects score)
- `must_not`: Documents MUST NOT match
- `filter`: Documents MUST match (doesn't affect score)

**Example:**
```json
{
  "query": {
    "bool": {
      "must": [
        { "match": { "content": "search" } }
      ],
      "filter": [
        { "term": { "category": "Technology" } }
      ],
      "should": [
        { "match": { "title": "elasticsearch" } }
      ],
      "must_not": [
        { "match": { "status": "draft" } }
      ]
    }
  }
}
```

### 7. Term Query (Exact Match)

For keyword fields:

```typescript
async searchByTerm(field: string, value: string): Promise<any> {
  const response = await this.client.search({
    index: 'articles',
    query: {
      term: {
        [field]: value,
      },
    },
  });

  return response;
}
```

**Example:**
```json
{
  "query": {
    "term": {
      "author": "John Smith"
    }
  }
}
```

### 8. Aggregations

Powerful analytics capabilities:

**Terms aggregation (group by):**

```typescript
async aggregateByCategory(): Promise<any> {
  const response = await this.client.search({
    index: 'articles',
    size: 0,  // Don't return documents, just aggregations
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
```

**Date histogram:**

```typescript
async aggregateByMonth(): Promise<any> {
  const response = await this.client.search({
    index: 'articles',
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
```

### 9. Advanced Search with Pagination

```typescript
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
        fields: ['title^2', 'content'],  // Title boosted 2x
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
    if (params.startDate) rangeQuery.gte = params.startDate.toISOString();
    if (params.endDate) rangeQuery.lte = params.endDate.toISOString();
    filter.push({ range: { publishedDate: rangeQuery } });
  }

  if (params.tags && params.tags.length > 0) {
    filter.push({ terms: { tags: params.tags } });
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 10;
  const from = (page - 1) * pageSize;

  const response = await this.client.search({
    index: 'articles',
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
      categories: { terms: { field: 'category' } },
      authors: { terms: { field: 'author' } },
    },
  });

  return {
    total: response.hits.total,
    page,
    pageSize,
    hits: response.hits.hits,
    aggregations: response.aggregations,
  };
}
```

## API Endpoints

```
POST   /elasticsearch/articles                - Index article
POST   /elasticsearch/articles/bulk           - Bulk index
GET    /elasticsearch/articles/:id            - Get by ID
PUT    /elasticsearch/articles/:id            - Update article
DELETE /elasticsearch/articles/:id            - Delete article
GET    /elasticsearch/articles/search/match   - Match query
GET    /elasticsearch/articles/search/multi-match - Multi-match query
GET    /elasticsearch/articles/search/range   - Date range query
GET    /elasticsearch/articles/search/term    - Exact term match
POST   /elasticsearch/articles/search/bool    - Bool query
GET    /elasticsearch/articles/search/advanced - Advanced search
GET    /elasticsearch/articles/aggregate/by-category - Category aggregation
GET    /elasticsearch/articles/aggregate/by-author - Author aggregation
GET    /elasticsearch/articles/aggregate/by-month - Date histogram
```

## Query DSL Examples

### Simple Search

```json
GET /articles/_search
{
  "query": {
    "match": {
      "title": "elasticsearch"
    }
  }
}
```

### Complex Bool Query

```json
GET /articles/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "content": "database" } }
      ],
      "filter": [
        { "term": { "category": "Technology" } },
        { "range": { "publishedDate": { "gte": "2024-01-01" } } }
      ],
      "should": [
        { "match": { "tags": "tutorial" } }
      ]
    }
  },
  "sort": [
    { "publishedDate": { "order": "desc" } }
  ],
  "from": 0,
  "size": 10
}
```

### Aggregation

```json
GET /articles/_search
{
  "size": 0,
  "aggs": {
    "categories": {
      "terms": {
        "field": "category",
        "size": 10
      },
      "aggs": {
        "avg_views": {
          "avg": {
            "field": "views"
          }
        }
      }
    }
  }
}
```

## Best Practices

1. **Use appropriate field types** - `text` for search, `keyword` for exact match
2. **Design mappings carefully** - Changing mappings requires reindexing
3. **Use bulk API** - For indexing multiple documents
4. **Leverage filters** - Filters are cacheable and faster
5. **Use pagination** - Limit result size with `from` and `size`
6. **Index optimization** - Use appropriate number of shards and replicas
7. **Monitor cluster health** - Keep track of cluster status
8. **Use aliases** - For zero-downtime reindexing

## Performance Tips

1. **Disable scoring when not needed:**
```json
{
  "query": {
    "bool": {
      "filter": [
        { "term": { "status": "published" } }
      ]
    }
  }
}
```

2. **Use source filtering:**
```json
{
  "_source": ["title", "author"],
  "query": { "match_all": {} }
}
```

3. **Limit result size:**
```json
{
  "size": 10,
  "query": { "match": { "title": "search" } }
}
```

## Trade-offs

**Advantages:**
- ✅ Excellent full-text search
- ✅ Real-time search and analytics
- ✅ Powerful aggregations
- ✅ Highly scalable
- ✅ RESTful API
- ✅ Rich ecosystem (Kibana, Logstash)

**Disadvantages:**
- ❌ Not suitable as primary database
- ❌ Eventual consistency
- ❌ Memory intensive
- ❌ Complex cluster management
- ❌ No ACID transactions
- ❌ Steep learning curve
