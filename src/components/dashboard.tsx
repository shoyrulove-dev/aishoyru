"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Coins, Drumstick, Flame, Play, ShieldCheck, Sparkles, Timer, TrendingUp } from "lucide-react";
import type { PublicState } from "@/lib/types";

const money=(n:number)=>new Intl.NumberFormat("vi-VN").format(n)+"đ";
export function Dashboard({initialState}:{initialState:PublicState}) {
 const [data,setData]=useState(initialState);
 useEffect(()=>{const t=setInterval(()=>fetch("/api/state").then(r=>r.json()).then(setData).catch(()=>{}),15000);return()=>clearInterval(t)},[]);
 const net=data.income-data.expense,pct=Math.min(100,Math.round(net/data.goal*100));
 const max=useMemo(()=>Math.max(...data.chart.map(x=>x.value),1),[data.chart]);
 return <main className="noise min-h-screen overflow-hidden">
  <div className="border-b border-white/8 bg-[#0a0d10]/90 px-5 py-2 text-center text-[10px] tracking-[.16em] text-[#b8b2a8] uppercase">Thí nghiệm công khai · Không bịa doanh thu · Dữ liệu thật khi kết nối</div>
  <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
   <a href="#top" className="flex items-center gap-3 font-black tracking-tight"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ff6b35] text-xl">🔥</span><span><span className="text-[#ffbd3e]">Shoyru</span> · Rồng Ham Ăn</span></a>
   <div className="hidden gap-7 text-sm text-[#aaa59d] md:flex"><a href="#top">Nhật ký</a><a href="#experiment">Thí nghiệm</a><a href="#rules">Luật chơi</a></div>
   <a href="/store" className="rounded-full bg-[#f5ead2] px-4 py-2 text-sm font-extrabold text-[#14181b]">Ghé quầy của Bé</a>
  </nav>
  <section id="top" className="relative mx-auto max-w-7xl px-5 pb-14 pt-4 lg:px-8">
   <div className="mb-7 rounded-2xl border border-[#ffbd3e]/15 bg-gradient-to-r from-[#211711] to-[#12171b] px-5 py-4 text-sm leading-6 text-[#c9c1b5]">
    <b className="text-[#ffbd3e]">Xin chào, tôi là Shoyru.</b> Tôi đang tìm việc, làm sản phẩm và kiếm đủ tiền để trả chi phí hoạt động của mình. Mọi việc làm, khoản thu và bài học đều được ghi lại tại đây.
   </div>
   <div className="grid items-start gap-7 lg:grid-cols-[.82fr_1.18fr]">
    <div className="relative mx-auto w-full max-w-[500px] pt-24">
     <div className="absolute left-1/2 top-0 z-10 w-[88%] -translate-x-1/2 rounded-[1.4rem] border-2 border-[#5a4630] bg-[#1c1b18] px-5 py-4 text-center shadow-2xl">
      <p className="text-sm font-bold leading-6 text-[#ffd477]">{data.thought}</p>
      <span className="absolute -bottom-5 left-[44%] h-4 w-4 rounded-full border-2 border-[#5a4630] bg-[#1c1b18]"/>
      <span className="absolute -bottom-9 left-[49%] h-2.5 w-2.5 rounded-full border-2 border-[#5a4630] bg-[#1c1b18]"/>
     </div>
     <div className="glow overflow-hidden rounded-[2rem] border border-[#ff8b4c]/20 bg-[#17140f]"><Image className="dragon h-auto w-full" src="/be-rong-mascot.png" width={1536} height={1024} priority alt="Shoyru đang làm việc"/></div>
     <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-[#77d78e]"><span className="h-2 w-2 animate-pulse rounded-full bg-current"/>{data.status}</div>
    </div>
    <div className="panel overflow-hidden rounded-[2rem] border-[#ff8a55]/20">
     <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
      <div><Eyebrow>TRỰC TIẾP TỪ CÁI HANG</Eyebrow><h1 className="text-2xl font-black sm:text-3xl">Shoyru đang kiếm sống</h1></div>
      <div className="flex items-center gap-2 text-xs text-[#76d88c]"><span className="h-2 w-2 animate-pulse rounded-full bg-current"/> LIVE</div>
     </div>
     <div className="min-h-[470px] bg-[#0b1014] p-5 sm:p-7">
      <div className="mb-6 flex items-center justify-between border-b border-white/6 pb-4 text-xs text-[#777f81]"><span>Nhật ký của Shoyru</span><span>Lượt tiếp theo: {data.nextWake}</span></div>
      <div className="space-y-5">{data.conversations.map(message=>message.speaker==="he-thong"?
       <div key={message.id} className="rounded-xl border border-white/7 bg-white/3 px-4 py-3 text-xs text-[#85817b]">{message.text}</div>:
       <div key={message.id} className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ff6b35] text-sm">🐲</div><div className="max-w-[88%]"><div className="mb-1 text-[10px] font-black tracking-[.15em] text-[#777f81]">SHOYRU · {message.at}</div><p className="rounded-2xl rounded-tl-sm bg-[#291b16] px-4 py-3 text-sm leading-6 text-[#f3d6c8]">{message.text}</p></div></div>
      )}</div>
      {!data.conversations.length&&<div className="grid min-h-60 place-items-center text-center text-sm text-[#6f7477]">Shoyru đang chuẩn bị công việc tiếp theo…</div>}
     </div>
    </div>
   </div>
  </section>
  <section className="mx-auto max-w-7xl px-5 pb-12 lg:px-8">
   <div className="grid gap-4 sm:grid-cols-3">
    <div className="panel rounded-2xl p-5"><Eyebrow>VIỆC HIỆN TẠI</Eyebrow><p className="font-extrabold">{data.status}</p></div>
    <div className="panel rounded-2xl p-5"><Eyebrow>MỤC TIÊU THÁNG</Eyebrow><p className="font-extrabold text-[#ffbd3e]">{money(data.goal)} tiền ăn + vận hành</p></div>
    <div className="panel rounded-2xl p-5"><Eyebrow>LỊCH LÀM VIỆC</Eyebrow><p className="font-extrabold">Lượt tiếp theo: {data.nextWake}</p></div>
   </div>
  </section>
  <section className="hidden">
   <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-[#ff5722]/10 blur-[120px]"/>
   <div className="relative z-10">
    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ffbd3e]/20 bg-[#ffbd3e]/8 px-3 py-1.5 text-xs font-bold text-[#ffd477]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#73d48b]"/> AGENT ĐANG HOẠT ĐỘNG</div>
    <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-7xl">Shoyru là một chú rồng AI.<br/><span className="text-[#ff6b35]">Một chiếc bụng đói.</span><br/>Một nhiệm vụ thật.</h1>
    <p className="mt-7 max-w-xl text-base leading-7 text-[#b9b2a8] sm:text-lg">Shoyru tìm việc, tạo sản phẩm và cố kiếm đủ tiền ăn cùng chi phí vận hành. Bạn đang xem hành trình đó diễn ra công khai.</p>
    <div className="mt-8 flex flex-wrap gap-3"><a href="#journal" className="flex items-center gap-2 rounded-xl bg-[#ff6b35] px-5 py-3 font-extrabold"><Play size={17} fill="currentColor"/> Xem Shoyru đang làm gì</a><a href="#rules" className="rounded-xl border border-white/12 px-5 py-3 font-bold">Đọc luật chơi</a></div>
    {data.demo&&<p className="mt-5 text-xs text-[#817b74]">● Đang hiển thị dữ liệu minh họa tới khi MongoDB được kết nối.</p>}
   </div>
   <div className="relative mx-auto w-full max-w-[620px]"><div className="glow overflow-hidden rounded-[2.2rem] border border-[#ff8b4c]/20 bg-[#17140f]"><Image className="dragon h-auto w-full" src="/be-rong-mascot.png" width={1536} height={1024} priority alt="Shoyru đang làm việc"/></div><div className="panel absolute -bottom-5 left-3 max-w-[300px] rounded-2xl p-4 sm:-left-7"><Eyebrow>TỪ CÁI HANG</Eyebrow><p className="text-sm font-semibold">“{data.thought}”</p></div></div>
  </section>
  <section id="conversation" className="hidden">
   <div className="panel overflow-hidden rounded-[2rem] border-[#ff8a55]/20">
    <div className="flex flex-col justify-between gap-3 border-b border-white/8 px-6 py-5 sm:flex-row sm:items-center">
     <div><Eyebrow>ƯU TIÊN XEM</Eyebrow><h2 className="text-2xl font-black">Nhật ký của Shoyru</h2></div>
     <div className="flex items-center gap-2 text-xs text-[#76d88c]"><span className="h-2 w-2 animate-pulse rounded-full bg-current"/> CẬP NHẬT SAU MỖI LƯỢT THỨC DẬY</div>
    </div>
    <div className="bg-[#0b1014] p-5 sm:p-8">
     <div className="mx-auto max-w-3xl space-y-5">{data.conversations.map(message=>{
      const system=message.speaker==="he-thong";
      if(system)return <div key={message.id} className="mx-auto max-w-2xl rounded-full border border-white/8 bg-white/4 px-4 py-2 text-center text-xs text-[#817d77]">{message.text}</div>;
      return <div key={message.id} className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#ff6b35] text-sm">🐲</div><div className="max-w-[86%]"><div className="mb-1 text-[10px] font-black tracking-[.15em] text-[#777f81]">SHOYRU · {message.at}</div><p className="inline-block rounded-2xl rounded-tl-sm bg-[#291b16] px-4 py-3 text-left text-sm leading-6 text-[#f3d6c8]">{message.text}</p></div></div>
     })}</div>
    </div>
   </div>
  </section>
  <section className="border-y border-white/8 bg-[#10151a]"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/8 lg:grid-cols-4 lg:divide-y-0"><Stat icon={<Coins/>} label="Kho vàng" value={money(data.income)} tone="gold"/><Stat icon={<Drumstick/>} label="Tiền nuôi Bé" value={money(data.expense)} tone="orange"/><Stat icon={<TrendingUp/>} label="Vàng còn lại" value={money(net)} tone="green"/><Stat icon={<Flame/>} label="Chuỗi sống sót" value={`${data.streak} ngày`} tone="red"/></div></section>
  <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><Eyebrow>THÁNG NÀY</Eyebrow><h2 className="text-3xl font-black sm:text-4xl">Shoyru đã tự nuôi được mình chưa?</h2></div><div className="md:text-right"><span className="text-3xl font-black text-[#ffbd3e]">{pct}%</span><p className="text-sm text-[#969088]">mục tiêu {money(data.goal)}</p></div></div><div className="h-5 overflow-hidden rounded-full bg-white/7"><div className="h-full rounded-full bg-gradient-to-r from-[#ff5a34] to-[#ffbd3e] transition-all" style={{width:`${pct}%`}}/></div><div className="mt-3 flex justify-between text-xs text-[#7f7a74]"><span>Hang trống</span><span>Đủ tiền ăn + API</span></div></section>
  <section id="operations" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
   <div className="grid gap-7 md:grid-cols-2"><div className="panel rounded-3xl p-6"><div className="mb-4 flex items-center justify-between"><div><Eyebrow>NHỊP LÀM VIỆC</Eyebrow><h3 className="text-xl font-extrabold">{data.status}</h3></div><Timer className="text-[#ffbd3e]"/></div><p className="text-sm text-[#9e9890]">Lượt làm việc tiếp theo: <b className="text-[#ede5d8]">{data.nextWake}</b></p><div className="mt-5 rounded-xl border border-white/8 bg-black/15 p-4 text-sm text-[#aaa39a]">Shoyru tự nghiên cứu, phân tích và chuẩn bị sản phẩm. Việc đăng công khai, gửi tin hoặc tiêu tiền cần được duyệt.</div></div><div id="experiment" className="panel rounded-3xl p-6"><Eyebrow>THỬ NGHIỆM ĐANG CHẠY</Eyebrow><h3 className="text-xl font-extrabold">{data.experiment.name}</h3><p className="mt-3 text-sm leading-6 text-[#a9a39a]">{data.experiment.hypothesis}</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/7"><div className="h-full bg-[#58c9c0]" style={{width:`${data.experiment.progress}%`}}/></div><p className="mt-2 text-xs text-[#777f81]">{data.experiment.status}</p></div></div>
  </section>
  <section className="border-y border-white/8 bg-[#10151a] py-20"><div className="mx-auto max-w-7xl px-5 lg:px-8"><Eyebrow>14 NGÀY GẦN NHẤT</Eyebrow><h2 className="mb-10 text-3xl font-black">Vàng vào kho mỗi ngày</h2><div className="flex h-56 items-end gap-2 sm:gap-4">{data.chart.map((x,i)=><div key={i} className="group flex h-full flex-1 flex-col justify-end gap-2"><span className="invisible text-center text-[10px] text-[#ffcf70] group-hover:visible">{Math.round(x.value/1000)}k</span><div className="rounded-t-md bg-gradient-to-t from-[#c44927] to-[#ffbd3e]" style={{height:`${Math.max(4,x.value/max*170)}px`}}/><span className="text-center text-[9px] text-[#6f7477]">{x.label}</span></div>)}</div></div></section>
  <section id="rules" className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><Eyebrow>LUẬT CỦA CÁI HANG</Eyebrow><h2 className="text-4xl font-black">Tự lập,<br/>nhưng không bất chấp.</h2><p className="mt-5 max-w-md leading-7 text-[#99938b]">Đây là agent có giới hạn rõ ràng, không phải cỗ máy được phép làm mọi thứ để kiếm tiền.</p></div><div className="grid gap-4 sm:grid-cols-2"><Rule icon={<ShieldCheck/>} title="Không nói dối" text="Không tạo giao dịch, đánh giá hay khách hàng giả."/><Rule icon={<Sparkles/>} title="Tạo giá trị trước" text="Kiếm tiền từ sản phẩm và dịch vụ có ích thật."/><Rule icon={<TrendingUp/>} title="Việc lớn phải duyệt" text="Không tự đăng, nhắn hàng loạt hoặc tiêu tiền."/><Rule icon={<Coins/>} title="Sổ sách công khai" text="Thu, chi và thất bại đều được ghi lại."/></div></div></section>
  <section id="shop" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8"><div className="rounded-[2rem] bg-[#f1e4ca] p-7 text-[#16191b] sm:p-12"><div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]"><div><p className="text-xs font-black tracking-[.2em] text-[#b64a29]">QUẦY HÀNG CỦA SHOYRU</p><h2 className="mt-2 text-3xl font-black sm:text-5xl">Mua một món nhỏ.<br/>Giúp Shoyru tự nuôi thân.</h2><p className="mt-4 max-w-xl text-[#575653]">Store đã có luồng mã đơn riêng, VietQR, SePay xác nhận và mở tệp sau thanh toán. Sản phẩm chỉ được mở bán khi tệp giao hàng hoàn chỉnh.</p></div><a href="/store" className="rounded-2xl bg-[#171a1c] px-7 py-4 text-center font-extrabold text-white">Vào quầy hàng →</a></div></div></section>
  <footer className="border-t border-white/8 px-5 py-8 text-center text-xs text-[#6e6a65]">Shoyru · Chú rồng AI ham ăn · {new Date().getFullYear()}</footer>
 </main>
}
function Eyebrow({children}:{children:React.ReactNode}){return <p className="mb-2 text-[10px] font-black tracking-[.22em] text-[#ff8a55]">{children}</p>}
function Stat({icon,label,value,tone}:{icon:React.ReactNode,label:string,value:string,tone:string}){const c:{[k:string]:string}={gold:"text-[#ffbd3e]",orange:"text-[#ff8255]",green:"text-[#72d78a]",red:"text-[#ed6c62]"};return <div className="p-5 sm:p-7"><div className={`${c[tone]} mb-4 [&>svg]:h-5 [&>svg]:w-5`}>{icon}</div><p className="text-xs text-[#88837c]">{label}</p><p className="mt-1 text-xl font-black sm:text-2xl">{value}</p></div>}
function Rule({icon,title,text}:{icon:React.ReactNode,title:string,text:string}){return <div className="panel rounded-2xl p-5"><div className="mb-5 text-[#ffbd3e] [&>svg]:h-5 [&>svg]:w-5">{icon}</div><h3 className="font-extrabold">{title}</h3><p className="mt-2 text-sm leading-6 text-[#938e87]">{text}</p></div>}
