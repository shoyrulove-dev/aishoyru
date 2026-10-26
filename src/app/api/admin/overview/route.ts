import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") ===
    `Bearer ${process.env.ADMIN_API_KEY}`;

export async function GET(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db)
    return NextResponse.json(
      { error: "Database unavailable" },
      { status: 503 },
    );
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
        { $match: { verified: true, type: "income" } },
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
  ]);
  const event = (type: string) => engagement.find((item) => item._id === type);
  return NextResponse.json({
    approvals,
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
          ? "shoyru@blissbiovn.com qua Resend"
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
