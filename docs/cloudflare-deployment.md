# Chuyển ShoyruAI từ Vercel sang Cloudflare Workers

Ngày 25/11/2026, tên miền `shoyruai.blissbiovn.com` trả HTTP 402 từ Vercel với mã `DEPLOYMENT_DISABLED`. Đây là trạng thái của deployment, không xác nhận nguyên nhân cụ thể. Kiểm tra Billing/Usage trong Vercel chỉ khi cần khôi phục Vercel để rollback.

## 1. Chuẩn bị biến môi trường

Điền [`.dev.vars`](../.dev.vars) cho **preview local**; file này đã được Git bỏ qua. Nếu chưa có file, sao chép từ [`.dev.vars.example`](../.dev.vars.example). Không gửi URI hoặc key qua chat, không commit chúng. File [`.env.cloudflare.local`](../.env.cloudflare.local) có sẵn trong máy được giữ nguyên; nó phục vụ script watchdog riêng, không phải file preview của app.

| Mục | Cần điền |
| --- | --- |
| MongoDB | `MONGODB_URI`, `MONGODB_DB`. Khi lên production, dùng đúng database đang chạy trên Vercel để giữ nguyên dữ liệu. Preview dùng database/test user riêng; các route đọc như `/api/state` có thể kích hoạt agent. |
| Admin | `ADMIN_API_KEY`. Dùng key riêng cho preview; production dùng key hiện tại hoặc thống nhất việc xoay key. |
| Agent/AI | Ít nhất một provider hỗ trợ structured output, ví dụ `GROQ_API_KEY`. Cloudflare Workers AI qua REST hiện chỉ dự phòng chat, không thay thế provider cho agent. |
| Cron | Giữ `CRON_SECRET` nếu còn caller dùng Bearer. GitHub Actions chạy bằng OIDC, không cần đổi sang dùng secret này. |
| Cửa hàng | Nếu đang bán hàng: `SEPAY_API_KEY` và `BANK_BIN`, `BANK_ACCOUNT_NO`, `BANK_ACCOUNT_NAME`. Nếu đang giao qua Vercel Blob, cần `BLOB_READ_WRITE_TOKEN` và store còn hoạt động. Đổi host không di chuyển file sang R2. |
| Tích hợp khác | Chuyển các key/tùy chỉnh đang dùng (Brave, GitHub Automation, Resend và model) từ deployment cũ nếu muốn giữ tính năng tương ứng. |

Trên Cloudflare, thêm key thật dưới dạng **Secret** tại **Workers & Pages → Worker → Settings → Variables and Secrets**. Đặt tên database/model dưới dạng biến runtime nếu muốn. Không đưa key vào [cấu hình Wrangler](../wrangler.jsonc) hoặc biến build.

## 2. Build và thử trước khi đổi DNS

Chạy trên Node.js 22+ (khuyến nghị Linux hoặc WSL, lưu repo trên filesystem Linux). Trên máy Windows hiện tại, Next build qua nhưng OpenNext dừng vì quyền tạo symlink (`EPERM`), nên chưa xác minh được bundle Worker. Có thể chạy thủ công **Validate Cloudflare build** trong GitHub Actions sau khi đưa workflow lên nhánh mặc định; workflow dùng Linux, không cần secrets và không deploy. Build từ checkout sạch không có file `.env.local` hoặc `.env.production.local` của production. Next có thể đọc các file đó ngay lúc build; không cần secret runtime để build.

```sh
npm ci
npm run check
npm run cf:build
npm run cf:preview
```

Kiểm tra `/`, `/api/state`, đăng nhập `/admin`, chat và các tính năng đang dùng trên database thử. Trước khi lên production xác nhận Atlas cho phép kết nối TLS từ Worker, đúng DB, và gọi liên tiếp để kiểm tra MongoDB dưới runtime thật. Không mở rộng Atlas IP allowlist một cách mặc định; nếu Atlas cần IP nguồn cố định, chuẩn bị phương án mạng phù hợp trước cutover. Chạy thử riêng webhook và tải file với dữ liệu thử; không gọi webhook có thể ghi giao dịch lên production để smoke test.

OpenNext cảnh báo hỗ trợ Next.js Proxy còn thử nghiệm và Cache Components chưa đầy đủ: kiểm tra đặc biệt các route admin/API và `/updates`. `npm audit --omit=dev` báo 4 mục mức high trong cây phụ thuộc Vercel Blob; rà soát/xử lý trước khi mở production, không chạy `npm audit fix --force` tùy tiện trên kho file đang bán.

Sau khi preview ổn, vào đúng tài khoản Cloudflare đang quản lý zone. Cấu hình ban đầu chỉ bật `workers.dev`, không tự đổi tên miền hoặc lập Cron Trigger mới:

```sh
npx wrangler login
npm run cf:deploy -- --dry-run
npm run cf:deploy
```

Chưa gắn production secrets vào một URL thử công khai nếu không muốn các route gọi agent/chạy ghi trên dữ liệu thật. Sau khi thử, tắt `workers.dev` khi chuyển sang chỉ dùng tên miền chính nếu không cần URL phụ.

## 3. Cutover và rollback

1. Lưu record DNS cũ của `shoyruai.blissbiovn.com` để rollback. Chỉ khi Worker đã thử xong và đang dùng đúng biến production mới gắn tên miền trong **Settings → Domains & Routes → Add → Custom domain**. Nếu Cloudflare báo CNAME đang tồn tại, gỡ đúng record của subdomain đó trong cửa sổ cutover rồi gắn Custom Domain; tránh thay các record của zone khác.
2. Kiểm tra HTTPS, dashboard đọc đúng dữ liệu, admin, chat, các webhook và giao hàng nếu đang sử dụng. Nếu Vercel Blob hết quyền hoặc hết dịch vụ, xử lý di chuyển các file trả phí sang kho private riêng rồi mới xác nhận cửa hàng hoạt động đầy đủ.
3. GitHub Actions và Cloudflare watchdog hiện đã gọi tên miền chính nên không cần sửa URL nếu giữ tên miền. Theo dõi lần chạy kế tiếp; không bật thêm lịch Cloudflare song song. Lượt Vercel Cron dự phòng lúc 08:00 không được chuyển nguyên trạng; khi Cloudflare chạy ổn thì ngắt Vercel Cron nếu Vercel sẽ được bật lại. Các thiết lập thời lượng của Vercel không thay đổi giới hạn CPU/runtime của Workers; kiểm tra log agent với gói Cloudflare thực tế.
4. Nếu cần rollback, tháo Custom Domain và khôi phục record cũ **chỉ khi** Vercel đã được kích hoạt lại. Record cũ sẽ không phục hồi dịch vụ nếu Vercel vẫn trả HTTP 402. Nếu đã có bản Worker tốt trước đó, dùng rollback của Cloudflare để tránh đổi DNS lần nữa.
