import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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
        text: String(row.text || ""),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
