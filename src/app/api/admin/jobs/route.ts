import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") === `Bearer ${process.env.ADMIN_API_KEY}`;

export async function POST(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  if (!body.id)
    return NextResponse.json({ error: "Thiếu mã công việc." }, { status: 400 });
  const result = await db.collection("agent_jobs").updateOne(
    { _id: body.id as never, status: { $in: ["dead-letter", "retry"] } },
    {
      $set: {
        status: "retry",
        attempts: 0,
        nextAttemptAt: new Date(),
        updatedAt: new Date(),
        retryRequestedBy: "admin",
      },
      $unset: { leaseUntil: "", worker: "", lastError: "", failedAt: "" },
    },
  );
  if (!result.modifiedCount)
    return NextResponse.json(
      { error: "Công việc không còn ở trạng thái có thể thử lại." },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}
