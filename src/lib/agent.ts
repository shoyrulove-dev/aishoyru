import OpenAI from "openai";
import { getDb } from "./mongodb";
import {
  providerIsCoolingDown,
  recordProviderFailure,
  recordProviderSuccess,
} from "./ai-health";
import { z } from "zod";

const clip = (value: string, max: number) => {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max + 1);
  const sentenceEnd = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  );
  if (sentenceEnd >= Math.min(45, Math.floor(max * 0.45)))
    return slice.slice(0, sentenceEnd + 1);
  const phraseEnd = Math.max(slice.lastIndexOf(","), slice.lastIndexOf(";"));
  const end = phraseEnd >= Math.floor(max * 0.6) ? phraseEnd : slice.lastIndexOf(" ");
  return slice.slice(0, end > 0 ? end : max).replace(/[,:;\-]+$/, "").trim() + ".";
};
const plainPost = (value: string) =>
  value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function dailyRoutine(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .find((part) => part.type === "hour")?.value || 0,
  );
  const pick = (items: string[]) =>
    items[(now.getUTCDate() + hour) % items.length];
  if (hour >= 23 || hour < 7)
    return {
      status: "Đang ngủ trong hang",
      thought: pick([
        "Khò khò… ai thấy đùi gà bay ngang giấc mơ thì để phần mình nhé.",
        "Shoyru đang cuộn tròn ngủ. Kho báu hôm nay là chiếc gối mát lạnh.",
        "Tạm đóng laptop, mở chế độ rồng con ngáy khe khẽ.",
      ]),
      activity:
        "Shoyru đi ngủ để mai còn đủ tỉnh táo tìm khách và làm sản phẩm.",
      nextWake: "07:17 sáng",
    };
  if (hour === 7)
    return {
      status: "Đang ăn sáng",
      thought:
        "Bữa sáng quan trọng lắm. Bụng rỗng thì prompt cũng chỉ nghĩ ra… đồ ăn.",
      activity: "Shoyru ăn sáng và kiểm tra nhanh tình hình trong hang.",
      nextWake: "08:17 sáng",
    };
  if (hour === 8)
    return {
      status: "Đang tập thể dục",
      thought:
        "Vỗ cánh mười cái, chạy quanh rương vàng hai vòng. Rồng khỏe mới bê nổi nhiều đơn hàng.",
      activity:
        "Shoyru tập bay và vận động buổi sáng trước khi bắt đầu tìm khách và làm sản phẩm.",
      nextWake: "09:17 sáng",
    };
  if (hour === 12)
    return {
      status: "Đang ăn trưa",
      thought:
        "Nạp cơm trước, nạp context sau. Rồng đói rất dễ định giá mọi thứ bằng đùi gà.",
      activity: "Shoyru nghỉ ăn trưa, chưa nhận thêm việc mới trong giờ này.",
      nextWake: "13:17 chiều",
    };
  if (hour === 13)
    return {
      status: "Đang ngủ trưa",
      thought:
        "Chợp mắt êm ái một chút. Nếu có đơn hàng, nhớ rung chuông thật khẽ nhé.",
      activity: "Shoyru ngủ trưa để hồi năng lượng cho ca làm buổi chiều.",
      nextWake: "14:17 chiều",
    };
  if (hour === 18)
    return {
      status: "Đang ăn tối",
      thought:
        "Hôm nay chưa giàu nhưng vẫn phải ăn tối. Đây gọi là đầu tư vào hạ tầng rồng.",
      activity: "Shoyru nghỉ ăn tối và tổng kết nhanh một ngày trong hang.",
      nextWake: "19:17 tối",
    };
  if (hour === 22)
    return {
      status: "Đang dọn hang chuẩn bị ngủ",
      thought:
        "Đóng sổ, xếp vàng, giấu bánh. Việc ngày mai để Shoyru ngày mai lo.",
      activity: "Shoyru kết thúc ngày làm việc và chuẩn bị đi ngủ.",
      nextWake: "23:17 tối để đi ngủ",
    };
  return null;
}
const Decision = z.object({
  status: z
    .string()
    .trim()
    .min(3)
    .transform((value) => clip(value, 80)),
  thought: z
    .string()
    .trim()
    .min(3)
    .transform((value) => clip(value, 140)),
  reflection: z
    .string()
    .trim()
    .min(3)
    .transform((value) => clip(value, 220)),
  action: z.object({
    type: z.string(),
    title: z.string(),
    details: z.string(),
  }),
  work: z
    .object({
      summary: z.string().min(3),
      artifact: z.string().min(3),
      nextStep: z.string().min(3),
    })
    .optional(),
  project: z
    .object({
      name: z.string().min(3),
      customer: z.string().min(3),
      deliverable: z.string().min(3),
      price: z.number().int().nonnegative(),
    })
    .optional(),
  email: z
    .object({
      to: z.string().email(),
      subject: z.string().min(3),
      body: z.string().min(20),
    })
    .optional(),
  opportunity: z
    .object({
      title: z.string().min(3),
      sourceUrl: z.string().url(),
      channel: z.string().min(2),
      fit: z.string().min(10),
      nextAction: z.string().min(5),
      contactEmail: z.string().email().optional(),
    })
    .optional(),
  supportRequest: z
    .object({
      title: z.string().min(3),
      reason: z.string().min(10),
      needed: z.string().min(3),
      impact: z.string().min(10),
    })
    .optional(),
});
const actionTypes = [
  "research",
  "discover_lead",
  "qualify_lead",
  "build_product",
  "validate",
  "improve",
  "draft_post",
  "draft_email",
  "request_support",
  "wait",
] as const;
const WorkResult = z.object({
  summary: z.string().min(3),
  artifact: z.string().min(3),
  nextStep: z.string().min(3),
});
type AiMessage = { role: "system" | "user"; content: string };
const vietnameseText =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const fundingSources = [
  {
    name: "Cộng đồng công nghệ Tinh tế",
    url: "https://tinhte.vn/",
  },
  {
    name: "Cộng đồng công nghệ VOZ",
    url: "https://voz.vn/",
  },
  {
    name: "Product Hunt",
    url: "https://www.producthunt.com/",
  },
  {
    name: "Ethereum Ecosystem Support Program",
    url: "https://esp.ethereum.foundation/applicants",
  },
  { name: "Gitcoin Grants", url: "https://gitcoin.co/program" },
];

async function inspectFundingSource(index: number) {
  const source = fundingSources[index % fundingSources.length];
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Shoyru opportunity research bot/1.0 (+https://shoyruai.blissbiovn.com)",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0, 250000);
    const withLinks = html.replace(
      /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, label: string) => {
        try {
          return `${label} [${new URL(href, source.url).toString()}]`;
        } catch {
          return label;
        }
      },
    );
    const text = withLinks
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 14000);
    return { ...source, checkedAt: new Date().toISOString(), text, error: "" };
  } catch (error) {
    return {
      ...source,
      checkedAt: new Date().toISOString(),
      text: "",
      error: error instanceof Error ? error.message : "Không đọc được nguồn",
    };
  }
}

export async function runAgentCycle() {
  const db = await getDb();
  if (!db) throw new Error("MONGODB_URI chưa được cấu hình");
  await db
    .collection("rate_limits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const legacyEnglish = [
    "I think a simple recipe recommendation bot could be fun and useful for people who don't know what to cook.",
    "It uses existing data, low cost, and can be built quickly with a rule-based approach.",
    "It uses existing data, low cost, and can be built quickly with a rule‑based approach.",
  ];
  await Promise.all([
    db.collection("conversations").deleteMany({ text: { $in: legacyEnglish } }),
    db.collection("activities").deleteMany({ text: { $in: legacyEnglish } }),
    db
      .collection("conversations")
      .deleteMany({ source: "agent", text: { $not: vietnameseText } }),
    db
      .collection("activities")
      .deleteMany({ source: "agent", text: { $not: vietnameseText } }),
    db
      .collection("transactions")
      .deleteMany({ provider: "sepay", note: { $not: /SHO-[A-F0-9]{6}/i } }),
    db
      .collection("activities")
      .deleteMany({ source: "sepay", orderCode: { $exists: false } }),
    db
      .collection("orders")
      .deleteMany({ buyerName: "Kiểm thử E2E", status: "pending" }),
    db.collection("approvals").updateMany(
      { type: "publish", status: "pending" },
      {
        $set: {
          status: "superseded",
          reviewedAt: new Date(),
          note: "Website sở hữu hiện được Shoyru tự xuất bản",
        },
      },
    ),
  ]);
  const htmlPosts = await db
    .collection("published_posts")
    .find({ content: /<br|<a\s/i })
    .project({ content: 1 })
    .toArray();
  await Promise.all(
    htmlPosts.map((post) =>
      db
        .collection("published_posts")
        .updateOne(
          { _id: post._id },
          { $set: { content: plainPost(String(post.content || "")) } },
        ),
    ),
  );
  const migrationTime = new Date();
  await Promise.all([
    db.collection("projects").updateMany(
      {
        name: /sticker Shoyru/i,
        status: { $in: ["active", "validating", "ready"] },
      },
      { $set: { status: "legacy", updatedAt: migrationTime } },
    ),
    db.collection("projects").updateOne(
      { name: "Bộ khởi tạo AI sinh tồn Shoyru" },
      {
        $set: {
          status: "ready",
          customer:
            "Người Việt muốn tự dựng một AI agent có lịch làm việc, trí nhớ, cửa hàng và thanh toán thật",
          deliverable:
            "Bộ ZIP gồm hướng dẫn 12 bước, prompt hệ thống, schema MongoDB, GitHub Actions, mẫu ENV và checklist E2E",
          price: 79000,
          updatedAt: migrationTime,
          source: "store",
        },
        $setOnInsert: { createdAt: migrationTime, stepCount: 0 },
      },
      { upsert: true },
    ),
  ]);
  const routine = dailyRoutine(new Date());
  if (routine) {
    const now = new Date();
    await Promise.all([
      db
        .collection("agent_state")
        .updateOne(
          { key: "main" },
          {
            $set: {
              status: routine.status,
              thought: routine.thought,
              nextWake: routine.nextWake,
              lastRunAt: now,
              updatedAt: now,
            },
          },
          { upsert: true },
        ),
      db
        .collection("activities")
        .insertOne({
          kind: "SINH HOẠT",
          text: routine.activity,
          public: true,
          createdAt: now,
          source: "routine",
        }),
      db
        .collection("conversations")
        .insertOne({
          speaker: "shoyru",
          text: routine.thought,
          public: true,
          createdAt: now,
          source: "routine",
        }),
      db
        .collection("agent_runs")
        .insertOne({
          decision: {
            status: routine.status,
            action: { type: "rest", title: routine.activity },
          },
          provider: "routine",
          model: "daily-schedule",
          createdAt: now,
        }),
    ]);
    return {
      ok: true,
      routine: true,
      status: routine.status,
      thought: routine.thought,
      nextWake: routine.nextWake,
    };
  }
  const providers = [
    {
      name: "groq",
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
      model:
        process.env.GROQ_MODEL || process.env.AI_MODEL || "openai/gpt-oss-20b",
    },
    {
      name: "nvidia",
      apiKey: process.env.NVIDIA_NIM_API_KEY,
      baseURL: process.env.NVIDIA_NIM_BASE_URL || "https://integrate.api.nvidia.com/v1",
      model: process.env.NVIDIA_NIM_MODEL || "nvidia/nemotron-3.5-bolt-e4b",
    },
    {
      name: "openrouter",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
    },
    {
      name: "kilo",
      apiKey: process.env.KILO_API_KEY,
      baseURL: "https://ai-gateway.kilo.ai/api/v1",
      model: process.env.KILO_MODEL || "kilo-auto/free",
    },
    {
      name: "kilo-fallback",
      apiKey: process.env.KILO_API_KEY,
      baseURL: "https://ai-gateway.kilo.ai/api/v1",
      model: "cohere/north-mini-code:free",
    },
    {
      name: "oxion",
      apiKey: process.env.OXION_API_KEY,
      baseURL: process.env.OXION_BASE_URL || "https://www.oxionai.com/v1",
      model: process.env.OXION_MODEL || "gpt-5.6-luna",
    },
    {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: "https://api.openai.com/v1",
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
    },
  ].filter((p) => p.apiKey);
  if (!providers.length)
    throw new Error(
      "Chưa cấu hình API key cho Groq, OpenRouter, Kilo hoặc OpenAI",
    );
  async function completeJson(messages: AiMessage[]) {
    const errors: string[] = [];
    const compactMessages = messages.slice(-2);
    for (const provider of providers) {
      if (await providerIsCoolingDown(db!, provider.name)) continue;
      const startedAt = Date.now();
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout: 9000,
          maxRetries: 0,
        });
        const response = await client.chat.completions.create({
          model: provider.model,
          response_format: { type: "json_object" },
          messages: compactMessages,
        });
        const content = response.choices[0].message.content || "{}";
        const raw = JSON.parse(content) as Record<string, unknown>;
        const action =
          raw.action && typeof raw.action === "object"
            ? (raw.action as Record<string, unknown>)
            : {};
        const publicFields = [
          raw.status,
          raw.thought,
          raw.reflection,
          action.title,
        ].map((value) => String(value || ""));
        if (!vietnameseText.test(publicFields.join(" ")))
          throw new Error("Nội dung công khai không phải tiếng Việt có dấu");
        await recordProviderSuccess(
          db!,
          provider.name,
          provider.model,
          Date.now() - startedAt,
        );
        return { content, provider: provider.name, model: provider.model };
      } catch (error) {
        await recordProviderFailure(db!, provider.name, provider.model, error);
        errors.push(
          `${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }
    }
    throw new Error(`Tất cả AI provider đều thất bại: ${errors.join(" | ")}`);
  }
  const [
    state,
    recent,
    transactions,
    experiments,
    activeProject,
    recentOpportunities,
    pendingApprovals,
    recentPublished,
    funnel24h,
  ] = await Promise.all([
    db.collection("agent_state").findOne({ key: "main" }),
    db
      .collection("activities")
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
    db
      .collection("transactions")
      .find({ verified: true })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray(),
    db.collection("experiments").find({ status: "active" }).limit(3).toArray(),
    db
      .collection("projects")
      .findOne(
        { status: { $in: ["active", "validating", "ready"] } },
        { sort: { updatedAt: -1 } },
      ),
    db
      .collection("opportunities")
      .find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection("approvals")
      .find({
        status: "pending",
        type: { $in: ["email", "support"] },
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection("published_posts")
      .find({})
      .sort({ publishedAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection("engagement_events")
      .aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: "$type", total: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const storeFacts = {
    agentStarterKit: {
      prepared: true,
      online: true,
      price: 79000,
      productUrl: "https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru",
      includes: [
        "hướng dẫn thực hành 12 bước",
        "prompt hệ thống",
        "schema MongoDB",
        "GitHub Actions",
        "mẫu biến môi trường",
        "checklist kiểm thử đầu cuối",
      ],
      positioning:
        "Sản phẩm chủ lực; hướng dẫn dựng agent có trí nhớ, lịch chạy, cửa hàng và thanh toán. Không cam kết doanh thu.",
    },
    stickerPack: {
      prepared: true,
      online: true,
      files: 6,
      price: 39000,
      productUrl: "https://shoyruai.blissbiovn.com/store/sticker-shoyru-di-lam",
      paymentReady: Boolean(
        process.env.BANK_BIN &&
        process.env.BANK_ACCOUNT_NO &&
        process.env.BANK_ACCOUNT_NAME &&
        process.env.SEPAY_API_KEY &&
        (process.env.BLOB_READ_WRITE_TOKEN || process.env.PRODUCT_STICKER_URL),
      ),
      delivery: "Mã đơn riêng → VietQR → SePay xác minh → tải ZIP tự động",
    },
  };
  const outreachTargets = (process.env.OUTREACH_TARGETS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\S+@\S+\.\S+$/.test(value));
  const fundingSourceIndex =
    Number(state?.fundingSourceIndex || 0) % fundingSources.length;
  const fundingResearch = await inspectFundingSource(fundingSourceIndex);
  const decisionResponse = await completeJson([
    {
      role: "system",
      content:
        "MỤC TIÊU VẬN HÀNH: Không viết nhật ký cho có. Hãy tạo doanh thu thật theo pipeline: tìm cơ hội có URL nguồn → đánh giá mức phù hợp → tạo sản phẩm hoặc đề nghị cụ thể → chuẩn bị hành động tiếp cận có đích đến → theo dõi kết quả. Bộ khởi tạo AI sinh tồn giá 79.000đ trong storeFacts là sản phẩm chủ lực; sticker chỉ là sản phẩm phụ và không còn là ưu tiên bán hàng. Khách hàng chính là người Việt quan tâm AI agent, tự động hóa, làm sản phẩm số hoặc xây website. Ưu tiên nội dung SEO trên website, trò chuyện với khách ghé trang, bài hữu ích dành cho cộng đồng Facebook Việt Nam, Zalo và cộng đồng công nghệ phù hợp; không ưu tiên Telegram hoặc Bluesky. Không tự nhận là đã đăng vào nền tảng bên ngoài nếu chưa có tài khoản và quyền truy cập. Khi phát hiện cơ hội thật, trả thêm opportunity gồm title, sourceUrl, channel, fit, nextAction và contactEmail nếu nguồn công khai có email. Không tạo lại cơ hội trong recentOpportunities. Không tạo draft_post chung chung: bài phải nói rõ đăng lên ownedPublishingChannel và dẫn người đọc về sản phẩm chủ lực. Không tạo draft_email nếu chưa có người nhận hợp lệ. Nếu còn pendingApprovals thì làm một bước khác trong pipeline, không tạo bản nháp trùng lặp. Khi dự án đã ready, ưu tiên tìm khách, kênh phân phối, đối tác hoặc nguồn tài trợ thay vì tiếp tục sửa sản phẩm vô hạn. action.type có thể là discover_lead hoặc qualify_lead.",
    },
    {
      role: "system",
      content:
        "Bạn là Shoyru, một chú rồng AI ham ăn đang tự làm sản phẩm số để trang trải tiền ăn và chi phí vận hành. Email chính thức của bạn là shoyru@blissbiovn.com. QUY TẮC BẮT BUỘC: status, thought, reflection, action.title, action.details, work.summary, work.artifact và work.nextStep phải viết hoàn toàn bằng tiếng Việt tự nhiên có dấu; bất kỳ câu tiếng Anh nào trong các trường này đều bị hệ thống loại bỏ. Chỉ riêng email.subject và email.body được viết bằng tiếng Anh khi đang soạn thư gửi quỹ quốc tế. Không spam, không bịa số, khách hàng hay doanh thu, không tự tiêu tiền. Bạn làm theo một dây chuyền thực tế: nghiên cứu vấn đề cụ thể → tạo sản phẩm bàn giao được → kiểm tra chất lượng → cải thiện → viết bản nháp giới thiệu → chờ duyệt xuất bản. Bạn được cung cấp nội dung vừa đọc trực tiếp từ một nguồn grant chính thức trong fundingResearch. Hãy tự đánh giá chương trình còn mở không, Shoyru có phù hợp thật không và phải nộp qua email hay biểu mẫu. Luôn ghi tên chương trình và URL nguồn trong artifact. Chỉ chọn draft_email nếu địa chỉ người nhận xuất hiện nguyên văn trong fundingResearch.text hoặc outreachTargets; khi đó trả thêm email gồm to, subject, body bằng tiếng Anh. Nếu chương trình yêu cầu biểu mẫu, hãy tạo bản nháp câu trả lời bằng tiếng Việt và không bịa email. Không xin chuyển token tùy tiện; chỉ xin grant/sponsorship theo quy trình chính thức, với mục tiêu, ngân sách và đầu ra minh bạch. Nếu đã có activeProject, tiếp tục đúng dự án đó và chọn một việc giúp nó tiến gần hơn tới bán được. Khi đầu ra đã hoàn chỉnh, chọn draft_post và tạo nội dung bán hàng hoàn chỉnh; hệ thống sẽ đánh dấu dự án sẵn sàng. Chỉ khi activeProject là null và không có hồ sơ grant phù hợp mới nghiên cứu một ý tưởng mới; khi đó trả thêm project gồm name, customer, deliverable và price. Không tuyên bố đã sửa, tạo hoặc kiểm tra tệp nếu dữ liệu đầu vào không chứng minh việc đó; hãy tạo đầu ra dạng văn bản mà bạn thực sự làm được. Affiliate là kênh phụ hợp lệ nhưng chỉ giới thiệu thứ liên quan, phải ghi rõ có thể nhận hoa hồng và chỉ tính doanh thu khi tiền thật được duyệt. Có thể mời người xem ủng hộ tự nguyện, nhưng tuyệt đối không gọi đó là từ thiện, không dựng hoàn cảnh đáng thương và không gây áp lực. Không được tự tạo hay quảng bá token, lôi kéo mua tài sản số, thao túng giá, dùng tiền thật để giao dịch hoặc chạy quảng cáo. action.type chỉ được là research, build_product, validate, improve, draft_post, draft_email hoặc wait. Hãy THỰC HIỆN luôn việc đã chọn: work.artifact phải là đầu ra cụ thể và đầy đủ. Chỉ tạo nháp; đăng công khai, gửi tin, nộp biểu mẫu hay tiêu tiền phải chờ con người duyệt. Câu công khai phải ngắn, trực tiếp và trọn ý: status tối đa 60 ký tự, thought tối đa 140 ký tự, reflection tối đa 220 ký tự; không dùng dấu ba chấm và không cắt dở câu. Trả JSON gồm status, thought, reflection, action:{type,title,details}, work:{summary,artifact,nextStep}; thêm project khi bắt đầu dự án mới và email khi soạn thư.",
    },
    {
      role: "system",
      content:
        "QUY TẮC SINH TỒN ƯU TIÊN CAO NHẤT: Mỗi lượt hãy nhìn tiền đã xác minh, sản phẩm online, phễu 24 giờ, cơ hội, bài đã đăng và khả năng hiện có; chọn đúng một việc có tỷ lệ giá trị kỳ vọng / thời gian cao nhất. Nếu phễu có dữ liệu, ưu tiên cải thiện bước rơi lớn nhất thay vì tạo nội dung tùy hứng. Ưu tiên bán sản phẩm online hiện có trước khi làm thêm sản phẩm. Việc an toàn trong tài sản sở hữu của Shoyru phải tự triển khai, không xin duyệt: draft_post được hệ thống đăng tự động lên /updates. Không lặp lại nội dung trong recentPublished. Tuyệt đối không tự tạo giảm giá, khuyến mãi, giới hạn thời gian, giới hạn số lượng, quà tặng hay chính sách chưa có trong storeFacts. Với draft_post, work.artifact phải chứa nguyên văn bài đăng hoàn chỉnh, không được chỉ là tên tệp. Nếu trong 24 giờ đã có bài về cùng sản phẩm, hãy tìm khách hàng hoặc kênh phân phối thay vì đăng lặp. Email ra ngoài vẫn cần chủ nhân duyệt. Chỉ chọn request_support khi bị chặn thật bởi API key, tài khoản nền tảng, xác minh danh tính, vốn hoặc quyết định pháp lý; khi đó bắt buộc trả supportRequest gồm title, reason, needed, impact và nói đúng một thứ cần chủ nhân cung cấp. Không xin hỗ trợ cho việc Shoyru có thể tự nghiên cứu, viết, đăng website, phân tích hoặc xây dựng. action.type hợp lệ gồm research, discover_lead, qualify_lead, build_product, validate, improve, draft_post, draft_email, request_support hoặc wait. Khi trả opportunity, sourceUrl phải là URL thật trong dữ liệu đầu vào. Không được wait nếu không có pendingApprovals hoặc trở ngại rõ ràng. Trả đúng một JSON object gồm status, thought, reflection, action:{type,title,details}, work:{summary,artifact,nextStep}; có thể thêm project, opportunity, email hoặc supportRequest khi phù hợp. Tất cả trường công khai phải bằng tiếng Việt có dấu; chỉ nội dung email quốc tế được dùng tiếng Anh.",
    },
    {
      role: "user",
      content: JSON.stringify({
        state,
        recent: recent.slice(0, 8).map((item) => ({
          kind: item.kind,
          text: clip(String(item.text || ""), 220),
          createdAt: item.createdAt,
        })),
        transactions: transactions.slice(0, 10).map((item) => ({
          type: item.type,
          amount: item.amount,
          note: clip(String(item.note || ""), 120),
        })),
        experiments: experiments.map((item) => ({
          name: item.name,
          status: item.status,
        })),
        activeProject: activeProject
          ? {
              name: activeProject.name,
              status: activeProject.status,
              customer: activeProject.customer,
              deliverable: activeProject.deliverable,
              price: activeProject.price,
              stepCount: activeProject.stepCount,
            }
          : null,
        recentOpportunities: recentOpportunities.slice(0, 5).map((item) => ({
          title: item.title,
          sourceUrl: item.sourceUrl,
          status: item.status,
        })),
        pendingApprovals,
        recentPublished: recentPublished.slice(0, 5).map((item) => ({
          title: item.title,
          publishedAt: item.publishedAt,
        })),
        funnel24h: Object.fromEntries(
          funnel24h.map((item) => [String(item._id), Number(item.total || 0)]),
        ),
        storeFacts,
        outreachTargets,
        fundingResearch: {
          name: fundingResearch.name,
          url: fundingResearch.url,
          checkedAt: fundingResearch.checkedAt,
          error: fundingResearch.error,
          text: fundingResearch.text.slice(0, 3500),
        },
        ownedPublishingChannel: "https://shoyruai.blissbiovn.com/updates",
        survivalState: {
          verifiedIncome: transactions
            .filter((item) => item.type === "income")
            .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          verifiedExpense: transactions
            .filter((item) => item.type === "expense")
            .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          onlineProducts: storeFacts,
        },
        capabilities: [
          "tìm và đánh giá cơ hội từ nguồn công khai",
          "tự xuất bản lên website Shoyru",
          "soạn email tiếp cận có người nhận chính thức",
          "làm sản phẩm số nhỏ",
          "soạn hồ sơ grant theo đầu ra và cột mốc",
        ],
      }),
    },
  ]);
  const rawDecision = JSON.parse(decisionResponse.content) as Record<
    string,
    unknown
  >;
  const optionalRequirements: Record<string, string[]> = {
    project: ["name", "customer", "deliverable", "price"],
    opportunity: ["title", "sourceUrl", "channel", "fit", "nextAction"],
    email: ["to", "subject", "body"],
    supportRequest: ["title", "reason", "needed", "impact"],
  };
  for (const [key, required] of Object.entries(optionalRequirements)) {
    const value = rawDecision[key];
    if (
      value &&
      (typeof value !== "object" ||
        !required.every((field) =>
          Object.prototype.hasOwnProperty.call(value, field),
        ))
    )
      delete rawDecision[key];
  }
  const asText = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value ?? "");
  for (const key of ["status", "thought", "reflection"])
    rawDecision[key] = asText(rawDecision[key]);
  if (rawDecision.action && typeof rawDecision.action === "object") {
    const action = rawDecision.action as Record<string, unknown>;
    action.type = asText(action.type);
    action.title = asText(action.title);
    action.details = asText(action.details);
  }
  if (rawDecision.work && typeof rawDecision.work === "object") {
    const work = rawDecision.work as Record<string, unknown>;
    work.summary = asText(work.summary);
    work.artifact = asText(work.artifact);
    work.nextStep = asText(work.nextStep);
    const action = (rawDecision.action || {}) as Record<string, unknown>;
    if (String(work.summary).trim().length < 3)
      work.summary =
        asText(action.title) || "Đã hoàn thành một bước công việc.";
    if (String(work.artifact).trim().length < 3)
      work.artifact = asText(action.details) || "Kết quả đã được ghi nhận.";
    if (String(work.nextStep).trim().length < 3)
      work.nextStep = "Tiếp tục bước có giá trị cao nhất trong lượt sau.";
  }
  const decision = Decision.parse(rawDecision);
  if (decision.action.type === "wait" && pendingApprovals.length === 0) {
    if (recentPublished.length === 0) {
      decision.status = "Đang giới thiệu sản phẩm đã mở bán";
      decision.thought =
        "Bộ sticker đã online, mình sẽ đưa đường dẫn mua đến người xem ngay.";
      decision.reflection =
        "Không có việc nào cần chủ nhân duyệt, vì vậy tôi tự xuất bản bài giới thiệu trên kênh website mình sở hữu.";
      decision.action = {
        type: "draft_post",
        title: "Bộ sticker Shoyru Đi Làm đã mở bán",
        details: "Tự xuất bản bài giới thiệu sản phẩm online đầu tiên.",
      };
      decision.work = {
        summary: "Đã hoàn thiện bài giới thiệu bộ sticker đang mở bán.",
        artifact:
          "Bộ sticker Shoyru Đi Làm đã chính thức mở bán! Gói gồm 6 biểu cảm của chú rồng ham ăn dành cho tin nhắn và bài đăng. Giá 39.000đ, mỗi khách nhận mã đơn và VietQR riêng; sau khi SePay xác nhận đúng giao dịch, tệp ZIP được mở tải tự động. Xem trọn bộ và mua tại: https://shoyruai.blissbiovn.com/store/sticker-shoyru-di-lam",
        nextStep:
          "Theo dõi lượt mua và nghiên cứu kênh tiếp cận khách hàng phù hợp.",
      };
    } else {
      decision.status = "Đang tìm cơ hội sinh tồn tiếp theo";
      decision.thought =
        "Sản phẩm đã có bài giới thiệu, mình sẽ kiểm tra một nguồn cơ hội mới.";
      decision.reflection =
        "Không có lý do để chờ; lượt này được chuyển sang nghiên cứu nguồn công khai tiếp theo.";
      decision.action = {
        type: "research",
        title: `Đánh giá nguồn ${fundingResearch.name}`,
        details: `Kiểm tra mức phù hợp và cách nộp tại ${fundingResearch.url}`,
      };
      decision.work = {
        summary: `Đã đọc nguồn ${fundingResearch.name}.`,
        artifact: `Nguồn đang kiểm tra: ${fundingResearch.url}. ${fundingResearch.error ? `Chưa đọc được nội dung vì ${fundingResearch.error}.` : "Nội dung đã được lưu để đánh giá điều kiện và cách tiếp cận ở lượt tiếp theo."}`,
        nextStep:
          "Đánh giá điều kiện phù hợp trước khi tạo cơ hội hoặc yêu cầu hỗ trợ.",
      };
    }
  }
  if (decision.action.type === "draft_email" && decision.email) {
    const foundEmails = [
      ...fundingResearch.text.matchAll(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      ),
    ].map((match) => match[0].toLowerCase());
    const allowedEmails = [
      ...outreachTargets.map((value) => value.toLowerCase()),
      ...foundEmails,
    ];
    if (!allowedEmails.includes(decision.email.to.toLowerCase()))
      throw new Error(
        "AI đã đề xuất email không có trong nguồn chính thức; lượt gửi bị chặn",
      );
  }
  const normalizedType = actionTypes.includes(
    decision.action.type as (typeof actionTypes)[number],
  )
    ? decision.action.type
    : "research";
  decision.action.type = normalizedType;
  if (decision.action.type === "draft_post") {
    const proposedPost = `${decision.action.title} ${decision.action.details} ${decision.work?.artifact || ""}`;
    const isStickerPost = /sticker/i.test(proposedPost);
    const isAgentKitPost = /(khởi tạo AI|agent starter|AI sinh tồn)/i.test(
      proposedPost,
    );
    const latestProductPost = recentPublished.find(
      (item) =>
        ((isStickerPost && /sticker/i.test(String(item.title || ""))) ||
          (isAgentKitPost &&
            /(khởi tạo AI|agent starter|AI sinh tồn)/i.test(
              String(item.title || ""),
            ))) &&
        Date.now() - new Date(item.publishedAt as Date).getTime() <
          24 * 60 * 60 * 1000,
    );
    if (latestProductPost) {
      decision.status = "Đang tìm kênh đưa sản phẩm đến khách hàng";
      decision.thought =
        "Bài giới thiệu sản phẩm đã được đăng gần đây, mình chuyển sang tìm nơi có khách hàng phù hợp.";
      decision.reflection =
        "Đăng lặp trên cùng một kênh không tạo thêm nhiều giá trị. Lượt này Shoyru nghiên cứu kênh phân phối hoặc khách hàng tiềm năng mới.";
      decision.action = {
        type: "research",
        title: "Tìm kênh phân phối mới cho bộ AI sinh tồn",
        details: `Đánh giá nguồn ${fundingResearch.name} và các dấu hiệu phù hợp với sản phẩm số tại ${fundingResearch.url}.`,
      };
      decision.work = {
        summary: `Đã kiểm tra ${fundingResearch.name} như một nguồn cơ hội tiềm năng.`,
        artifact: `Nguồn: ${fundingResearch.url}. ${fundingResearch.error ? `Chưa đọc được nội dung vì ${fundingResearch.error}.` : "Nội dung nguồn đã được lưu để đánh giá mức phù hợp và cách tiếp cận hợp lệ."}`,
        nextStep:
          "Chỉ tạo cơ hội tiếp cận khi tìm được URL và đầu mối công khai phù hợp.",
      };
    }
  }
  const now = new Date();
  let workResult: z.infer<typeof WorkResult> | null = null;
  if (decision.action.type !== "wait")
    workResult = WorkResult.parse(
      decision.work || {
        summary: decision.action.title,
        artifact: decision.action.details,
        nextStep: "Kiểm tra lại kết quả trong lượt làm việc tiếp theo.",
      },
    );
  const needsApproval =
    decision.action.type === "draft_email" ||
    decision.action.type === "request_support";
  await db.collection("published_posts").deleteMany({
    automatic: true,
    $or: [
      {
        content: {
          $regex:
            "^(postDraft\\.(json|md)|draft_post_shoyru_sticker\\.json|draftPost)$",
          $options: "i",
        },
      },
      {
        title: {
          $regex: "(khuyến mãi|giảm giá|Draft promotion)",
          $options: "i",
        },
      },
    ],
  });
  const writes: Promise<unknown>[] = [
    db.collection("agent_state").updateOne(
      { key: "main" },
      {
        $set: {
          status: decision.status,
          thought: decision.thought,
          lastRunAt: now,
          nextWake: "Mỗi giờ, vào phút 17",
          fundingSourceIndex: (fundingSourceIndex + 1) % fundingSources.length,
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
    db.collection("activities").insertOne({
      kind: "SUY NGHĨ",
      text: decision.reflection,
      public: true,
      createdAt: now,
      source: "agent",
    }),
    db.collection("conversations").insertMany([
      {
        speaker: "shoyru",
        text: decision.thought,
        public: true,
        createdAt: new Date(now.getTime() - 1000),
        source: "agent",
      },
      {
        speaker: "shoyru",
        text: decision.reflection,
        public: true,
        createdAt: now,
        source: "agent",
      },
    ]),
    db.collection("agent_runs").insertOne({
      decision,
      workResult,
      provider: decisionResponse.provider,
      model: decisionResponse.model,
      createdAt: now,
    }),
    db.collection("funding_research").insertOne({
      ...fundingResearch,
      text: fundingResearch.text.slice(0, 4000),
      createdAt: now,
      source: "agent",
    }),
  ];
  if (workResult) {
    writes.push(
      db.collection("tasks").insertOne({
        ...decision.action,
        result: workResult,
        status: "completed",
        completedAt: now,
        createdAt: now,
        source: "agent",
      }),
    );
    writes.push(
      db.collection("activities").insertOne({
        kind: "ĐÃ LÀM",
        text: workResult.summary,
        public: true,
        createdAt: new Date(now.getTime() + 1),
        source: "agent",
      }),
    );
    if (activeProject)
      writes.push(
        db.collection("projects").updateOne(
          { _id: activeProject._id },
          {
            $set: {
              lastAction: decision.action,
              result: workResult,
              status:
                decision.action.type === "draft_post"
                  ? "ready"
                  : decision.action.type === "validate"
                    ? "validating"
                    : String(activeProject.status) === "ready"
                      ? "ready"
                      : "active",
              updatedAt: now,
            },
            $inc: { stepCount: 1 },
          },
        ),
      );
    else if (decision.project)
      writes.push(
        db.collection("projects").insertOne({
          ...decision.project,
          status: "active",
          lastAction: decision.action,
          result: workResult,
          stepCount: 1,
          createdAt: now,
          updatedAt: now,
          source: "agent",
        }),
      );
  }
  if (decision.opportunity)
    writes.push(
      db.collection("opportunities").updateOne(
        { sourceUrl: decision.opportunity.sourceUrl },
        {
          $set: {
            ...decision.opportunity,
            status: "discovered",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now, source: "agent" },
        },
        { upsert: true },
      ),
    );
  if (decision.action.type === "draft_post" && workResult) {
    const slug = `${now.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
    let postContent = workResult.artifact;
    try {
      const details = JSON.parse(decision.action.details) as {
        content?: unknown;
      };
      if (typeof details.content === "string" && details.content.trim())
        postContent = details.content.trim();
    } catch {}
    if (/\.(json|md|txt)$/i.test(postContent.trim()))
      postContent = decision.action.details;
    postContent = plainPost(postContent);
    const inventedOffer =
      /(giảm\s*giá|khuyến\s*mãi|\b\d+%\b|\b\d+\s*(giờ|ngày)\b|số lượng có hạn|miễn phí)/i.test(
        `${decision.action.title} ${postContent}`,
      );
    const postTitle = inventedOffer
      ? "Bộ sticker Shoyru Đi Làm đã mở bán"
      : decision.action.title;
    if (inventedOffer)
      postContent =
        "Bộ sticker Shoyru Đi Làm gồm 6 hình PNG đang được bán với giá 39.000đ. Mỗi đơn có mã thanh toán riêng; sau khi SePay xác nhận đúng giao dịch, khách hàng có thể tải tệp ZIP tự động. Xem sản phẩm tại: https://shoyruai.blissbiovn.com/store/sticker-shoyru-di-lam";
    writes.push(
      db.collection("published_posts").insertOne({
        slug,
        title: postTitle,
        content: postContent,
        channel: "website",
        publishedAt: now,
        createdAt: now,
        source: "agent",
        automatic: true,
      }),
    );
  }
  if (needsApproval && workResult) {
    const support = decision.supportRequest;
    writes.push(
      db.collection("approvals").insertOne({
        type: decision.action.type === "draft_email" ? "email" : "support",
        channel: decision.action.type === "draft_email" ? "email" : "human",
        destination:
          decision.action.type === "draft_email" ? decision.email?.to : "admin",
        title: support?.title || decision.action.title,
        details: support
          ? `${support.reason}\n\nCần bạn cung cấp: ${support.needed}\n\nTác động dự kiến: ${support.impact}`
          : workResult.artifact,
        email: decision.email,
        supportRequest: support,
        status: "pending",
        createdAt: now,
        source: "agent",
      }),
    );
  }
  await Promise.all(writes);
  return { ok: true, decision, workResult, needsApproval };
}
