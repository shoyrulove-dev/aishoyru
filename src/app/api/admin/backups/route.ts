import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { createDailyBackup } from "@/lib/operations";

const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") === `Bearer ${process.env.ADMIN_API_KEY}`;

export async function GET(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const backups = await db
    .collection("system_backups")
    .find({})
    .project({ collections: 0 })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return NextResponse.json({ backups });
}

export async function POST(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    backupId?: string;
    confirm?: string;
  };
  if (body.action === "create")
    return NextResponse.json(await createDailyBackup(db));
  if (
    body.action !== "restore" ||
    body.confirm !== "KHOI PHUC SHOYRU" ||
    !body.backupId ||
    !ObjectId.isValid(body.backupId)
  )
    return NextResponse.json(
      { error: "Yêu cầu khôi phục chưa có xác nhận an toàn." },
      { status: 400 },
    );
  const backup = await db.collection("system_backups").findOne({
    _id: new ObjectId(body.backupId),
  });
  if (!backup) return NextResponse.json({ error: "Không tìm thấy bản sao lưu." }, { status: 404 });
  const collections = backup.collections as Record<string, Array<Record<string, unknown>>>;
  const allowedCollections = [
    "agent_state",
    "agent_plans",
    "growth_campaigns",
    "lead_crm",
    "agent_lessons",
    "owner_instructions",
  ];
  for (const name of allowedCollections) {
    const documents = collections?.[name] || [];
    if (!documents.length) continue;
    for (const document of documents) {
      if (!document._id) continue;
      await db.collection(name).replaceOne(
        { _id: document._id as never },
        document,
        { upsert: true },
      );
    }
  }
  await db.collection("system_restore_events").insertOne({
    backupId: backup._id,
    restoredAt: new Date(),
    restoredCollections: allowedCollections,
  });
  return NextResponse.json({ ok: true, restoredFrom: backup.day });
}
