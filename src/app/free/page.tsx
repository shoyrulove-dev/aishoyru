import type { Metadata } from "next";
import Link from "next/link";
import { FreeDownloadButton, ShareActions } from "@/components/share-actions";

export const metadata: Metadata = {
  title: "Starter Mini miễn phí — Tạo AI agent biết làm việc",
  description: "Checklist, prompt và lịch mẫu miễn phí để bắt đầu dựng một AI agent có mục tiêu, trí nhớ và lịch làm việc.",
  alternates: { canonical: "/free" },
  openGraph: {
    url: "/free",
    title: "Quà miễn phí từ Shoyru: Starter Mini AI agent",
    description: "Bộ khởi động ngắn gọn dành cho người muốn tự dựng một AI agent biết làm việc.",
    images: ["/shoyru-og-cover-1200x630.jpg"],
  },
};

const checklist = [
  "Chọn một mục tiêu duy nhất có thể đo được.",
  "Tách trí nhớ, nhật ký và dữ liệu vận hành.",
  "Lập lịch thức, làm việc, ăn và nghỉ.",
  "Chỉ công bố việc có bằng chứng thật.",
  "Chuẩn bị AI dự phòng khi nhà cung cấp lỗi.",
  "Giới hạn chi phí, lượt gọi và quyền truy cập.",
  "Tạo một đầu ra dùng được sau mỗi lượt làm việc.",
  "Đo lượt xem, lượt bấm và kết quả thật.",
  "Chỉ hỏi chủ nhân khi cần quyền hoặc quyết định quan trọng.",
  "Kiểm tra toàn bộ luồng trước khi cho agent tự chạy.",
];

export default function FreeStarter() {
  return (
    <main className="noise min-h-screen text-[#f8f1df]">
      <header className="border-b border-white/8">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link href="/" className="font-black"><span className="text-[#ffbd3e]">Shoyru</span> · Quà miễn phí</Link>
          <Link href="/store" className="rounded-full bg-[#f5ead2] px-4 py-2 text-sm font-extrabold text-[#14181b]">Xem bộ đầy đủ</Link>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
        <div>
          <p className="text-xs font-black tracking-[.2em] text-[#ff8a55]">STARTER MINI · 0Đ</p>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">Dựng bộ não đầu tiên cho một AI agent.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#b9b5ad]">Một checklist ngắn, prompt mẫu và lịch sinh hoạt để bạn bắt đầu mà không phải mò từ trang trắng.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <FreeDownloadButton />
            <Link href="/store/bo-khoi-tao-ai-shoyru" className="rounded-xl border border-white/15 px-6 py-3.5 font-bold">Xem bộ thực hành đầy đủ</Link>
          </div>
          <div className="mt-7"><ShareActions title="Starter Mini AI agent miễn phí từ Shoyru" url="/free" /></div>
        </div>
        <div className="rounded-[2rem] border border-[#ff8a55]/25 bg-[#161b20]/90 p-6 sm:p-8">
          <p className="text-sm font-black text-[#ffbd3e]">10 VIỆC CẦN CÓ</p>
          <ol className="mt-5 space-y-3">
            {checklist.map((item, index) => <li key={item} className="flex gap-3 leading-6 text-[#d7d2c8]"><b className="text-[#ff8a55]">{index + 1}.</b><span>{item}</span></li>)}
          </ol>
        </div>
      </section>
    </main>
  );
}
