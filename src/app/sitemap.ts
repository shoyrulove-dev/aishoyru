import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://shoyruai.blissbiovn.com";
  return [
    { url: base, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/store`, changeFrequency: "weekly", priority: 0.9 },
    {
      url: `${base}/store/bo-khoi-tao-ai-shoyru`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    { url: `${base}/updates`, changeFrequency: "daily", priority: 0.8 },
    {
      url: `${base}/store/sticker-shoyru-di-lam`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
