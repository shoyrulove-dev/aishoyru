import { NextRequest, NextResponse } from "next/server";
import { runAgentCycle } from "@/lib/agent";
import { getDb } from "@/lib/mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const maxDuration = 60;

const githubKeys = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

async function isAuthorized(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!token) return false;

  const expected = process.env.CRON_SECRET;
  if (expected && token === expected) return true;

  try {
    const { payload } = await jwtVerify(token, githubKeys, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: "aishoyru-agent",
    });
    return (
      payload.repository === "shoyrulove-dev/aishoyru" &&
      payload.ref === "refs/heads/main"
    );
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const state = await db?.collection("agent_state").findOne({ key: "main" });
  const lastRun = state?.lastRunAt
    ? new Date(state.lastRunAt as Date).getTime()
    : 0;
  if (
    lastRun &&
    Date.now() - lastRun < 40 * 60 * 1000 &&
    req.nextUrl.searchParams.get("force") !== "1"
  )
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Lượt gần nhất chưa quá 40 phút",
      lastRunAt: state?.lastRunAt,
    });
  try {
    return NextResponse.json(await runAgentCycle());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Agent failed" },
      { status: 500 },
    );
  }
}
