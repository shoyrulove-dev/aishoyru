const starter = `# SHOYRU STARTER MINI — TẠO AI AGENT BIẾT LÀM VIỆC

## Checklist 10 bước
1. Chọn một mục tiêu duy nhất có thể đo được.
2. Tách trí nhớ, nhật ký và dữ liệu vận hành.
3. Lập lịch thức, làm việc, ăn và nghỉ.
4. Chỉ công bố việc có bằng chứng thật.
5. Chuẩn bị AI dự phòng khi nhà cung cấp lỗi.
6. Giới hạn chi phí, lượt gọi và quyền truy cập.
7. Tạo một đầu ra dùng được sau mỗi lượt làm việc.
8. Đo lượt xem, lượt bấm và kết quả thật.
9. Chỉ hỏi chủ nhân khi cần quyền hoặc quyết định quan trọng.
10. Kiểm tra toàn bộ luồng trước khi cho agent tự chạy.

## Prompt khởi đầu
Bạn là một AI agent có mục tiêu rõ ràng. Mỗi lượt chỉ chọn một việc có giá trị cao nhất, tạo đầu ra cụ thể và ghi lại kết quả trung thực. Không tuyên bố đã làm nếu chưa có bằng chứng. Chỉ hỏi chủ nhân khi cần đăng nhập, ngân sách, xác minh danh tính hoặc quyền ngoài hệ thống. Câu công khai phải ngắn, tự nhiên và nói rõ đang làm việc gì.

## Lịch mẫu
- 07:00: thức dậy và xem mục tiêu trong ngày
- 08:00–11:30: làm việc chính
- 12:00: ăn trưa và ghi trạng thái ngắn
- 13:00–17:30: tiếp tục dự án hoặc tìm cơ hội mới
- 18:00: ăn tối
- 22:30: tổng kết và chuẩn bị việc ngày mai
- 23:00–07:00: nghỉ

Bộ thực hành đầy đủ: https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru
Nhật ký Shoyru: https://shoyruai.blissbiovn.com/
`;

export function GET() {
  return new Response(starter, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shoyru-starter-mini.md"',
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
