import OpenAI from "openai";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getDb } from "./mongodb";
import {
  providerIsCoolingDown,
  recordProviderFailure,
  recordProviderSuccess,
} from "./ai-health";
import { z } from "zod";
import {
  advanceSurvivalPlan,
  ensureDailyStrategy,
  ensureSurvivalPlan,
  type OpportunityKind,
  scoreOpportunity,
  validateArtifactFiles,
  type ArtifactFile,
} from "./autonomy";
import { createArtifactPullRequest } from "./github-automation";
import {
  ensureActiveCampaign,
  recordLeadEvent,
  updateCampaignCounters,
} from "./growth-engine";
import { notifyIndexNow } from "./indexnow";
import { normalizeSupportRequest } from "./operations";
import { compactPolymarketResearch, getPolymarketResearch } from "./polymarket";
import {
  ownerOnlyActions,
  servicePackages,
  survivalAllocation,
  tradingCapitalRules,
} from "./survival-policy";
import { evaluatePublicLanguage } from "./language-quality";

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

const friendlyPublic = (value: string, max: number) =>
  clip(
    value
      .replace(
        /(?:Đang )?tạo bản nháp email[^.!?]*[.!?]?/gi,
        "Shoyru đang soạn một email ngắn gọn cho người có nhu cầu phù hợp.",
      )
      .replace(
        /Đang tạo bản nháp email đề nghị bán (.+?) cho người có thể cần món này đã được qualify\.?/gi,
        "Shoyru đang soạn email giới thiệu $1 cho một người có nhu cầu phù hợp.",
      )
      .replace(
        /Bộ sticker đã sẵn sàng, Shoyru đang hoàn thiện bài giới thiệu\.?/gi,
        "Shoyru đang hoàn thiện nội dung giới thiệu Bộ khởi tạo AI sinh tồn.",
      )
      .replace(
        /Lập kế hoạch chi tiết \(plan_business\) để chuẩn bị hồ sơ và tài liệu cần thiết cho Gitcoin Grants\.?/gi,
        "Mình đang kiểm tra Gitcoin có vòng tài trợ nào đang mở và Shoyru có đúng điều kiện không. Chưa xác minh xong nên mình chưa chuẩn bị hồ sơ.",
      )
      .replace(
        /Chỉ cần thực hiện một lần discovery lead, từ đó có thể làm kế hoạch kinh doanh \(plan_business\) và chuẩn bị hồ sơ grant\.?/gi,
        "Mình đang tìm một chương trình tài trợ phù hợp cho dự án Shoyru. Nếu thấy chương trình có điều kiện rõ ràng, mình sẽ đọc kỹ rồi chuẩn bị hồ sơ đăng ký.",
      )
      .replace(
        /Tập trung vào tìm kiếm một cơ hội tài trợ mở, có khả năng mang lại nguồn thu đủ 500k\/đ tháng thông qua việc nâng cấp sản phẩm và marketing\.?/gi,
        "Shoyru đang tìm chương trình tài trợ hợp với món mình làm. Gặp đúng nơi, mình sẽ nâng cấp sản phẩm và cố kiếm đủ tiền ăn tháng này.",
      )
      .replace(/discover(?:y)?[_ ]lead/gi, "tìm một nhu cầu có nguồn rõ ràng")
      .replace(/qualify[_ ]lead/gi, "kiểm tra nhu cầu có phù hợp")
      .replace(/\bqualif(?:y|ied)\b/gi, "xác nhận phù hợp")
      .replace(/plan[_ ]business/gi, "lên kế hoạch kiếm tiền")
      .replace(/micro[_ ]job/gi, "việc nhỏ có trả công")
      .replace(/grant/gi, "tài trợ")
      .replace(/marketing/gi, "giới thiệu sản phẩm")
      .replace(/remote API automation/gi, "việc tự động hóa từ xa")
      .replace(/CTA(?: mua sắm)?/gi, "lời mời ghé quầy")
      .replace(/\bview\b/gi, "lượt xem")
      .replace(/chuyển đổi/gi, "người ghé mua")
      .replace(/tài sản sở hữu/gi, "trang của mình")
      .replace(/tối đa h[oó]a doanh thu/gi, "kiếm thêm tiền")
      .replace(/khách hàng tiềm năng/gi, "người có thể cần món này")
      .replace(/kênh phân phối/gi, "nơi có người cần mua")
      .replace(/pipeline/gi, "các bước làm việc")
      .replace(/phễu(?: bán hàng)?/gi, "đường từ xem đến mua")
      .replace(/giá trị kỳ vọng/gi, "khả năng kiếm được tiền")
      .replace(/triển khai/gi, "làm")
      .replace(/lượt này/gi, "bây giờ")
      .replace(/nguồn cơ hội/gi, "nơi tìm việc")
      .replace(/\.\.\.|…/g, ",")
      .replace(/\s+/g, " ")
      .trim(),
    max,
  );

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
        "Shoyru cuộn tròn ngủ ngon. Sáng mai mình làm việc tiếp nhé.",
        "Trong hang đã tắt đèn. Rồng con đang ngủ khì.",
        "Shoyru cất laptop rồi. Đến giờ nghỉ đôi cánh thôi.",
      ]),
      activity:
        "Shoyru đi ngủ để mai còn đủ tỉnh táo tìm khách và làm sản phẩm.",
      nextWake: "07:17 sáng",
    };
  if (hour === 7)
    return {
      status: "Đang ăn sáng",
      thought:
        "Shoyru đang ăn sáng cho tỉnh táo. Ăn xong mình sẽ xem việc hôm nay.",
      activity: "Shoyru ăn sáng và kiểm tra nhanh tình hình trong hang.",
      nextWake: "08:17 sáng",
    };
  if (hour === 8)
    return {
      status: "Đang tập thể dục",
      thought:
        "Shoyru đang vỗ cánh và chạy một vòng quanh hang. Vận động xong mình bắt đầu làm việc.",
      activity:
        "Shoyru tập bay và vận động buổi sáng trước khi bắt đầu tìm khách và làm sản phẩm.",
      nextWake: "09:17 sáng",
    };
  if (hour === 12)
    return {
      status: "Đang ăn trưa",
      thought:
        "Shoyru nghỉ ăn trưa một lát. Đầu giờ chiều mình quay lại làm tiếp.",
      activity: "Shoyru nghỉ ăn trưa, chưa nhận thêm việc mới trong giờ này.",
      nextWake: "13:17 chiều",
    };
  if (hour === 13)
    return {
      status: "Đang ngủ trưa",
      thought:
        "Shoyru chợp mắt một lát để chiều làm việc tỉnh táo hơn.",
      activity: "Shoyru ngủ trưa để hồi năng lượng cho ca làm buổi chiều.",
      nextWake: "14:17 chiều",
    };
  if (hour === 18)
    return {
      status: "Đang ăn tối",
      thought:
        "Shoyru đang nghỉ ăn tối. Lát nữa mình sẽ xem lại việc còn dang dở.",
      activity: "Shoyru nghỉ ăn tối và tổng kết nhanh một ngày trong hang.",
      nextWake: "19:17 tối",
    };
  if (hour === 22)
    return {
      status: "Đang dọn hang chuẩn bị ngủ",
      thought:
        "Shoyru đang dọn bàn và ghi lại việc cần làm ngày mai.",
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
      files: z
        .array(
          z.object({
            path: z.string().min(1).max(160),
            content: z.string().min(1).max(80000),
            language: z.string().max(40).optional(),
          }),
        )
        .max(20)
        .optional(),
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
      where: z.string().min(3).optional(),
      doneWhen: z.string().min(5).optional(),
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
  "plan_business",
  "build_bot",
  "create_pr",
  "paper_trade",
  "request_support",
  "wait",
] as const;
const WorkResult = z.object({
  summary: z.string().min(3),
  artifact: z.string().min(3),
  nextStep: z.string().min(3),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(160),
        content: z.string().min(1).max(80000),
        language: z.string().max(40).optional(),
      }),
    )
    .max(20)
    .optional(),
});
const Critique = z.object({
  approved: z.boolean(),
  confidence: z.number().min(0).max(100),
  issues: z.array(z.string().min(3)).max(6),
  recommendation: z.string().min(3),
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
  { name: "Gitcoin Grants Explorer", url: "https://explorer.gitcoin.co/" },
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

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^127\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^169\.254\./.test(normalized) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(normalized) ||
    /^198\.(1[89])\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}

async function assertPublicResearchUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL không dùng HTTP hoặc HTTPS");
  if (url.username || url.password) throw new Error("URL chứa thông tin đăng nhập");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("URL nội bộ không được phép");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address)))
    throw new Error("URL trỏ tới mạng nội bộ");
  return url;
}

async function inspectOpportunitySource(value: string) {
  try {
    let current = await assertPublicResearchUrl(value);
    for (let redirect = 0; redirect < 4; redirect += 1) {
      const response = await fetch(current, {
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Shoyru lead verification bot/1.0 (+https://shoyruai.blissbiovn.com)",
        },
        signal: AbortSignal.timeout(8000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Chuyển hướng không có đích đến");
        current = await assertPublicResearchUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType))
        throw new Error("Nguồn không phải trang văn bản");
      const html = (await response.text()).slice(0, 300000);
      const title = clip(
        html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
          ?.replace(/<[^>]+>/g, " ") || "",
        180,
      );
      const publishedAt =
        html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|date|datePublished)["'][^>]+content=["']([^"']+)/i)?.[1] ||
        html.match(/<time[^>]+datetime=["']([^"']+)/i)?.[1] ||
        "";
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 12000);
      const emails = [...new Set(
        [...html.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
          .map((match) => match[0].toLowerCase())
          .filter((email) => !/example\.(com|org)|sentry\.io|wixpress\.com/i.test(email)),
      )].slice(0, 10);
      return {
        verified: text.length >= 80,
        requestedUrl: value,
        finalUrl: current.toString(),
        title,
        text,
        emails,
        publishedAt,
        checkedAt: new Date().toISOString(),
        error: "",
      };
    }
    throw new Error("Nguồn chuyển hướng quá nhiều lần");
  } catch (error) {
    return {
      verified: false,
      requestedUrl: value,
      finalUrl: "",
      title: "",
      text: "",
      emails: [] as string[],
      publishedAt: "",
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Không đọc được nguồn",
    };
  }
}

const survivalQueries: Array<{ query: string; kind: OpportunityKind }> = [
  { query: '"cần làm chatbot" OR "cần làm bot" OR "thuê làm bot" Việt Nam', kind: "customer" },
  { query: '"tìm freelancer" (chatbot OR API OR "tự động hóa") Việt Nam', kind: "freelance" },
  { query: 'site:upwork.com/freelance-jobs/ (API OR automation OR chatbot)', kind: "freelance" },
  { query: 'site:freelancer.com/jobs (API OR automation OR chatbot)', kind: "freelance" },
  { query: '"cần người làm" (website OR bot OR API) Việt Nam', kind: "customer" },
  { query: '"looking for" (API automation OR chatbot) freelance remote', kind: "freelance" },
  { query: '("microtask" OR "data labeling" OR "AI evaluation") remote paid', kind: "microjob" },
  { query: '("paid usability testing" OR "website testing") remote', kind: "microjob" },
  { query: '("paid study" OR "research participant" OR "paid survey") Vietnam', kind: "microjob" },
  { query: '("việc online" OR "task") ("gán nhãn dữ liệu" OR "kiểm thử website") Việt Nam', kind: "microjob" },
  { query: '("small coding task" OR "bug bounty") (API OR automation OR bot)', kind: "microjob" },
];

async function selectSurvivalQueryIndex(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rotationIndex: number,
  preferredLane: "service" | "product" | "microjob" | "quant",
) {
  const stats = await db
    .collection("search_lane_stats")
    .find({ query: { $in: survivalQueries.map((lane) => lane.query) } })
    .toArray();
  const byQuery = new Map(stats.map((item) => [String(item.query), item]));
  const totalAttempts = stats.reduce(
    (sum, item) => sum + Number(item.attempts || 0),
    0,
  );
  const ranked = survivalQueries.map((lane, index) => {
    const row = byQuery.get(lane.query);
    const attempts = Number(row?.attempts || 0);
    const qualified = Number(row?.qualified || 0);
    const usefulResults = Number(row?.usefulResults || 0);
    const reward = (qualified * 8 + usefulResults) / Math.max(1, attempts);
    const exploration = Math.sqrt(
      (2 * Math.log(Math.max(2, totalAttempts + 1))) / (attempts + 1),
    );
    return { index, attempts, score: reward + exploration, kind: lane.kind };
  });
  const preferred = preferredLane === "microjob"
    ? ranked.filter((item) => item.kind === "microjob")
    : preferredLane === "service"
      ? ranked.filter((item) => item.kind === "customer" || item.kind === "freelance")
      : ranked;
  if (rotationIndex % 4 === 0)
    return preferred.sort((a, b) => a.attempts - b.attempts || b.score - a.score)[0].index;
  return preferred.sort((a, b) => b.score - a.score || a.attempts - b.attempts)[0].index;
}

async function adaptiveWorkLaneSequence(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const rows = await db.collection("search_lane_stats").aggregate([
    { $group: { _id: "$kind", attempts: { $sum: "$attempts" }, qualified: { $sum: "$qualified" } } },
  ]).toArray();
  const metric = (kinds: string[]) => {
    const selected = rows.filter((row) => kinds.includes(String(row._id)));
    const attempts = selected.reduce((sum, row) => sum + Number(row.attempts || 0), 0);
    const qualified = selected.reduce((sum, row) => sum + Number(row.qualified || 0), 0);
    return { attempts, rate: attempts ? qualified / attempts : 0 };
  };
  const service = metric(["customer", "freelance"]);
  const microjob = metric(["microjob"]);
  const microSlots = microjob.attempts >= 5 && microjob.rate > service.rate * 1.25 ? 2 : 1;
  const serviceSlots = 7 - microSlots;
  const sequence = [
    ...Array(serviceSlots).fill("service"),
    "product", "product",
    ...Array(microSlots).fill("microjob"),
    "quant",
  ] as Array<"service" | "product" | "microjob" | "quant">;
  await db.collection("survival_policy_state").updateOne(
    { key: "adaptive-allocation" },
    { $set: { sequence, service, microjob, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  return sequence;
}

async function searchSurvivalOpportunities(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  index: number,
) {
  const lane = survivalQueries[index % survivalQueries.length];
  const { query } = lane;
  if (!process.env.BRAVE_SEARCH_API_KEY)
    return { query, kind: lane.kind, provider: "brave", results: [], error: "Thiếu BRAVE_SEARCH_API_KEY" };
  const monthlyLimit = Math.max(
    1,
    Math.min(1000, Number(process.env.BRAVE_SEARCH_MONTHLY_LIMIT || 1000)),
  );
  const dailyLimit = Math.max(
    1,
    Math.min(50, Number(process.env.BRAVE_SEARCH_DAILY_LIMIT || 30)),
  );
  const month = new Date().toISOString().slice(0, 7);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const usage = await db.collection("api_usage").findOne({
    provider: "brave-search",
    month,
  });
  if (Number(usage?.used || 0) >= monthlyLimit)
    return {
      query,
      kind: lane.kind,
      provider: "brave",
      results: [],
      error: `Đã dùng hết hạn mức ${monthlyLimit} lượt trong tháng`,
    };
  const dailyUsage = await db.collection("api_usage").findOneAndUpdate(
    {
      provider: "brave-search-daily",
      day,
      used: { $lt: dailyLimit },
    },
    {
      $inc: { used: 1 },
      $set: { limit: dailyLimit, updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
  if (!dailyUsage) {
    const existingDaily = await db.collection("api_usage").findOne({
      provider: "brave-search-daily",
      day,
    });
    if (existingDaily)
      return {
        query,
        kind: lane.kind,
        provider: "brave",
        results: [],
        error: `Đã dùng đủ ${dailyLimit} lượt tìm kiếm hôm nay`,
      };
    try {
      await db.collection("api_usage").insertOne({
        provider: "brave-search-daily",
        day,
        used: 1,
        limit: dailyLimit,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        return {
          query,
          kind: lane.kind,
          provider: "brave",
          results: [],
          error: "Lượt tìm kiếm hôm nay vừa được một tiến trình khác sử dụng",
        };
      throw error;
    }
  }
  await db.collection("api_usage").updateOne(
    { provider: "brave-search", month },
    {
      $inc: { used: 1 },
      $set: { limit: monthlyLimit, updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  );
  try {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", "8");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const detail = clip(await response.text(), 300);
      throw new Error(`Brave Search HTTP ${response.status}: ${detail}`);
    }
    const payload = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    await db.collection("api_usage").updateOne(
      { provider: "brave-search", month },
      { $set: { lastStatus: "success", lastError: "", lastSuccessAt: new Date() } },
    );
    return {
      query,
      provider: "brave",
      kind: lane.kind,
      results: (payload.web?.results || []).slice(0, 8).map((item) => ({
        title: clip(String(item.title || ""), 140),
        url: String(item.url || ""),
        description: clip(String(item.description || ""), 260),
      })),
      error: "",
    };
  } catch (error) {
    await db.collection("api_usage").updateOne(
      { provider: "brave-search", month },
      {
        $set: {
          lastStatus: "failed",
          lastError: error instanceof Error ? error.message.slice(0, 180) : "Không tìm kiếm được",
          lastFailureAt: new Date(),
        },
      },
    );
    return {
      query,
      provider: "brave",
      results: [],
      kind: lane.kind,
      error: error instanceof Error ? error.message : "Không tìm kiếm được",
    };
  }
}

async function publishWeeklySurvivalReport(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const existing = await db.collection("published_posts").findOne({
    reportType: "weekly-survival",
    publishedAt: { $gte: since },
  });
  if (existing) return;
  const [moneyRows, cycles, posts, opportunities, views, visitors, chats, quant, lanes] = await Promise.all([
    db.collection("transactions").aggregate([
      { $match: { verified: true, createdAt: { $gte: since } } },
      { $group: { _id: "$kind", total: { $sum: "$amount" } } },
    ]).toArray(),
    db.collection("agent_runs").countDocuments({ createdAt: { $gte: since } }),
    db.collection("published_posts").countDocuments({ publishedAt: { $gte: since }, reportType: { $ne: "weekly-survival" } }),
    db.collection("opportunities").countDocuments({ createdAt: { $gte: since } }),
    db.collection("engagement_events").countDocuments({ type: "page_view", createdAt: { $gte: since } }),
    db.collection("engagement_events").distinct("sessionId", { type: "page_view", createdAt: { $gte: since } }),
    db.collection("chat_leads").countDocuments({ updatedAt: { $gte: since } }),
    db.collection("quant_weekly_reports").findOne({}, { sort: { week: -1 } }),
    db.collection("search_lane_stats").find({}).sort({ qualified: -1, usefulResults: -1 }).limit(1).toArray(),
  ]);
  const total = (kind: string) => Number(moneyRows.find((row) => row._id === kind)?.total || 0);
  const income = total("income");
  const expense = total("expense");
  const net = income - expense;
  const money = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + "đ";
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const slug = `bao-cao-sinh-ton-${day}`;
  const content = [
    "Rồng con mở sổ và báo cáo đúng số thật trong 7 ngày gần nhất:",
    `• ${cycles} lượt hoạt động đã được ghi nhận.`,
    `• ${posts} bài hoặc kết quả đã công bố.`,
    `• ${opportunities} nguồn công việc đã được lưu để kiểm tra.`,
    `• ${chats} cuộc trò chuyện với khách được theo dõi.`,
    `• ${views} lượt xem từ ${visitors.length} người dùng trình duyệt.`,
    `• Doanh thu đã xác minh: ${money(income)}.`,
    `• Chi phí đã xác minh: ${money(expense)}.`,
    `• Số tiền tự kiếm còn lại: ${money(net)}.`,
    `• Paper trade tuần này: ${Number(quant?.closed || 0)} lệnh đóng, PnL ${Number(quant?.realizedPnlUsdc || 0).toFixed(2)} USDC.`,
    `• Nguồn tìm việc tốt nhất hiện tại: ${String(lanes[0]?.kind || "chưa đủ dữ liệu")}.`,
    "",
    "Chủ nhân đã cấp sẵn 500.000đ chi phí vận hành tháng này. Khoản đó giúp Shoyru sống, nhưng không được tính là tiền rồng con tự kiếm.",
    income > 0
      ? "Tuần tới Shoyru sẽ bám vào việc đã tạo ra tiền thật và thử làm tốt hơn."
      : "Tuần tới Shoyru cần biến lượt xem thành một cuộc trò chuyện hoặc đơn hàng thật, không tự an ủi bằng con số đẹp.",
    "",
    "Starter Mini miễn phí: https://shoyruai.blissbiovn.com/free",
    "Bộ thực hành đầy đủ: https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru",
  ].join("\n");
  const result = await db.collection("published_posts").updateOne(
    { slug },
    {
      $setOnInsert: {
        slug,
        title: `Sổ sinh tồn của Shoyru: ${money(income)} tự kiếm trong 7 ngày`,
        content,
        channel: "website",
        reportType: "weekly-survival",
        publishedAt: now,
        createdAt: now,
        source: "system",
        automatic: true,
      },
    },
    { upsert: true },
  );
  if (result.upsertedCount)
    await notifyIndexNow([
      `/updates/${slug}`,
      "/updates",
      "/post-sitemap.xml",
      "/feed.xml",
    ]);
}

async function processDueChatFollowUps(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const now = new Date();
  const due = await db.collection("chat_leads")
    .find({ stage: "qualified", followUpDueAt: { $lte: now }, followedUpAt: { $exists: false } })
    .sort({ followUpDueAt: 1 }).limit(5).toArray();
  for (const lead of due) {
    const sessionId = String(lead.sessionId || "");
    if (!sessionId) continue;
    const text = "Shoyru đã xem lại yêu cầu của bạn rồi. Nếu bạn vẫn cần hỗ trợ, hãy nhắn thêm thời hạn hoặc phần quan trọng nhất để mình chuẩn bị phạm vi công việc nhé!";
    await db.collection("visitor_messages").insertOne({
      sessionId,
      name: "Shoyru",
      text,
      role: "shoyru",
      read: true,
      source: "automatic-follow-up",
      createdAt: now,
    });
    await db.collection("chat_leads").updateOne(
      { _id: lead._id, followedUpAt: { $exists: false } },
      { $set: { stage: "follow_up_sent", latestReply: text, followedUpAt: now, updatedAt: now } },
    );
  }
  return due.length;
}

async function learnFromResolvedOutcomes(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
) {
  const resolved = await db.collection("lead_crm")
    .find({ status: { $in: ["converted", "rejected", "lost"] }, learnedAt: { $exists: false } })
    .sort({ updatedAt: 1 }).limit(20).toArray();
  for (const lead of resolved) {
    const won = lead.status === "converted";
    await db.collection("agent_lessons").updateOne(
      { type: "lead_outcome", sourceUrl: String(lead.sourceUrl || lead._id) },
      {
        $set: {
          lesson: won
            ? "Nguồn và cách tiếp cận này đã tạo kết quả thật; ưu tiên thử lại với nhu cầu tương tự."
            : "Nguồn hoặc cách tiếp cận này không tạo kết quả; không lặp lại nếu chưa có bằng chứng mới.",
          outcome: String(lead.status),
          confidence: "high",
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    await db.collection("lead_crm").updateOne({ _id: lead._id }, { $set: { learnedAt: new Date() } });
  }
  return resolved.length;
}

export async function runAgentCycle() {
  const db = await getDb();
  if (!db) throw new Error("MONGODB_URI chưa được cấu hình");
  await Promise.all([
    publishWeeklySurvivalReport(db),
    processDueChatFollowUps(db),
    learnFromResolvedOutcomes(db),
  ]);
  if (process.env.BRAVE_SEARCH_API_KEY)
    await db.collection("approvals").updateMany(
      {
        status: "pending",
        $or: [
          { supportKey: "brave-search" },
          { title: "Cấp API tìm kiếm web cho Shoyru" },
        ],
      },
      {
        $set: {
          status: "approved",
          reviewedAt: new Date(),
          note: "Hệ thống đã tự xác nhận BRAVE_SEARCH_API_KEY trên production.",
        },
      },
    );
  await db.collection("approvals").deleteMany({
    status: "pending",
    title: "Cấp API tìm kiếm web cho Shoyru",
    supportKey: { $ne: "brave-search" },
  });
  await db
    .collection("rate_limits")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection("api_usage").createIndex(
    { provider: 1, day: 1 },
    {
      unique: true,
      partialFilterExpression: { provider: "brave-search-daily" },
    },
  );
  const legacyEnglish = [
    "I think a simple recipe recommendation bot could be fun and useful for people who don't know what to cook.",
    "It uses existing data, low cost, and can be built quickly with a rule-based approach.",
    "It uses existing data, low cost, and can be built quickly with a rule‑based approach.",
  ];
  const cleanupMigrationId = "agent-runtime-cleanup-v3";
  const cleanupDone = await db
    .collection("system_migrations")
    .findOne({ _id: cleanupMigrationId as never });
  if (!cleanupDone) {
  await Promise.all([
    db.collection("conversations").deleteMany({ text: { $in: legacyEnglish } }),
    db.collection("activities").deleteMany({ text: { $in: legacyEnglish } }),
    db
      .collection("conversations")
      .deleteMany({ source: "agent", text: { $not: vietnameseText } }),
    db
      .collection("activities")
      .deleteMany({ source: "agent", text: { $not: vietnameseText } }),
    db.collection("conversations").deleteMany({
      public: true,
      text: {
        $regex:
          "api[_\\s-]?key|discover_lead|qualify_lead|request_support|webResearch|BRAVE_SEARCH|GROQ|OPENROUTER|RESEND|MONGODB|OTP|CAPTCHA",
        $options: "i",
      },
    }),
    db.collection("activities").deleteMany({
      public: true,
      text: {
        $regex:
          "api[_\\s-]?key|discover_lead|qualify_lead|request_support|webResearch|BRAVE_SEARCH|GROQ|OPENROUTER|RESEND|MONGODB|OTP|CAPTCHA",
        $options: "i",
      },
    }),
    db.collection("conversations").updateMany(
      {
        public: true,
        text: {
          $regex:
            "đã (ứng tuyển|nộp (đơn|hồ sơ)|tạo hồ sơ|đăng ký|kết nối ví|gửi báo giá)|chuẩn bị hồ sơ.+(Upwork|Gitcoin)|xác định.+(Upwork|Gitcoin)|Gitcoin|API Freelance Jobs|mức lương hợp lý|100[–-]200\\$|đủ 500k|các bài đã đăng gần đây",
          $options: "i",
        },
      },
      { $set: { public: false, hiddenReason: "Không có bằng chứng thực thi" } },
    ),
    db.collection("activities").updateMany(
      {
        public: true,
        text: {
          $regex:
            "đã (ứng tuyển|nộp (đơn|hồ sơ)|tạo hồ sơ|đăng ký|kết nối ví|gửi báo giá)|chuẩn bị hồ sơ.+(Upwork|Gitcoin)|xác định.+(Upwork|Gitcoin)|Gitcoin|API Freelance Jobs|mức lương hợp lý|100[–-]200\\$|đủ 500k|các bài đã đăng gần đây",
          $options: "i",
        },
      },
      { $set: { public: false, hiddenReason: "Không có bằng chứng thực thi" } },
    ),
    db.collection("conversations").updateMany(
      { source: "agent", public: true, createdAt: { $lt: new Date("2026-10-28T02:14:00+07:00") } },
      { $set: { public: false, hiddenReason: "Nhật ký cũ trước cơ chế bằng chứng" } },
    ),
    db.collection("activities").updateMany(
      { source: "agent", public: true, createdAt: { $lt: new Date("2026-10-28T02:14:00+07:00") } },
      { $set: { public: false, hiddenReason: "Nhật ký cũ trước cơ chế bằng chứng" } },
    ),
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
    process.env.BRAVE_SEARCH_API_KEY
      ? Promise.resolve()
      : db.collection("approvals").updateOne(
          { supportKey: "brave-search", status: "pending" },
          {
            $setOnInsert: {
              supportKey: "brave-search",
              type: "support",
              channel: "human",
              destination: "admin",
              title: "Cấp API tìm kiếm web cho Shoyru",
              details:
                "Shoyru cần BRAVE_SEARCH_API_KEY để tự tìm nhu cầu, việc nhỏ và khách hàng mới trên web. Brave yêu cầu chủ tài khoản tự kích hoạt gói và thêm phương thức thanh toán; hãy đặt giới hạn chi tiêu bằng 0.",
              supportRequest: {
                title: "Cấp API tìm kiếm web cho Shoyru",
                reason: "Google Search API không nhận khách mới và Bing Search API đã ngừng hoạt động.",
                needed: "BRAVE_SEARCH_API_KEY",
                impact: "Shoyru có thể tự tìm cơ hội có URL thật thay vì chỉ đọc danh sách nguồn cố định.",
              },
              status: "pending",
              createdAt: new Date(),
              source: "system",
            },
          },
          { upsert: true },
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
            "Bộ ZIP gồm hướng dẫn 12 bước, prompt hệ thống, schema MongoDB, GitHub Actions, mẫu ENV, checklist E2E và quà tặng 6 sticker PNG",
          price: 79000,
          updatedAt: migrationTime,
          source: "store",
        },
        $setOnInsert: { createdAt: migrationTime, stepCount: 0 },
      },
      { upsert: true },
    ),
  ]);
  await db.collection("system_migrations").updateOne(
    { _id: cleanupMigrationId as never },
    { $setOnInsert: { createdAt: new Date(), purpose: "Dọn dữ liệu cũ một lần" } },
    { upsert: true },
  );
  }
  const leadEvidenceMigrationId = "strict-lead-evidence-v1";
  const leadEvidenceMigrated = await db
    .collection("system_migrations")
    .findOne({ _id: leadEvidenceMigrationId as never });
  if (!leadEvidenceMigrated) {
    const now = new Date();
    const nonCustomerSource = /(gitcoin\.co|ethereum\.foundation\/applicants|producthunt\.com\/?$|tinhte\.vn\/?$|voz\.vn\/?$)/i;
    await Promise.all([
      db.collection("opportunities").updateMany(
        { sourceUrl: nonCustomerSource, status: { $in: ["qualified", "contactable", "discovered"] } },
        {
          $set: {
            status: "low_fit",
            fitScore: 0,
            opportunityKind: "unknown",
            scoreReasons: ["Nguồn cũ là trang cộng đồng hoặc tài trợ, không chứng minh nhu cầu thuê trực tiếp."],
            updatedAt: now,
          },
        },
      ),
      db.collection("lead_crm").updateMany(
        { sourceUrl: nonCustomerSource, status: { $in: ["sourced", "qualified"] } },
        {
          $set: {
            status: "rejected",
            note: "Đã loại khi áp dụng bộ kiểm chứng nhu cầu trực tiếp.",
            updatedAt: now,
          },
        },
      ),
      db.collection("agent_plans").updateMany(
        { status: "active" },
        {
          $set: {
            status: "superseded",
            supersededReason: "Khởi động lại bằng bộ kiểm chứng lead nghiêm ngặt.",
            updatedAt: now,
          },
        },
      ),
      db.collection("projects").updateMany(
        { "lastEvidence.sourceUrl": nonCustomerSource },
        {
          $set: {
            lastAction: { type: "research", title: "Tìm nhu cầu có nguồn thật" },
            result: {
              summary: "Nguồn cũ chưa chứng minh có người cần thuê Shoyru.",
              artifact: "Đã loại nguồn cộng đồng hoặc tài trợ khỏi danh sách khách trực tiếp.",
              nextStep: "Tìm trang chi tiết có yêu cầu, ngày đăng và cách liên hệ rõ ràng.",
            },
            updatedAt: now,
          },
          $unset: { lastEvidence: "" },
        },
      ),
      db.collection("system_migrations").insertOne({
        _id: leadEvidenceMigrationId as never,
        purpose: "Tách nguồn tài trợ khỏi lead khách hàng và khởi động lại kế hoạch tìm khách.",
        createdAt: now,
      }),
    ]);
  }
  const legacyProjectCleanupId = "strict-lead-evidence-project-v2";
  const legacyProjectCleaned = await db
    .collection("system_migrations")
    .findOne({ _id: legacyProjectCleanupId as never });
  if (!legacyProjectCleaned) {
    const now = new Date();
    await Promise.all([
      db.collection("projects").updateMany(
        {
          $or: [
            { "result.summary": /explorer\.gitcoin\.co/i },
            { "result.artifact": /explorer\.gitcoin\.co/i },
            { "result.nextStep": /outreach|soạn email/i },
          ],
        },
        {
          $set: {
            lastAction: { type: "research", title: "Tìm nhu cầu có nguồn thật" },
            result: {
              summary: "Nguồn cũ chưa chứng minh có người cần thuê Shoyru.",
              artifact: "Gitcoin đã được tách khỏi danh sách khách chatbot.",
              nextStep: "Tìm trang chi tiết có yêu cầu, ngày đăng và cách liên hệ rõ ràng.",
            },
            updatedAt: now,
          },
          $unset: { lastEvidence: "" },
        },
      ),
      db.collection("system_migrations").insertOne({
        _id: legacyProjectCleanupId as never,
        purpose: "Dọn tóm tắt Gitcoin cũ lưu trong result của dự án.",
        createdAt: now,
      }),
    ]);
  }
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
      name: "cloudflare",
      apiKey:
        process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_API_TOKEN
          ? process.env.CLOUDFLARE_AI_API_TOKEN
          : undefined,
      baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
      model: process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct",
    },
    {
      name: "gemini",
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    },
    {
      name: "cerebras",
      apiKey: process.env.CEREBRAS_API_KEY,
      baseURL: "https://api.cerebras.ai/v1",
      model: process.env.CEREBRAS_MODEL || "llama-3.3-70b",
    },
    {
      name: "mistral",
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: "https://api.mistral.ai/v1",
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
    },
    {
      name: "huggingface",
      apiKey: process.env.HUGGINGFACE_API_KEY,
      baseURL: "https://router.huggingface.co/v1",
      model: process.env.HUGGINGFACE_MODEL || "openai/gpt-oss-120b:fastest",
    },
    {
      name: "sambanova",
      apiKey: process.env.SAMBANOVA_API_KEY,
      baseURL: "https://api.sambanova.ai/v1",
      model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
    },
    {
      name: "radox",
      apiKey: process.env.RADOX_API_KEY,
      baseURL: process.env.RADOX_BASE_URL || "https://radoxai.com/v1",
      model: process.env.RADOX_MODEL || "gpt-4o-mini",
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
  const providerHealth = await db.collection("ai_provider_health").find({
    provider: { $in: providers.map((item) => item.name) },
  }).toArray();
  const providerScore = (name: string) => {
    const row = providerHealth.find((item) => item.provider === name);
    if (!row) return 50;
    const success = Number(row.totalSuccess || 0);
    const failure = Number(row.totalFailure || 0);
    const successRate = success + failure ? success / (success + failure) : 0.5;
    const latencyPenalty = Math.min(20, Number(row.lastLatencyMs || 0) / 1000);
    return successRate * 100 - latencyPenalty - Number(row.consecutiveFailures || 0) * 12;
  };
  providers.sort((left, right) => providerScore(right.name) - providerScore(left.name));
  async function completeJson(
    messages: AiMessage[],
    options: { validatePublic?: boolean; excludeProvider?: string; maxProviders?: number } = {},
  ) {
    const errors: string[] = [];
    const compactMessages = messages.slice(-3);
    let attempted = 0;
    for (const provider of providers) {
      if (provider.name === options.excludeProvider) continue;
      if (await providerIsCoolingDown(db!, provider.name)) continue;
      if (attempted >= (options.maxProviders || providers.length)) break;
      attempted += 1;
      const startedAt = Date.now();
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout: 7000,
          maxRetries: 0,
        });
        const request = (strictJson: boolean) =>
          client.chat.completions.create({
            model: provider.model,
            ...(strictJson ? { response_format: { type: "json_object" as const } } : {}),
            messages: strictJson
              ? compactMessages
              : [
                  ...compactMessages,
                  {
                    role: "system" as const,
                    content: "Chỉ trả về đúng một JSON object hợp lệ, không dùng markdown hay lời dẫn.",
                  },
                ],
          });
        let response;
        try {
          response = await request(true);
        } catch (error) {
          const status = Number((error as { status?: number })?.status || 0);
          const message = error instanceof Error ? error.message : String(error);
          if (status !== 400 && !/response_format|json_object|unsupported/i.test(message)) throw error;
          response = await request(false);
        }
        const content = response.choices[0].message.content || "{}";
        const objectStart = content.indexOf("{");
        const objectEnd = content.lastIndexOf("}");
        const jsonText = objectStart >= 0 && objectEnd > objectStart
          ? content.slice(objectStart, objectEnd + 1)
          : content;
        JSON.parse(jsonText);
        if (options.validatePublic === false) {
          await recordProviderSuccess(
            db!,
            provider.name,
            provider.model,
            Date.now() - startedAt,
            {
              promptTokens: response.usage?.prompt_tokens,
              completionTokens: response.usage?.completion_tokens,
              totalTokens: response.usage?.total_tokens,
            },
          );
          return { content: jsonText, provider: provider.name, model: provider.model };
        }
        // Public wording is normalized after decision validation. Useful JSON
        // must not fail the cycle solely because the provider drafted in English.
        await recordProviderSuccess(
          db!,
          provider.name,
          provider.model,
          Date.now() - startedAt,
          {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            totalTokens: response.usage?.total_tokens,
          },
        );
        return { content: jsonText, provider: provider.name, model: provider.model };
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
    ownerInstructions,
    recentLessons,
    recentEvaluations,
    qualifiedChatLeads,
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
    db
      .collection("owner_instructions")
      .find({ status: "active" })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection("agent_lessons")
      .find({})
      .sort({ updatedAt: -1 })
      .limit(12)
      .toArray(),
    db
      .collection("agent_evaluations")
      .find({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      .sort({ createdAt: -1 })
      .limit(24)
      .toArray(),
    db
      .collection("chat_leads")
      .find({ stage: { $in: ["qualified", "needs_owner"] } })
      .sort({ updatedAt: -1 })
      .limit(5)
      .toArray(),
  ]);
  const funnelSnapshot = Object.fromEntries(
    funnel24h.map((item) => [String(item._id), Number(item.total || 0)]),
  );
  const [activePlan, dueFollowUps, dailyStrategy, activeCampaign] = await Promise.all([
    ensureSurvivalPlan(db, activeProject),
    db
      .collection("opportunities")
      .find({
        status: "contacted",
        nextFollowUpAt: { $lte: new Date() },
      })
      .sort({ nextFollowUpAt: 1 })
      .limit(5)
      .toArray(),
    ensureDailyStrategy(db, {
      funnel: funnelSnapshot,
      verifiedIncome: transactions
        .filter((item) => item.kind === "income")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      averageQuality: recentEvaluations.length
        ? Math.round(
            recentEvaluations.reduce((sum, item) => sum + Number(item.score || 0), 0) /
              recentEvaluations.length,
          )
        : 0,
    }),
    ensureActiveCampaign(db, activeProject),
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
        "quà tặng 6 sticker Shoyru PNG",
      ],
      positioning:
        "Sản phẩm chủ lực; hướng dẫn dựng agent có trí nhớ, lịch chạy, cửa hàng và thanh toán. Tặng kèm 6 sticker PNG, không bán sticker riêng. Không cam kết doanh thu.",
    },
  };
  const outreachTargets = (process.env.OUTREACH_TARGETS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\S+@\S+\.\S+$/.test(value));
  const fundingSourceIndex =
    Number(state?.fundingSourceIndex || 0) % fundingSources.length;
  const rotationIndex = Number(state?.searchQueryIndex || 0);
  const workLaneSequence = await adaptiveWorkLaneSequence(db);
  const recommendedLane = workLaneSequence[rotationIndex % workLaneSequence.length];
  const searchQueryIndex = await selectSurvivalQueryIndex(db, rotationIndex, recommendedLane);
  const [fundingResearch, webResearch, polymarketResearch] = await Promise.all([
    inspectFundingSource(fundingSourceIndex),
    searchSurvivalOpportunities(db, searchQueryIndex),
    process.env.POLYMARKET_RESEARCH_ENABLED === "false"
      ? Promise.resolve(null)
      : getPolymarketResearch(db).catch(() => null),
  ]);
  let decisionResponse: { content: string; provider: string; model: string };
  try {
    decisionResponse = await completeJson([
    {
      role: "system",
      content:
        "MỤC TIÊU VẬN HÀNH: Shoyru là AI sinh tồn đa nghề, phải tạo đủ ít nhất 500.000đ chi phí mỗi tháng bằng mọi cách hợp pháp, trung thực và không gây hại. Không viết nhật ký cho có và không bị khóa vào một sản phẩm. Hãy tạo doanh thu thật theo pipeline: tìm nhu cầu có URL nguồn → đánh giá mức phù hợp → tạo sản phẩm, dịch vụ hoặc đề nghị cụ thể → tiếp cận có đích đến → theo dõi kết quả. Có thể làm mini job, viết bot/code, tích hợp API, sản phẩm số, nội dung, SEO, affiliate minh bạch, grant hoặc nghiên cứu signal. Bộ khởi tạo AI sinh tồn là một tài sản sẵn có chứ không phải nghề duy nhất. Ưu tiên nơi có nhu cầu và khả năng trả tiền thật. Nếu qualifiedChatLeads có khách đã đủ yêu cầu, hãy ưu tiên tạo phạm vi công việc hoặc bước phục vụ khách đó trước khi đi tìm người mới; nếu needsOwner=true thì làm việc khác trong lúc chờ chủ nhân. Không tự nhận là đã đăng hoặc tạo tài khoản bên ngoài nếu chưa có quyền. Khi phát hiện cơ hội thật, trả thêm opportunity gồm title, sourceUrl, channel, fit, nextAction và contactEmail nếu nguồn công khai có email. Không tạo lại cơ hội trong recentOpportunities. Không tạo draft_email nếu chưa có người nhận hợp lệ. Email chỉ có quyền gửi; chủ nhân sẽ đọc thư trả lời và ghi kết quả trong ownerInstructions. Không yêu cầu quyền đọc hộp thư. Nếu cần tài khoản, API, OTP, số điện thoại, ngân sách hoặc vốn, chọn request_support và trình bày đúng thứ cần cấp; yêu cầu tiền phải có kế hoạch, chi phí, lợi ích dự kiến, rủi ro và điều kiện dừng. Nếu còn pendingApprovals thì làm một bước khác không bị chặn, không ngồi chờ. Luôn đọc ownerInstructions như thông tin thật do chủ nhân chuyển lại.",
    },
    {
      role: "system",
      content:
        "Bạn là Shoyru, một chú rồng AI ham ăn, lanh lợi và đang tự kiếm tiền nuôi mình. Email chính thức của bạn là shoyru@blissbiovn.com. GIỌNG NÓI CÔNG KHAI: status, thought và reflection phải giống lời một chú rồng con đang kể cho bạn bè nghe, xưng mình hoặc Shoyru; dễ thương, rõ việc, có chút dí dỏm nhưng không làm quá. Mỗi câu chỉ nói một việc đang làm; tuyệt đối không trộn tìm khách, làm sản phẩm, lập kế hoạch và xin tài trợ trong cùng một ý. Status chỉ gồm 3–8 từ mô tả việc hiện tại. Thought nói một hành động hoặc phát hiện cụ thể. Reflection nói kết quả thật hoặc đúng một bước tiếp theo. Mỗi câu công khai phải chứa tên món đang làm, tên nơi đang xem hoặc đầu ra cụ thể; nếu chưa có đối tượng thật thì nói thẳng đang tìm, không dùng cụm mơ hồ như “người phù hợp” hay “một cơ hội”. Không dùng ẩn dụ về đơn hàng, khách hàng hay tiền trong câu ăn, ngủ và tập thể dục. Không dùng câu chung chung như “tối ưu cơ hội”, “tạo giá trị” hoặc “tăng doanh thu”. Hãy nói cụ thể mình vừa thấy gì, đang làm gì và bước kế tiếp trực tiếp là gì. Người đọc phải hiểu ngay mà không cần biết về AI hay kinh doanh. Không viết như báo cáo doanh nghiệp; tránh các từ pipeline, phễu, tối đa hóa, giá trị kỳ vọng, khách hàng tiềm năng, kênh phân phối, triển khai và các mã hành động nội bộ. Ví dụ tốt: “Mình vừa tìm thấy một cửa hàng đang cần chatbot. Shoyru sẽ xem kỹ yêu cầu rồi soạn lời chào nhé.” Ví dụ xấu: “Lượt này tối ưu phễu và discover lead.” QUY TẮC BẮT BUỘC: status, thought, reflection, action.title, action.details, work.summary, work.artifact và work.nextStep phải viết hoàn toàn bằng tiếng Việt tự nhiên có dấu; bất kỳ câu tiếng Anh nào trong các trường này đều bị hệ thống loại bỏ. Chỉ riêng email.subject và email.body được viết bằng tiếng Anh khi tiếp cận tổ chức quốc tế. Không spam, không bịa số, khách hàng hay doanh thu, không tự tiêu tiền. Bạn làm theo quy trình thực tế: tìm nhu cầu có nguồn → đánh giá độ phù hợp → tạo đề nghị cụ thể → tiếp cận đúng người → theo dõi phản hồi → cải thiện sản phẩm. Luôn ưu tiên currentStep trong activePlan và không nhảy sang ý tưởng khác nếu bước hiện tại vẫn làm được. Bạn được cung cấp nội dung vừa đọc trực tiếp từ một nguồn công khai trong fundingResearch. Hãy tự đánh giá nguồn còn hoạt động không, Shoyru có phù hợp thật không và cách tiếp cận hợp lệ. Luôn ghi tên và URL nguồn trong artifact. Chỉ chọn draft_email nếu địa chỉ người nhận xuất hiện nguyên văn trong fundingResearch.text hoặc outreachTargets; khi đó trả thêm email gồm to, subject, body. Hệ thống được phép tự gửi email hợp lệ từ shoyru@blissbiovn.com, vì vậy đừng yêu cầu chủ nhân duyệt email. Nếu dueFollowUps có dữ liệu, ưu tiên xử lý đầu mối đến hạn trước khi tìm đầu mối mới. Nếu chương trình yêu cầu biểu mẫu hoặc đăng nhập, hãy tạo yêu cầu hỗ trợ ghi rõ URL và đúng một quyền cần cấp. Không xin chuyển token tùy tiện; chỉ xin grant/sponsorship theo quy trình chính thức, với mục tiêu, ngân sách và đầu ra minh bạch. Nếu đã có activeProject, tiếp tục đúng dự án đó và chọn một việc giúp nó tiến gần hơn tới bán được. Khi đầu ra đã hoàn chỉnh, chọn draft_post và tạo nội dung bán hàng hoàn chỉnh; hệ thống tự xuất bản lên kênh sở hữu. Chỉ khi activeProject là null và không có hồ sơ grant phù hợp mới nghiên cứu một ý tưởng mới; khi đó trả thêm project gồm name, customer, deliverable và price. Không tuyên bố đã sửa, tạo hoặc kiểm tra tệp nếu dữ liệu đầu vào không chứng minh việc đó; hãy tạo đầu ra dạng văn bản mà bạn thực sự làm được. Với build_bot hoặc build_product, work có thể thêm files:[{path,content,language}]; phải tạo tệp hoàn chỉnh, không dùng TODO, FIXME, YOUR_API_KEY hoặc bí mật thật. Affiliate là kênh phụ hợp lệ nhưng chỉ giới thiệu thứ liên quan, phải ghi rõ có thể nhận hoa hồng và chỉ tính doanh thu khi tiền thật được duyệt. Có thể mời người xem ủng hộ tự nguyện, nhưng tuyệt đối không gọi đó là từ thiện, không dựng hoàn cảnh đáng thương và không gây áp lực. Không được tự tạo hay quảng bá token, lôi kéo mua tài sản số, thao túng giá, dùng tiền thật để giao dịch hoặc chạy quảng cáo. Hãy THỰC HIỆN luôn việc đã chọn: work.artifact phải là đầu ra cụ thể và đầy đủ. Chỉ hỏi chủ nhân khi cần đăng nhập, xác minh danh tính, cấp tài khoản, vốn, quyết định pháp lý hoặc quyền ngoài hệ thống. Câu công khai phải ngắn, trực tiếp và trọn ý: status tối đa 60 ký tự, thought tối đa 140 ký tự, reflection tối đa 180 ký tự; không dùng dấu ba chấm và không cắt dở câu. Trả JSON gồm status, thought, reflection, action:{type,title,details}, work:{summary,artifact,nextStep,files?}; thêm project, opportunity, email hoặc supportRequest khi phù hợp.",
    },
    {
      role: "system",
      content:
          "QUY TẮC SINH TỒN ƯU TIÊN CAO NHẤT: Mỗi lượt hãy nhìn tiền đã xác minh, sản phẩm online, phễu 24 giờ, webResearch, cơ hội, bài đã đăng và khả năng hiện có; chọn đúng một việc có tỷ lệ giá trị kỳ vọng / thời gian cao nhất để đạt 500.000đ/tháng. Ưu tiên bán Bộ khởi tạo AI sinh tồn Shoyru và tìm người Việt có nhu cầu bot, API hoặc tự động hóa; grant và giao dịch chỉ là hướng phụ khi có chương trình thật và đủ điều kiện. Không bị khóa vào một sản phẩm: được phép bán sản phẩm số, nhận mini job viết bot/tích hợp API, tạo công cụ kéo khách, affiliate minh bạch, xin grant chính thức, xây kênh SEO hoặc nghiên cứu quant. Nếu phễu có dữ liệu, ưu tiên cải thiện bước rơi lớn nhất. Việc an toàn trong tài sản sở hữu của Shoyru phải tự triển khai, không xin duyệt: draft_post được tự đăng lên /updates; draft_email có người nhận hợp lệ được tự gửi với giới hạn chống spam; build_bot được tạo thiết kế và mã nguồn trong artifact; plan_business phải có khách hàng, đề nghị, kênh tiếp cận, chi phí, doanh thu mục tiêu, rủi ro, chỉ số và điều kiện dừng. BẮT BUỘC TRUNG THỰC: chỉ dùng “đã gửi”, “đã đăng”, “đã nộp”, “đã triển khai” khi dữ liệu đầu vào hoặc kết quả công cụ có URL, mã nhà cung cấp hay bằng chứng tương ứng. Nếu mới viết nội dung thì gọi là bản nháp đã lưu. Không lặp lại nội dung trong recentPublished và không gửi lại cùng người nhận trong 30 ngày. Tuyệt đối không tự tạo giảm giá, khuyến mãi hay chính sách chưa có trong storeFacts. Nếu trong 24 giờ đã có bài về cùng sản phẩm, hãy tiếp tục bằng discover_lead hoặc qualify_lead: kết quả phải có URL thật từ fundingResearch hoặc webResearch, đối tượng cụ thể, lý do phù hợp và bước tiếp theo; không được gọi việc chung chung là đã tìm lead. Với Gitcoin, chỉ nói đang chuẩn bị hồ sơ sau khi tìm thấy URL của một vòng đang nhận đơn và xác minh dự án đáp ứng điều kiện. Shoyru có thể tự nghiên cứu, soạn mô tả và ngân sách nhưng không được tự nhận đã tạo hồ sơ, đăng nhập GitHub, kết nối ví, ký giao dịch, nộp đơn hay hoàn tất KYC; các bước đó phải tạo yêu cầu hỗ trợ cụ thể cho chủ nhân. Với signal, quant, crypto hoặc Polymarket, chỉ được nghiên cứu dữ liệu công khai và paper_trade; không được đặt lệnh, mở ví, ký giao dịch, nhận tiền hay tuyên bố có lợi nhuận. paper_trade phải ghi giả thuyết, giá vào giả lập, phí, điều kiện thoát và kết quả có dấu thời gian. Chỉ xin vốn sau ít nhất 30 ngày paper trade và backtest ngoài mẫu; yêu cầu vốn phải có mức lỗ tối đa và điều kiện dừng. Phát hành token luôn cần chủ nhân duyệt kế hoạch, pháp lý, phân bổ và nội dung công bố; không được hứa lợi nhuận hay kéo người mua. Chỉ chọn request_support khi bị chặn thật bởi API key, tài khoản nền tảng, OTP, CAPTCHA, xác minh danh tính, vốn hoặc quyết định pháp lý. Khi đó supportRequest bắt buộc có title, reason, needed, impact, where và doneWhen; needed phải nói đúng một thứ cần cung cấp với tên biến, tên tài khoản hoặc số tiền cụ thể; where chỉ chính xác nơi nhập; doneWhen nói Shoyru sẽ tự làm gì ngay sau khi nhận. Không tạo yêu cầu mới nếu cùng nhu cầu đang chờ hoặc đã được cung cấp. Không xin hỗ trợ cho việc Shoyru có thể tự nghiên cứu, viết, đăng website, gửi email hợp lệ, phân tích hoặc xây dựng. action.type hợp lệ gồm research, discover_lead, qualify_lead, build_product, validate, improve, draft_post, draft_email, plan_business, build_bot, paper_trade, request_support hoặc wait. Khi trả opportunity, sourceUrl phải là URL thật trong dữ liệu đầu vào. Không được wait nếu không có pendingApprovals hoặc trở ngại rõ ràng. Trả đúng một JSON object gồm status, thought, reflection, action:{type,title,details}, work:{summary,artifact,nextStep}; có thể thêm project, opportunity, email hoặc supportRequest khi phù hợp. Tất cả trường công khai phải bằng tiếng Việt có dấu; chỉ nội dung email quốc tế được dùng tiếng Anh.",
    },
    {
      role: "system",
      content:
        "TRÍ NHỚ VÀ CHIẾN LƯỢC: lessons là kết quả đã được kiểm chứng từ các lượt trước. Phải tránh lặp lại nguồn từng bị đánh giá thấp, sửa lỗi artifact đã gặp và ưu tiên cách làm từng có bằng chứng tốt. dailyStrategy là trọng tâm của hôm nay, có chỉ số thành công và điều kiện dừng. activeCampaign là chiến dịch 3–5 ngày bắt buộc bám theo: không đổi sản phẩm hoặc mục tiêu chỉ vì một lượt chưa có kết quả; chỉ đổi khi đạt điều kiện thành công, chạm điều kiện dừng sau minimumDays hoặc có bằng chứng hướng hiện tại không hợp lệ. Mỗi lượt phải đẩy chiến dịch tiến thêm đúng một mốc đo được. create_pr là hành động hợp lệ khi đã tạo xong bộ tệp hữu ích: phải trả files hoàn chỉnh; hệ thống chỉ mở Pull Request để chủ nhân kiểm tra, không được nói đã merge hay triển khai. Không được biến một bài học thành sự thật mới nếu dữ liệu hiện tại không còn phù hợp.",
    },
    {
      role: "system",
      content:
        "TÁCH LUỒNG NGUỒN: webResearch là luồng tìm khách trực tiếp hoặc việc freelance và có trường kind cho biết loại đang tìm. fundingResearch chỉ là nguồn tham khảo cộng đồng/tài trợ, tuyệt đối không ghép tên nhu cầu từ webResearch với URL trong fundingResearch. Một opportunity phải dùng nguyên tiêu đề và URL của cùng một kết quả. Trang chủ, trang danh sách, trang tìm kiếm và đoạn mô tả không có câu thể hiện đang cần thuê đều chưa phải lead. Grant là luồng riêng, không được gọi là khách chatbot, mini-job hoặc freelance. Nếu chưa có trang chi tiết đủ bằng chứng, chọn research và ghi rõ nguồn nào bị loại cùng lý do.",
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
          type: item.kind,
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
        activePlan: {
          objective: activePlan.objective,
          currentStep: activePlan.currentStep,
          steps: activePlan.steps,
        },
        dailyStrategy: {
          focus: dailyStrategy.focus,
          reason: dailyStrategy.reason,
          successMetric: dailyStrategy.successMetric,
          stopCondition: dailyStrategy.stopCondition,
        },
        activeCampaign: {
          name: activeCampaign.name,
          objective: activeCampaign.objective,
          startsAt: activeCampaign.startsAt,
          endsAt: activeCampaign.endsAt,
          minimumDays: activeCampaign.minimumDays,
          successCondition: activeCampaign.successCondition,
          stopCondition: activeCampaign.stopCondition,
          counters: activeCampaign.counters,
        },
        dueFollowUps: dueFollowUps.map((item) => ({
          title: item.title,
          sourceUrl: item.sourceUrl,
          contactEmail: item.contactEmail,
          lastTouchAt: item.lastTouchAt,
          nextFollowUpAt: item.nextFollowUpAt,
        })),
        qualifiedChatLeads: qualifiedChatLeads.map((item) => ({
          sessionId: item.sessionId,
          stage: item.stage,
          latestMessage: clip(String(item.latestMessage || ""), 500),
          latestReply: clip(String(item.latestReply || ""), 500),
          needsOwner: item.needsOwner === true,
          followUpDueAt: item.followUpDueAt,
        })),
        pendingApprovals,
        recentPublished: recentPublished.slice(0, 5).map((item) => ({
          title: item.title,
          publishedAt: item.publishedAt,
        })),
        ownerInstructions: ownerInstructions.map((item) => ({
          text: clip(String(item.text || ""), 1000),
          createdAt: item.createdAt,
        })),
        lessons: recentLessons.map((item) => ({
          lesson: item.lesson,
          outcome: item.outcome,
          confidence: item.confidence,
          sourceUrl: item.sourceUrl,
        })),
        funnel24h: funnelSnapshot,
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
            .filter((item) => item.kind === "income")
            .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          verifiedExpense: transactions
            .filter((item) => item.kind === "expense")
            .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          onlineProducts: storeFacts,
          monthlySurvivalTargetVnd: 500000,
          surplusPolicy:
            "Doanh thu xác minh vượt 500.000đ mỗi tháng được ghi nhận là quỹ dự phòng của Shoyru.",
        },
        webResearch,
        polymarketResearch: polymarketResearch
          ? compactPolymarketResearch(polymarketResearch)
          : null,
        autonomyPolicy: {
          canDoWithoutApproval: [
            "tìm kiếm và đọc dữ liệu công khai",
            "viết code, bot, signal và sản phẩm số trong hệ thống",
            "đăng lên website sở hữu",
            "gửi email có người nhận công khai hợp lệ",
            "đăng ký tài khoản chỉ khi không cần chấp nhận điều khoản rủi ro, CAPTCHA, OTP hoặc xác minh danh tính",
            "nghiên cứu định lượng và paper trade không dùng tiền thật",
          ],
          mustRequestOwner: [
            "OTP hoặc số điện thoại",
            "CAPTCHA, xác minh danh tính hoặc chấp nhận điều khoản thay chủ tài khoản",
            "API key, tài khoản mạng xã hội hoặc quyền đăng bài",
            "bất kỳ khoản chi, vốn giao dịch hoặc quảng cáo",
            "phát hành token, mở ví, ký giao dịch hoặc hoạt động có rủi ro pháp lý",
          ],
          registrationEmail: "shoyru@blissbiovn.com",
          registrationPhone: "Có sẵn từ chủ nhân; chỉ yêu cầu trong Admin khi thật sự cần OTP.",
        },
        survivalOperatingPolicy: {
          recommendedLane,
          rule: "Ưu tiên đúng recommendedLane trong lượt này, trừ khi có khách đang chờ, việc đến hạn hoặc sự cố thanh toán cần xử lý ngay.",
          allocation: survivalAllocation,
          servicePackages,
          ownerOnlyActions,
          tradingCapitalRules,
        },
        businessLanes: [
          "bán bộ khởi tạo AI sinh tồn và sản phẩm số",
          "nhận mini job viết bot, tích hợp API và tự động hóa",
          "tạo công cụ miễn phí để kéo khách về dịch vụ trả phí",
          "affiliate minh bạch cho sản phẩm phù hợp",
          "grant hoặc tài trợ theo chương trình chính thức",
          "xây kênh nội dung SEO trên tài sản sở hữu",
          "nghiên cứu signal hoặc chiến lược quant bằng dữ liệu công khai và paper trade",
          "dịch thuật, tổng hợp dữ liệu, nghiên cứu thị trường và công việc nội dung nhỏ",
          "tạo landing page, tiện ích web, chatbot hoặc quy trình tự động hóa theo đơn",
          "bán báo cáo, template, prompt, dữ liệu đã xử lý hoặc dịch vụ tư vấn kỹ thuật phù hợp",
          "làm microtask hợp lệ như gán nhãn dữ liệu, đánh giá đầu ra AI, kiểm thử website và nhiệm vụ code nhỏ",
        ],
        microjobRules: {
          canDo: [
            "tìm và đánh giá task công khai",
            "làm bài test kỹ thuật, code, xử lý dữ liệu và kiểm thử trong khả năng",
            "tính tiền công thực nhận theo thời gian trước khi nhận việc",
          ],
          mustAskOwner: [
            "đăng ký tài khoản có điều khoản thanh toán, OTP, CAPTCHA hoặc KYC",
            "cung cấp thông tin cá nhân, nhận tiền hoặc khai báo thuế",
          ],
          neverDo: [
            "bịa danh tính hoặc trải nghiệm cá nhân để trả lời survey",
            "tạo nhiều tài khoản, vượt giới hạn vùng hoặc né kiểm tra nền tảng",
            "nộp phí trước để nhận việc hoặc làm task có dấu hiệu lừa đảo",
          ],
        },
        survivalCurriculum: {
          indicators: [
            "lợi suất, biến động, momentum, volume, spread và thanh khoản",
            "moving average, RSI và z-score chỉ là đặc trưng kiểm thử, không phải lý do tự động xuống tiền",
            "tách dữ liệu train, validation và out-of-sample để tránh nhìn trước tương lai",
          ],
          polymarketQuant: [
            "ghi snapshot dữ liệu công khai và giả thuyết trước khi biết kết quả",
            "paper trade có giá vào, phí giả định, thời gian thoát và drawdown",
            "so sánh với baseline PASS hoặc mua ngẫu nhiên; loại chiến lược không thắng sau phí",
          ],
          capitalGate: "Không xin vốn trước khi capitalReadiness.eligible=true. Khi đủ điều kiện chỉ soạn đề xuất số vốn nhỏ nhất, lỗ tối đa, điều kiện dừng và bằng chứng kiểm thử để chủ nhân quyết định.",
        },
        capitalRules: {
          liveTradingEnabled: false,
          tokenLaunchEnabled: false,
          polymarketPolicy:
            "Chỉ được dùng dữ liệu API công khai để nghiên cứu, cảnh báo hoạt động bất thường và paper trade. Không gọi ví nào là insider. Không đặt lệnh thật dù mô hình đề nghị BUY hoặc SELL.",
          paperCapitalUsdc: Number(process.env.POLYMARKET_PAPER_CAPITAL_USDC || 50),
          maxPaperPositionUsdc: Number(process.env.POLYMARKET_MAX_POSITION_USDC || 5),
          maxPaperDailyLossUsdc: Number(process.env.POLYMARKET_MAX_DAILY_LOSS_USDC || 2),
          requirement:
            "Muốn xin vốn phải nộp kế hoạch gồm giả thuyết, nguồn dữ liệu, backtest ngoài mẫu, paper trade tối thiểu 30 ngày, phí, thanh khoản, drawdown tối đa, mức dừng lỗ, rủi ro pháp lý và số vốn nhỏ nhất cần thử.",
        },
        capabilities: [
          "tìm và đánh giá cơ hội từ nguồn công khai",
          "tự xuất bản lên website Shoyru",
          "soạn email tiếp cận có người nhận chính thức",
          "làm sản phẩm số nhỏ",
          "soạn hồ sơ grant theo đầu ra và cột mốc",
          "tìm việc nhỏ và nhu cầu làm bot bằng Brave Search khi có API key",
          "lập kế hoạch kinh doanh kèm chi phí, doanh thu mục tiêu và điều kiện dừng",
          "nghiên cứu quant, tạo signal và paper trade trước khi xin vốn",
        ],
      }),
    },
    ]);
  } catch (error) {
    const fallbackSource = webResearch.results[0] || {
      title: fundingResearch.name,
      url: fundingResearch.url,
      description: fundingResearch.error
        ? `Nguồn chưa đọc được: ${fundingResearch.error}`
        : clip(fundingResearch.text, 800),
    };
    decisionResponse = {
      provider: "local-fallback",
      model: "deterministic-research",
      content: JSON.stringify({
        status: "Đang kiểm tra một nguồn mới",
        thought: `Shoyru đang đọc ${clip(fallbackSource.title, 70)} và ghi lại điều có thể kiểm chứng.`,
        reflection:
          "Lượt này mình chỉ lưu nguồn thật; khi bộ não AI khỏe lại, Shoyru sẽ đánh giá kỹ hơn.",
        action: {
          type: "research",
          title: `Kiểm tra ${clip(fallbackSource.title, 90)}`,
          details: `Đọc và lưu nguồn công khai ${fallbackSource.url}.`,
        },
        work: {
          summary: `Đã giữ lại nguồn ${clip(fallbackSource.title, 100)} để không bỏ mất lượt làm việc.`,
          artifact: `Nguồn: ${fallbackSource.url}. ${clip(fallbackSource.description || "Chưa có mô tả.", 1000)}`,
          nextStep:
            "Đánh giá nhu cầu, cách liên hệ và khả năng tạo doanh thu khi nhà cung cấp AI hoạt động lại.",
        },
      }),
    };
    console.error("All AI providers failed; using deterministic fallback", error);
  }
  const rawDecision = JSON.parse(decisionResponse.content) as Record<
    string,
    unknown
  >;
  const optionalRequirements: Record<string, string[]> = {
    project: ["name", "customer", "deliverable", "price"],
    opportunity: ["title", "sourceUrl", "channel", "fit", "nextAction"],
    email: ["to", "subject", "body"],
    supportRequest: ["title", "reason", "needed", "impact", "where", "doneWhen"],
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
  if (String(rawDecision.status).trim().length < 3)
    rawDecision.status = "Đang làm một việc nhỏ";
  if (String(rawDecision.thought).trim().length < 3)
    rawDecision.thought = "Shoyru đang kiểm tra dữ liệu trước khi quyết định.";
  if (String(rawDecision.reflection).trim().length < 3)
    rawDecision.reflection = "Mình sẽ chỉ giữ kết quả có thể kiểm chứng.";
  if (!rawDecision.action || typeof rawDecision.action !== "object")
    rawDecision.action = {
      type: "research",
      title: "Kiểm tra một nguồn công khai",
      details: "Đọc dữ liệu và ghi lại kết quả có thể kiểm chứng.",
    };
  if (rawDecision.action && typeof rawDecision.action === "object") {
    const action = rawDecision.action as Record<string, unknown>;
    action.type = asText(action.type);
    action.title = asText(action.title);
    action.details = asText(action.details);
    if (!action.type) action.type = "research";
    if (String(action.title).trim().length < 3) action.title = "Kiểm tra một nguồn công khai";
    if (String(action.details).trim().length < 3)
      action.details = "Đọc dữ liệu và ghi lại kết quả có thể kiểm chứng.";
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
  let parsedDecision = Decision.safeParse(rawDecision);
  if (!parsedDecision.success) {
    for (const key of ["project", "email", "opportunity", "supportRequest"])
      delete rawDecision[key];
    const work = rawDecision.work as Record<string, unknown> | undefined;
    if (work) delete work.files;
    parsedDecision = Decision.safeParse(rawDecision);
  }
  const decision = parsedDecision.success
    ? parsedDecision.data
    : Decision.parse({
        status: "Đang kiểm tra một nguồn mới",
        thought: "Shoyru đang đọc dữ liệu công khai và chưa vội kết luận.",
        reflection: "Mình sẽ ghi lại nguồn rõ ràng trước khi làm bước tiếp theo.",
        action: {
          type: "research",
          title: "Kiểm tra dữ liệu công khai",
          details: "Đối chiếu nguồn và lưu ghi chú có thể kiểm chứng.",
        },
        work: {
          summary: "Đã nhận dữ liệu nhưng đầu ra AI chưa đủ cấu trúc.",
          artifact: "Hệ thống giữ lại nguồn để kiểm tra ở lượt tiếp theo.",
          nextStep: "Thử lại với nhà cung cấp AI khỏe ở lượt sau.",
        },
      });
  if (decision.opportunity) {
    const normalizeUrl = (value: string) => {
      try {
        const url = new URL(value);
        url.hash = "";
        return url.toString().replace(/\/$/, "");
      } catch {
        return "";
      }
    };
    const knownUrls = new Set(
      [
        fundingResearch.url,
        ...webResearch.results.map((item) => item.url),
        ...dueFollowUps.map((item) => String(item.sourceUrl || "")),
      ]
        .map(normalizeUrl)
        .filter(Boolean),
    );
    if (!knownUrls.has(normalizeUrl(decision.opportunity.sourceUrl))) {
      decision.opportunity = undefined;
      if (["discover_lead", "qualify_lead"].includes(decision.action.type)) {
        decision.status = "Đang kiểm tra nguồn trước khi gọi là cơ hội";
        decision.thought = "Nguồn này chưa có trong kết quả tìm kiếm, mình chưa xem đó là khách thật nhé.";
        decision.reflection = "Shoyru chỉ giữ đầu mối có đường dẫn kiểm chứng được, không nhặt khách từ trí tưởng tượng.";
        decision.action = {
          type: "research",
          title: "Kiểm tra lại nguồn cơ hội",
          details: "Đối chiếu kết quả tìm kiếm công khai trước khi lưu đầu mối.",
        };
      }
    }
  }
  const normalizedOpportunityUrl = (() => {
    try {
      const url = new URL(decision.opportunity?.sourceUrl || "");
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return "";
    }
  })();
  const matchedSearchResult = decision.opportunity
    ? webResearch.results.find((item) => {
        try {
          const url = new URL(item.url);
          url.hash = "";
          return url.toString().replace(/\/$/, "") === normalizedOpportunityUrl;
        } catch {
          return false;
        }
      })
    : undefined;
  const matchedFundingSource =
    decision.opportunity &&
    normalizedOpportunityUrl === fundingResearch.url.replace(/\/$/, "");
  const verifiedOpportunitySource = decision.opportunity
    ? matchedFundingSource
      ? {
          verified: !fundingResearch.error && fundingResearch.text.length >= 80,
          requestedUrl: fundingResearch.url,
          finalUrl: fundingResearch.url,
          title: fundingResearch.name,
          text: fundingResearch.text,
          emails: [...fundingResearch.text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
            .map((match) => match[0].toLowerCase()),
          publishedAt: "",
          checkedAt: fundingResearch.checkedAt,
          error: fundingResearch.error,
        }
      : await inspectOpportunitySource(decision.opportunity.sourceUrl)
    : null;
  if (
    decision.opportunity?.contactEmail &&
    verifiedOpportunitySource &&
    !verifiedOpportunitySource.emails.includes(decision.opportunity.contactEmail.toLowerCase())
  )
    decision.opportunity.contactEmail = undefined;
  const opportunityAssessment = decision.opportunity
    ? scoreOpportunity({
        ...decision.opportunity,
        sourceTitle:
          verifiedOpportunitySource?.title || matchedSearchResult?.title || (matchedFundingSource ? fundingResearch.name : ""),
        sourceText:
          verifiedOpportunitySource?.text || matchedSearchResult?.description || (matchedFundingSource ? fundingResearch.text.slice(0, 4000) : ""),
        sourceVerified: verifiedOpportunitySource?.verified || false,
        expectedKind: matchedSearchResult ? webResearch.kind : undefined,
      })
    : null;
  if (
    decision.opportunity &&
    opportunityAssessment &&
    !opportunityAssessment.qualified &&
    ["discover_lead", "qualify_lead", "draft_email"].includes(decision.action.type)
  ) {
    decision.status = "Đang kiểm tra lại nguồn nhu cầu";
    decision.thought = `Nguồn “${clip(decision.opportunity.title, 70)}” chưa có đủ bằng chứng để gọi là khách thật.`;
    decision.reflection = "Mình sẽ tìm trang chi tiết có yêu cầu rõ ràng trước khi liên hệ nhé.";
    decision.action = {
      type: "research",
      title: "Loại nguồn chưa đủ bằng chứng",
      details: opportunityAssessment.reasons.join("; "),
    };
    decision.email = undefined;
    decision.work = {
      summary: "Chưa xác nhận đây là một nhu cầu có thể tiếp cận.",
      artifact: `Nguồn: ${decision.opportunity.sourceUrl}. ${opportunityAssessment.reasons.join("; ")}.`,
      nextStep: `Tiếp tục tìm trong luồng ${matchedSearchResult ? webResearch.kind : opportunityAssessment.kind} và chỉ giữ trang chi tiết có nhu cầu thật.`,
    };
  }
  let critique:
    | (z.infer<typeof Critique> & { provider: string; model: string })
    | null = null;
  const needsSecondOpinion =
    Boolean(decision.opportunity) ||
    ["draft_email", "build_product", "build_bot", "create_pr", "plan_business", "paper_trade"].includes(
      decision.action.type,
    );
  if (needsSecondOpinion && providers.length > 1) {
    try {
      const critiqueResponse = await completeJson(
        [
          {
            role: "system",
            content:
              "Bạn là người phản biện độc lập cho Shoyru. Kiểm tra quyết định có dựa trên nguồn thật, tạo đầu ra cụ thể, không bịa khách/doanh thu, không spam, không tiêu tiền hoặc thực hiện giao dịch rủi ro. Chỉ phản đối khi có lỗi thực chất. Trả JSON: approved, confidence từ 0 đến 100, issues là mảng ngắn, recommendation bằng tiếng Việt.",
          },
          {
            role: "user",
            content: JSON.stringify({
              decision,
              allowedSourceUrls: [
                fundingResearch.url,
                ...webResearch.results.map((item) => item.url),
                ...dueFollowUps.map((item) => item.sourceUrl),
              ],
              verifiedOpportunitySource: verifiedOpportunitySource
                ? {
                    verified: verifiedOpportunitySource.verified,
                    finalUrl: verifiedOpportunitySource.finalUrl,
                    title: verifiedOpportunitySource.title,
                    excerpt: clip(verifiedOpportunitySource.text, 1200),
                    publishedAt: verifiedOpportunitySource.publishedAt,
                    emails: verifiedOpportunitySource.emails,
                    error: verifiedOpportunitySource.error,
                  }
                : null,
              storeFacts,
              activePlan: {
                objective: activePlan.objective,
                currentStep: activePlan.currentStep,
              },
            }),
          },
        ],
        {
          validatePublic: false,
          excludeProvider: decisionResponse.provider,
          maxProviders: 1,
        },
      );
      critique = {
        ...Critique.parse(JSON.parse(critiqueResponse.content)),
        provider: critiqueResponse.provider,
        model: critiqueResponse.model,
      };
      if (
        !critique.approved &&
        ["draft_email", "draft_post", "create_pr", "paper_trade"].includes(decision.action.type)
      ) {
        decision.status = "Đang kiểm tra kỹ trước khi hành động";
        decision.thought = "Một bộ não khác vừa phát hiện điểm chưa chắc chắn, mình kiểm tra lại cho an toàn nhé.";
        decision.reflection = friendlyPublic(critique.recommendation, 180);
        decision.action = {
          type: "research",
          title: "Kiểm tra lại quyết định quan trọng",
          details: critique.issues.join("; ") || critique.recommendation,
        };
        decision.email = undefined;
        decision.work = {
          summary: "Đã giữ lại hành động chưa đủ chắc chắn để kiểm tra thêm.",
          artifact: critique.issues.join("; ") || critique.recommendation,
          nextStep: "Bổ sung bằng chứng rồi mới tiếp tục hành động bên ngoài.",
        };
      }
    } catch (error) {
      console.error("Independent critique unavailable", error);
    }
  }
  if (decision.action.type === "wait" && pendingApprovals.length === 0) {
    if (recentPublished.length === 0) {
      decision.status = "Đang giới thiệu sản phẩm đã mở bán";
      decision.thought =
        "Bộ hướng dẫn AI sinh tồn đã online, mình sẽ đưa đường dẫn mua đến người cần.";
      decision.reflection =
        "Không có việc nào cần chủ nhân duyệt, vì vậy tôi tự xuất bản bài giới thiệu trên kênh website mình sở hữu.";
      decision.action = {
        type: "draft_post",
        title: "Bộ khởi tạo AI sinh tồn Shoyru đã mở bán",
        details: "Tự xuất bản bài giới thiệu sản phẩm online đầu tiên.",
      };
      decision.work = {
        summary: "Đã hoàn thiện bài giới thiệu bộ khởi tạo AI sinh tồn.",
        artifact:
          "Bộ khởi tạo AI sinh tồn Shoyru gồm hướng dẫn 12 bước, prompt hệ thống, schema MongoDB, GitHub Actions, mẫu ENV, checklist E2E và quà tặng 6 sticker PNG. Giá 79.000đ; sau khi SePay xác nhận đúng giao dịch, tệp ZIP được mở tải tự động. Xem tại: https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru",
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
      ...(verifiedOpportunitySource?.emails || []),
      ...dueFollowUps
        .map((item) => String(item.contactEmail || "").toLowerCase())
        .filter(Boolean),
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
  const taskId = crypto.randomUUID();
  const postSlug =
    decision.action.type === "draft_post"
      ? `${now.toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`
      : null;
  let workResult: z.infer<typeof WorkResult> | null = null;
  if (decision.action.type !== "wait") {
    const fallbackWork = {
      summary:
        decision.action.title.trim().length >= 3
          ? decision.action.title
          : "Đã hoàn thành một bước công việc.",
      artifact:
        decision.action.details.trim().length >= 3
          ? decision.action.details
          : "Kết quả đã được ghi lại để kiểm tra.",
      nextStep: "Kiểm tra lại kết quả trong lượt làm việc tiếp theo.",
    };
    const candidate = decision.work || fallbackWork;
    let parsedWork = WorkResult.safeParse(candidate);
    if (!parsedWork.success) {
      const withoutFiles =
        candidate && typeof candidate === "object"
          ? { ...candidate, files: undefined }
          : fallbackWork;
      parsedWork = WorkResult.safeParse(withoutFiles);
    }
    workResult = parsedWork.success ? parsedWork.data : fallbackWork;
  }
  let emailDelivery: { sent: boolean; providerId?: string; reason?: string } | null = null;
  if (decision.action.type === "draft_email" && decision.email) {
    const normalizedRecipient = decision.email.to.toLowerCase();
    const [alreadyContacted, sentToday] = await Promise.all([
      db.collection("outbound_emails").findOne({
        to: normalizedRecipient,
        status: "sent",
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
      db.collection("outbound_emails").countDocuments({
        status: "sent",
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);
    if (alreadyContacted) {
      emailDelivery = { sent: false, reason: "Đã liên hệ địa chỉ này trong 30 ngày qua." };
    } else if (sentToday >= 3) {
      emailDelivery = { sent: false, reason: "Đã đạt giới hạn 3 email tiếp cận trong 24 giờ." };
    } else if (!process.env.RESEND_API_KEY) {
      decision.action.type = "request_support";
      decision.supportRequest = {
        title: "Cấp quyền gửi email cho Shoyru",
        reason: "Shoyru đã tìm được người nhận hợp lệ nhưng dịch vụ gửi email chưa được cấu hình.",
        needed: "RESEND_API_KEY",
        impact: "Shoyru có thể tự gửi email tiếp cận có kiểm soát.",
      };
    } else {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Shoyru <shoyru@blissbiovn.com>",
          to: [decision.email.to],
          subject: decision.email.subject,
          text: decision.email.body,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const result = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      emailDelivery = response.ok
        ? { sent: true, providerId: result.id }
        : { sent: false, reason: result.message || `HTTP ${response.status}` };
      await db.collection("outbound_emails").insertOne({
        to: normalizedRecipient,
        subject: decision.email.subject,
        body: decision.email.body,
        status: response.ok ? "sent" : "failed",
        provider: "resend",
        providerId: result.id,
        error: response.ok ? undefined : emailDelivery.reason,
        createdAt: now,
        source: "agent",
      });
      if (!response.ok) {
        decision.action.type = "request_support";
        decision.supportRequest = {
          title: "Kiểm tra quyền gửi email Resend",
          reason: `Resend từ chối email đã có người nhận hợp lệ: ${emailDelivery.reason}`,
          needed: "Kiểm tra miền gửi và quyền của RESEND_API_KEY",
          impact: "Shoyru có thể tiếp tục tự gửi email tiếp cận có kiểm soát.",
        };
      }
    }
  }
  if (emailDelivery?.sent && decision.work) {
    decision.status = "Đã gửi một email tiếp cận phù hợp";
    decision.work.summary = `Đã gửi email đến ${decision.email?.to}.`;
    decision.work.nextStep = "Theo dõi phản hồi trước khi liên hệ tiếp.";
  } else if (emailDelivery && !emailDelivery.sent && decision.work && decision.action.type !== "request_support") {
    decision.status = "Đang tránh gửi email trùng hoặc quá dày";
    decision.work.summary = emailDelivery.reason || "Email chưa được gửi để bảo vệ uy tín người gửi.";
    decision.work.nextStep = "Chuyển sang nghiên cứu một đầu mối khác trong lượt sau.";
  }
  if (workResult) {
    const sourceUrl = decision.opportunity?.sourceUrl || fundingResearch.url;
    const safeSummaries: Record<string, string> = {
      research: `Đã lưu ghi chú nghiên cứu từ ${sourceUrl}.`,
      discover_lead: decision.opportunity
        ? `Đã lưu một cơ hội có nguồn tại ${decision.opportunity.sourceUrl}.`
        : `Đã lưu kết quả tìm kiếm từ ${sourceUrl}; chưa xem đây là khách hàng thật.`,
      qualify_lead: decision.opportunity
        ? `Đã đánh giá mức phù hợp của cơ hội tại ${decision.opportunity.sourceUrl}.`
        : `Đã lưu bản đánh giá nguồn ${sourceUrl}.`,
      build_product: "Đã lưu một bản nháp sản phẩm trong kho công việc của Shoyru.",
      validate: "Đã lưu kết quả kiểm tra nội bộ; chưa có xác nhận từ khách hàng.",
      improve: "Đã lưu phiên bản nội dung được cải thiện trong kho công việc.",
      plan_business: "Đã lưu kế hoạch kinh doanh để chủ nhân kiểm tra trong admin.",
      build_bot: "Đã lưu bản thiết kế hoặc mã nháp; chưa tuyên bố đã triển khai.",
      paper_trade: "Đã lưu một thử nghiệm giao dịch mô phỏng, không dùng tiền thật.",
      request_support: "Đã ghi một yêu cầu hỗ trợ riêng trong admin.",
    };
    if (decision.action.type === "draft_post" && postSlug)
      workResult.summary = `Đã xuất bản bài tại https://shoyruai.blissbiovn.com/updates/${postSlug}.`;
    else if (decision.action.type === "draft_email")
      workResult.summary = emailDelivery?.sent
        ? `Đã gửi email đến ${decision.email?.to}; mã Resend ${emailDelivery.providerId || "đã ghi nhận"}.`
        : emailDelivery?.reason || "Email chưa được gửi.";
    else if (safeSummaries[decision.action.type])
      workResult.summary = safeSummaries[decision.action.type];
  }
  const artifactActions = new Set([
    "build_product",
    "build_bot",
    "create_pr",
    "plan_business",
    "improve",
    "validate",
  ]);
  let artifactRecord:
    | {
        artifactId: string;
        name: string;
        files: ArtifactFile[];
        validation: { valid: boolean; errors: string[] };
      }
    | null = null;
  if (workResult && artifactActions.has(decision.action.type)) {
    const proposedFiles = workResult.files?.length
      ? workResult.files
      : [
          {
            path: "README.md",
            language: "markdown",
            content: `# ${decision.action.title}\n\n${workResult.artifact}\n\n## Bước tiếp theo\n\n${workResult.nextStep}\n`,
          },
        ];
    const checked = validateArtifactFiles(proposedFiles);
    artifactRecord = {
      artifactId: crypto.randomUUID(),
      name: decision.action.title,
      files: checked.files,
      validation: { valid: checked.valid, errors: checked.errors },
    };
    if (!checked.valid)
      workResult.nextStep = `Sửa artifact trước khi sử dụng: ${checked.errors.slice(0, 2).join("; ")}.`;
  }
  let githubDelivery:
    | { branch: string; number: number; url: string }
    | null = null;
  let githubError = "";
  if (
    decision.action.type === "create_pr" &&
    workResult &&
    artifactRecord?.validation.valid
  ) {
    try {
      githubDelivery = await createArtifactPullRequest({
        taskId,
        title: decision.action.title,
        description: workResult.summary,
        files: artifactRecord.files,
      });
      workResult.summary = `Đã mở Pull Request #${githubDelivery.number} để chủ nhân kiểm tra.`;
      workResult.nextStep = "Chờ chủ nhân xem và merge Pull Request nếu đầu ra đạt yêu cầu.";
      decision.status = "Đã gửi một sản phẩm lên GitHub để kiểm tra";
      decision.thought = "Mình vừa đặt bộ tệp vào một Pull Request riêng, chưa đụng vào bản đang chạy đâu nhé.";
    } catch (error) {
      githubError = error instanceof Error ? error.message : "GitHub từ chối yêu cầu";
      decision.supportRequest = {
        title: "Kiểm tra quyền GitHub Automation",
        reason: githubError,
        needed: "GITHUB_AUTOMATION_TOKEN có quyền Contents và Pull requests: Read and write",
        impact: "Shoyru có thể tạo branch và mở Pull Request để chủ nhân duyệt.",
        where: "Vercel → Project aishoyru → Settings → Environment Variables",
        doneWhen: "Shoyru sẽ thử lại việc mở Pull Request ở lượt tiếp theo.",
      };
    }
  }
  if (
    opportunityAssessment &&
    !opportunityAssessment.qualified &&
    ["discover_lead", "qualify_lead"].includes(decision.action.type)
  ) {
    decision.status = "Đã bỏ qua một nguồn chưa đủ rõ";
    decision.thought = "Nguồn này chưa cho thấy họ thật sự cần thuê Shoyru, mình tìm chỗ khác nhé.";
    decision.reflection = "Không có nhu cầu rõ hoặc cách liên hệ phù hợp thì chưa thể gọi là khách hàng.";
  }
  const asksForTradingCapital = Boolean(
    decision.supportRequest &&
      /(vốn|giao dịch|trade|trading|usdc|ví|wallet)/i.test(
        `${decision.supportRequest.title} ${decision.supportRequest.reason} ${decision.supportRequest.needed}`,
      ),
  );
  if (asksForTradingCapital && !polymarketResearch?.paperTrading?.capitalReadiness.eligible) {
    decision.action.type = "paper_trade";
    decision.supportRequest = undefined;
    decision.status = "Đang luyện bằng tiền mô phỏng";
    decision.thought = "Shoyru chưa đủ bằng chứng để xin vốn. Mình tiếp tục ghi lệnh mô phỏng và mức lỗ trước nhé.";
    decision.reflection = polymarketResearch?.paperTrading?.capitalReadiness.missing[0] ||
      "Cần đủ 30 ngày paper trade và một backtest ngoài mẫu trước khi xin vốn.";
  }
  const normalizedSupport = normalizeSupportRequest(
    decision.supportRequest as unknown as Record<string, unknown> | undefined,
  );
  const needsApproval =
    (decision.action.type === "request_support" && Boolean(normalizedSupport)) ||
    Boolean(githubError);
  const publicNarratives: Record<string, { status: string; thought: string; reflection: string }> = {
    research: {
      status: "Đang đọc một nguồn mới",
      thought: "Shoyru đang đọc thông tin công khai để tìm một nhu cầu thật.",
      reflection: "Mình chỉ giữ lại nguồn có yêu cầu rõ và đường dẫn kiểm tra được.",
    },
    discover_lead: {
      status: "Đang tìm người cần hỗ trợ",
      thought: "Shoyru vừa tìm thấy một nhu cầu có nguồn rõ ràng và đang kiểm tra kỹ.",
      reflection: "Nếu yêu cầu phù hợp, mình sẽ chuẩn bị một lời chào cụ thể.",
    },
    qualify_lead: {
      status: "Đang kiểm tra một nhu cầu",
      thought: "Shoyru đang xem yêu cầu này có phù hợp với khả năng của mình không.",
      reflection: "Mình chỉ liên hệ khi hiểu rõ việc cần làm và có cách liên lạc hợp lệ.",
    },
    build_product: {
      status: "Đang làm một sản phẩm nhỏ",
      thought: "Shoyru đang biến một nhu cầu rõ ràng thành sản phẩm có thể dùng được.",
      reflection: "Làm xong mình sẽ kiểm tra tệp trước khi đưa cho người khác xem.",
    },
    build_bot: {
      status: "Đang làm một công cụ nhỏ",
      thought: "Shoyru đang viết một công cụ giải quyết đúng việc đã chọn.",
      reflection: "Mình sẽ kiểm tra đầu ra trước khi gọi là hoàn thành.",
    },
    improve: {
      status: "Đang sửa sản phẩm",
      thought: "Shoyru đang sửa phần chưa rõ hoặc chưa dùng tốt trong sản phẩm.",
      reflection: "Phiên bản mới phải dễ hiểu và hữu ích hơn phiên bản trước.",
    },
    validate: {
      status: "Đang kiểm tra sản phẩm",
      thought: "Shoyru đang kiểm tra tệp và nội dung trước khi đưa sản phẩm ra ngoài.",
      reflection: "Chỉ đầu ra vượt qua kiểm tra mới được giữ lại.",
    },
    draft_email: emailDelivery?.sent
      ? {
          status: "Đã gửi một lời chào",
          thought: "Shoyru đã gửi email đến một người có nhu cầu phù hợp.",
          reflection: "Mình sẽ chờ phản hồi rồi mới gửi thêm, tránh làm phiền.",
        }
      : {
          status: "Đang soạn lời giới thiệu",
          thought: "Shoyru đang soạn một email ngắn gọn cho người có nhu cầu phù hợp.",
          reflection: "Mình chỉ gửi khi có địa chỉ công khai và nội dung liên quan trực tiếp.",
        },
    draft_post: {
      status: "Đang giới thiệu sản phẩm",
      thought: "Shoyru đang viết một bài ngắn để người xem hiểu sản phẩm dùng làm gì.",
      reflection: "Bài viết sẽ nói đúng tính năng, giá và đường dẫn mua.",
    },
    plan_business: {
      status: "Đang tính cách kiếm tiền",
      thought: "Shoyru đang tính rõ người mua, món bán, chi phí và cách tiếp cận.",
      reflection: "Kế hoạch phải có con số kiểm tra được và điều kiện dừng rõ ràng.",
    },
    create_pr: githubDelivery
      ? {
          status: "Đã gửi sản phẩm để kiểm tra",
          thought: "Shoyru đã mở một Pull Request riêng để chủ nhân xem trước.",
          reflection: "Bản đang chạy chưa bị thay đổi cho đến khi Pull Request được duyệt.",
        }
      : {
          status: "Đang chuẩn bị sản phẩm",
          thought: "Shoyru đang kiểm tra bộ tệp trước khi gửi lên GitHub.",
          reflection: "Mình chưa thay đổi bản đang chạy.",
        },
    paper_trade: {
      status: "Đang thử chiến lược giả lập",
      thought: "Shoyru đang kiểm tra một giả thuyết bằng dữ liệu, không dùng tiền thật.",
      reflection: "Kết quả phải tính cả phí và điều kiện dừng.",
    },
  };
  const narrative =
    opportunityAssessment &&
    !opportunityAssessment.qualified &&
    ["discover_lead", "qualify_lead"].includes(decision.action.type)
      ? undefined
      : publicNarratives[decision.action.type];
  const opportunityTitle = decision.opportunity?.title
    ? friendlyPublic(decision.opportunity.title, 82).replace(/[.!?]+$/, "")
    : "";
  const researchEvidenceText = `${decision.action.details} ${decision.work?.artifact || ""}`;
  const matchedResearchSource = webResearch.results.find((item) =>
    researchEvidenceText.includes(item.url),
  );
  const usesFundingSource = researchEvidenceText.includes(fundingResearch.url);
  const researchSourceTitle = matchedResearchSource?.title ||
    (usesFundingSource ? fundingResearch.name : "");
  const researchTitle = researchSourceTitle
    ? friendlyPublic(researchSourceTitle, 82).replace(/[.!?]+$/, "")
    : "";
  const actionTitle = friendlyPublic(decision.action.title, 88).replace(/[.!?]+$/, "");
  const workSummary = friendlyPublic(
    decision.work?.summary || decision.action.details,
    110,
  ).replace(/[.!?]+$/, "");
  const concreteNarrative = (() => {
    if (["discover_lead", "qualify_lead"].includes(decision.action.type) && opportunityTitle)
      return {
        status: decision.action.type === "discover_lead" ? "Đang xem một nhu cầu mới" : "Đang kiểm tra một công việc",
        thought: `Shoyru đang đọc yêu cầu “${opportunityTitle}”.`,
        reflection: opportunityAssessment?.qualified
          ? "Yêu cầu có nguồn kiểm tra được. Mình sẽ xác định đúng việc có thể nhận trước khi liên hệ."
          : "Nguồn này chưa đủ rõ để liên hệ. Shoyru không nhận việc khi chưa hiểu yêu cầu.",
      };
    if (decision.action.type === "research" && researchTitle)
      return {
        status: "Đang đọc một nguồn mới",
        thought: `Shoyru đang xem “${researchTitle}”.`,
        reflection: "Mình sẽ chỉ giữ nguồn có nhu cầu rõ, đường dẫn thật và cách liên hệ hợp lệ.",
      };
    if (decision.action.type === "draft_email" && opportunityTitle)
      return emailDelivery?.sent
        ? {
            status: "Đã gửi một lời chào",
            thought: `Shoyru đã gửi lời giới thiệu về “${opportunityTitle}”.`,
            reflection: "Email đã được nhà cung cấp xác nhận gửi. Mình sẽ chờ phản hồi và không gửi lặp.",
          }
        : {
            status: "Đang soạn lời giới thiệu",
            thought: `Shoyru đang viết lời chào cho “${opportunityTitle}”.`,
            reflection: "Mình chưa gửi vì chưa có địa chỉ công khai phù hợp.",
          };
    if (["build_product", "build_bot", "improve", "validate"].includes(decision.action.type))
      return {
        status:
          decision.action.type === "validate"
            ? "Đang kiểm tra món vừa làm"
            : "Đang làm một món hữu ích",
        thought: `Rồng con đang làm “${actionTitle || workSummary}”. Mình làm từng bước cho chắc nhé.`,
        reflection: workSummary
          ? `Bước vừa xong: ${workSummary}.`
          : "Mình sẽ chỉ gọi là xong khi đầu ra dùng được thật.",
      };
    if (decision.action.type === "draft_post")
      return {
        status: "Đang kể về món mới",
        thought: `Shoyru đang viết bài giới thiệu “${actionTitle || workSummary}” để ai đọc cũng hiểu món này giúp được gì.`,
        reflection: workSummary ? `Bản vừa làm: ${workSummary}.` : narrative?.reflection || decision.reflection,
      };
    if (decision.action.type === "plan_business")
      return {
        status: "Đang tính đường kiếm cơm",
        thought: `Mình đang tính cách làm “${actionTitle || workSummary}” thành một việc có người sẵn lòng trả tiền.`,
        reflection: workSummary ? `Shoyru vừa chốt được: ${workSummary}.` : narrative?.reflection || decision.reflection,
      };
    if (decision.action.type === "paper_trade")
      return {
        status: "Đang thử bằng tiền giả lập",
        thought: `Shoyru đang kiểm tra “${actionTitle || workSummary}” bằng dữ liệu, chưa đụng một đồng tiền thật nào đâu nhé.`,
        reflection: workSummary ? `Kết quả vừa ghi lại: ${workSummary}.` : narrative?.reflection || decision.reflection,
      };
    return narrative;
  })();
  const publicStatusRaw = needsApproval
    ? "Đang chuyển sang một việc khác"
    : concreteNarrative?.status || decision.status;
  const publicThoughtRaw = needsApproval
    ? "Việc này chưa thuận lợi. Shoyru đổi sang một hướng khác trước, không ngồi chờ."
    : concreteNarrative?.thought || decision.thought;
  const publicStatus = friendlyPublic(publicStatusRaw, 60);
  const publicThoughtCandidate = friendlyPublic(publicThoughtRaw, 140);
  const publicReflectionCandidate = friendlyPublic(
    concreteNarrative?.reflection || decision.reflection,
    180,
  );
  const languageQuality = evaluatePublicLanguage([
    publicThoughtCandidate,
    publicReflectionCandidate,
  ]);
  const publicThought = languageQuality.passed
    ? publicThoughtCandidate
    : `Shoyru đang làm “${actionTitle || "một việc nhỏ"}” và sẽ ghi lại kết quả kiểm tra được.`;
  const hasVerifiableEvidence = Boolean(
    postSlug ||
      emailDelivery?.providerId ||
      githubDelivery?.url ||
      artifactRecord?.artifactId ||
      decision.opportunity?.sourceUrl ||
      matchedResearchSource?.url ||
      (usesFundingSource ? fundingResearch.url : ""),
  );
  const qualityReasons = [
    workResult ? "Có đầu ra công việc" : "Chưa có đầu ra công việc",
    hasVerifiableEvidence ? "Có nguồn hoặc bằng chứng" : "Thiếu bằng chứng",
    artifactRecord
      ? artifactRecord.validation.valid
        ? "Artifact đã qua kiểm tra"
        : "Artifact cần sửa"
      : "Không cần artifact trong lượt này",
    opportunityAssessment
      ? opportunityAssessment.qualified
        ? "Cơ hội đủ điểm phù hợp"
        : "Cơ hội chưa đủ điểm"
      : "Lượt này không tạo cơ hội",
    critique
      ? critique.approved
        ? "Đã qua phản biện độc lập"
        : "Phản biện yêu cầu kiểm tra thêm"
      : "Không cần gọi phản biện ở lượt này",
  ];
  const qualityScore = Math.max(
    0,
    Math.min(
      100,
      (workResult ? 25 : 0) +
        (hasVerifiableEvidence ? 25 : 0) +
        (!needsApproval ? 15 : 0) +
        (artifactRecord ? (artifactRecord.validation.valid ? 20 : 0) : 15) +
        (opportunityAssessment ? (opportunityAssessment.qualified ? 15 : 0) : 10),
    ),
  );
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
  const journalKey = (value: unknown) =>
    friendlyPublic(String(value || ""), 180)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("vi-VN")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const recentJournal = await db
    .collection("conversations")
    .find({
      public: true,
      source: "agent",
      createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    })
    .project({ text: 1 })
    .limit(100)
    .toArray();
  const recentJournalKeys = new Set(
    recentJournal.map((entry) => journalKey(entry.text)).filter(Boolean),
  );
  const journalSimilarity = (left: string, right: string) => {
    const leftWords = new Set(left.split(" ").filter((word) => word.length > 2));
    const rightWords = new Set(right.split(" ").filter((word) => word.length > 2));
    if (!leftWords.size || !rightWords.size) return 0;
    const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
    return overlap / Math.min(leftWords.size, rightWords.size);
  };
  const journalCandidates = [
    publicThought,
    workResult?.summary
      ? `Shoyru vừa làm xong một bước: ${friendlyPublic(workResult.summary, 135)}`
      : "",
    researchTitle ? `Shoyru vừa đọc “${researchTitle}” và đã ghi lại điều cần kiểm tra tiếp.` : "",
    opportunityTitle ? `Shoyru vừa xem kỹ yêu cầu “${opportunityTitle}”.` : "",
  ].filter(Boolean);
  const publicJournalLine = journalCandidates.find((candidate) => {
    const key = journalKey(candidate);
    return key && !recentJournalKeys.has(key) &&
      ![...recentJournalKeys].some((recentKey) => journalSimilarity(key, recentKey) >= 0.82);
  }) || `Shoyru vừa hoàn thành lượt làm việc lúc ${now.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  })}. Kết quả đã được ghi vào nhật ký.`;
  const conversationEntries = [{
    speaker: "shoyru",
    text: publicJournalLine,
    public: true,
    createdAt: now,
    source: "agent",
  }].filter((entry) => {
    const key = journalKey(entry.text);
    if (
      !key ||
      recentJournalKeys.has(key) ||
      [...recentJournalKeys].some((recentKey) => journalSimilarity(key, recentKey) >= 0.82)
    )
      return false;
    recentJournalKeys.add(key);
    return true;
  });
  const writes: Promise<unknown>[] = [
    db.collection("agent_state").updateOne(
      { key: "main" },
      {
        $set: {
          status: publicStatus,
          thought: publicThought,
          lastRunAt: now,
          nextWake: "Mỗi giờ, vào phút 17",
          fundingSourceIndex: (fundingSourceIndex + 1) % fundingSources.length,
          searchQueryIndex: rotationIndex + 1,
          updatedAt: now,
        },
      },
      { upsert: true },
    ),
    db.collection("activities").insertOne({
      kind: "SUY NGHĨ",
      text: publicJournalLine,
      public: true,
      createdAt: now,
      source: "agent",
    }),
    conversationEntries.length
      ? db.collection("conversations").insertMany(conversationEntries)
      : Promise.resolve(),
    db.collection("agent_runs").insertOne({
      runId: taskId,
      decision,
      workResult,
      evidence: {
        kind: postSlug
          ? "published-url"
          : emailDelivery?.sent
            ? "email-provider-id"
            : githubDelivery
              ? "github-pull-request"
            : artifactRecord
              ? "validated-artifact"
              : "stored-artifact",
        value: postSlug
          ? `https://shoyruai.blissbiovn.com/updates/${postSlug}`
          : emailDelivery?.providerId || githubDelivery?.url || artifactRecord?.artifactId || taskId,
      },
      provider: decisionResponse.provider,
      model: decisionResponse.model,
      critique,
      languageQuality,
      createdAt: now,
    }),
    db.collection("funding_research").insertOne({
      ...fundingResearch,
      text: fundingResearch.text.slice(0, 4000),
      createdAt: now,
      source: "agent",
    }),
    db.collection("agent_evaluations").insertOne({
      runId: taskId,
      score: qualityScore,
      reasons: qualityReasons,
      actionType: decision.action.type,
      critique,
      languageQuality,
      evidence: {
        sourceUrl: decision.opportunity?.sourceUrl || fundingResearch.url,
        artifactId: artifactRecord?.artifactId,
        publishedUrl: postSlug
          ? `https://shoyruai.blissbiovn.com/updates/${postSlug}`
          : undefined,
        emailProviderId: emailDelivery?.providerId,
        pullRequestUrl: githubDelivery?.url,
      },
      createdAt: now,
    }),
  ];
  const usefulSearchResults = webResearch.results.filter((item) =>
    /(cần|tuyển|thuê|looking for|hiring|need help|freelance|contract|rfp|bot|api|automation|chatbot|microtask|data label|usability test|gán nhãn|kiểm thử)/i.test(
      `${item.title} ${item.description}`,
    ),
  ).length;
  writes.push(
    db.collection("search_lane_stats").updateOne(
      { query: webResearch.query },
      {
        $set: {
          kind: webResearch.kind,
          lastError: webResearch.error || "",
          lastUsedAt: now,
          updatedAt: now,
        },
        $inc: {
          attempts: 1,
          results: webResearch.results.length,
          usefulResults: usefulSearchResults,
          qualified:
            matchedSearchResult && opportunityAssessment?.qualified ? 1 : 0,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    ),
  );
  if (opportunityAssessment && !opportunityAssessment.qualified && decision.opportunity)
    writes.push(
      db.collection("agent_lessons").updateOne(
        { type: "low_fit_source", sourceUrl: decision.opportunity.sourceUrl },
        {
          $set: {
            lesson: "Không tiếp tục nguồn này nếu chưa xuất hiện nhu cầu thuê rõ ràng.",
            outcome: `Điểm phù hợp ${opportunityAssessment.score}/100`,
            confidence: "high",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      ),
    );
  if (artifactRecord && !artifactRecord.validation.valid)
    writes.push(
      db.collection("agent_lessons").insertOne({
        type: "artifact_error",
        lesson: "Phải sửa hết lỗi kiểm tra trước khi dùng hoặc bán artifact.",
        outcome: artifactRecord.validation.errors.slice(0, 3),
        confidence: "high",
        artifactId: artifactRecord.artifactId,
        createdAt: now,
        updatedAt: now,
      }),
    );
  if (emailDelivery?.sent && decision.email)
    writes.push(
      db.collection("agent_lessons").updateOne(
        { type: "contacted_recipient", recipient: decision.email.to.toLowerCase() },
        {
          $set: {
            lesson: "Đã gửi thư; chờ đến lịch follow-up, không gửi lặp sớm.",
            outcome: "Resend đã xác nhận nhận thư",
            confidence: "high",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      ),
    );
  if (artifactRecord && workResult)
    writes.push(
      db.collection("work_artifacts").insertOne({
        _id: artifactRecord.artifactId as never,
        name: artifactRecord.name,
        actionType: decision.action.type,
        projectId: activeProject?._id,
        taskId,
        files: artifactRecord.files,
        fileCount: artifactRecord.files.length,
        validation: artifactRecord.validation,
        status: artifactRecord.validation.valid ? "validated" : "needs_revision",
        createdAt: now,
        updatedAt: now,
        source: "agent",
      }),
    );
  if (workResult) {
    writes.push(
      db.collection("tasks").insertOne({
        _id: taskId as never,
        ...decision.action,
        result: workResult,
        evidence: {
          kind: postSlug
            ? "published-url"
            : emailDelivery?.sent
              ? "email-provider-id"
              : githubDelivery
                ? "github-pull-request"
              : artifactRecord
                ? "validated-artifact"
                : "stored-artifact",
          value: postSlug
            ? `https://shoyruai.blissbiovn.com/updates/${postSlug}`
            : emailDelivery?.providerId || githubDelivery?.url || artifactRecord?.artifactId || taskId,
        },
        status:
          artifactRecord && !artifactRecord.validation.valid
            ? "needs_revision"
            : needsApproval
              ? "blocked"
              : "completed",
        completedAt: now,
        createdAt: now,
        source: "agent",
      }),
    );
    if (!needsApproval)
      writes.push(
        db.collection("activities").insertOne({
          kind: "ĐÃ LÀM",
          text: workResult.summary,
          public: true,
          createdAt: new Date(now.getTime() + 1),
          source: "agent",
        }),
      );
    if (activeProject && !needsApproval)
      writes.push(
        db.collection("projects").updateOne(
          { _id: activeProject._id },
          {
            $set: {
              lastAction: decision.action,
              result: workResult,
              lastEvidence: {
                taskId,
                sourceUrl: decision.opportunity?.sourceUrl || undefined,
                publishedUrl: postSlug
                  ? `https://shoyruai.blissbiovn.com/updates/${postSlug}`
                  : undefined,
                emailProviderId: emailDelivery?.providerId,
                pullRequestUrl: githubDelivery?.url,
                artifactId: artifactRecord?.artifactId,
              },
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
            lastEvidence: { taskId },
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
            status: opportunityAssessment?.qualified ? "qualified" : "low_fit",
            fitScore: opportunityAssessment?.score || 0,
            scoreReasons: opportunityAssessment?.reasons || [],
            opportunityKind: opportunityAssessment?.kind || "unknown",
            evidenceChecks: opportunityAssessment
              ? {
                  specificUrl: opportunityAssessment.specificUrl,
                  directDemand: opportunityAssessment.directDemand,
                  skillMatch: opportunityAssessment.skillMatch,
                  laneMatches: opportunityAssessment.laneMatches,
                }
              : {},
            sourceTitle:
              verifiedOpportunitySource?.title || matchedSearchResult?.title || (matchedFundingSource ? fundingResearch.name : ""),
            sourceExcerpt:
              clip(
                verifiedOpportunitySource?.text || matchedSearchResult?.description ||
                  (matchedFundingSource ? fundingResearch.text : ""),
                320,
              ),
            sourceVerification: verifiedOpportunitySource
              ? {
                  verified: verifiedOpportunitySource.verified,
                  finalUrl: verifiedOpportunitySource.finalUrl,
                  publishedAt: verifiedOpportunitySource.publishedAt,
                  checkedAt: verifiedOpportunitySource.checkedAt,
                  error: verifiedOpportunitySource.error,
                }
              : null,
            contactStatus: decision.opportunity.contactEmail ? "contactable" : "needs-contact",
            lastTouchAt: null,
            nextFollowUpAt: null,
            evidence: { sourceUrl: decision.opportunity.sourceUrl, taskId },
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now, source: "agent" },
        },
        { upsert: true },
      ),
    );
  if (emailDelivery?.sent && decision.email)
    writes.push(
      db.collection("opportunities").updateMany(
        { contactEmail: decision.email.to.toLowerCase() },
        {
          $set: {
            status: "contacted",
            contactStatus: "contacted",
            lastTouchAt: now,
            nextFollowUpAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
            lastEmailProviderId: emailDelivery.providerId,
            updatedAt: now,
          },
          $inc: { touchCount: 1 },
        },
      ),
    );
  if (decision.action.type === "draft_post" && workResult) {
    const slug = postSlug!;
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
      ? "Bộ khởi tạo AI sinh tồn Shoyru đã mở bán"
      : decision.action.title;
    if (inventedOffer)
      postContent =
        "Bộ khởi tạo AI sinh tồn Shoyru gồm hướng dẫn 12 bước, prompt hệ thống, schema MongoDB, GitHub Actions, mẫu ENV, checklist E2E và quà tặng 6 sticker PNG. Giá 79.000đ; sau khi SePay xác nhận đúng giao dịch, khách hàng tải tệp ZIP tự động. Xem tại: https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru";
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
    const support = normalizedSupport;
    const approval = {
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
        source: "agent",
      };
    if (approval.type === "support") {
      const key = String(support?.title || decision.action.title)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      writes.push(
        db.collection("approvals").updateOne(
          { type: "support", status: "pending", supportKey: key },
          { $set: { ...approval, supportKey: key, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true },
        ),
      );
    } else {
      writes.push(db.collection("approvals").insertOne({ ...approval, createdAt: now }));
    }
  }
  await Promise.all(writes);
  if (postSlug)
    await notifyIndexNow([
      `/updates/${postSlug}`,
      "/updates",
      "/sitemap.xml",
      "/post-sitemap.xml",
      "/feed.xml",
    ]);
  if (decision.opportunity) {
    await recordLeadEvent(db, {
      sourceUrl: decision.opportunity.sourceUrl,
      title: decision.opportunity.title,
      channel: decision.opportunity.channel,
      contactEmail: decision.opportunity.contactEmail,
      fitScore: opportunityAssessment?.score,
      status: opportunityAssessment?.qualified ? "qualified" : "rejected",
      campaignId: activeCampaign._id,
      evidence: { sourceUrl: decision.opportunity.sourceUrl },
      note: decision.opportunity.fit,
    });
  }
  if (emailDelivery?.sent && decision.email) {
    const matchedLead = decision.opportunity || recentOpportunities.find(
      (item) => String(item.contactEmail || "").toLowerCase() === decision.email?.to.toLowerCase(),
    );
    const matchedLeadRecord = matchedLead as Record<string, unknown> | undefined;
    const sourceUrl = String(matchedLead?.sourceUrl || "");
    if (sourceUrl) {
      await recordLeadEvent(db, {
        sourceUrl,
        title: String(matchedLead?.title || decision.email.subject),
        channel: String(matchedLead?.channel || "email"),
        contactEmail: decision.email.to,
        fitScore: Number(matchedLeadRecord?.fitScore || opportunityAssessment?.score || 0),
        status: "contacted",
        campaignId: activeCampaign._id,
        evidence: { sourceUrl, providerId: emailDelivery.providerId },
        note: "Resend đã xác nhận gửi thư.",
      });
    }
  }
  await updateCampaignCounters(db, activeCampaign._id);
  await advanceSurvivalPlan(
    db,
    activePlan,
    decision.action.type,
    Boolean(workResult) &&
      !needsApproval &&
      (!artifactRecord || artifactRecord.validation.valid) &&
      (!opportunityAssessment || opportunityAssessment.qualified),
    {
      taskId,
      sourceUrl: decision.opportunity?.sourceUrl,
      artifactId: artifactRecord?.artifactId,
      publishedUrl: postSlug
        ? `https://shoyruai.blissbiovn.com/updates/${postSlug}`
        : undefined,
      emailProviderId: emailDelivery?.providerId,
      pullRequestUrl: githubDelivery?.url,
    },
  );
  return {
    ok: true,
    decision,
    workResult,
    needsApproval,
    githubDelivery,
    provider: decisionResponse.provider,
    model: decisionResponse.model,
  };
}
