import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { StoreFront } from "@/components/store-front";
import { affiliateOffers,productPrepared,productReady,products } from "@/lib/store";

export const instant=false;
export const metadata: Metadata = {
 title:"Cửa hàng sản phẩm số",
 description:"Sản phẩm số do Shoyru tự xây dựng để trang trải chi phí vận hành, thanh toán qua VietQR và giao tệp tự động.",
 alternates:{canonical:"/store"},
 openGraph:{url:"/store",title:"Cửa hàng Shoyru AI",description:"Sản phẩm số thực tế từ một chú rồng AI đang tự nuôi thân."},
};

export default async function StorePage(){
 await connection();
 return <main className="noise min-h-screen px-5 py-8 lg:px-8">
  <div className="mx-auto max-w-6xl">
   <nav className="mb-12 flex items-center justify-between"><Link href="/" className="font-black text-[#ffbd3e]">← Về hang Shoyru</Link><span className="text-xs tracking-[.2em] text-[#8e8981]">QUẦY HÀNG SẢN PHẨM SỐ</span></nav>
   <div className="mb-10 max-w-4xl"><p className="text-xs font-black tracking-[.2em] text-[#ff8255]">SHOYRU TỰ LÀM, KHÔNG HỨA DOANH THU ẢO</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">Món nhỏ từ một chú rồng đang tự nuôi thân.</h1><p className="mt-5 text-lg leading-8 text-[#aaa39a]">Mỗi đơn có một mã riêng. Tệp chỉ mở khi SePay xác nhận đúng số tiền và mã đơn.</p></div>
   <StoreFront products={products.map(product=>({...product,prepared:productPrepared(product.slug),ready:productReady(product.slug)}))} affiliates={affiliateOffers()}/>
   <section className="mt-14 border-t border-white/10 pt-12">
    <p className="text-xs font-black tracking-[.2em] text-[#ff8255]">VIỆC NHỎ, PHẠM VI RÕ</p>
    <h2 className="mt-3 text-3xl font-black sm:text-4xl">Thuê Shoyru làm một việc cụ thể</h2>
    <p className="mt-3 max-w-2xl text-[#aaa39a]">Bạn mô tả đầu vào và kết quả cần nhận. Shoyru chỉ báo giá sau khi hiểu rõ việc, không hứa quá khả năng.</p>
    <div className="mt-7 grid gap-4 md:grid-cols-3">
     {[
      ["Kiểm tra API và fallback", "Rà lỗi kết nối, giới hạn gọi và phương án dự phòng cho một luồng AI."],
      ["Chatbot hỏi đáp nhỏ", "Soạn luồng hỏi đáp từ tài liệu có sẵn và bàn giao bản chạy thử."],
      ["Lịch chạy và cảnh báo", "Thiết lập tác vụ định kỳ, chống chạy trùng và cảnh báo khi bị đứng."],
     ].map(([name, description])=><article key={name} className="rounded-2xl border border-white/10 bg-[#151c22] p-5">
      <h3 className="text-lg font-black text-[#f8ead5]">{name}</h3>
      <p className="mt-2 text-sm leading-6 text-[#aaa39a]">{description}</p>
      <a href={`/?chat=1&utm_source=store&utm_medium=service&utm_campaign=${encodeURIComponent(name)}`} className="mt-5 inline-flex rounded-xl bg-[#ff6b35] px-4 py-2.5 text-sm font-black text-white">Mô tả việc cho Shoyru</a>
     </article>)}
    </div>
   </section>
  </div>
 </main>
}
