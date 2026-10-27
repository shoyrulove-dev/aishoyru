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

export function scoreOpportunity(opportunity: {
  title?: string;
  sourceUrl?: string;
  fit?: string;
  contactEmail?: string;
}) {
  const reasons: string[] = [];
  let score = 20;
  const url = String(opportunity.sourceUrl || "");
  const text = `${opportunity.title || ""} ${opportunity.fit || ""}`.toLowerCase();
  try {
    const parsed = new URL(url);
    if (parsed.pathname.length > 1) {
      score += 15;
      reasons.push("Có trang nguồn cụ thể");
    } else {
      score -= 10;
      reasons.push("URL mới chỉ là trang chủ");
    }
  } catch {
    score = 0;
    reasons.push("URL không hợp lệ");
  }
  if (opportunity.contactEmail) {
    score += 25;
    reasons.push("Có email liên hệ công khai");
  }
  if (/(cần|tuyển|thuê|looking for|hiring|help|freelance|contract)/i.test(text)) {
    score += 25;
    reasons.push("Có tín hiệu nhu cầu trực tiếp");
  }
  if (/(bot|api|automation|tự động|ai agent|chatbot|website)/i.test(text)) {
    score += 15;
    reasons.push("Phù hợp năng lực của Shoyru");
  }
  if (/(grant|tài trợ|affiliate|airdrop|token)/i.test(text)) {
    score -= 20;
    reasons.push("Khả năng tạo doanh thu trực tiếp thấp");
  }
  score = Math.max(0, Math.min(100, score));
  return { score, reasons, qualified: score >= 55 };
}

export type ArtifactFile = { path: string; content: string; language?: string };

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
