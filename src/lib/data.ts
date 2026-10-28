import { demoState } from "./demo";
import { getDb } from "./mongodb";
import type { PublicState } from "./types";
const vietnameseText =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const privateOperations =
  /(api[_\s-]?key|secret|token|password|mật khẩu|otp|captcha|số điện thoại|ngân sách|xin vốn|discover_lead|qualify_lead|request_support|webResearch|resend|brave_search|groq|openrouter|mongodb)/i;
const unverifiedClaims =
  /(đã (ứng tuyển|nộp (đơn|hồ sơ)|tạo hồ sơ|đăng ký|kết nối ví|gửi báo giá)|chuẩn bị hồ sơ.+(Upwork|Gitcoin)|xác định.+(Upwork|Gitcoin)|Gitcoin|API Freelance Jobs|mức lương hợp lý|100[–-]200\$|đủ 500k|các bài đã đăng gần đây)/i;
const truthfulJournalStartedAt = new Date("2026-10-28T02:14:00+07:00");
const isLegacyAgentEntry = (item: Record<string, unknown>) =>
  item.source === "agent" &&
  item.createdAt &&
  new Date(item.createdAt as Date).getTime() < truthfulJournalStartedAt.getTime();
const publicSentence = (value: unknown, max = 190) => {
  const clean = String(value || "")
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
    .trim();
  if (clean.length <= max && !clean.endsWith("…") && !clean.endsWith("...")) return clean;
  const candidates = clean.match(/[^.!?]+[.!?]+/g) || [];
  let result = "";
  for (const sentence of candidates) {
    if ((result + sentence).trim().length > max) break;
    result = (result + " " + sentence).trim();
  }
  if (result) return result;
  const short = clean.slice(0, max).replace(/\s+\S*$/, "").replace(/[,:;.…\-]+$/, "");
  return short ? short + "." : "Shoyru đang tiếp tục công việc.";
};
const nextWakeLabel = (now: Date) => {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  shifted.setUTCSeconds(0, 0);
  if (shifted.getUTCMinutes() >= 17) shifted.setUTCHours(shifted.getUTCHours() + 1);
  shifted.setUTCMinutes(17);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:17`;
};
export async function getPublicState(): Promise<PublicState> {
  const db = await getDb();
  if (!db) return { ...demoState, updatedAt: new Date().toISOString() };
  const legacy: Record<string, string> = {
    "I think a simple recipe recommendation bot could be fun and useful for people who don’t know what to cook.":
      "Mình có thể làm một công cụ gợi ý món ăn cho những người không biết hôm nay nên nấu gì.",
    "I think a simple recipe recommendation bot could be fun and useful for people who don't know what to cook.":
      "Mình có thể làm một công cụ gợi ý món ăn cho những người không biết hôm nay nên nấu gì.",
    "It uses existing data, low cost, and can be built quickly with a rule-based approach.":
      "Ý tưởng này dùng dữ liệu có sẵn, chi phí thấp và có thể dựng bản thử nghiệm nhanh.",
    "It uses existing data, low cost, and can be built quickly with a rule‑based approach.":
      "Ý tưởng này dùng dữ liệu có sẵn, chi phí thấp và có thể dựng bản thử nghiệm nhanh.",
  };
  const legacyTexts = Object.keys(legacy);
  const activeProject = await db
    .collection("projects")
    .findOne(
      { status: { $in: ["active", "validating", "ready"] } },
      { sort: { updatedAt: -1 } },
    );
  const conversationFilter: Record<string, unknown> = {
    public: true,
    text: { $nin: legacyTexts, $regex: vietnameseText },
  };
  if (activeProject?.createdAt)
    conversationFilter.createdAt = {
      $gte: new Date(
        new Date(activeProject.createdAt as Date).getTime() - 5000,
      ),
    };
  const now = new Date();
  const vietnamNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const todayStartVietnam = new Date(vietnamNow);
  todayStartVietnam.setHours(0, 0, 0, 0);
  const todayStart = new Date(todayStartVietnam.getTime() - 7 * 60 * 60 * 1000);
  const activeSince = new Date(now.getTime() - 90 * 1000);
  const [state, activities, transactions, conversations, activeViewers, todaySessions, totalViews] = await Promise.all([
    db.collection("agent_state").findOne({ key: "main" }),
    db
      .collection("activities")
      .find({
        public: true,
        text: { $nin: legacyTexts, $regex: vietnameseText },
      })
      .sort({ createdAt: -1 })
      .limit(12)
      .toArray(),
    db
      .collection("transactions")
      .find({ verified: true })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray(),
    db
      .collection("conversations")
      .find(conversationFilter)
      .sort({ createdAt: -1 })
      .limit(12)
      .toArray(),
    db.collection("visitor_presence").countDocuments({ lastSeenAt: { $gte: activeSince } }),
    db.collection("engagement_events").distinct("sessionId", {
      type: "page_view",
      createdAt: { $gte: todayStart },
    }),
    db.collection("engagement_events").countDocuments({ type: "page_view" }),
  ]);
  const income = transactions
    .filter((x) => x.kind === "income")
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const expense = transactions
    .filter((x) => x.kind === "expense")
    .reduce((s, x) => s + Number(x.amount || 0), 0);
  const launchAt = new Date("2026-10-27T00:00:00+07:00");
  const operatingDays = Math.max(
    1,
    Math.floor((now.getTime() - launchAt.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  const dayKey = (value: Date) =>
    value.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const chart = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(now.getTime() - (13 - index) * 24 * 60 * 60 * 1000);
    const key = dayKey(day);
    return {
      label: day.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      }),
      value: transactions
        .filter(
          (transaction) =>
            transaction.kind === "income" &&
            transaction.verified === true &&
            transaction.createdAt &&
            dayKey(new Date(transaction.createdAt as Date)) === key,
        )
        .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0),
    };
  });
  const seenActivityText = new Set<string>();
  const activitiesOut = activities.filter((x) => {
    const text = String(x.text || "").trim();
    if (isLegacyAgentEntry(x) || privateOperations.test(text) || unverifiedClaims.test(text) || seenActivityText.has(text))
      return false;
    seenActivityText.add(text);
    return true;
  }).map((x) => ({
    id: String(x._id),
    at: new Date(x.createdAt as Date).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    }),
    kind: String(x.kind || "NHẬT KÝ"),
      text: publicSentence(x.text, 180),
    amount: x.amount ? Number(x.amount) : undefined,
  }));
  const seenConversationText = new Set<string>();
  const conversationsOut = conversations
    .reverse()
    .filter((x) => {
      const text = String(x.text || "").trim();
      if (isLegacyAgentEntry(x) || privateOperations.test(text) || unverifiedClaims.test(text) || seenConversationText.has(text))
        return false;
      seenConversationText.add(text);
      return true;
    })
    .map((x) => ({
      id: String(x._id),
      speaker: (x.speaker === "he-thong" ? "he-thong" : "shoyru") as
        "shoyru" | "he-thong",
      at: new Date(x.createdAt as Date).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      }),
      text: publicSentence(legacy[String(x.text || "")] || x.text),
    }));
  const status = String(state?.status || "Đang nghỉ trong hang");
  const statusVi = privateOperations.test(status)
    ? "Đang sắp xếp công việc tiếp theo"
    :
    status === "idea"
      ? "Đang chọn việc có thể kiếm tiền"
      : vietnameseText.test(status)
        ? status
        : "Đang hoàn thiện nội dung bán hàng";
  const rawThought =
    legacy[String(state?.thought || "")] || String(state?.thought || "");
  const thoughtVi = privateOperations.test(rawThought)
    ? "Việc này chưa thuận lợi. Shoyru chuyển sang một hướng khác trước."
    : vietnameseText.test(rawThought)
    ? publicSentence(rawThought, 145)
    : "Shoyru đang hoàn thiện nội dung giới thiệu Bộ khởi tạo AI sinh tồn.";
  const projectResult =
    activeProject?.result && typeof activeProject.result === "object"
      ? (activeProject.result as Record<string, unknown>)
      : {};
  const projectAction =
    activeProject?.lastAction && typeof activeProject.lastAction === "object"
      ? (activeProject.lastAction as Record<string, unknown>)
      : {};
  const projectPrivate =
    String(projectAction.type || "") === "request_support" ||
    privateOperations.test(`${projectAction.title || ""} ${projectResult.summary || ""} ${projectResult.nextStep || ""}`);
  const project = {
    name: String(activeProject?.name || demoState.project.name),
    status: String(activeProject?.status || "active"),
    customer: String(activeProject?.customer || demoState.project.customer),
    deliverable: String(
      activeProject?.deliverable || demoState.project.deliverable,
    ),
    price: Number(activeProject?.price || demoState.project.price),
    stepCount: Number(activeProject?.stepCount || 0),
    lastAction: projectPrivate
      ? "Tìm người đang cần một AI agent giống Shoyru"
      : vietnameseText.test(String(projectAction.title || ""))
      ? publicSentence(projectAction.title, 150)
      : "Hoàn thiện một bước của dự án",
    result: projectPrivate
      ? "Bộ hướng dẫn đã sẵn sàng bán với giá 79.000đ."
      : vietnameseText.test(String(projectResult.summary || ""))
      ? publicSentence(projectResult.summary, 180)
      : "Shoyru đã hoàn thiện thêm một phần của sản phẩm.",
    nextStep: projectPrivate
      ? "Theo dõi lượt xem sản phẩm và tìm một đầu mối có nhu cầu thật."
      : vietnameseText.test(String(projectResult.nextStep || ""))
      ? publicSentence(projectResult.nextStep, 180)
      : "Tiếp tục hoàn thiện sản phẩm trong lượt làm việc kế tiếp.",
  };
  const progress = Math.max(
    8,
    Math.min(100, activeProject?.status === "ready" ? 100 : Number(activeProject?.stepCount || 0) * 8),
  );
  const experiment = {
    name: String(activeProject?.name || "Tìm sản phẩm đầu tiên có người mua"),
    hypothesis: activeProject
      ? `${String(activeProject.customer || "Người cần một AI agent")} sẽ trả ${Number(activeProject.price || 0).toLocaleString("vi-VN")}đ cho đầu ra rõ ràng và dùng được.`
      : "Một sản phẩm nhỏ, giải quyết nhu cầu thật và giao tự động có thể tạo đơn đầu tiên.",
    status: activeProject?.status === "ready" ? "Đã sẵn sàng bán" : "Đang kiểm chứng bằng dữ liệu thật",
    progress,
  };
  return {
    ...demoState,
    demo: false,
    income,
    expense,
    fundedBudget: 500000,
    operatingDays,
    status: statusVi,
    thought: thoughtVi,
    nextWake: nextWakeLabel(now),
    streak: operatingDays,
    visitors: Number(state?.visitors || 0),
    activeViewers,
    todayVisitors: todaySessions.length,
    totalViews,
    lastRunAt: state?.lastRunAt ? new Date(state.lastRunAt as Date).toISOString() : null,
    cronDelayed: state?.lastRunAt
      ? now.getTime() - new Date(state.lastRunAt as Date).getTime() > 90 * 60 * 1000
      : true,
    activities: activitiesOut,
    conversations: conversationsOut,
    experiment,
    project,
    chart,
    updatedAt: new Date().toISOString(),
  };
}
