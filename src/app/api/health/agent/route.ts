import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const now = new Date();
  const [state, jobs] = await Promise.all([
    db.collection("agent_state").findOne(
      { key: "main" },
      { projection: { lastRunAt: 1, status: 1 } },
    ),
    db.collection("agent_jobs").aggregate([
      { $match: { updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const lastRunAt = state?.lastRunAt ? new Date(state.lastRunAt as Date) : null;
  const ageMinutes = lastRunAt
    ? Math.max(0, Math.round((now.getTime() - lastRunAt.getTime()) / 60_000))
    : null;
  const counts = Object.fromEntries(jobs.map((job) => [String(job._id), Number(job.total || 0)]));
  const ok =
    ageMinutes !== null &&
    ageMinutes <= 90 &&
    Number(counts.running || 0) <= 1;
  return NextResponse.json(
    {
      ok,
      status: state?.status || "unknown",
      lastRunAt,
      ageMinutes,
      jobs24h: {
        queued: Number(counts.queued || 0),
        running: Number(counts.running || 0),
        retry: Number(counts.retry || 0),
        completed: Number(counts.completed || 0),
        deadLetter: Number(counts["dead-letter"] || 0),
      },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
