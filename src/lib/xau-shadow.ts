import type { Db } from "mongodb";

const DAY = 24 * 60 * 60 * 1000;

export const xauShadowPolicy = {
  mode: "research-only" as const,
  liveTradingEnabled: false,
  brokerExecutionEnabled: false,
  defaultDecision: "PASS" as const,
  source: "ATD XAU strategy audit (sanitized, no credentials)",
  learnedRules: [
    "Đánh giá theo equity gồm cả lãi/lỗ đang mở, không chỉ số lệnh đã đóng.",
    "Spread, slippage, commission và swap phải được trừ trước khi kết luận có lợi thế.",
    "Lọc xu hướng đa khung, phiên giao dịch, tin mạnh và cú sốc giá trước khi cân nhắc tín hiệu.",
    "Không dùng win rate cao để che một khoản lỗ đuôi lớn; recovery, grid và DCA phải được stress test riêng.",
    "Chiến lược phải thắng PASS ở dữ liệu ngoài mẫu và nhiều cửa sổ walk-forward.",
  ],
  capitalGate: {
    minimumPaperDays: 30,
    minimumClosedTrades: 100,
    minimumProfitFactor: 1.2,
    maximumDrawdownPercent: 5,
    minimumOutOfSampleWindows: 3,
  },
};

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export async function getXauShadowLab(db: Db) {
  const [first, latest, closed, summary] = await Promise.all([
    db.collection("xau_shadow_observations").findOne({}, { sort: { observedAt: 1 } }),
    db.collection("xau_shadow_observations").findOne({}, { sort: { observedAt: -1 } }),
    db.collection("xau_shadow_trades").countDocuments({ status: "closed" }),
    db.collection("xau_shadow_metrics").findOne({ key: "current" }),
  ]);
  const paperDays = first?.observedAt instanceof Date
    ? Math.max(1, Math.floor((Date.now() - first.observedAt.getTime()) / DAY) + 1)
    : 0;
  const profitFactor = number(summary?.profitFactor);
  const drawdownPercent = number(summary?.maxDrawdownPercent);
  const outOfSampleWindows = number(summary?.outOfSampleWindows);
  const netAfterCosts = number(summary?.netAfterCosts);
  const missing: string[] = [];
  if (!latest) missing.push("Chưa có nguồn dữ liệu XAU cập nhật tự động");
  if (paperDays < xauShadowPolicy.capitalGate.minimumPaperDays)
    missing.push(`Cần thêm ${xauShadowPolicy.capitalGate.minimumPaperDays - paperDays} ngày paper trade`);
  if (closed < xauShadowPolicy.capitalGate.minimumClosedTrades)
    missing.push(`Cần thêm ${xauShadowPolicy.capitalGate.minimumClosedTrades - closed} lệnh mô phỏng đã đóng`);
  if (profitFactor < xauShadowPolicy.capitalGate.minimumProfitFactor)
    missing.push("Profit factor sau chi phí chưa đạt 1,20");
  if (!drawdownPercent || drawdownPercent > xauShadowPolicy.capitalGate.maximumDrawdownPercent)
    missing.push("Drawdown chưa được xác minh dưới 5%");
  if (outOfSampleWindows < xauShadowPolicy.capitalGate.minimumOutOfSampleWindows)
    missing.push("Chưa đạt ba cửa sổ kiểm tra ngoài mẫu");
  if (netAfterCosts <= 0) missing.push("Lợi nhuận sau toàn bộ chi phí chưa dương");
  return {
    ...xauShadowPolicy,
    status: latest ? "collecting" : "awaiting-data",
    latestObservationAt: latest?.observedAt || null,
    paperDays,
    closedTrades: closed,
    metrics: { profitFactor, maxDrawdownPercent: drawdownPercent, outOfSampleWindows, netAfterCosts },
    capitalReadiness: {
      eligible: missing.length === 0,
      missing,
      note: missing.length ? "Shoyru tiếp tục học và mô phỏng; chưa được xin vốn." : "Đủ dữ liệu để soạn đề xuất vốn nhỏ cho chủ nhân duyệt.",
    },
  };
}

export function compactXauShadowLab(lab: Awaited<ReturnType<typeof getXauShadowLab>>) {
  return {
    mode: lab.mode,
    liveTradingEnabled: lab.liveTradingEnabled,
    defaultDecision: lab.defaultDecision,
    learnedRules: lab.learnedRules,
    status: lab.status,
    paperDays: lab.paperDays,
    closedTrades: lab.closedTrades,
    metrics: lab.metrics,
    capitalReadiness: lab.capitalReadiness,
  };
}
