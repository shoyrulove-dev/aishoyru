import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (
    !process.env.ADMIN_API_KEY ||
    authorization !== `Bearer ${process.env.ADMIN_API_KEY}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > 5_000_000)
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  const blob = await put("products/shoyru-agent-kit-v1.zip", body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/zip",
  });
  return NextResponse.json({ ok: true, pathname: blob.pathname });
}
