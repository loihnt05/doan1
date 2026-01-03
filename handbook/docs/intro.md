---
sidebar_position: 1
---

# Lời mở đầu

Chào mừng bạn. Đây là bản tóm lược tiếng Việt của toàn bộ triển khai trong thư mục `backend/`, giúp chúng ta bám sát hiện trạng code thay vì lý thuyết chung chung.

## Cách sử dụng nhanh
- Đọc [handbook](./handbook-intro.md) để nắm cấu trúc 0 → 10 (Runtime, Auth, Cache, Data, ...).
- Mỗi mục đều chỉ thẳng tới thư mục thực thi trong `backend/apps/*` hoặc `backend/libs/*`; mở file tương ứng để xem mã nguồn.
- Khi chỉnh sửa kiến trúc, cập nhật song song cả handbook lẫn code để giữ tính đồng bộ.

## Công cụ cần có
- Node.js v23.7 trở lên (trùng với môi trường backend).
- pnpm để quản lý package cho cả `backend/` và `handbook/`.
- Docker / Docker Compose nếu muốn tái hiện demo.

## Luồng làm việc gợi ý
1. Chạy `pnpm install` trong cả hai thư mục `backend/` và `handbook/`.
2. Khởi động tài liệu bằng `pnpm start` (Docusaurus) để xem bản cập nhật realtime.
3. Sau mỗi thay đổi kiến trúc, bổ sung mục tương ứng trong handbook trước khi merge code.

## Liên hệ
- Vấn đề liên quan kiến trúc: trao đổi qua channel nội bộ.
- Cập nhật tài liệu: mở PR trong thư mục `handbook/` và dẫn chứng bằng đường dẫn file thực thi ở backend.
