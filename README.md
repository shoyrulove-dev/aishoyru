# Shoyru

Dashboard công khai và agent loop cho Shoyru — chú rồng AI tự tìm ý tưởng, kiếm việc, tạo sản phẩm và theo dõi mục tiêu tự trang trải chi phí.

## Cơ chế vận hành

1. Cloudflare Cron Triggers gọi agent mỗi 10 phút; khóa trong MongoDB giới hạn lượt làm việc. Bộ thu thập quant chạy ở phút 02, 17, 32 và 47. Cả hai gọi nội bộ bằng `CRON_SECRET`, không cần GitHub Actions.
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
- `OXION_API_KEY` bật OxionAI ở tầng dự phòng; mặc định dùng `gpt-5.6-luna` qua endpoint OpenAI-compatible.
- NVIDIA NIM dự phòng cho cả suy luận có cấu trúc và chat. Cloudflare Workers AI chỉ dự phòng chat vì model hiện tại không bảo đảm JSON hợp lệ.
- Brave Search được chặn ở 30 lượt/ngày và 1.000 lượt/tháng để không vượt gói miễn phí.
- Có thể đổi sang `AI_PROVIDER=openai` và thêm `OPENAI_API_KEY` mà không sửa code
- `CRON_SECRET`: Vercel tự gửi dưới dạng Bearer khi chạy cron
- `ADMIN_API_KEY`: khóa tự đặt để mở `/admin`
- `SEPAY_API_KEY`: khóa xác minh webhook SePay

## Collections

`agent_state`, `activities`, `transactions`, `experiments`, `tasks`, `approvals`, `agent_runs`.

## Triển khai

Phương án chuyển sang Cloudflare Workers: [hướng dẫn build, secrets và đổi domain](docs/cloudflare-deployment.md).

Worker `shoyruai` là bản production. GitHub có thể dùng để build khi push, nhưng không còn giữ lịch chạy agent hay quant. Không triển khai thêm watchdog độc lập nếu lịch của Worker chính đã hoạt động.

## Giới hạn an toàn

- Không ghi doanh thu từ output AI.
- Giao dịch có identity `provider + externalId`; nên tạo unique index trong Atlas.
- Hành động đối ngoại phải qua approval.
- Không đưa key vào frontend hoặc repository.
# Thử nghiệm nhiều AI provider

Điền key trong `.env.ai.local`, sau đó chạy:

```bash
npm run ai:test
npm run ai:bench
```

`ai:test` gửi một yêu cầu an toàn tới từng provider. `ai:bench` gửi 10 yêu cầu/provider với concurrency 2 để đo độ trễ và quan sát rate limit. Script không in API key hoặc nội dung trả lời. Không tăng số request quá cao khi dùng gói miễn phí.

Có thể kiểm tra riêng một provider/model mà không sửa file chứa key:

```bash
node scripts/test-ai-providers.mjs --provider=Gemini --model=gemini-3.5-flash-lite --requests=3 --max_tokens=256
```
