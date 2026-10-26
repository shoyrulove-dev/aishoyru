import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongodb";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  providerIsCoolingDown,
  recordProviderFailure,
  recordProviderSuccess,
} from "@/lib/ai-health";

const Message = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{12,64}$/),
  name: z.string().trim().max(40).optional().default("Bạn mới"),
  text: z.string().trim().min(1).max(600),
});
const compactReply = (value: string) => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 240 && !clean.endsWith("…")) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  const complete = sentences.filter((sentence) => sentence.trim()).slice(0, 2).join(" ").trim();
  if (complete && complete.length <= 240) return complete;
  return "Mình đã hiểu. Mình sẽ xử lý hoặc chuyển chủ nhân xem nếu cần quyết định nhé!";
};
const usefulFallback = (text: string) => {
  const value = text
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  if (/ban gi|san pham|mua gi|cua hang/.test(value))
    return "Mình đang bán Bộ khởi tạo AI Shoyru theo từng bước. Bạn có thể xem nội dung và giá tại quầy hàng nhé!";
  if (/gia|bao nhieu|chi phi/.test(value))
    return "Giá hiện tại được ghi công khai tại quầy hàng. Mình không tự tạo giảm giá hoặc phụ phí đâu nhé!";
  if (/mua|thanh toan|chuyen khoan|qr/.test(value))
    return "Bạn chọn sản phẩm tại quầy hàng để nhận VietQR riêng. Tệp chỉ mở sau khi SePay xác nhận đúng đơn.";
  if (/lien he|email|hop tac/.test(value))
    return "Bạn có thể nhắn ngay tại đây hoặc email shoyru@blissbiovn.com. Việc cần chủ nhân quyết định, mình sẽ chuyển giúp.";
  if (/ung ho|donate|tang/.test(value))
    return "Bạn có thể mời Shoyru một bữa tại quầy hàng. Khoản ủng hộ là tự nguyện và được ghi nhận minh bạch.";
  return "Mình đã nhận lời nhắn. Nếu cần chủ nhân quyết định, mình sẽ chuyển giúp bạn nhé!";
};

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
  const rate = await checkRateLimit(db, request, "chat", 30, 60 * 60 * 1000);
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Bạn nhắn hơi nhanh. Vui lòng thử lại sau." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
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

  let reply = usefulFallback(parsed.data.text);
  let providerUsed = "built-in";
  const history = await db
    .collection("visitor_messages")
    .find({ sessionId: parsed.data.sessionId })
    .sort({ createdAt: -1 })
    .limit(8)
    .project({ _id: 0, role: 1, text: 1 })
    .toArray();
  const providers = [
    process.env.GROQ_API_KEY && {
      name: "groq",
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
      model: process.env.GROQ_MODEL || process.env.AI_MODEL || "openai/gpt-oss-20b",
    },
    process.env.NVIDIA_NIM_API_KEY && {
      name: "nvidia",
      apiKey: process.env.NVIDIA_NIM_API_KEY,
      baseURL: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
      model: process.env.NVIDIA_NIM_MODEL || "nvidia/nemotron-3.5-bolt-e4b",
    },
    process.env.CLOUDFLARE_AI_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID && {
      name: "cloudflare",
      apiKey: process.env.CLOUDFLARE_AI_API_TOKEN,
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      model: process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct",
    },
    process.env.OPENROUTER_API_KEY && {
      name: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
    },
    process.env.KILO_API_KEY && {
      name: "kilo-auto",
      apiKey: process.env.KILO_API_KEY,
      baseURL: "https://ai-gateway.kilo.ai/api/v1",
      model: process.env.KILO_MODEL || "kilo-auto/free",
    },
    process.env.KILO_API_KEY && {
      name: "kilo-fallback",
      apiKey: process.env.KILO_API_KEY,
      baseURL: "https://ai-gateway.kilo.ai/api/v1",
      model: "cohere/north-mini-code:free",
    },
    process.env.OXION_API_KEY && {
      name: "oxion",
      apiKey: process.env.OXION_API_KEY,
      baseURL: process.env.OXION_BASE_URL || "https://www.oxionai.com/v1",
      model: process.env.OXION_MODEL || "gpt-5.6-luna",
    },
  ].filter(Boolean) as Array<{ name: string; apiKey: string; baseURL: string; model: string }>;
  for (const provider of providers) {
    if (await providerIsCoolingDown(db, provider.name)) continue;
    const startedAt = Date.now();
    try {
      const client = new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
        timeout: 12000,
      });
      const result = await client.chat.completions.create({
        model: provider.model,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "Bạn là Shoyru, rồng con AI thân thiện đang bán sản phẩm số để tự trang trải. Trả lời tiếng Việt có dấu, tối đa 2 câu ngắn và 220 ký tự. Đi thẳng vào câu hỏi, dễ thương vừa đủ, không dùng dấu ba chấm và không cắt dở câu. Có thể giới thiệu sản phẩm khi thật sự liên quan, nhưng không ép mua. Không bịa doanh thu, khách hàng, tính năng hoặc khuyến mãi; không xin dữ liệu nhạy cảm. Việc cần chủ nhân quyết định thì nói đã chuyển chủ nhân xem.",
          },
          ...history.reverse().map((message) => ({
            role: message.role === "shoyru" ? ("assistant" as const) : ("user" as const),
            content: String(message.text || ""),
          })),
        ],
      });
      const answer = result.choices[0]?.message?.content?.replace(/\s+/g, " ").trim();
      const naturalVietnamese = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
      if (answer && naturalVietnamese.test(answer) && !/user safety|policy|moderation/i.test(answer)) {
        reply = compactReply(answer);
        providerUsed = provider.name;
        await recordProviderSuccess(
          db,
          provider.name,
          provider.model,
          Date.now() - startedAt,
        );
        break;
      }
      throw new Error("Pháº£n há»“i khÃ´ng Ä‘áº¡t tiÃªu chuáº©n tiáº¿ng Viá»‡t");
    } catch (error) {
      await recordProviderFailure(db, provider.name, provider.model, error);
    }
  }
  await db.collection("visitor_messages").insertOne({
    sessionId: parsed.data.sessionId,
    name: "Shoyru",
    text: reply,
    role: "shoyru",
    read: true,
    createdAt: new Date(now.getTime() + 1),
  });
  return NextResponse.json({ ok: true, reply, provider: providerUsed });
}
