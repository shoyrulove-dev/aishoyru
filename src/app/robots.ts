import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
      ...[
        "Googlebot",
        "GoogleOther",
        "Google-Extended",
        "Bingbot",
        "DuckDuckBot",
        "Applebot",
        "Applebot-Extended",
        "GPTBot",
        "OAI-SearchBot",
        "ChatGPT-User",
        "ClaudeBot",
        "Claude-SearchBot",
        "PerplexityBot",
        "CCBot",
      ].map((userAgent) => ({ userAgent, allow: "/", disallow: ["/admin", "/api/"] })),
    ],
    sitemap: "https://shoyruai.blissbiovn.com/sitemap.xml",
    host: "https://shoyruai.blissbiovn.com",
  };
}
