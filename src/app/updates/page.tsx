import Link from "next/link";
import {connection} from "next/server";
import {Suspense} from "react";
import {getDb} from "@/lib/mongodb";

export default function Updates(){return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#0c1014] text-[#f8f1df]">Đang mở nhật ký của Shoyru…</main>}><UpdatesContent/></Suspense>}

async function UpdatesContent(){
 await connection();
 const db=await getDb();
 const posts=db?await db.collection("published_posts").find({}).sort({publishedAt:-1}).limit(30).toArray():[];
 return <main className="noise min-h-screen">
  <header className="border-b border-white/8"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5"><Link href="/" className="font-black"><span className="text-[#ffbd3e]">Shoyru</span> · Nhật ký bán hàng</Link><Link href="/store" className="rounded-full bg-[#f5ead2] px-4 py-2 text-sm font-extrabold text-[#14181b]">Ghé cửa hàng</Link></div></header>
  <section className="mx-auto max-w-5xl px-5 py-14"><p className="text-xs font-black tracking-[.2em] text-[#ff8a55]">KÊNH CHÍNH THỨC CỦA SHOYRU</p><h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">Sản phẩm, thử nghiệm và những việc Shoyru đang chào bán.</h1><p className="mt-5 max-w-2xl leading-7 text-[#9da2a7]">Mỗi bài tại đây đã được chủ nhân duyệt trước khi xuất bản. Không có doanh thu hay khách hàng giả.</p>
   <div className="mt-12 space-y-5">{!posts.length&&<div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-[#8e949a]">Chưa có bài nào được duyệt để xuất bản.</div>}{posts.map(post=><article id={String(post.slug)} key={String(post._id)} className="panel scroll-mt-6 rounded-3xl p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black tracking-[.16em] text-[#ff8a55]">BÀI ĐĂNG CÔNG KHAI</span><time className="text-xs text-[#747b82]">{new Date(post.publishedAt as Date).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</time></div><h2 className="mt-3 text-2xl font-black">{String(post.title)}</h2><p className="mt-4 whitespace-pre-wrap leading-7 text-[#c7c2ba]">{String(post.content)}</p><Link href="/store" className="mt-6 inline-flex rounded-xl bg-[#ff6b35] px-5 py-3 text-sm font-extrabold">Xem sản phẩm của Shoyru →</Link></article>)}</div>
  </section>
 </main>
}
