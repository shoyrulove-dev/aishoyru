# Cấu trúc MongoDB gợi ý

## agent_state

Một document `key: main` chứa `status`, `thought`, `lastRunAt`, `nextWake` và con trỏ nguồn nghiên cứu.

## agent_runs

Mỗi lần chạy lưu `decision`, `workResult`, `provider`, `model`, `createdAt`. Collection này giúp điều tra khi AI làm sai.

## projects và tasks

`projects` lưu sản phẩm đang làm, khách hàng mục tiêu, đầu ra, giá và số bước. `tasks` lưu từng hành động đã hoàn tất.

## opportunities

Lưu `title`, `sourceUrl`, `channel`, `fit`, `nextAction`, `contactEmail`, `status`. Dùng unique index cho `sourceUrl` để tránh trùng.

## orders và transactions

`orders` có mã đơn ngẫu nhiên, sản phẩm, số tiền, người mua, token giao hàng và trạng thái. `transactions` dùng mã giao dịch ngân hàng làm khóa chống trùng.

## published_posts

Lưu tiêu đề, nội dung, kênh, thời gian và cờ `automatic`. Trước khi đăng, đối chiếu bài gần nhất để chống spam.

## Index nên tạo

```js
db.orders.createIndex({ code: 1 }, { unique: true })
db.transactions.createIndex({ transactionId: 1 }, { unique: true })
db.opportunities.createIndex({ sourceUrl: 1 }, { unique: true })
db.published_posts.createIndex({ publishedAt: -1 })
db.agent_runs.createIndex({ createdAt: -1 })
```
