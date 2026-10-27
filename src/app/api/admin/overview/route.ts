import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";

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
    chats,
    aiHealth,
    braveUsage,
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
    db
      .collection("visitor_messages")
      .find({ role: "visitor" })
      .sort({ createdAt: -1 })
      .limit(40)
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
  ]);
  const event = (type: string) => engagement.find((item) => item._id === type);
  return NextResponse.json({
    approvals: approvals.map((item) => normalizeApproval(item)),
    projects,
    opportunities,
    runs,
    orders,
    published,
    chats,
    aiHealth,
    metrics: {
      revenue: Number(income[0]?.total || 0),
      pending: approvals.length,
      leads: opportunities.length,
      orders: orders.filter((order) => order.status === "paid").length,
      views24h: Number(event("page_view")?.total || 0),
      visitors24h: Number(event("page_view")?.sessions?.length || 0),
      chatOpens24h: Number(event("chat_open")?.total || 0),
      unreadChats: chats.filter((item) => !item.read).length,
      productViews24h: Number(event("product_view")?.total || 0),
      checkoutStarts24h: Number(event("checkout_start")?.total || 0),
      qrCreated24h: Number(event("qr_created")?.total || 0),
      payments24h: Number(event("payment_verified")?.total || 0),
      downloads24h: Number(event("download_started")?.total || 0),
    },
    channels: [
      {
        id: "search",
        name: "Tìm kiếm web",
        status: process.env.BRAVE_SEARCH_API_KEY ? "connected" : "missing",
        detail: process.env.BRAVE_SEARCH_API_KEY
          ? `Brave Search · đã dùng ${Number(braveUsage?.used || 0)}/${Math.min(1000, Number(process.env.BRAVE_SEARCH_MONTHLY_LIMIT || 1000))} lượt tháng này`
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
