import type { Db, Document } from "mongodb";

const DAY = 24 * 60 * 60 * 1000;

export type CampaignEvidence = {
  sourceUrl?: string;
  contactEmail?: string;
  providerId?: string;
  artifactId?: string;
  pullRequestUrl?: string;
};

export async function ensureActiveCampaign(
  db: Db,
  project?: Document | null,
) {
  const now = new Date();
  const existing = await db.collection("growth_campaigns").findOne({
    status: "active",
    endsAt: { $gt: now },
  });
  if (existing) return existing;

  await db.collection("growth_campaigns").updateMany(
    { status: "active", endsAt: { $lte: now } },
    { $set: { status: "completed", completedAt: now, updatedAt: now } },
  );

  const campaign = {
    name: `Bán ${String(project?.name || "dịch vụ AI nhỏ")}`,
    projectId: project?._id,
    productName: String(project?.name || "Dịch vụ AI nhỏ của Shoyru"),
    objective: "Tạo một cuộc trao đổi thật với người có nhu cầu phù hợp",
    status: "active",
    startsAt: now,
    endsAt: new Date(now.getTime() + 5 * DAY),
    minimumDays: 3,
    successCondition: "Có phản hồi thật, đơn hàng hoặc giao dịch đã xác minh",
    stopCondition:
      "Dừng sau ít nhất 3 ngày nếu đã thử 3 nguồn phù hợp mà không có tín hiệu thật",
    counters: {
      sourced: 0,
      qualified: 0,
      contacted: 0,
      replied: 0,
      converted: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await db.collection("growth_campaigns").insertOne(campaign);
  return { ...campaign, _id: inserted.insertedId };
}

export async function recordLeadEvent(
  db: Db,
  input: {
    sourceUrl: string;
    title?: string;
    channel?: string;
    contactEmail?: string;
    fitScore?: number;
    status: "sourced" | "qualified" | "contacted" | "replied" | "converted" | "rejected";
    campaignId?: unknown;
    evidence?: CampaignEvidence;
    note?: string;
  },
) {
  const now = new Date();
  const normalizedUrl = new URL(input.sourceUrl).toString().replace(/\/$/, "");
  const event = {
    type: input.status,
    note: input.note,
    evidence: input.evidence,
    createdAt: now,
  };
  await db.collection("lead_crm").updateOne(
    { sourceUrl: normalizedUrl },
    {
      $set: {
        title: input.title,
        channel: input.channel,
        contactEmail: input.contactEmail?.toLowerCase(),
        fitScore: input.fitScore,
        status: input.status,
        campaignId: input.campaignId,
        lastEventAt: now,
        updatedAt: now,
      },
      $setOnInsert: { sourceUrl: normalizedUrl, createdAt: now },
      $push: { events: event } as never,
    },
    { upsert: true },
  );
}

export async function updateCampaignCounters(db: Db, campaignId: unknown) {
  if (!campaignId) return;
  const rows = await db
    .collection("lead_crm")
    .aggregate([
      { $match: { campaignId } },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ])
    .toArray();
  const counts = Object.fromEntries(rows.map((row) => [String(row._id), Number(row.total)]));
  const rank = ["sourced", "qualified", "contacted", "replied", "converted"];
  const cumulative = (minimum: string) => {
    const index = rank.indexOf(minimum);
    return rank.slice(index).reduce((sum, key) => sum + Number(counts[key] || 0), 0);
  };
  await db.collection("growth_campaigns").updateOne(
    { _id: campaignId },
    {
      $set: {
        counters: {
          sourced: cumulative("sourced"),
          qualified: cumulative("qualified"),
          contacted: cumulative("contacted"),
          replied: cumulative("replied"),
          converted: cumulative("converted"),
        },
        updatedAt: new Date(),
      },
    },
  );
}

export async function recordOperationalAlert(
  db: Db,
  input: { key: string; title: string; reason: string; needed: string },
) {
  const now = new Date();
  const since = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const recentFailures = await db.collection("agent_cycle_claims").countDocuments({
    status: "failed",
    failedAt: { $gte: since },
  });
  if (recentFailures < 2) return;
  await db.collection("approvals").updateOne(
    { type: "support", status: "pending", supportKey: input.key },
    {
      $set: {
        type: "support",
        status: "pending",
        supportKey: input.key,
        channel: "human",
        destination: "admin",
        title: input.title,
        details: input.reason,
        supportRequest: {
          title: input.title,
          reason: input.reason,
          needed: input.needed,
          impact: "Khôi phục các lượt tự chạy bị lỗi liên tiếp.",
          where: "Admin → Sức khỏe AI và GitHub Actions",
          doneWhen: "Shoyru sẽ tự chạy lại ở lượt watchdog kế tiếp.",
        },
        occurrenceCount: recentFailures,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}
