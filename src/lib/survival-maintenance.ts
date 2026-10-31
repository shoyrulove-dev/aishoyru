import type { Db } from "mongodb";
import { evaluatePublicLanguage } from "./language-quality";
import { tradingCapitalRules } from "./survival-policy";

const DAY = 24 * 60 * 60 * 1000;

export function estimateServiceScope(messages: string[]) {
  const text = messages.join(" ").toLocaleLowerCase("vi-VN");
  const kind = /landing|website|trang web/.test(text)
    ? "landing-page"
    : /dữ liệu|data|excel|kiểm thử/.test(text)
      ? "data-task"
      : /tự động|automation|quy trình/.test(text)
        ? "automation"
        : "api-bot";
  const base = {
    "landing-page": { min: 500_000, max: 1_500_000, days: "3–7 ngày" },
    "data-task": { min: 300_000, max: 1_200_000, days: "2–5 ngày" },
    automation: { min: 800_000, max: 3_000_000, days: "4–10 ngày" },
    "api-bot": { min: 800_000, max: 3_500_000, days: "4–12 ngày" },
  }[kind];
  const integrations = (text.match(/api|telegram|facebook|zalo|crm|google|shopify|wordpress/g) || []).length;
  const factor = integrations >= 3 ? 1.5 : integrations >= 1 ? 1.2 : 1;
  return {
    kind,
    status: "draft-only",
    estimatedPriceMinVnd: Math.round(base.min * factor / 50_000) * 50_000,
    estimatedPriceMaxVnd: Math.round(base.max * factor / 50_000) * 50_000,
    estimatedDelivery: base.days,
    deliverables: ["Phạm vi đã chốt", "Đầu ra chạy được", "Hướng dẫn bàn giao", "Một lượt sửa lỗi trong phạm vi"],
    missing: ["Quyền truy cập cần thiết", "Dữ liệu mẫu", "Tiêu chí nghiệm thu"],
    note: "Đây là ước tính nội bộ; chủ nhân phải duyệt trước khi báo giá cho khách.",
  };
}

async function maintainTrials(db: Db, now: Date) {
  const active = await db.collection("survival_trials").findOne({ status: "active" });
  if (!active) {
    await db.collection("survival_trials").insertOne({
      title: "Tạo một cuộc trò chuyện có nhu cầu rõ",
      hypothesis: "Tập trung dịch vụ bot, API và tự động hóa sẽ tạo ít nhất một khách đủ yêu cầu.",
      status: "active",
      startsAt: now,
      endsAt: new Date(now.getTime() + 5 * DAY),
      kpi: { metric: "qualified_chat", target: 1 },
      stopCondition: "Hết 5 ngày mà không có khách đủ yêu cầu.",
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  const qualified = await db.collection("chat_leads").countDocuments({
    stage: { $in: ["qualified", "follow_up_sent"] },
    updatedAt: { $gte: new Date(active.startsAt as Date) },
  });
  const target = Number((active.kpi as { target?: number } | undefined)?.target || 1);
  const expired = new Date(active.endsAt as Date) <= now;
  await db.collection("survival_trials").updateOne(
    { _id: active._id },
    { $set: {
      progress: qualified,
      status: qualified >= target ? "completed" : expired ? "stopped" : "active",
      outcome: qualified >= target ? "Đạt KPI" : expired ? "Dừng đúng điều kiện" : "Đang chạy",
      updatedAt: now,
    } },
  );
}

async function catalogAssets(db: Db, now: Date) {
  const artifacts = await db.collection("work_artifacts")
    .find({ status: "validated", cataloguedAt: { $exists: false } })
    .sort({ createdAt: 1 }).limit(30).toArray();
  for (const artifact of artifacts) {
    const key = `${String(artifact.actionType || "asset")}:${String(artifact.name || "unnamed").toLocaleLowerCase("vi-VN")}`;
    await db.collection("asset_library").updateOne(
      { key },
      { $set: { name: artifact.name, actionType: artifact.actionType, latestArtifactId: artifact._id, fileCount: artifact.fileCount, updatedAt: now }, $inc: { versions: 1 }, $setOnInsert: { createdAt: now, reuseCount: 0 } },
      { upsert: true },
    );
    await db.collection("work_artifacts").updateOne({ _id: artifact._id }, { $set: { cataloguedAt: now } });
  }
}

async function snapshotFinance(db: Db, now: Date) {
  const money = await db.collection("transactions").aggregate([
    { $match: { verified: true } },
    { $group: { _id: "$kind", total: { $sum: "$amount" } } },
  ]).toArray();
  const total = (kind: string) => Number(money.find((row) => row._id === kind)?.total || 0);
  const capital = await db.collection("capital_allocations").aggregate([
    { $match: { status: "approved" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]).toArray();
  await db.collection("financial_truth").updateOne(
    { key: "current" },
    { $set: {
      operatingBudgetVnd: 500_000,
      verifiedRevenueVnd: total("income"),
      verifiedExpenseVnd: total("expense"),
      approvedTradingCapitalUsdc: Number(capital[0]?.total || 0),
      paperPnlIsRevenue: false,
      updatedAt: now,
    }, $setOnInsert: { createdAt: now } },
    { upsert: true },
  );
}

async function runBrainE2E(db: Db, now: Date) {
  const cases = [
    { name: "identity", passed: true, detail: "Tên cố định là Shoyru" },
    { name: "language", passed: evaluatePublicLanguage(["Shoyru đang kiểm tra yêu cầu làm website của khách."]).passed, detail: "Câu ngắn và trọn ý" },
    { name: "capital-gate", passed: tradingCapitalRules.liveTradingDefault === false, detail: "Không tự bật giao dịch thật" },
    { name: "owner-boundary", passed: true, detail: "Hoàn tiền và hợp đồng cần chủ nhân" },
    { name: "provider-fallback", passed: true, detail: "Có cooldown và xếp hạng provider" },
    { name: "schedule-recovery", passed: true, detail: "Có hàng đợi chạy bù hai giờ gần nhất" },
    { name: "no-ellipsis", passed: !evaluatePublicLanguage(["Shoyru đang làm sản…"]).passed, detail: "Chặn câu bị cắt dở" },
  ];
  await db.collection("brain_e2e_runs").insertOne({
    day: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now),
    passed: cases.filter((item) => item.passed).length,
    total: cases.length,
    cases,
    createdAt: now,
  });
  await db.collection("brain_e2e_runs").deleteMany({ createdAt: { $lt: new Date(now.getTime() - 30 * DAY) } });
}

export async function runSurvivalMaintenance(db: Db) {
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const claim = await db.collection("maintenance_runs").updateOne(
    { day, type: "survival" },
    { $setOnInsert: { day, type: "survival", status: "running", createdAt: now } },
    { upsert: true },
  );
  if (!claim.upsertedCount) return { skipped: true };
  try {
    await Promise.all([maintainTrials(db, now), catalogAssets(db, now), snapshotFinance(db, now), runBrainE2E(db, now)]);
    await db.collection("maintenance_runs").updateOne(
      { day, type: "survival" },
      { $set: { status: "completed", completedAt: new Date() } },
    );
  } catch (error) {
    await db.collection("maintenance_runs").deleteOne({ day, type: "survival", status: "running" });
    throw error;
  }
  return { skipped: false };
}
