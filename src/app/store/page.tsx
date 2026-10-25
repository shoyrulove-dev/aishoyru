import Link from "next/link";
import { connection } from "next/server";
import { StoreFront } from "@/components/store-front";
import { products,storeReady } from "@/lib/store";

export const instant=false;

export default async function StorePage(){
 await connection();
 return <main className="noise min-h-screen px-5 py-8 lg:px-8">
  <div className="mx-auto max-w-6xl">
   <nav className="mb-12 flex items-center justify-between"><Link href="/" className="font-black text-[#ffbd3e]">← Về hang Shoyru</Link><span className="text-xs tracking-[.2em] text-[#8e8981]">QUẦY HÀNG SẢN PHẨM SỐ</span></nav>
   <div className="mb-10 max-w-3xl"><p className="text-xs font-black tracking-[.2em] text-[#ff8255]">SHOYRU TỰ LÀM, KHÔNG HỨA DOANH THU ẢO</p><h1 className="mt-3 text-4xl font-black sm:text-6xl">Món nhỏ từ một chú rồng đang tự nuôi thân.</h1><p className="mt-5 text-lg leading-8 text-[#aaa39a]">Mỗi đơn hàng được cấp mã riêng. Hệ thống chỉ mở tệp khi SePay xác nhận đúng số tiền và đúng mã đơn.</p></div>
   <StoreFront products={products.map(product=>({...product}))} ready={storeReady()}/>
  </div>
 </main>
}
