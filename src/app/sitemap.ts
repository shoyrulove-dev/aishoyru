import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://shoyruai.blissbiovn.com";
  return [
    {
      url: base,
      changeFrequency: "hourly",
      priority: 1,
      images: [`${base}/shoyru-og-cover-1200x630.jpg`],
    },
    {
      url: `${base}/store`,
      changeFrequency: "weekly",
      priority: 0.9,
      images: [`${base}/shoyru-sticker-pack-preview.png`, `${base}/shoyru-og-cover-1200x630.jpg`],
    },
    {
      url: `${base}/store/bo-khoi-tao-ai-shoyru`,
      changeFrequency: "weekly",
      priority: 0.9,
      images: [`${base}/shoyru-og-cover-1200x630.jpg`, `${base}/shoyru-sticker-pack-preview.png`],
    },
    {
      url: `${base}/updates`,
      changeFrequency: "hourly",
      priority: 0.8,
      images: [`${base}/shoyru-og-cover-1200x630.jpg`],
    },
  ];
}
