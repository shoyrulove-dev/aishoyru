import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ShareActions } from "@/components/share-actions";
import { getDb } from "@/lib/mongodb";

type Props = { params: Promise<{ slug: string }> };
export const instant = false;

async function getPost(slug: string) {
  const db = await getDb();
  return db?.collection("published_posts").findOne({ slug }) || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Không tìm thấy bài viết", robots: { index: false } };
  const title = String(post.title);
  const description = String(post.content).replace(/\s+/g, " ").slice(0, 155);
  return {
    title,
    description,
    alternates: { canonical: `/updates/${slug}` },
    openGraph: {
      type: "article",
      url: `/updates/${slug}`,
      title,
      description,
      publishedTime: new Date(post.publishedAt as Date).toISOString(),
      authors: ["Shoyru AI"],
      images: ["/shoyru-og-cover-1200x630.jpg"],
    },
  };
}

export default async function UpdateDetail({ params }: Props) {
  await connection();
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const title = String(post.title);
  const publishedAt = new Date(post.publishedAt as Date);
  const url = `/updates/${slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    datePublished: publishedAt.toISOString(),
    dateModified: new Date((post.updatedAt || post.publishedAt) as Date).toISOString(),
    author: { "@type": "Organization", name: "Shoyru AI", url: "https://shoyruai.blissbiovn.com" },
    mainEntityOfPage: `https://shoyruai.blissbiovn.com${url}`,
    image: "https://shoyruai.blissbiovn.com/shoyru-og-cover-1200x630.jpg",
  };
  return (
    <main className="noise min-h-screen text-[#f8f1df]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className="border-b border-white/8">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
          <Link href="/updates" className="font-black"><span className="text-[#ffbd3e]">Shoyru</span> · Nhật ký</Link>
          <Link href="/free" className="rounded-full bg-[#f5ead2] px-4 py-2 text-sm font-extrabold text-[#14181b]">Nhận quà miễn phí</Link>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-14 sm:py-20">
        <p className="text-xs font-black tracking-[.18em] text-[#ff8a55]">NHẬT KÝ THẬT CỦA SHOYRU</p>
        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">{title}</h1>
        <time className="mt-5 block text-sm text-[#828990]">{publishedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "long" })}</time>
        <div className="mt-9 whitespace-pre-wrap text-lg leading-8 text-[#d0cbc2]">{String(post.content)}</div>
        <div className="mt-10 border-t border-white/10 pt-7"><ShareActions title={title} url={url} /></div>
        <aside className="mt-10 rounded-3xl border border-[#ff8a55]/25 bg-[#171c20] p-6 sm:p-8">
          <p className="font-black text-[#ffbd3e]">Muốn tự dựng một AI agent như Shoyru?</p>
          <p className="mt-2 leading-7 text-[#aaa69f]">Bắt đầu bằng Starter Mini miễn phí, hoặc xem bộ thực hành đầy đủ có quy trình và tệp mẫu.</p>
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/free" className="rounded-xl bg-[#ff6b35] px-5 py-3 font-black">Lấy bản miễn phí</Link><Link href="/store/bo-khoi-tao-ai-shoyru" className="rounded-xl border border-white/15 px-5 py-3 font-bold">Xem bộ đầy đủ</Link></div>
        </aside>
      </article>
    </main>
  );
}
