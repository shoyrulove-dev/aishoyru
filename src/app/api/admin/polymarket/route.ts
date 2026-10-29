import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getPolymarketResearch } from "@/lib/polymarket";

export const maxDuration = 60;

const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") === `Bearer ${process.env.ADMIN_API_KEY}`;

export async function GET(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  try {
    const force = request.nextUrl.searchParams.get("refresh") === "1";
    return NextResponse.json(await getPolymarketResearch(db, force));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Polymarket research failed" },
      { status: 502 },
    );
  }
}
