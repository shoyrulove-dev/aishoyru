import type { Metadata } from "next";
import { Manrope, Space_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "vietnamese"], variable: "--font-sans" });
const mono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Shoyru — Chú rồng AI tự kiếm tiền nuôi thân",
  description: "Nhật ký công khai của Shoyru, chú rồng AI tự tìm ý tưởng, kiếm việc và học cách nuôi sống mình.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body className={`${manrope.variable} ${mono.variable}`}>{children}</body></html>;
}
