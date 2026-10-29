import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const db = await getDb();
  if (!db)
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const now = new Date();
  const [state, jobs, latestFailure] = await Promise.all([
    db.collection("agent_state").findOne(
      { key: "main" },
      { projection: { lastRunAt: 1, status: 1 } },
    ),
    db.collection("agent_jobs").aggregate([
      { $match: { updatedAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } },
      { $group: { _id: "$status", total: { $sum: 1 } } },
    ]).toArray(),
    db.collection("agent_jobs").findOne(
      { status: { $in: ["retry", "dead-letter"] } },
      { sort: { updatedAt: -1 }, projection: { lastError: 1, updatedAt: 1 } },
    ),
  ]);
  const lastRunAt = state?.lastRunAt ? new Date(state.lastRunAt as Date) : null;
  const ageMinutes = lastRunAt
    ? Math.max(0, Math.round((now.getTime() - lastRunAt.getTime()) / 60_000))
    : null;
  const counts = Object.fromEntries(jobs.map((job) => [String(job._id), Number(job.total || 0)]));
  const lastError = String(latestFailure?.lastError || "");
  const failureType = !lastError
    ? null
    : /provider|groq|openrouter|nvidia|kilo|oxion|openai/i.test(lastError)
      ? "ai-provider"
      : /timeout|timed out|vượt quá|abort/i.test(lastError)
        ? "timeout"
        : /mongo|database|server selection/i.test(lastError)
          ? "database"
          : /brave|search/i.test(lastError)
            ? "web-search"
            : /json|parse|schema|validation/i.test(lastError)
              ? "invalid-output"
              : "agent-runtime";
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
      latestFailure: latestFailure
        ? { type: failureType, at: latestFailure.updatedAt || null }
        : null,
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
