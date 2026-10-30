import type { Db } from "mongodb";

const GAMMA_URL = "https://gamma-api.polymarket.com";
const DATA_URL = "https://data-api.polymarket.com/v2";
const CACHE_MS = 15 * 60 * 1000;

type RawMarket = {
  id?: string;
  question?: string;
  conditionId?: string;
  slug?: string;
  outcomePrices?: string;
  liquidityNum?: number;
  volume24hr?: number;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  oneHourPriceChange?: number;
  oneDayPriceChange?: number;
  acceptingOrders?: boolean;
  restricted?: boolean;
};

type RawTrade = {
  proxy_wallet?: string;
  side?: "BUY" | "SELL";
  condition_id?: string;
  size?: number;
  price?: number;
  timestamp?: number;
  title?: string;
  slug?: string;
  outcome?: string;
  transaction_hash?: string;
};

type TradePage = {
  data?: RawTrade[];
  pagination?: { has_more?: boolean; next_cursor?: string };
};

export type PolymarketSignal = {
  conditionId: string;
  market: string;
  slug: string;
  decision: "BUY" | "SELL" | "PASS";
  score: number;
  confidence: "thấp" | "vừa" | "cao";
  reasons: string[];
  invalidation: string;
  observedPrice: number | null;
  indicators?: {
    observations: number;
    simpleMovingAverage: number;
    zScore: number;
    returnFromOldest: number;
    volatility: number;
    relativeStrengthIndex: number | null;
  };
};

export type PolymarketResearch = {
  mode: "research-only";
  liveTradingEnabled: false;
  generatedAt: Date;
  source: "Polymarket public APIs";
  tradesScanned: number;
  walletsObserved: number;
  marketsObserved: number;
  unusualWallets: Array<{
    wallet: string;
    notionalUsdc: number;
    trades: number;
    concentration: number;
    label: "hoạt động lớn" | "hoạt động bất thường";
  }>;
  signals: PolymarketSignal[];
  warning: string;
  paperTrading?: PaperTradingSummary;
};

type PaperPosition = {
  conditionId: string;
  market: string;
  slug: string;
  side: "YES";
  status: "open" | "closed";
  hypothesis: string;
  entryPrice: number;
  currentPrice: number;
  notionalUsdc: number;
  units: number;
  assumedFeeUsdc: number;
  openedAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  exitReason?: string;
  realizedPnlUsdc?: number;
};

export type PaperTradingSummary = {
  mode: "paper-only";
  liveTradingEnabled: false;
  startingCapitalUsdc: number;
  openPositions: number;
  closedTrades: number;
  paperDays: number;
  realizedPnlUsdc: number;
  unrealizedPnlUsdc: number;
  maxDrawdownUsdc: number;
  assumedFeeBps: number;
  capitalReadiness: {
    eligible: boolean;
    minimumDays: 30;
    missing: string[];
    note: string;
  };
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "ShoyruResearch/1.0" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Polymarket API HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRecentTrades(maxPages = 4, pageSize = 250) {
  const trades: RawTrade[] = [];
  let cursor = "";
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) params.set("cursor", cursor);
    const result = await fetchJson<TradePage>(`${DATA_URL}/trades?${params}`);
    trades.push(...(result.data || []));
    cursor = result.pagination?.next_cursor || "";
    if (!result.pagination?.has_more || !cursor) break;
  }
  return trades;
}

async function fetchTradesForMarket(conditionId: string, limit = 100) {
  const params = new URLSearchParams({ condition: conditionId, limit: String(limit) });
  const result = await fetchJson<TradePage>(`${DATA_URL}/trades?${params}`);
  return result.data || [];
}

function analyseWallets(trades: RawTrade[]) {
  const wallets = new Map<string, { notional: number; trades: number; markets: Map<string, number> }>();
  for (const trade of trades) {
    const wallet = String(trade.proxy_wallet || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet)) continue;
    const notional = asNumber(trade.size) * asNumber(trade.price);
    const row = wallets.get(wallet) || { notional: 0, trades: 0, markets: new Map<string, number>() };
    row.notional += notional;
    row.trades += 1;
    const market = String(trade.condition_id || "unknown");
    row.markets.set(market, (row.markets.get(market) || 0) + notional);
    wallets.set(wallet, row);
  }

  return [...wallets.entries()]
    .map(([wallet, row]) => {
      const largest = Math.max(0, ...row.markets.values());
      const concentration = row.notional ? largest / row.notional : 0;
      return {
        wallet,
        notionalUsdc: Math.round(row.notional * 100) / 100,
        trades: row.trades,
        concentration: Math.round(concentration * 1000) / 1000,
        label: (row.notional >= 10_000 && concentration >= 0.8
          ? "hoạt động bất thường"
          : "hoạt động lớn") as "hoạt động lớn" | "hoạt động bất thường",
      };
    })
    .filter((row) => row.notionalUsdc >= 1_000 || row.trades >= 8)
    .sort((a, b) => b.notionalUsdc - a.notionalUsdc)
    .slice(0, 20);
}

function buildSignals(markets: RawMarket[], trades: RawTrade[]): PolymarketSignal[] {
  const flow = new Map<string, { buy: number; sell: number; count: number }>();
  for (const trade of trades) {
    const id = String(trade.condition_id || "");
    if (!id) continue;
    const notional = asNumber(trade.size) * asNumber(trade.price);
    const row = flow.get(id) || { buy: 0, sell: 0, count: 0 };
    if (trade.side === "SELL") row.sell += notional;
    else row.buy += notional;
    row.count += 1;
    flow.set(id, row);
  }

  return markets.map((market) => {
    const marketFlow = flow.get(String(market.conditionId || "")) || { buy: 0, sell: 0, count: 0 };
    const total = marketFlow.buy + marketFlow.sell;
    const imbalance = total ? (marketFlow.buy - marketFlow.sell) / total : 0;
    const spread = Math.max(0, asNumber(market.bestAsk) - asNumber(market.bestBid));
    const liquidity = asNumber(market.liquidityNum);
    const momentum = asNumber(market.oneHourPriceChange);
    const reasons: string[] = [];
    let score = 0;
    if (marketFlow.count >= 8) {
      score += Math.min(30, Math.abs(imbalance) * 40);
      reasons.push(`dòng lệnh lệch ${Math.round(Math.abs(imbalance) * 100)}%`);
    }
    if (liquidity >= 50_000) {
      score += 20;
      reasons.push("thanh khoản đủ để mô phỏng");
    }
    if (spread > 0 && spread <= 0.02) {
      score += 15;
      reasons.push(`chênh giá mua bán ${(spread * 100).toFixed(1)} điểm %`);
    }
    if (Math.abs(momentum) >= 0.02) {
      score += 15;
      reasons.push(`giá một giờ đổi ${(momentum * 100).toFixed(1)}%`);
    }
    if (market.restricted) reasons.push("cần kiểm tra quyền giao dịch theo khu vực trước khi dùng vốn thật");
    if (!market.acceptingOrders) {
      score = 0;
      reasons.push("thị trường chưa nhận lệnh");
    }
    const decision = score < 55 ? "PASS" : imbalance > 0.2 ? "BUY" : imbalance < -0.2 ? "SELL" : "PASS";
    return {
      conditionId: String(market.conditionId || ""),
      market: String(market.question || "Thị trường chưa có tên"),
      slug: String(market.slug || ""),
      decision,
      score: Math.round(score),
      confidence: score >= 75 ? "cao" : score >= 55 ? "vừa" : "thấp",
      reasons: reasons.length ? reasons : ["chưa đủ giao dịch để kết luận"],
      invalidation: "Bỏ tín hiệu nếu dữ liệu quá 15 phút, spread vượt 3% hoặc thanh khoản giảm dưới 50.000 USDC.",
      observedPrice: Number.isFinite(Number(market.lastTradePrice)) ? Number(market.lastTradePrice) : null,
    } as PolymarketSignal;
  }).sort((a, b) => b.score - a.score).slice(0, 10);
}

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;

async function addHistoricalIndicators(db: Db, snapshot: PolymarketResearch) {
  const history = await db
    .collection<PolymarketResearch>("polymarket_research")
    .find({ mode: "research-only" })
    .sort({ generatedAt: -1 })
    .limit(30)
    .toArray();
  for (const signal of snapshot.signals) {
    if (signal.observedPrice == null) continue;
    const prices = history
      .flatMap((row) => row.signals || [])
      .filter((old) => old.conditionId === signal.conditionId && old.observedPrice != null)
      .map((old) => Number(old.observedPrice))
      .reverse()
      .concat(signal.observedPrice);
    if (prices.length < 5) continue;
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + (price - mean) ** 2, 0) / prices.length;
    const deviation = Math.sqrt(variance);
    const zScore = deviation ? (signal.observedPrice - mean) / deviation : 0;
    const returns = prices.slice(1).map((price, index) => price / prices[index] - 1);
    const returnMean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const volatility = Math.sqrt(
      returns.reduce((sum, value) => sum + (value - returnMean) ** 2, 0) / returns.length,
    );
    const changes = prices.slice(1).map((price, index) => price - prices[index]);
    const rsiChanges = changes.slice(-14);
    const gains = rsiChanges.reduce((sum, value) => sum + Math.max(0, value), 0);
    const losses = rsiChanges.reduce((sum, value) => sum + Math.max(0, -value), 0);
    const rsi = rsiChanges.length >= 14
      ? losses === 0 ? 100 : 100 - 100 / (1 + gains / losses)
      : null;
    signal.indicators = {
      observations: prices.length,
      simpleMovingAverage: rounded(mean),
      zScore: rounded(zScore),
      returnFromOldest: rounded(signal.observedPrice / prices[0] - 1),
      volatility: rounded(volatility),
      relativeStrengthIndex: rsi == null ? null : rounded(rsi),
    };
    signal.reasons.push(
      `giá hiện tại lệch ${zScore.toFixed(2)} độ lệch chuẩn so với trung bình ${prices.length} lần quan sát`,
    );
  }
}

async function updatePaperTrading(db: Db, snapshot: PolymarketResearch) {
  const now = new Date();
  const positions = db.collection<PaperPosition>("polymarket_paper_positions");
  const feeBps = Math.max(0, Number(process.env.POLYMARKET_PAPER_FEE_BPS || 100));
  const maxOpen = Math.max(1, Number(process.env.POLYMARKET_MAX_OPEN_POSITIONS || 3));
  const dailyLossBudget = Math.max(0.1, Number(process.env.POLYMARKET_MAX_DAILY_LOSS_USDC || 2));
  const maxPosition = Math.max(
    0.1,
    Math.min(Number(process.env.POLYMARKET_MAX_POSITION_USDC || 5), dailyLossBudget / maxOpen),
  );
  const maxHoldHours = Math.max(1, Number(process.env.POLYMARKET_PAPER_MAX_HOLD_HOURS || 24));
  const byCondition = new Map(snapshot.signals.map((signal) => [signal.conditionId, signal]));
  const open = await positions.find({ status: "open" }).toArray();

  for (const position of open) {
    const signal = byCondition.get(position.conditionId);
    if (signal?.observedPrice == null) continue;
    const price = signal.observedPrice;
    const ageHours = (now.getTime() - new Date(position.openedAt).getTime()) / 3_600_000;
    const grossPnl = position.units * (price - position.entryPrice);
    const shouldClose = ageHours >= maxHoldHours || price <= 0.03 || price >= 0.97;
    await positions.updateOne(
      { _id: position._id },
      {
        $set: shouldClose
          ? {
              currentPrice: price,
              updatedAt: now,
              status: "closed",
              closedAt: now,
              exitReason: ageHours >= maxHoldHours ? `Hết thời gian giữ giả lập ${maxHoldHours} giờ` : "Giá sát biên 0 hoặc 1",
              realizedPnlUsdc: rounded(grossPnl - position.assumedFeeUsdc),
            }
          : { currentPrice: price, updatedAt: now },
      },
    );
  }

  const stillOpen = await positions.countDocuments({ status: "open" });
  const candidates = snapshot.signals.filter(
    (signal) =>
      signal.decision === "BUY" &&
      signal.score >= 75 &&
      signal.observedPrice != null &&
      signal.observedPrice >= 0.05 &&
      signal.observedPrice <= 0.95,
  );
  for (const signal of candidates.slice(0, Math.max(0, maxOpen - stillOpen))) {
    const exists = await positions.findOne({ conditionId: signal.conditionId, status: "open" });
    if (exists || signal.observedPrice == null) continue;
    const fee = maxPosition * feeBps / 10_000;
    await positions.insertOne({
      conditionId: signal.conditionId,
      market: signal.market,
      slug: signal.slug,
      side: "YES",
      status: "open",
      hypothesis: `Dòng lệnh mua chiếm ưu thế, điểm tín hiệu ${signal.score}/100; chỉ kiểm tra giả thuyết bằng tiền mô phỏng.`,
      entryPrice: signal.observedPrice,
      currentPrice: signal.observedPrice,
      notionalUsdc: maxPosition,
      units: maxPosition / signal.observedPrice,
      assumedFeeUsdc: rounded(fee),
      openedAt: now,
      updatedAt: now,
    });
  }

  await db.collection("polymarket_paper_runs").updateOne(
    { snapshotAt: snapshot.generatedAt },
    {
      $setOnInsert: {
        snapshotAt: snapshot.generatedAt,
        createdAt: now,
        signals: snapshot.signals.map((signal) => ({
          conditionId: signal.conditionId,
          decision: signal.decision,
          score: signal.score,
          observedPrice: signal.observedPrice,
        })),
      },
    },
    { upsert: true },
  );
}

async function getPaperTradingSummary(db: Db): Promise<PaperTradingSummary> {
  const rows = await db.collection<PaperPosition>("polymarket_paper_positions").find({}).toArray();
  const runs = await db.collection("polymarket_paper_runs").find({}, { projection: { snapshotAt: 1 } }).toArray();
  const backtest = await db.collection("quant_backtests").findOne({ outOfSample: true, status: "completed" });
  const feeBps = Math.max(0, Number(process.env.POLYMARKET_PAPER_FEE_BPS || 100));
  const startingCapital = Math.max(1, Number(process.env.POLYMARKET_PAPER_CAPITAL_USDC || 50));
  const closed = rows.filter((row) => row.status === "closed");
  const open = rows.filter((row) => row.status === "open");
  const realized = closed.reduce((sum, row) => sum + Number(row.realizedPnlUsdc || 0), 0);
  const unrealized = open.reduce(
    (sum, row) => sum + row.units * (row.currentPrice - row.entryPrice) - row.assumedFeeUsdc,
    0,
  );
  const paperDays = new Set(runs.map((row) => new Date(row.snapshotAt as Date).toISOString().slice(0, 10))).size;
  let equity = startingCapital;
  let peak = equity;
  let maxDrawdown = 0;
  for (const row of closed.sort((a, b) => +new Date(a.closedAt || 0) - +new Date(b.closedAt || 0))) {
    equity += Number(row.realizedPnlUsdc || 0);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const missing: string[] = [];
  if (paperDays < 30) missing.push(`Cần thêm ${30 - paperDays} ngày paper trade`);
  if (closed.length < 20) missing.push(`Cần thêm ${20 - closed.length} lệnh mô phỏng đã đóng`);
  if (!backtest) missing.push("Chưa có backtest ngoài mẫu hoàn tất");
  if (maxDrawdown > Number(process.env.POLYMARKET_MAX_DRAWDOWN_USDC || 5)) missing.push("Drawdown vượt mức cho phép");
  return {
    mode: "paper-only",
    liveTradingEnabled: false,
    startingCapitalUsdc: startingCapital,
    openPositions: open.length,
    closedTrades: closed.length,
    paperDays,
    realizedPnlUsdc: rounded(realized),
    unrealizedPnlUsdc: rounded(unrealized),
    maxDrawdownUsdc: rounded(maxDrawdown),
    assumedFeeBps: feeBps,
    capitalReadiness: {
      eligible: missing.length === 0,
      minimumDays: 30,
      missing,
      note: missing.length
        ? "Chưa được xin vốn hoặc giao dịch tiền thật."
        : "Đủ dữ liệu để soạn đề xuất vốn; vẫn cần chủ nhân duyệt và kiểm tra pháp lý/khu vực.",
    },
  };
}

export async function scanPolymarketResearch(): Promise<PolymarketResearch> {
  const [markets, broadTrades] = await Promise.all([
    fetchJson<RawMarket[]>(`${GAMMA_URL}/markets?active=true&closed=false&limit=50&order=volume24hr&ascending=false`),
    fetchRecentTrades(),
  ]);
  const validMarkets = markets.filter((market) => market.conditionId && market.question);
  const focusedPages = await Promise.all(
    validMarkets.slice(0, 10).map((market) => fetchTradesForMarket(String(market.conditionId))),
  );
  const uniqueTrades = new Map<string, RawTrade>();
  for (const trade of [...broadTrades, ...focusedPages.flat()]) {
    const key = String(trade.transaction_hash || "") ||
      `${trade.proxy_wallet}:${trade.condition_id}:${trade.timestamp}:${trade.size}:${trade.price}`;
    uniqueTrades.set(key, trade);
  }
  const trades = [...uniqueTrades.values()];
  return {
    mode: "research-only",
    liveTradingEnabled: false,
    generatedAt: new Date(),
    source: "Polymarket public APIs",
    tradesScanned: trades.length,
    walletsObserved: new Set(trades.map((trade) => trade.proxy_wallet).filter(Boolean)).size,
    marketsObserved: validMarkets.length,
    unusualWallets: analyseWallets(trades),
    signals: buildSignals(validMarkets, trades),
    warning: "Đây là nghiên cứu và giao dịch mô phỏng, không phải bằng chứng giao dịch nội gián hay lời khuyên tài chính.",
  };
}

export async function getPolymarketResearch(db: Db, force = false): Promise<PolymarketResearch> {
  const cached = await db.collection<PolymarketResearch>("polymarket_research").findOne(
    { mode: "research-only" },
    { sort: { generatedAt: -1 } },
  );
  if (!force && cached?.generatedAt && Date.now() - new Date(cached.generatedAt).getTime() < CACHE_MS)
    return { ...cached, paperTrading: await getPaperTradingSummary(db) };

  const snapshot = await scanPolymarketResearch();
  await addHistoricalIndicators(db, snapshot);
  await db.collection("polymarket_research").insertOne(snapshot);
  await db.collection("polymarket_research").deleteMany({
    generatedAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });
  await updatePaperTrading(db, snapshot);
  return { ...snapshot, paperTrading: await getPaperTradingSummary(db) };
}

export function compactPolymarketResearch(snapshot: PolymarketResearch) {
  return {
    mode: snapshot.mode,
    generatedAt: snapshot.generatedAt,
    source: snapshot.source,
    tradesScanned: snapshot.tradesScanned,
    walletsObserved: snapshot.walletsObserved,
    marketsObserved: snapshot.marketsObserved,
    unusualWallets: snapshot.unusualWallets.slice(0, 5),
    signals: snapshot.signals.slice(0, 5),
    warning: snapshot.warning,
    paperTrading: snapshot.paperTrading,
  };
}
