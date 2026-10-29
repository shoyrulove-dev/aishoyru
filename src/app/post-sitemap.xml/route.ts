import { getDb } from "@/lib/mongodb";

const base = "https://shoyruai.blissbiovn.com";
const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET() {
  const db = await getDb();
  const posts = db
    ? await db
        .collection("published_posts")
        .find({})
        .sort({ publishedAt: -1 })
        .limit(1000)
        .project({ slug: 1, publishedAt: 1, updatedAt: 1 })
        .toArray()
    : [];
  const urls = posts
    .map((post) => {
      const location = `${base}/updates/${encodeURIComponent(String(post.slug))}`;
      const modified = new Date((post.updatedAt || post.publishedAt) as Date).toISOString();
      return `<url><loc>${escapeXml(location)}</loc><lastmod>${modified}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    })
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=1800",
      },
    },
  );
}
