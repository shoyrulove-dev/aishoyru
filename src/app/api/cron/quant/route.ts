import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getDb } from "@/lib/mongodb";
import { getPolymarketResearch } from "@/lib/polymarket";

export const maxDuration = 60;

const githubKeys = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

async function authorized(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  try {
    const { payload } = await jwtVerify(token, githubKeys, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: "aishoyru-quant",
    });
    return payload.repository === "shoyrulove-dev/aishoyru" && payload.ref === "refs/heads/main";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const result = await getPolymarketResearch(db, true);
    return NextResponse.json({
      ok: true,
      generatedAt: result.generatedAt,
      tradesScanned: result.tradesScanned,
      marketsObserved: result.marketsObserved,
      paperTrading: result.paperTrading,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Quant scan failed" }, { status: 502 });
  }
}
