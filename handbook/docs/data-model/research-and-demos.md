# Data Model & Query Language - Demo và Triển Khai

Tài liệu mô tả các phần demo thực tế cho các mô hình dữ liệu và ngôn ngữ truy vấn.

## Công nghệ sử dụng

- **Relational DB**: PostgreSQL + Sequelize ORM
- **Document DB**: MongoDB + Mongoose ODM
- **Graph DB**: Neo4j + Neo4j Driver
- **Search Engine**: Elasticsearch + @elastic/elasticsearch
- **Backend Framework**: NestJS
- **Polyglot Persistence**: Sử dụng đồng thời nhiều database

## Các Phần Demo

### Demo 1: Relational Model - PostgreSQL với Sequelize

**Công nghệ**: PostgreSQL + Sequelize ORM + TypeScript decorators

**Cách triển khai**:
- Định nghĩa bảng dữ liệu như định nghĩa một class TypeScript với các decorator đặc biệt
- Mỗi cột trong bảng được khai báo với kiểu dữ liệu rõ ràng (số nguyên, chuỗi, ngày tháng)
- Tạo chỉ mục (index) để tìm kiếm nhanh hơn, giống như mục lục trong sách
- Khi gọi các hàm TypeScript, Sequelize tự động chuyển thành câu lệnh SQL để thực thi
- Có thể gom nhiều thao tác thành một giao dịch (transaction), nếu một bước lỗi thì tất cả đều huỷ bỏ
- Thời gian tạo và cập nhật được tự động ghi lại mỗi khi thay đổi dữ liệu
- Các quy tắc kiểm tra dữ liệu (validation) được viết ngay trong định nghĩa model

**Cách test**:
- POST `/sequelize/users` để tạo user mới với name và age
- GET `/sequelize/users` để lấy tất cả users, verify response là array
- GET `/sequelize/users/:id` để lấy user theo ID, check các fields đúng type
- PUT `/sequelize/users/:id` để update user, verify updatedAt timestamp thay đổi
- DELETE `/sequelize/users/:id` để xóa user, verify cascade delete nếu có relationships
- Test query performance: tạo 10,000 users, so sánh query với/không có index trên age field
- Check database với psql: `\d users` để xem schema, `\di` để xem indexes
- Test transactions: update multiple records, rollback nếu có lỗi, verify data consistency

---

### Demo 2: Document Model - MongoDB với Mongoose

**Công nghệ**: MongoDB + Mongoose ODM + Schema decorators

**Cách triển khai**:
- Định nghĩa cấu trúc dữ liệu linh hoạt như một bản thiết kế, không bắt buộc chặt chẽ
- Mỗi document (bản ghi) có thể có cấu trúc hơi khác nhau, rất linh hoạt
- Quy tắc kiểm tra viết ngay trong khai báo: bắt buộc phải có, độ dài tối thiểu/tối đa, giá trị hợp lệ
- Các giá trị mặc định được thiết lập sẵn nếu không truyền vào
- Có thể lồng dữ liệu bên trong (như mảng tags, danh sách comments) một cách tự nhiên
- Tạo chỉ mục để tìm kiếm nhanh, khai báo ngay trong schema
- Tự động lưu thời gian tạo và cập nhật khi bật tính năng timestamps
- Có thể chạy các hàm tự động trước/sau khi lưu hoặc xóa dữ liệu

**Cách test**:
- POST `/mongodb/articles` với title, category, content, tags array
- Verify validation: POST với title < 5 chars → 400 Bad Request
- POST với category không trong enum → 400 Bad Request
- GET `/mongodb/articles` để list all, verify tags là array, views default = 0
- PUT `/mongodb/articles/:id` để update, chỉ update fields được truyền (partial update)
- Test partial updates: chỉ update views field, verify các fields khác unchanged
- POST với missing required fields → validation error với message rõ ràng
- Test flexible schema: thêm field mới không có trong schema vào document
- Query với filters: GET với query params `?category=Technology&published=true`
- Check MongoDB với mongo shell: `db.articles.find()`, `db.articles.stats()` để xem collection info

---

### Demo 3: Graph Model - Neo4j với Cypher Query Language

**Công nghệ**: Neo4j + Neo4j Driver + Cypher query language

**Cách triển khai**:
- Các điểm (nodes) đại diện cho đối tượng thực (User), có nhãn và các thuộc tính
- Các mối quan hệ (relationships) thể hiện kết nối giữa các điểm, cũng có thể chứa thông tin
- Viết câu truy vấn bằng ngôn ngữ Cypher giống như mô tả bằng lời: tìm cái gì, điều kiện, trả về kết quả gì
- Dùng CREATE để tạo mới, MATCH để tìm kiếm dữ liệu
- Tìm kiếm theo mẫu: tìm tất cả bạn bè của một người bằng cách match pattern
- Có thể duyệt theo chiều sâu: tìm bạn của bạn qua 1, 2, hoặc 3 bước kết nối
- Đếm số lượng hoặc gom nhóm kết quả với các hàm tổng hợp
- Tạo chỉ mục trên các thuộc tính để tìm kiếm nhanh hơn
- Quan hệ hai chiều: tạo 2 mối quan hệ ngược nhau cho mối quan hệ bạn bè

**Cách test**:
- POST `/neo4j/users` để tạo nodes với name, email, age
- POST `/neo4j/friendships` với userId1 và userId2 để tạo FRIEND relationship
- GET `/neo4j/users/:id/friends` để lấy direct friends, verify return array of users
- GET `/neo4j/users/:id/friends-of-friends` để traverse 2 levels, tìm mutual connections
- Test recommendation: tìm friends of friends mà chưa là friend (potential friends)
- GET `/neo4j/users/:id/friend-count` để đếm số friends
- DELETE friendship để test unfollow, verify relationship removed
- Visualize trong Neo4j Browser: `MATCH (n) RETURN n` để xem graph
- Test complex query: shortest path giữa 2 users qua friendship network
- Performance: so sánh query friends-of-friends trong Neo4j vs SQL joins (Neo4j nhanh hơn nhiều)

---

### Demo 4: Search Model - Elasticsearch với Full-text Search

**Công nghệ**: Elasticsearch + @elastic/elasticsearch client + Lucene

**Cách triển khai**:
- Khai báo kiểu dữ liệu cho mỗi trường: text (phân tích từ), keyword (giữ nguyên), ngày tháng
- Trường text được xử lý: tách từ, chuyển chữ thường, bỏ từ dừng (a, the, is...)
- Trường keyword dùng để tìm chính xác, nhóm dữ liệu, sắp xếp
- Cài đặt index: chia nhỏ dữ liệu (shards) để mở rộng, tạo bản sao (replicas) để dự phòng
- Các loại tìm kiếm: tìm theo từ khóa, tìm chính xác, tìm theo khoảng, kết hợp nhiều điều kiện
- Tính điểm liên quan: tài liệu càng khớp với từ khóa càng có điểm cao
- Tổng hợp dữ liệu: nhóm theo danh mục, theo thời gian, tính min/max/trung bình
- Đưa nhiều tài liệu vào cùng lúc (bulk) để xử lý nhanh hơn
- Cập nhật bằng cách lưu lại tài liệu với cùng ID

**Cách test**:
- POST `/elasticsearch/articles` để index article với title, content, author, tags
- GET `/elasticsearch/articles/search/match?field=title&query=nodejs` → full-text search
- Verify relevance scoring: query "nodejs tutorial" → docs với cả 2 keywords ranked cao hơn
- GET `/elasticsearch/articles/search/multi-match?query=docker&fields=title,content` → search nhiều fields
- Test exact match: GET `/elasticsearch/articles/search/term?field=author&value=John` → keyword search
- Date range: GET với `gte=2024-01-01&lte=2024-12-31` → filter by published date
- Boolean query: combine must (AND), should (OR), must_not (NOT) conditions
- Test aggregations: GET `/elasticsearch/articles/aggregate/category` → count per category
- Bulk index: POST 1000 articles → check indexing time
- Check Elasticsearch: `GET /articles/_search` trong Dev Tools, verify mappings với `GET /articles/_mapping`

---

### Demo 5: Polyglot Persistence - Kết hợp nhiều databases

**Công nghệ**: Tất cả các databases trên được sử dụng đồng thời

**Cách triển khai**:
- Mỗi loại database dùng cho công việc phù hợp nhất với khả năng của nó
- PostgreSQL lưu dữ liệu giao dịch quan trọng: người dùng, đơn hàng, thanh toán (cần độ chính xác cao)
- MongoDB lưu nội dung linh hoạt: bài viết blog, catalog sản phẩm (cấu trúc hay thay đổi)
- Neo4j lưu dữ liệu quan hệ: kết nối xã hội, gợi ý kết bạn
- Elasticsearch dùng cho tìm kiếm và phân tích: tìm sản phẩm, phân tích log
- Đồng bộ dữ liệu: khi tạo user trong PostgreSQL, cũng đưa vào Elasticsearch để tìm kiếm
- Đồng bộ theo sự kiện: khi có thay đổi, gửi thông báo để các DB khác cập nhật
- Lớp API điều phối: lấy dữ liệu từ nhiều DB khác nhau rồi gộp lại trả về

**Cách test**:
- Create user flow: POST user → lưu PostgreSQL + index Elasticsearch + create node Neo4j
- Verify sync: check user tồn tại trong cả 3 databases với cùng ID
- Update user: PUT user → update tất cả databases, verify consistency
- Complex query: lấy user info (PostgreSQL) + friends (Neo4j) + recent posts (MongoDB)
- Search users: full-text search trong Elasticsearch, lấy details từ PostgreSQL
- Test failure scenario: PostgreSQL save thành công, Elasticsearch fail → verify rollback hoặc retry
- Performance: measure latency khi query single DB vs multiple DBs
- Data consistency: update user name ở một DB, verify eventual consistency ở các DB khác
- Monitoring: check logs để thấy queries đến từng database
- Test với large dataset: create 10k users, verify performance của cross-DB queries

---

### Demo 6: Query Optimization - Indexes và Performance

**Công nghệ**: Indexes trong tất cả databases

**Cách triển khai**:
- **PostgreSQL**: tạo chỉ mục trên các cột hay dùng để tìm kiếm và nối bảng
- **MongoDB**: tạo chỉ mục ghép nhiều trường cho câu truy vấn phức tạp
- **Neo4j**: tạo chỉ mục trên nhãn và thuộc tính của điểm để tìm nhanh hơn
- **Elasticsearch**: tự động tạo chỉ mục ngược cho các trường text, tối ưu tìm kiếm
- Phân tích cách thực thi: dùng EXPLAIN để xem database thực hiện truy vấn như thế nào
- Cột có nhiều giá trị khác nhau (email) hưởng lợi từ chỉ mục nhiều hơn cột ít giá trị (giới tính)
- Chỉ mục bao phủ: chứa đủ thông tin cần thiết, không cần đọc bảng gốc
- Bảo trì chỉ mục: xây dựng lại khi dữ liệu bị phân mảnh

**Cách test**:
- Tạo 100k users trong PostgreSQL không có index trên age
- Query `SELECT * FROM users WHERE age > 25` → measure time (~500ms)
- Add index: `CREATE INDEX idx_age ON users(age)` → query lại (~5ms)
- Check query plan: `EXPLAIN ANALYZE SELECT...` → verify index được sử dụng
- MongoDB: query articles by category không index → slow scan (~200ms)
- Add index: `db.articles.createIndex({category: 1})` → query lại (~2ms)
- Neo4j: MATCH users by email không index → scan tất cả nodes (~100ms)
- Add index: `CREATE INDEX ON :User(email)` → query lại (~1ms)
- Test compound index: query with 2 conditions, compare với separate indexes
- Monitor index size: indexes chiếm disk space, trade-off giữa speed và storage

---

### Demo 7: Transactions và ACID Properties

**Công nghệ**: PostgreSQL transactions, MongoDB transactions (replica set)

**Cách triển khai**:
- **PostgreSQL**: gom nhiều thao tác vào một giao dịch với BEGIN (bắt đầu), COMMIT (xác nhận), ROLLBACK (huỷ bỏ)
- **Sequelize**: dùng hàm transaction() để quản lý giao dịch tự động
- **MongoDB**: cần cài đặt replica set (nhiều server) mới dùng được transaction
- **Tính chất ACID**: Toàn vẹn (tất cả hoặc không), Nhất quán (trạng thái hợp lệ), Độc lập (không ảnh hưởng nhau), Bền vững (lưu lại)
- Mức độ cô lập: từ thấp (đọc được dữ liệu chưa commit) đến cao (hoàn toàn độc lập)
- Khóa lạc quan: dùng số phiên bản để phát hiện cập nhật đồng thời
- Khóa bi quan: khóa dòng dữ liệu để không ai khác sửa được

**Cách test**:
- Test atomicity: transaction transfer money từ account A sang B
- Deduct từ A, thêm vào B, rollback nếu insufficient funds
- Verify: nếu rollback, cả 2 accounts unchanged
- Test isolation: 2 concurrent transactions update cùng row
- Without locks: race condition, lost update
- With locks: second transaction waits, sequential execution
- MongoDB multi-document transaction: update user và create activity log
- Rollback if activity log fails → user update also rollback
- Test với intentional errors: throw error giữa transaction → verify rollback
- Performance: transactions có overhead, measure latency với/không có transaction

---

### Demo 8: Data Modeling Patterns

**Công nghệ**: Best practices cho mỗi database type

**Cách triển khai**:
- **Chuẩn hóa quan hệ**: tách dữ liệu thành nhiều bảng để tránh lặp lại (các chuẩn 1, 2, 3)
- **Phi chuẩn hóa**: lưu trùng dữ liệu để giảm việc nối bảng, đọc nhanh hơn
- **Nhúng tài liệu**: lồng dữ liệu liên quan vào cùng một tài liệu (comments trong bài post)
- **Tham chiếu tài liệu**: chỉ lưu ID để liên kết, tránh lồng quá sâu
- **Mô hình đồ thị**: đối tượng là điểm, mối quan hệ là cạnh nối, cả hai đều có thuộc tính
- **Phi chuẩn hóa Elasticsearch**: lưu tất cả dữ liệu cần tìm vào một tài liệu (không nối)
- Các mẫu thiết kế: một-nhiều, nhiều-nhiều dùng bảng trung gian/mảng/cạnh nối

**Cách test**:
- Design blog system: normalized với separate tables (users, posts, comments) vs denormalized
- Query performance: join 3 tables vs read single denormalized document
- MongoDB: post với embedded comments vs post với comment IDs (references)
- Test với 1000 comments: embedded → large document, slow reads; references → fast reads, multiple queries
- Neo4j: social network với user nodes và FOLLOWS relationships
- Query followers: simple pattern match vs JOIN queries trong SQL (Neo4j đơn giản hơn)
- Update pattern: normalized → update once; denormalized → update multiple places
- Trade-offs: read vs write performance, consistency vs flexibility

---

### Demo 9: Aggregation và Analytics

**Công nghệ**: Aggregation pipelines trong mỗi database

**Cách triển khai**:
- **PostgreSQL**: nhóm dữ liệu với GROUP BY, dùng hàm đếm, tính tổng, trung bình, max, min
- **MongoDB**: chuỗi xử lý dữ liệu qua nhiều bước: lọc, nhóm, chọn trường, sắp xếp, giới hạn
- **Neo4j**: dùng các hàm đếm và gom nhóm trong câu lệnh RETURN của Cypher
- **Elasticsearch**: tổng hợp theo nhóm, tính thống kê, biểu đồ theo thời gian, tổng hợp lồng nhau
- Hàm cửa sổ trong SQL: đánh số thứ tự, xếp hạng, tính tổng cộng dồn
- Tối ưu pipeline: lọc sớm (ở bước đầu), giảm lượng dữ liệu qua mỗi bước

**Cách test**:
- PostgreSQL: tính total sales per month với GROUP BY và SUM
- Verify results: check manual calculation vs query results
- MongoDB: aggregate articles by category với count và average views
- Pipeline: `{$group: {_id: "$category", count: {$sum: 1}, avgViews: {$avg: "$views"}}}`
- Neo4j: count connections per user với pattern match và aggregation
- Elasticsearch: date histogram của articles per day với terms aggregation by category
- Complex aggregation: top 10 authors với most articles và highest total views
- Performance: aggregation trên 1M documents, measure query time
- Compare approaches: SQL GROUP BY vs MongoDB pipeline vs Elasticsearch aggs

---

### Demo 10: Migration và Schema Evolution

**Công nghệ**: Migration tools cho mỗi database

**Cách triển khai**:
- **Sequelize**: tạo file migration với hàm up() (thực hiện) và down() (hoàn tác)
- **MongoDB**: không có schema cứng nhắc, thêm trường mới không cần migration
- **Neo4j**: viết script Cypher để thêm ràng buộc, chỉ mục, đổi tên thuộc tính
- **Elasticsearch**: tạo index mới với mapping cập nhật, sau đó di chuyển dữ liệu qua
- Quản lý phiên bản: các file migration được đánh số thứ tự trong version control
- Khả năng quay lại: dùng hàm down() để hoàn tác thay đổi khi cần
- Migration không gián đoạn: thay đổi tương thích ngược, triển khai từng bước

**Cách test**:
- Sequelize: tạo migration add column `email` to users table
- Run `npm run migrate` → verify column added trong database
- Rollback: `npm run migrate:undo` → verify column removed
- MongoDB: add new field `bio` to users collection
- Insert document với bio → success; old documents không có bio → still valid
- Neo4j: migration script change relationship type từ LIKES sang FAVORITES
- Match old relationships, create new type, delete old
- Elasticsearch: change field type từ keyword sang text
- Cannot update mapping in-place → create new index, reindex data, switch alias
- Test với production-like data: large dataset, measure migration time
- Verify data integrity: count before/after, check sample records

---

## Setup và Chạy Demo

**PostgreSQL installation**:
```bash
# Docker
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=testdb \
  -p 5432:5432 postgres:15

# Verify
psql -h localhost -U postgres -d testdb
```

**MongoDB installation**:
```bash
# Docker
docker run -d --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7

# Verify
mongosh mongodb://admin:password@localhost:27017
```

**Neo4j installation**:
```bash
# Docker
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:5

# Access browser: http://localhost:7474
```

**Elasticsearch installation**:
```bash
# Docker
docker run -d --name elasticsearch \
  -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  docker.elastic.co/elasticsearch/elasticsearch:8.11.0

# Verify
curl http://localhost:9200
```

**Dependencies cần cài đặt**:
```
# Sequelize và PostgreSQL
pnpm install sequelize sequelize-typescript pg pg-hstore
pnpm install @nestjs/sequelize

# Mongoose và MongoDB
pnpm install mongoose @nestjs/mongoose
pnpm install @types/mongoose

# Neo4j
pnpm install neo4j-driver

# Elasticsearch
pnpm install @elastic/elasticsearch @nestjs/elasticsearch
```

**Environment variables**:
```bash
# PostgreSQL
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=testdb

# MongoDB
MONGODB_URI=mongodb://admin:password@localhost:27017/testdb?authSource=admin

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# Elasticsearch
ELASTICSEARCH_NODE=http://localhost:9200
```

**NestJS module setup**:
```typescript
// PostgreSQL
SequelizeModule.forRoot({
  dialect: 'postgres',
  host: process.env.DATABASE_HOST,
  port: +process.env.DATABASE_PORT,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  autoLoadModels: true,
  synchronize: true, // dev only
})

// MongoDB
MongooseModule.forRoot(process.env.MONGODB_URI)

// Neo4j - custom provider
{
  provide: 'NEO4J_DRIVER',
  useFactory: () => {
    return neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
    )
  }
}

// Elasticsearch
ElasticsearchModule.register({
  node: process.env.ELASTICSEARCH_NODE
})
```

**Khởi động ứng dụng**:
```bash
# Start all databases
docker-compose up -d

# Run migrations
npm run migrate

# Start NestJS
cd backend
pnpm run start:dev

# Verify services
curl http://localhost:3000/health
```

**Testing endpoints**:
- PostgreSQL: `/sequelize/users`, `/sequelize/posts`
- MongoDB: `/mongodb/articles`, `/mongodb/products`
- Neo4j: `/neo4j/users`, `/neo4j/friendships`
- Elasticsearch: `/elasticsearch/articles/search`

**Database GUI tools**:
- **PostgreSQL**: pgAdmin, DBeaver, TablePlus
- **MongoDB**: MongoDB Compass, Studio 3T
- **Neo4j**: Neo4j Browser (http://localhost:7474)
- **Elasticsearch**: Kibana, Elasticvue, Dev Tools

**Query examples**:
```bash
# PostgreSQL
psql -h localhost -U postgres -d testdb -c "SELECT * FROM users;"

# MongoDB
mongosh --eval "db.articles.find().pretty()"

# Neo4j Cypher
cypher-shell -u neo4j -p password "MATCH (n) RETURN count(n);"

# Elasticsearch
curl -X GET "localhost:9200/articles/_search?pretty"
```

**Performance benchmarking**:
```bash
# Sequelize query performance
npm run benchmark:sequelize

# MongoDB aggregation performance
npm run benchmark:mongodb

# Neo4j traversal performance
npm run benchmark:neo4j

# Elasticsearch search performance
npm run benchmark:elasticsearch
```

**Monitoring và debugging**:
- Enable query logging trong mỗi database config
- Monitor slow queries với EXPLAIN/explain()
- Check database metrics: connections, query time, index usage
- Use APM tools: New Relic, DataDog để track cross-DB queries
