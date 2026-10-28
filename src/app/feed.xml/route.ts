import { getDb } from "@/lib/mongodb";

const base = "https://shoyruai.blissbiovn.com";
const xml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const db = await getDb();
  const posts = db
    ? await db.collection("published_posts").find({}).sort({ publishedAt: -1 }).limit(30).toArray()
    : [];
  const items = posts.map((post) => {
    const link = `${base}/updates/${encodeURIComponent(String(post.slug))}`;
    return `<item><title>${xml(post.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><pubDate>${new Date(post.publishedAt as Date).toUTCString()}</pubDate><description>${xml(post.content)}</description></item>`;
  }).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Nhật ký Shoyru AI</title><link>${base}/updates</link><description>Việc làm, sản phẩm và báo cáo sinh tồn thật của Shoyru.</description><language>vi-VN</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}</channel></rss>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=1800",
    },
  });
}
