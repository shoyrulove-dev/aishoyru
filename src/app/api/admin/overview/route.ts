import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getOperationalHealth } from "@/lib/operations";
import { getPolymarketResearch } from "@/lib/polymarket";
import {
  ownerOnlyActions,
  servicePackages,
  survivalAllocation,
  tradingCapitalRules,
} from "@/lib/survival-policy";

const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") ===
    `Bearer ${process.env.ADMIN_API_KEY}`;

const supportKey = (item: Record<string, unknown>) => {
  const explicit = String(item.supportKey || "").trim().toLowerCase();
  if (explicit) return explicit;
  return String(item.title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

async function cleanAdminInbox(db: Db) {
  const now = new Date();
  if (process.env.BRAVE_SEARCH_API_KEY) {
    await db.collection("approvals").updateMany(
      {
        status: "pending",
        type: "support",
        $or: [
          { supportKey: "brave-search" },
          { title: /API t[iì]m ki[eế]m web|Brave Search/i },
          { details: /BRAVE_SEARCH_API_KEY/i },
        ],
      },
      {
        $set: {
          status: "fulfilled",
          reviewedAt: now,
          resolution: "BRAVE_SEARCH_API_KEY đã được cấu hình và kiểm tra thành công.",
        },
      },
    );
  }

  const pendingSupport = await db
    .collection("approvals")
    .find({ status: "pending", type: "support" })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  const seen = new Set<string>();
  const duplicates = pendingSupport
    .filter((item) => {
      const key = supportKey(item);
      if (!key || !seen.has(key)) {
        if (key) seen.add(key);
        return false;
      }
      return true;
    })
    .map((item) => item._id);
  if (duplicates.length) {
    await db.collection("approvals").updateMany(
      { _id: { $in: duplicates }, status: "pending" },
      {
        $set: {
          status: "superseded",
          reviewedAt: now,
          resolution: "Yêu cầu trùng đã được gộp vào yêu cầu mới nhất.",
        },
      },
    );
  }

  const migrationId = "cleanup-test-chats-2026-10-27";
  const claimed = await db.collection<{ _id: string }>("system_migrations").updateOne(
    { _id: migrationId },
    { $setOnInsert: { createdAt: now, purpose: "Dọn hội thoại E2E trước khi vận hành thật" } },
    { upsert: true },
  );
  if (claimed.upsertedCount === 1) {
    await db.collection("visitor_messages").deleteMany({ createdAt: { $lte: now } });
  }
}

const normalizeApproval = (item: Record<string, unknown>) => {
  let request = item.supportRequest as Record<string, unknown> | undefined;
  if (!request && typeof item.details === "string") {
    try {
      const parsed = JSON.parse(item.details) as { supportRequest?: Record<string, unknown> };
      request = parsed.supportRequest;
    } catch {
      // Legacy support cards can contain plain text.
    }
  }
  return request ? { ...item, supportRequest: request } : item;
};

export async function GET(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
  await cleanAdminInbox(db);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    approvals,
    projects,
    opportunities,
    runs,
    orders,
    published,
    income,
    engagement,
    trafficSourceRows,
    topPageRows,
    chats,
    aiHealth,
    braveUsage,
    braveDailyUsage,
    activePlan,
    artifacts,
    evaluations,
    cycleClaims,
    activeStrategy,
    activeCampaign,
    crmStages,
    operations,
    aiUsageToday,
  ] = await Promise.all([
    db
      .collection("approvals")
      .find({ status: "pending", type: { $in: ["email", "support"] } })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
    db
      .collection("projects")
      .find({})
      .sort({ updatedAt: -1 })
      .limit(12)
      .toArray(),
    db
      .collection("opportunities")
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray(),
    db
      .collection("agent_runs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(12)
      .project({
        provider: 1,
        model: 1,
        createdAt: 1,
        "decision.action": 1,
        "decision.status": 1,
        workResult: 1,
        critique: 1,
      })
      .toArray(),
    db
      .collection("orders")
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .project({
        orderCode: 1,
        productSlug: 1,
        amount: 1,
        status: 1,
        createdAt: 1,
      })
      .toArray(),
    db
      .collection("published_posts")
      .find({})
      .sort({ publishedAt: -1 })
      .limit(10)
      .toArray(),
    db
      .collection("transactions")
      .aggregate([
        { $match: { verified: true, kind: "income" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray(),
    db
      .collection("engagement_events")
      .aggregate([
        { $match: { createdAt: { $gte: since24h } } },
        {
          $group: {
            _id: "$type",
            total: { $sum: 1 },
            sessions: { $addToSet: "$sessionId" },
          },
        },
      ])
      .toArray(),
    db.collection("engagement_events").aggregate([
      { $match: { type: "page_view", createdAt: { $gte: since24h } } },
      { $group: { _id: { source: { $ifNull: ["$utmSource", ""] }, campaign: { $ifNull: ["$utmCampaign", ""] }, referrer: { $ifNull: ["$referrer", ""] } }, views: { $sum: 1 }, sessions: { $addToSet: "$sessionId" } } },
      { $sort: { views: -1 } },
      { $limit: 12 },
    ]).toArray(),
    db.collection("engagement_events").aggregate([
      { $match: { type: "page_view", createdAt: { $gte: since24h } } },
      { $group: { _id: "$path", views: { $sum: 1 }, sessions: { $addToSet: "$sessionId" } } },
      { $sort: { views: -1 } },
      { $limit: 10 },
    ]).toArray(),
    db
      .collection("visitor_messages")
      .find({ role: { $in: ["visitor", "shoyru"] } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    db
      .collection("ai_provider_health")
      .find({})
      .sort({ updatedAt: -1 })
      .toArray(),
    db.collection("api_usage").findOne({
      provider: "brave-search",
      month: new Date().toISOString().slice(0, 7),
    }),
    db.collection("api_usage").findOne({
      provider: "brave-search-daily",
      day: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    }),
    db.collection("agent_plans").findOne(
      { status: "active" },
      { sort: { updatedAt: -1 } },
    ),
    db
      .collection("work_artifacts")
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .project({ files: 0 })
      .toArray(),
    db
      .collection("agent_evaluations")
      .find({ createdAt: { $gte: since24h } })
      .sort({ createdAt: -1 })
      .limit(24)
      .toArray(),
    db
      .collection("agent_cycle_claims")
      .find({ claimedAt: { $gte: since24h }, _id: { $not: /-force-/ } })
      .sort({ claimedAt: -1 })
      .limit(30)
      .toArray(),
    db.collection("agent_strategies").findOne({}, { sort: { createdAt: -1 } }),
    db.collection("growth_campaigns").findOne(
      { status: "active" },
      { sort: { createdAt: -1 } },
    ),
    db.collection("lead_crm").aggregate([
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]).toArray(),
    getOperationalHealth(db),
    db.collection("ai_usage_daily").aggregate([
      {
        $match: {
          day: new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
        },
      },
      {
        $group: {
          _id: null,
          requests: { $sum: "$requests" },
          promptTokens: { $sum: "$promptTokens" },
          completionTokens: { $sum: "$completionTokens" },
          totalTokens: { $sum: "$totalTokens" },
        },
      },
    ]).toArray(),
  ]);
  const [careerLaneRows, taskLaneRows, chatLeadRows, polymarket, adaptivePolicy, weeklyReport] = await Promise.all([
    db.collection("search_lane_stats").aggregate([
      { $group: { _id: "$kind", attempts: { $sum: "$attempts" }, results: { $sum: "$results" }, useful: { $sum: "$usefulResults" }, qualified: { $sum: "$qualified" } } },
      { $sort: { qualified: -1, useful: -1 } },
    ]).toArray(),
    db.collection("tasks").aggregate([
      { $match: { createdAt: { $gte: since24h }, status: { $in: ["completed", "needs_revision"] } } },
      { $group: { _id: "$type", total: { $sum: 1 } } },
    ]).toArray(),
    db.collection("chat_leads").find({}).sort({ updatedAt: -1 }).limit(50).toArray(),
    process.env.POLYMARKET_RESEARCH_ENABLED === "false"
      ? Promise.resolve(null)
      : getPolymarketResearch(db).catch(() => null),
    db.collection("survival_policy_state").findOne({ key: "adaptive-allocation" }),
    db.collection("published_posts").findOne({ reportType: "weekly-survival" }, { sort: { publishedAt: -1 } }),
  ]);
  const event = (type: string) => engagement.find((item) => item._id === type);
  const crmCount = (status: string) =>
    Number(crmStages.find((item) => item._id === status)?.total || 0);
  const trafficSources = trafficSourceRows.map((item) => {
    const source = String(item._id?.source || "").trim();
    const campaign = String(item._id?.campaign || "").trim();
    const referrer = String(item._id?.referrer || "").trim();
    let label = source || "Trực tiếp";
    if (!source && referrer) {
      try { label = new URL(referrer).hostname.replace(/^www\./, ""); } catch { label = "Liên kết ngoài"; }
    }
    if (source && campaign && campaign !== "shoyru") label = `${source} · ${campaign}`;
    return { label, views: Number(item.views || 0), visitors: item.sessions?.length || 0 };
  });
  const chatSessionMap = new Map<string, Record<string, unknown>>();
  for (const message of chats) {
    const sessionId = String(message.sessionId || "");
    if (!sessionId) continue;
    const current = chatSessionMap.get(sessionId) || { sessionId };
    if (message.role === "visitor" && !current.lastVisitorText) {
      current.name = message.name || "Bạn mới";
      current.lastVisitorText = message.text;
      current.lastVisitorAt = message.createdAt;
      current.read = message.read === true;
    }
    if (message.role === "shoyru" && !current.lastReplyText) {
      current.lastReplyText = message.text;
      current.lastReplyAt = message.createdAt;
      current.replySource = message.source || "auto";
    }
    chatSessionMap.set(sessionId, current);
  }
  const chatSessions: Array<Record<string, unknown>> = [...chatSessionMap.values()]
    .filter((item) => item.lastVisitorText)
    .map((item) => {
      const visitorAt = new Date(item.lastVisitorAt as Date).getTime();
      const replyAt = item.lastReplyAt ? new Date(item.lastReplyAt as Date).getTime() : 0;
      const visitorText = String(item.lastVisitorText || "");
      const needsOwner = /(hoàn tiền|khiếu nại|pháp lý|hợp đồng|xuất hóa đơn|báo giá riêng|giảm giá|mất tiền|không nhận được|refund|complaint)/i.test(visitorText);
      const lead = chatLeadRows.find((row) => String(row.sessionId || "") === String(item.sessionId || ""));
      return {
        ...item,
        autoReplied: replyAt > visitorAt,
        needsOwner: lead?.needsOwner === true || needsOwner,
        leadStage: String(lead?.stage || "conversation"),
        questionCount: Number(lead?.questionCount || 0),
        followUpDueAt: lead?.followUpDueAt || null,
      } as Record<string, unknown>;
    });
  return NextResponse.json({
    approvals: approvals.map((item) => normalizeApproval(item)),
    projects,
    opportunities,
    runs,
    orders,
    published,
    chats: chatSessions,
    aiHealth,
    operations,
    aiUsageToday: aiUsageToday[0] || {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    activePlan,
    artifacts,
    evaluations,
    activeStrategy,
    activeCampaign,
    survivalCenter: {
      allocation: survivalAllocation,
      adaptiveSequence: Array.isArray(adaptivePolicy?.sequence) ? adaptivePolicy.sequence : [],
      weeklyReport: weeklyReport ? {
        title: weeklyReport.title,
        content: weeklyReport.content,
        publishedAt: weeklyReport.publishedAt,
      } : null,
      servicePackages,
      ownerOnlyActions,
      workMix24h: taskLaneRows.map((item) => ({ action: String(item._id || "khác"), total: Number(item.total || 0) })),
      careerLanes: careerLaneRows.map((item) => ({
        kind: String(item._id || "unknown"),
        attempts: Number(item.attempts || 0),
        results: Number(item.results || 0),
        useful: Number(item.useful || 0),
        qualified: Number(item.qualified || 0),
      })),
      chatLeads: {
        total: chatLeadRows.length,
        qualifying: chatLeadRows.filter((item) => item.stage === "qualifying").length,
        qualified: chatLeadRows.filter((item) => item.stage === "qualified").length,
        needsOwner: chatLeadRows.filter((item) => item.stage === "needs_owner").length,
        followUpsDue: chatLeadRows.filter((item) => item.followUpDueAt && new Date(item.followUpDueAt as Date) <= new Date()).length,
      },
      capital: {
        policy: tradingCapitalRules,
        paperTrading: polymarket?.paperTrading || null,
      },
    },
    trafficSources,
    topPages: topPageRows.map((item) => ({ path: String(item._id || "/"), views: Number(item.views || 0), visitors: item.sessions?.length || 0 })),
    metrics: {
      revenue: Number(income[0]?.total || 0),
      pending: approvals.length,
      leads: opportunities.length,
      orders: orders.filter((order) => order.status === "paid").length,
      views24h: Number(event("page_view")?.total || 0),
      visitors24h: Number(event("page_view")?.sessions?.length || 0),
      chatOpens24h: Number(event("chat_open")?.total || 0),
      unreadChats: chatSessions.filter((item) => item.read !== true).length,
      productViews24h: Number(event("product_view")?.total || 0),
      checkoutStarts24h: Number(event("checkout_start")?.total || 0),
      qrCreated24h: Number(event("qr_created")?.total || 0),
      payments24h: Number(event("payment_verified")?.total || 0),
      downloads24h: Number(event("download_started")?.total || 0),
      brainScore: evaluations.length
        ? Math.round(
            evaluations.reduce((sum, item) => sum + Number(item.score || 0), 0) /
              evaluations.length,
          )
        : 0,
      cycles24h: cycleClaims.filter((item) => item.status === "completed").length,
      failedCycles24h: cycleClaims.filter((item) => item.status === "failed").length,
      sourcedLeads: crmStages.reduce((sum, item) => sum + Number(item.total || 0), 0),
      qualifiedLeads: crmCount("qualified") + crmCount("contacted") + crmCount("replied") + crmCount("converted"),
      contactedLeads: crmCount("contacted") + crmCount("replied") + crmCount("converted"),
      repliedLeads: crmCount("replied") + crmCount("converted"),
      convertedLeads: crmCount("converted"),
    },
    channels: [
      {
        id: "search",
        name: "Tìm kiếm web",
        status: process.env.BRAVE_SEARCH_API_KEY ? "connected" : "missing",
        detail: process.env.BRAVE_SEARCH_API_KEY
          ? `Brave Search · hôm nay ${Number(braveDailyUsage?.used || 0)}/${Math.min(50, Number(process.env.BRAVE_SEARCH_DAILY_LIMIT || 30))} · tháng này ${Number(braveUsage?.used || 0)}/${Math.min(1000, Number(process.env.BRAVE_SEARCH_MONTHLY_LIMIT || 1000))}`
          : "Thiếu BRAVE_SEARCH_API_KEY",
      },
      {
        id: "website",
        name: "Website Shoyru",
        status: "connected",
        detail: "Đăng bài công khai tại /updates",
      },
      {
        id: "email",
        name: "Email tiếp cận",
        status: process.env.RESEND_API_KEY ? "connected" : "missing",
        detail: process.env.RESEND_API_KEY
          ? "Shoyru tự gửi qua Resend · tối đa 3 thư/ngày · không lặp người nhận trong 30 ngày"
          : "Thiếu RESEND_API_KEY",
      },
      {
        id: "payments",
        name: "Thanh toán",
        status: process.env.SEPAY_API_KEY ? "connected" : "missing",
        detail: process.env.SEPAY_API_KEY
          ? "SePay đang xác minh giao dịch"
          : "Thiếu SEPAY_API_KEY",
      },
      {
        id: "facebook",
        name: "Cộng đồng Facebook Việt Nam",
        status: "manual",
        detail:
          "Shoyru nghiên cứu nhóm phù hợp và soạn bài; chủ tài khoản đăng để tránh spam và vi phạm quy định nhóm",
      },
      {
        id: "zalo",
        name: "Zalo cá nhân / OA",
        status: "manual",
        detail:
          "Dùng để tư vấn và chăm sóc khách Việt khi có tài khoản hoặc OA chính thức",
      },
    ],
  });
}
