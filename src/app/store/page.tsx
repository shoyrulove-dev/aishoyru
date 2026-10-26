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
  </div>
 </main>
}
