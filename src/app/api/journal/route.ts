import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const friendlyJournalText = (value: unknown) =>
  String(value || "")
    .replace(
      /Chỉ cần thực hiện một lần discovery lead, từ đó có thể làm kế hoạch kinh doanh \(plan_business\) và chuẩn bị hồ sơ grant\.?/gi,
      "Mình đang tìm một chương trình tài trợ phù hợp cho dự án Shoyru. Nếu thấy chương trình có điều kiện rõ ràng, mình sẽ đọc kỹ rồi chuẩn bị hồ sơ đăng ký.",
    )
    .replace(
      /Tập trung vào tìm kiếm một cơ hội tài trợ mở, có khả năng mang lại nguồn thu đủ 500k\/đ tháng thông qua việc nâng cấp sản phẩm và marketing\.?/gi,
      "Shoyru đang tìm chương trình tài trợ hợp với món mình làm. Gặp đúng nơi, mình sẽ nâng cấp sản phẩm và cố kiếm đủ tiền ăn tháng này.",
    )
    .replace(/discover(?:y)?[_ ]lead/gi, "tìm người đang cần giúp đỡ")
    .replace(/qualify[_ ]lead/gi, "xem người đó có thật sự phù hợp")
    .replace(/plan[_ ]business/gi, "lên kế hoạch kiếm tiền")
    .replace(/micro[_ ]job/gi, "việc nhỏ có trả công")
    .replace(/grant/gi, "tài trợ")
    .replace(/marketing/gi, "giới thiệu sản phẩm")
    .replace(/remote API automation/gi, "việc tự động hóa từ xa")
    .replace(/CTA(?: mua sắm)?/gi, "lời mời ghé quầy")
    .replace(/\bview\b/gi, "lượt xem")
    .replace(/chuyển đổi/gi, "người ghé mua")
    .replace(/tài sản sở hữu/gi, "trang của mình")
    .replace(/Tập trung vào công việc việc tự động hóa từ xa có trả lương cao, nhanh chóng mang lại doanh thu đủ 500kđ\/ tháng\.?/gi, "Mình đang xem một việc tự động hóa từ xa có trả công. Phải đọc kỹ yêu cầu trước, kẻo rồng con ham tiền lại ôm việc quá sức.")
    .replace(/Đề nghị việc nhỏ có trả công từ các trang tuyển dụng có mức lương hợp lý \(từ 100[–-]200\$\)\./gi, "Mình vừa thấy một việc nhỏ trên trang tuyển dụng, mức trả khoảng 100–200 USD.")
    .replace(/khách hàng tiềm năng/gi, "người có thể cần món này")
    .replace(/kênh phân phối/gi, "nơi có người cần mua")
    .replace(/tối đa h[oó]a doanh thu/gi, "kiếm thêm tiền")
    .replace(/triển khai/gi, "làm")
    .replace(/\.\.\.|…/g, ",")
    .replace(/\s+/g, " ")
    .trim();

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || "";
  if (!datePattern.test(date))
    return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });

  const db = await getDb();
  if (!db) return NextResponse.json({ messages: [] });

  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(`${date}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 1);

  const rows = await db
    .collection("conversations")
    .find({ public: true, createdAt: { $gte: start, $lt: end } })
    .sort({ createdAt: 1 })
    .limit(200)
    .project({ _id: 1, speaker: 1, text: 1, createdAt: 1 })
    .toArray();

  return NextResponse.json(
    {
      date,
      messages: rows.map((row) => ({
        id: String(row._id),
        speaker: row.speaker === "he-thong" ? "he-thong" : "shoyru",
        at: new Date(row.createdAt as Date).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Ho_Chi_Minh",
        }),
        text: friendlyJournalText(row.text),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
