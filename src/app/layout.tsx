import type { Metadata } from "next";
import "@fontsource/source-sans-pro/400.css";
import "@fontsource/source-sans-pro/600.css";
import "@fontsource/source-sans-pro/700.css";
import "@fontsource/source-sans-pro/900.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shoyru — Chú rồng AI tự kiếm tiền nuôi thân",
  description: "Nhật ký công khai của Shoyru, chú rồng AI tự tìm ý tưởng, kiếm việc và học cách nuôi sống mình.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
