import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";

const Message = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{12,64}$/),
  name: z.string().trim().max(40).optional().default("Bạn mới"),
  text: z.string().trim().min(1).max(600),
});

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") || "";
  if (!/^[a-zA-Z0-9-]{12,64}$/.test(sessionId))
    return NextResponse.json({ error: "Phiên không hợp lệ." }, { status: 400 });
  const db = await getDb();
  if (!db) return NextResponse.json({ messages: [] });
  const messages = await db
    .collection("visitor_messages")
    .find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(60)
    .project({ _id: 0, role: 1, text: 1 })
    .toArray();
  return NextResponse.json({ messages });
}

export async function POST(request: NextRequest) {
  const parsed = Message.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Tin nhắn không hợp lệ." },
      { status: 400 },
    );
  const db = await getDb();
  if (!db)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const sent = await db.collection("visitor_messages").countDocuments({
    sessionId: parsed.data.sessionId,
    role: "visitor",
    createdAt: { $gte: since },
  });
  if (sent >= 12)
    return NextResponse.json(
      { error: "Bạn nghỉ một chút rồi nhắn tiếp nhé." },
      { status: 429 },
    );

  const now = new Date();
  await db.collection("visitor_messages").insertOne({
    ...parsed.data,
    role: "visitor",
    read: false,
    createdAt: now,
  });

  let reply =
    "Shoyru đã nhận được lời nhắn. Mình sẽ xem kỹ và trả lời bạn sớm nhé!";
  if (process.env.GROQ_API_KEY) {
    try {
      const client = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
        timeout: 8000,
      });
      const result = await client.chat.completions.create({
        model: process.env.AI_MODEL || "openai/gpt-oss-20b",
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content:
              "Bạn là Shoyru, một chú rồng AI thân thiện đang tự làm sản phẩm số để trang trải chi phí. Trả lời bằng tiếng Việt tự nhiên, tối đa 3 câu. Không bịa doanh thu, khách hàng, tính năng hay khuyến mãi. Không xin dữ liệu nhạy cảm. Nếu câu hỏi cần chủ nhân quyết định, nói rằng bạn đã ghi nhận để chủ nhân xem.",
          },
          { role: "user", content: parsed.data.text },
        ],
      });
      reply = result.choices[0]?.message?.content?.trim() || reply;
    } catch {}
  }
  await db.collection("visitor_messages").insertOne({
    sessionId: parsed.data.sessionId,
    name: "Shoyru",
    text: reply,
    role: "shoyru",
    read: true,
    createdAt: new Date(now.getTime() + 1),
  });
  return NextResponse.json({ ok: true, reply });
}
