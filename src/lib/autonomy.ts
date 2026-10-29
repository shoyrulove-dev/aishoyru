import type { Db, Document } from "mongodb";

export const PLAN_STEPS = [
  { key: "research", label: "Tìm nhu cầu có nguồn thật" },
  { key: "qualify", label: "Chọn người có nhu cầu phù hợp" },
  { key: "offer", label: "Tạo đề nghị và đầu ra cụ thể" },
  { key: "outreach", label: "Tiếp cận đúng đầu mối" },
  { key: "follow_up", label: "Theo dõi phản hồi" },
  { key: "measure", label: "Đo kết quả và quyết định tiếp" },
] as const;

type PlanStep = {
  key: (typeof PLAN_STEPS)[number]["key"];
  label: string;
  status: "pending" | "active" | "completed";
  completedAt?: Date;
};

export async function ensureSurvivalPlan(db: Db, project?: Document | null) {
  const projectKey = String(project?._id || "survival-main");
  const existing = await db.collection("agent_plans").findOne({ projectKey, status: "active" });
  if (existing) return existing;
  const now = new Date();
  const plan = {
    projectKey,
    projectName: String(project?.name || "Tìm nguồn thu đầu tiên cho Shoyru"),
    objective: "Tạo doanh thu được xác minh để bù 500.000đ chi phí vận hành mỗi tháng",
    status: "active",
    currentStep: "research",
    steps: PLAN_STEPS.map<PlanStep>((step, index) => ({
      ...step,
      status: index === 0 ? "active" : "pending",
    })),
    createdAt: now,
    updatedAt: now,
  };
  await db.collection("agent_plans").insertOne(plan);
  return plan;
}

const actionStep: Record<string, PlanStep["key"]> = {
  research: "research",
  discover_lead: "research",
  qualify_lead: "qualify",
  build_product: "offer",
  improve: "offer",
  validate: "offer",
  plan_business: "offer",
  build_bot: "offer",
  create_pr: "offer",
  draft_post: "outreach",
  draft_email: "outreach",
};

export async function advanceSurvivalPlan(
  db: Db,
  plan: Document,
  actionType: string,
  success: boolean,
  evidence?: Record<string, unknown>,
) {
  if (!success) return;
  const currentStep = String(plan.currentStep || "research") as PlanStep["key"];
  const completedKey =
    currentStep === "follow_up" && actionType === "draft_email"
      ? "follow_up"
      : currentStep === "measure" && ["research", "validate"].includes(actionType)
        ? "measure"
        : actionStep[actionType];
  if (!completedKey) return;
  const steps = (plan.steps as PlanStep[]).map((step) => ({ ...step }));
  const completedIndex = steps.findIndex((step) => step.key === completedKey);
  if (completedIndex < 0) return;
  const currentIndex = steps.findIndex((step) => step.key === currentStep);
  if (currentIndex >= 0 && completedIndex !== currentIndex) return;
  const now = new Date();
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].status === "active") steps[index] = { ...steps[index], status: "pending" };
  }
  steps[completedIndex] = { ...steps[completedIndex], status: "completed", completedAt: now };
  const nextIndex = steps.findIndex((step, index) => index > completedIndex && step.status !== "completed");
  if (nextIndex >= 0) steps[nextIndex] = { ...steps[nextIndex], status: "active" };
  await db.collection("agent_plans").updateOne(
    { _id: plan._id },
    {
      $set: {
        steps,
        currentStep: nextIndex >= 0 ? steps[nextIndex].key : completedKey,
        status: nextIndex >= 0 ? "active" : "completed",
        lastEvidence: evidence,
        updatedAt: now,
      },
      $push: {
        history: {
          actionType,
          step: completedKey,
          evidence,
          completedAt: now,
        },
      } as never,
    },
  );
}

export type OpportunityKind = "customer" | "freelance" | "grant" | "affiliate" | "unknown";

export function classifyOpportunity(input: {
  title?: string;
  sourceUrl?: string;
  sourceText?: string;
}): OpportunityKind {
  const text = `${input.title || ""} ${input.sourceText || ""} ${input.sourceUrl || ""}`.toLowerCase();
  if (/(grant|grants|tài trợ|funding round|quadratic funding|gitcoin|ethereum foundation)/i.test(text))
    return "grant";
  if (/(affiliate|referral program|đối tác liên kết|hoa hồng)/i.test(text))
    return "affiliate";
  if (/(upwork|freelancer\.com|freelance|contractor|remote job|tuyển freelancer)/i.test(text))
    return "freelance";
  if (/(cần|tuyển|thuê|looking for|hiring|need help|request for proposal|rfp)/i.test(text))
    return "customer";
  return "unknown";
}

export function scoreOpportunity(opportunity: {
  title?: string;
  sourceUrl?: string;
  fit?: string;
  contactEmail?: string;
  sourceTitle?: string;
  sourceText?: string;
  sourceVerified?: boolean;
  expectedKind?: OpportunityKind;
}) {
  const reasons: string[] = [];
  let score = 0;
  const url = String(opportunity.sourceUrl || "");
  const claimedText = `${opportunity.title || ""} ${opportunity.fit || ""}`.toLowerCase();
  const sourceText = `${opportunity.sourceTitle || ""} ${opportunity.sourceText || ""}`.toLowerCase();
  const kind = classifyOpportunity({
    title: opportunity.sourceTitle || opportunity.title,
    sourceUrl: url,
    sourceText,
  });
  let specificUrl = false;
  const sourceVerified = opportunity.sourceVerified !== false;
  if (sourceVerified) {
    score += 10;
    reasons.push("Đã mở và đọc được trang nguồn");
  } else {
    reasons.push("Chưa mở được trang nguồn để xác minh");
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    specificUrl = path.length > 1 && !/^\/(search|jobs?|grants?|explore|applicants)?$/i.test(path);
    if (specificUrl) {
      score += 20;
      reasons.push("Có trang nguồn cụ thể");
    } else {
      reasons.push("URL mới chỉ là trang chủ hoặc trang danh sách");
    }
  } catch {
    reasons.push("URL không hợp lệ");
  }
  if (opportunity.contactEmail) {
    score += 15;
    reasons.push("Có email liên hệ công khai");
  }
  const directDemand = /(cần|tuyển|thuê|looking for|hiring|need (?:a |an )?|seeking|freelance|contract|request for proposal|rfp)/i.test(sourceText);
  if (directDemand) {
    score += 35;
    reasons.push("Nguồn gốc có câu thể hiện nhu cầu trực tiếp");
  } else {
    reasons.push("Nguồn gốc chưa có câu thể hiện nhu cầu trực tiếp");
  }
  const skillMatch = /(bot|api|automation|tự động|ai agent|chatbot|website|next\.js|typescript)/i.test(sourceText);
  if (skillMatch) {
    score += 20;
    reasons.push("Phù hợp năng lực của Shoyru");
  } else if (/(bot|api|automation|tự động|ai agent|chatbot|website)/i.test(claimedText)) {
    reasons.push("Mức phù hợp mới chỉ do AI tự mô tả, nguồn chưa xác nhận");
  }
  const laneMatches = !opportunity.expectedKind || opportunity.expectedKind === kind;
  if (laneMatches && kind !== "unknown") {
    score += 10;
    reasons.push(`Đúng luồng ${kind}`);
  } else if (opportunity.expectedKind) {
    reasons.push(`Sai luồng: đang tìm ${opportunity.expectedKind} nhưng nguồn là ${kind}`);
  }
  score = Math.max(0, Math.min(100, score));
  const qualified = sourceVerified && specificUrl && directDemand && skillMatch && laneMatches && score >= 80;
  return { score, reasons, qualified, kind, directDemand, skillMatch, specificUrl, laneMatches, sourceVerified };
}

export type ArtifactFile = { path: string; content: string; language?: string };

export async function ensureDailyStrategy(
  db: Db,
  input: {
    funnel: Record<string, number>;
    verifiedIncome: number;
    averageQuality: number;
  },
) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const existing = await db.collection("agent_strategies").findOne({ day });
  if (existing) return existing;
  const views = Number(input.funnel.product_view || 0);
  const checkouts = Number(input.funnel.checkout_start || 0);
  const payments = Number(input.funnel.payment_verified || 0);
  const strategy = payments > 0
    ? {
        focus: "Giao hàng tốt và tìm thêm người giống khách đã mua",
        reason: "Đã có thanh toán xác minh, cần giữ trải nghiệm tốt và nhân rộng cách bán hiệu quả.",
        successMetric: "Giao tệp thành công và có thêm một lượt thanh toán xác minh",
        stopCondition: "Dừng mở rộng nếu phát sinh lỗi giao tệp hoặc khiếu nại chưa xử lý",
      }
    : checkouts > 0
      ? {
          focus: "Gỡ vướng ở bước thanh toán",
          reason: "Đã có người mở thanh toán nhưng chưa có giao dịch xác minh.",
          successMetric: "Có một giao dịch SePay xác minh hoặc tìm được lỗi thanh toán cụ thể",
          stopCondition: "Dừng sửa nội dung bán hàng nếu nguyên nhân nằm ở kỹ thuật thanh toán",
        }
      : views > 0
        ? {
            focus: "Làm lời mời mua rõ hơn",
            reason: "Có người xem sản phẩm nhưng chưa bắt đầu thanh toán.",
            successMetric: "Có ít nhất một lượt mở thanh toán",
            stopCondition: "Dừng thay đổi nếu chưa đủ 20 lượt xem để kết luận",
          }
        : {
            focus: "Tìm đúng nơi có người thật sự cần sản phẩm hoặc dịch vụ",
            reason: "Chưa có lượt xem sản phẩm trong 24 giờ gần nhất.",
            successMetric: "Có một nguồn nhu cầu thật hoặc một lượt xem sản phẩm mới",
            stopCondition: "Bỏ nguồn nếu không có nhu cầu rõ, URL cụ thể hoặc cách tiếp cận hợp lệ",
          };
  const document = {
    day,
    ...strategy,
    baseline: input,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.collection("agent_strategies").insertOne(document);
  return document;
}

export function validateArtifactFiles(files: ArtifactFile[]) {
  const errors: string[] = [];
  const normalized: ArtifactFile[] = [];
  const seen = new Set<string>();
  for (const file of files.slice(0, 20)) {
    const path = String(file.path || "").replace(/\\/g, "/").replace(/^\.\//, "");
    const content = String(file.content || "");
    if (!path || path.startsWith("/") || path.includes("..") || !/^[a-zA-Z0-9._/-]+$/.test(path)) {
      errors.push(`Đường dẫn không an toàn: ${path || "(trống)"}`);
      continue;
    }
    if (seen.has(path)) {
      errors.push(`Tệp bị lặp: ${path}`);
      continue;
    }
    seen.add(path);
    if (!content.trim()) errors.push(`Tệp rỗng: ${path}`);
    if (content.length > 80_000) errors.push(`Tệp quá lớn: ${path}`);
    if (/(sk-[a-z0-9_-]{16,}|api[_-]?key\s*[:=]\s*["'][^"']{8,}|mongodb(?:\+srv)?:\/\/[^\s"']+)/i.test(content))
      errors.push(`Có dấu hiệu chứa bí mật: ${path}`);
    if (/\b(TODO|FIXME|YOUR_API_KEY|CHANGEME)\b/i.test(content))
      errors.push(`Còn placeholder: ${path}`);
    if (path.endsWith(".json")) {
      try { JSON.parse(content); } catch { errors.push(`JSON không hợp lệ: ${path}`); }
    }
    normalized.push({ path, content, language: file.language });
  }
  if (!normalized.length) errors.push("Artifact chưa có tệp sử dụng được");
  return { files: normalized, errors, valid: errors.length === 0 };
}
