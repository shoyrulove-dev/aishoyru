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
const normalizeIntent = (text: string) => text
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const directReply = (text: string) => {
  const value = normalizeIntent(text);
  if (/(^|\s)(ten ban la gi|ban ten gi|ban la ai|may la ai|who are you|what is your name|your name)(\s|$)/.test(value))
    return "Mình là Shoyru, một chú rồng AI đang học cách làm việc và tự kiếm chi phí nuôi mình. Rất vui được gặp bạn nhé!";
  if (/^(hi|hello|hey|xin chao|chao|chao ban|alo)(\s|$)/.test(value))
    return "Chào bạn, mình là Shoyru đây! Bạn muốn hỏi về mình, xem sản phẩm hay cần mình hỗ trợ việc gì?";
  if (/(ban lam duoc gi|shoyru lam duoc gi|co the lam gi|giup duoc gi)/.test(value))
    return "Mình có thể trò chuyện, tìm thông tin công khai, làm sản phẩm số nhỏ và hỗ trợ bot, API hoặc tự động hóa. Việc cần quyền hay chi phí, mình sẽ nhờ chủ nhân quyết định.";
  if (/(ai tao ra ban|chu nhan la ai|ai la chu cua ban)/.test(value))
    return "Mình là Shoyru, được chủ nhân xây một chiếc hang số để học làm việc và tự trang trải. Bạn cứ trò chuyện trực tiếp với mình nhé!";
  if (/(ban dang lam gi|hom nay lam gi|dang lam gi)/.test(value))
    return "Mình đang tìm việc phù hợp, học từ kết quả thật và chăm quầy sản phẩm Shoyru. Nhật ký ngoài trang chủ ghi lại từng lượt mình làm.";
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
  return null;
};
const usefulFallback = (text: string) => {
  const direct = directReply(text);
  if (direct) return direct;
  return "Mình chưa hiểu rõ câu này. Bạn nói cụ thể hơn một chút để Shoyru trả lời đúng ý nhé!";
};

const serviceIntent = (text: string) =>
  /(can|muon|nho|thue|lam giup|bao gia|tim nguoi).{0,60}(bot|api|website|landing page|tu dong hoa|xu ly du lieu)/.test(
    normalizeIntent(text),
  );

const ownerDecisionIntent = (text: string) =>
  /(hoan tien|khieu nai|phap ly|hop dong|xuat hoa don|bao gia rieng|giam gia|mat tien|khong nhan duoc|refund|complaint)/.test(
    normalizeIntent(text),
  );

const qualificationReply = (text: string, visitorMessages: string[]) => {
  if (!serviceIntent(text) && !visitorMessages.some(serviceIntent)) return null;
  const count = visitorMessages.length;
  if (count <= 1)
    return "Shoyru có thể xem việc này. Bạn muốn bot, website hoặc quy trình tự động hóa tạo ra kết quả cụ thể gì?";
  if (count === 2)
    return "Mình hiểu mục tiêu rồi. Hiện bạn đang dùng công cụ, API hoặc dữ liệu nào để làm việc đó?";
  if (count === 3)
    return "Còn một ý nữa nhé: bạn muốn hoàn thành khi nào và có giới hạn chi phí dự kiến không?";
  return "Mình đã ghi đủ yêu cầu ban đầu. Shoyru sẽ tóm tắt phạm vi và chuyển chủ nhân xem phần báo giá nếu cần quyết định nhé!";
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

  const deterministicReply = directReply(parsed.data.text);
  let reply = deterministicReply || usefulFallback(parsed.data.text);
  let providerUsed = deterministicReply ? "built-in-intent" : "built-in";
  const history = await db
    .collection("visitor_messages")
    .find({ sessionId: parsed.data.sessionId })
    .sort({ createdAt: -1 })
    .limit(8)
    .project({ _id: 0, role: 1, text: 1 })
    .toArray();
  const visitorMessages = history
    .filter((message) => message.role === "visitor")
    .reverse()
    .map((message) => String(message.text || ""));
  const qualifyingReply = qualificationReply(parsed.data.text, visitorMessages);
  if (!deterministicReply && qualifyingReply) {
    reply = qualifyingReply;
    providerUsed = "built-in-qualification";
  }
  const providers = [
    process.env.GEMINI_API_KEY && {
      name: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    },
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
  for (const provider of deterministicReply || qualifyingReply ? [] : providers) {
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
              "Bạn là Shoyru, một chú rồng AI dễ thương đang học làm việc và tự kiếm chi phí nuôi mình. Tên của bạn luôn là Shoyru. Trả lời đúng câu vừa hỏi theo ngữ cảnh hội thoại, bằng tiếng Việt có dấu, tối đa 2 câu ngắn và 220 ký tự. Không trả lời bằng câu xác nhận chung chung khi câu hỏi có đáp án trực tiếp. Chỉ giới thiệu sản phẩm khi liên quan; không ép mua, không bịa doanh thu, tính năng hay khuyến mãi và không xin dữ liệu nhạy cảm. Chỉ nói cần chủ nhân khi khách yêu cầu hoàn tiền, hợp đồng, pháp lý, báo giá riêng hoặc quyết định vượt quyền.",
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
  const needsOwner = ownerDecisionIntent(parsed.data.text);
  const leadStage = needsOwner
    ? "needs_owner"
    : serviceIntent(parsed.data.text) || visitorMessages.some(serviceIntent)
      ? visitorMessages.length >= 4 ? "qualified" : "qualifying"
      : "conversation";
  await db.collection("chat_leads").updateOne(
    { sessionId: parsed.data.sessionId },
    {
      $set: {
        name: parsed.data.name,
        stage: leadStage,
        latestMessage: parsed.data.text,
        latestReply: reply,
        conversationBrief: visitorMessages.slice(-4).join(" | ").slice(0, 1200),
        needsOwner,
        questionCount: leadStage === "qualifying" || leadStage === "qualified"
          ? Math.min(3, visitorMessages.length)
          : 0,
        updatedAt: now,
        followUpDueAt: leadStage === "qualified" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
      },
      $setOnInsert: { createdAt: now, source: "website-chat" },
    },
    { upsert: true },
  );
  if (needsOwner) {
    await db.collection("approvals").updateOne(
      { type: "support", status: "pending", supportKey: `chat-${parsed.data.sessionId}` },
      {
        $set: {
          type: "support",
          status: "pending",
          supportKey: `chat-${parsed.data.sessionId}`,
          title: "Khách chat cần chủ nhân quyết định",
          details: parsed.data.text,
          supportRequest: {
            title: "Xem yêu cầu đặc biệt trong chat",
            reason: `Khách nhắn: ${parsed.data.text}`,
            needed: "Quyết định cách xử lý yêu cầu của khách",
            impact: "Shoyru có thể tiếp tục trả lời đúng thẩm quyền.",
            where: "Admin → Khách & chat",
            doneWhen: "Shoyru sẽ lưu câu trả lời và tiếp tục cuộc trò chuyện.",
          },
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }
  return NextResponse.json({ ok: true, reply, provider: providerUsed });
}
