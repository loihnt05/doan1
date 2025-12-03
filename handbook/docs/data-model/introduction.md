---
sidebar_position: 1
---
# Giới thiệu về các Mô hình Dữ liệu

Phần này trình bày bốn mô hình dữ liệu cơ bản được sử dụng trong phát triển ứng dụng hiện đại. Mỗi mô hình được thiết kế để giải quyết các loại vấn đề cụ thể và xuất sắc trong các tình huống khác nhau.

## Tổng quan

Backend của chúng ta bao gồm:

1. **Mô hình Quan hệ** (PostgreSQL + Sequelize)
2. **Mô hình Tài liệu** (MongoDB + Mongoose)
3. **Mô hình Đồ thị** (Neo4j)
4. **Mô hình Tìm kiếm** (Elasticsearch)

## Tại sao cần nhiều Mô hình Dữ liệu?

Các mô hình dữ liệu khác nhau được tối ưu hóa cho các trường hợp sử dụng khác nhau:

- **Cơ sở dữ liệu quan hệ** xuất sắc trong việc xử lý dữ liệu có cấu trúc với các mối quan hệ phức tạp và giao dịch ACID
- **Cơ sở dữ liệu tài liệu** lý tưởng cho schema linh hoạt và dữ liệu phân cấp
- **Cơ sở dữ liệu đồ thị** hoàn hảo cho dữ liệu có nhiều kết nối và các truy vấn về mối quan hệ
- **Công cụ tìm kiếm** chuyên về tìm kiếm toàn văn bản và phân tích dữ liệu

## Polyglot Persistence (Lưu trữ đa ngôn ngữ)

Các ứng dụng hiện đại thường sử dụng nhiều cơ sở dữ liệu (polyglot persistence) để tận dụng điểm mạnh của từng mô hình. Cách tiếp cận này cho phép bạn:

- Chọn công cụ phù hợp cho từng trường hợp sử dụng cụ thể
- Tối ưu hóa hiệu suất và khả năng mở rộng
- Duy trì tính nhất quán của dữ liệu khi cần thiết đồng thời cho phép linh hoạt ở những nơi khác

## Bạn sẽ học được gì

Trong phần này, bạn sẽ học về:

- Nguyên tắc mô hình hóa dữ liệu cho từng loại cơ sở dữ liệu
- Khi nào nên sử dụng mỗi mô hình dữ liệu
- Các mẫu truy vấn và kỹ thuật tối ưu hóa
- Phương pháp hay nhất trong thiết kế schema
- Chiến lược đánh chỉ mục
- Ví dụ triển khai thực tế

Hãy cùng khám phá từng mô hình dữ liệu! 
