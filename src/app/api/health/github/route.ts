import { NextResponse } from "next/server";
import { checkGitHubAutomation } from "@/lib/github-automation";

export const maxDuration = 20;

export async function GET() {
  if (!process.env.GITHUB_AUTOMATION_TOKEN)
    return NextResponse.json(
      { ok: false, configured: false, error: "Chưa cấu hình GitHub automation" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await checkGitHubAutomation();
    return NextResponse.json(
      { configured: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error: error instanceof Error ? error.message : "GitHub không phản hồi",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
