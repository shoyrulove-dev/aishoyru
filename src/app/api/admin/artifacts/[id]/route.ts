import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const allowed = (request: NextRequest) =>
  Boolean(process.env.ADMIN_API_KEY) &&
  request.headers.get("authorization") === `Bearer ${process.env.ADMIN_API_KEY}`;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!allowed(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[a-f0-9-]{20,64}$/i.test(id))
    return NextResponse.json({ error: "Artifact không hợp lệ" }, { status: 400 });
  const db = await getDb();
  if (!db)
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const artifact = await db.collection("work_artifacts").findOne({ _id: id as never });
  if (!artifact)
    return NextResponse.json({ error: "Không tìm thấy artifact" }, { status: 404 });
  const safeName = String(artifact.name || "shoyru-artifact")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
  return new NextResponse(JSON.stringify({
    name: artifact.name,
    actionType: artifact.actionType,
    validation: artifact.validation,
    files: artifact.files,
    createdAt: artifact.createdAt,
  }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName || "shoyru-artifact"}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
