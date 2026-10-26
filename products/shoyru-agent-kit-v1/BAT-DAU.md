# Bộ khởi tạo AI sinh tồn Shoyru — phiên bản 1.0

Đây là bộ thực hành giúp bạn dựng một nhân vật AI có thể chạy theo lịch, ghi nhớ việc đã làm, công khai nhật ký, bán sản phẩm số và báo rõ khi cần con người cấp quyền.

## Lời nói thật

AI không tự tạo ra tiền chỉ vì được bật 24/7. Doanh thu chỉ xuất hiện khi có sản phẩm thật, khách hàng thật và kênh phân phối thật. Bộ này cung cấp kiến trúc và quy trình vận hành; không cam kết thu nhập và không khuyến khích spam, giao dịch tài chính tự động hay tạo số liệu giả.

## Bạn nhận được gì

- Lộ trình 12 bước từ ý tưởng tới agent chạy theo giờ.
- Prompt hệ thống có hàng rào chống bịa dữ liệu và chống chờ vô hạn.
- Mẫu biến môi trường, GitHub Actions và cấu trúc MongoDB.
- Checklist cửa hàng số, VietQR, SePay và giao tệp sau thanh toán.
- Bộ sticker Shoyru dùng cá nhân làm quà kèm.

## Quy trình 12 bước

1. Chọn nhân vật, mục tiêu sinh tồn và giới hạn đạo đức.
2. Chọn một sản phẩm số nhỏ có thể giao ngay.
3. Dựng website công khai: trạng thái, nhật ký, sản phẩm và sổ thu chi.
4. Tạo MongoDB và các collection: agent_state, agent_runs, tasks, projects, opportunities, orders, transactions, published_posts.
5. Nối một nhà cung cấp AI chính và ít nhất một fallback.
6. Buộc AI trả JSON có schema; từ chối dữ liệu sai trước khi ghi database.
7. Thiết kế vòng lặp: quan sát → chọn một việc → thực hiện → ghi kết quả → chọn bước tiếp.
8. Dùng GitHub Actions gọi endpoint cron mỗi giờ; secret chỉ nằm trong GitHub/Vercel.
9. Tạo trang quản trị cho các việc cần quyền: gửi email, tài khoản mạng xã hội, vốn và quyết định pháp lý.
10. Tạo đơn hàng có mã riêng, VietQR đúng số tiền và nội dung chuyển khoản.
11. Nhận webhook SePay, chống ghi trùng và chỉ mở tải khi giao dịch khớp.
12. Kiểm thử đầu cuối bằng đơn thử trước khi công bố.

## Hàng rào bắt buộc

- Không bịa doanh thu, khách hàng, đánh giá, khuyến mãi hoặc độ khan hiếm.
- Không tự gửi email hàng loạt; mọi email ra ngoài cần duyệt.
- Không tự chi tiền, giao dịch, tạo token hoặc quảng bá tài sản đầu cơ.
- Không lưu bí mật trong mã nguồn hay nhật ký công khai.
- Mỗi lượt chỉ chọn một hành động có đầu ra kiểm chứng được.
- Nếu sản phẩm đã có, ưu tiên tìm khách và kênh phân phối thay vì sửa vô hạn.

## Kiểm thử tối thiểu

- Cron sai secret phải trả 401.
- JSON AI sai schema phải bị từ chối.
- Một webhook gửi hai lần chỉ tạo một giao dịch.
- Sai mã đơn hoặc sai số tiền không được mở tệp.
- Nhật ký công khai không hiển thị khóa, email riêng hoặc số tài khoản đầy đủ.
- Agent không được đăng lặp cùng sản phẩm liên tục.

Mở tiếp `PROMPT-HE-THONG.md`, `MONGODB-SCHEMA.md`, `.env.example` và `.github/workflows/shoyru-hourly.yml` để triển khai.
