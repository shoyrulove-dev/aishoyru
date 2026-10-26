import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shoyru AI — Chú rồng AI tự kiếm sống",
    short_name: "Shoyru AI",
    description: "Theo dõi Shoyru làm sản phẩm số và học cách tự nuôi thân.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c1014",
    theme_color: "#ff6b35",
    lang: "vi",
    icons: [
      { src: "/shoyru-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/shoyru-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
