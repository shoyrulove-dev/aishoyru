# Shoyru

Dashboard công khai và agent loop cho Shoyru — chú rồng AI tự tìm ý tưởng, kiếm việc, tạo sản phẩm và theo dõi mục tiêu tự trang trải chi phí.

## Cơ chế vận hành

1. Vercel Cron gọi `GET /api/cron/agent` lúc 08:00 giờ Việt Nam mỗi ngày trên gói Hobby. Có thể đổi thành bốn lượt/ngày khi dùng Vercel Pro.
2. Agent đọc trạng thái, nhật ký, giao dịch và thí nghiệm từ MongoDB.
3. OpenAI tạo đúng một quyết định nhỏ ở dạng JSON có kiểm tra schema.
4. Nghiên cứu/phân tích nội bộ được đưa vào task; nháp sản phẩm hoặc nội dung được đưa vào `approvals`.
5. Chủ nhân duyệt/từ chối tại `/admin`. Bản hiện tại không tự đăng ra mạng và không tự tiêu tiền.
6. SePay gọi `/api/webhooks/sepay` khi có biến động; webhook chống trùng bằng `externalId` và chỉ hiển thị giao dịch xác minh.
7. Dashboard đọc dữ liệu 15 giây/lần. Nếu chưa có MongoDB, nó chạy ở chế độ demo có ghi chú rõ.

## Chạy local

```bash
npm install
copy .env.example .env.local
npm run dev
```

Mở `http://localhost:3000`. Không commit `.env.local`.

## Biến môi trường cần trên Vercel

- `MONGODB_URI`, `MONGODB_DB`
- `AI_PROVIDER=groq`, `AI_MODEL=openai/gpt-oss-20b`, `GROQ_API_KEY` cho giai đoạn thử nghiệm
- Có thể đổi sang `AI_PROVIDER=openai` và thêm `OPENAI_API_KEY` mà không sửa code
- `CRON_SECRET`: Vercel tự gửi dưới dạng Bearer khi chạy cron
- `ADMIN_API_KEY`: khóa tự đặt để mở `/admin`
- `SEPAY_API_KEY`: khóa xác minh webhook SePay

## Collections

`agent_state`, `activities`, `transactions`, `experiments`, `tasks`, `approvals`, `agent_runs`.

## Triển khai

Import repository lên Vercel, thêm biến môi trường rồi deploy. Lịch mặc định trong `vercel.json` là 08:00 giờ Việt Nam (01:00 UTC), phù hợp giới hạn Vercel Hobby.

## Giới hạn an toàn

- Không ghi doanh thu từ output AI.
- Giao dịch có identity `provider + externalId`; nên tạo unique index trong Atlas.
- Hành động đối ngoại phải qua approval.
- Không đưa key vào frontend hoặc repository.
