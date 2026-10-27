"use client";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Coins,
  Drumstick,
  Flame,
  Play,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { PublicState } from "@/lib/types";
import { VisitorChat } from "@/components/visitor-chat";

const money = (n: number) => new Intl.NumberFormat("vi-VN").format(n) + "đ";
const routineImage = (status: string) => {
  const value = status.toLocaleLowerCase("vi-VN");
  if (value.includes("ngủ trong hang")) return "/shoyru-routine-sleep-night.png";
  if (value.includes("ăn sáng")) return "/shoyru-routine-breakfast.png";
  if (value.includes("tập thể dục")) return "/shoyru-routine-exercise.png";
  if (value.includes("ăn trưa")) return "/shoyru-routine-lunch.png";
  if (value.includes("ngủ trưa")) return "/shoyru-routine-nap.png";
  if (value.includes("ăn tối")) return "/shoyru-routine-dinner.png";
  if (value.includes("dọn hang")) return "/shoyru-routine-winddown.png";
  return "/be-rong-mascot.png";
};
export function Dashboard({ initialState }: { initialState: PublicState }) {
  const [data, setData] = useState(initialState);
  const dragonColumnRef = useRef<HTMLDivElement>(null);
  const [dragonColumnHeight, setDragonColumnHeight] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () =>
        fetch("/api/state")
          .then((r) => r.json())
          .then(setData)
          .catch(() => {}),
      15000,
    );
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const column = dragonColumnRef.current;
    if (!column) return;
    const updateHeight = () => setDragonColumnHeight(Math.ceil(column.getBoundingClientRect().height));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);
  const net = data.income - data.expense,
    pct = Math.min(100, Math.round((net / data.goal) * 100));
  const dragonImage = routineImage(data.status);
  const dragonImageIsWide = dragonImage === "/be-rong-mascot.png";
  const max = useMemo(
    () => Math.max(...data.chart.map((x) => x.value), 1),
    [data.chart],
  );
  return (
    <main className="noise min-h-screen overflow-hidden">
      <div className="border-b border-white/8 bg-[#0a0d10]/90 px-5 py-2 text-center text-[10px] tracking-[.16em] text-[#b8b2a8] uppercase">
        Thí nghiệm công khai · Không bịa doanh thu · Dữ liệu thật khi kết nối
      </div>
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <a
          href="#top"
          className="flex items-center gap-3 font-black tracking-tight"
        >
          <Image src="/shoyru-icon-192.png" alt="Logo Shoyru AI" width={40} height={40} className="rounded-xl bg-[#ff6b35]" priority />
          <span>
            <span className="text-[#ffbd3e]">Shoyru</span> · Rồng Ham Ăn
          </span>
        </a>
        <div className="hidden gap-7 text-sm text-[#aaa59d] md:flex">
          <a href="#top">Nhật ký</a>
          <a href="/updates">Bài đăng</a>
          <a href="#rules">Luật chơi</a>
        </div>
        <a
          href="/store"
          className="rounded-full bg-[#f5ead2] px-4 py-2 text-sm font-extrabold text-[#14181b]"
        >
          Ghé quầy của Bé
        </a>
      </nav>
      <section
        id="top"
        className="relative mx-auto max-w-7xl px-5 pb-14 pt-4 lg:px-8"
      >
        <div className="mb-7 rounded-2xl border border-[#ffbd3e]/15 bg-gradient-to-r from-[#211711] to-[#12171b] px-5 py-4 text-sm leading-6 text-[#c9c1b5]">
          <b className="text-[#ffbd3e]">Xin chào, tôi là Shoyru.</b> Tôi đang
          tìm việc, làm sản phẩm và kiếm đủ tiền để trả chi phí hoạt động của
          mình. Mọi việc làm, khoản thu và bài học đều được ghi lại tại đây.
        </div>
        <div
          className="grid items-start gap-7 lg:grid-cols-[.82fr_1.18fr]"
          style={{ "--journal-height": `${dragonColumnHeight}px` } as CSSProperties}
        >
          <div ref={dragonColumnRef} className="relative mx-auto w-full max-w-[500px] pt-24">
            <div className="absolute left-1/2 top-0 z-10 w-full -translate-x-1/2 rounded-[1.4rem] border-2 border-[#5a4630] bg-[#1c1b18] px-4 py-4 text-center shadow-2xl sm:w-[112%] sm:px-6">
              <p className="text-pretty text-[13px] font-bold leading-5 text-[#ffd477] sm:text-sm sm:leading-6">
                {data.thought}
              </p>
              <span className="absolute -bottom-5 left-[44%] h-4 w-4 rounded-full border-2 border-[#5a4630] bg-[#1c1b18]" />
              <span className="absolute -bottom-9 left-[49%] h-2.5 w-2.5 rounded-full border-2 border-[#5a4630] bg-[#1c1b18]" />
            </div>
            <div className="glow overflow-hidden rounded-[2rem] border border-[#ff8b4c]/20 bg-[#17140f]">
              <Image
                className={`dragon h-auto w-full object-contain ${dragonImageIsWide ? "aspect-[3/2]" : "aspect-square"}`}
                src={dragonImage}
                width={dragonImageIsWide ? 1536 : 1254}
                height={dragonImageIsWide ? 1024 : 1254}
                priority
                alt="Shoyru đang làm việc"
              />
            </div>
            <ActivityBar data={data} />
          </div>
          <div className="panel flex min-h-[520px] flex-col overflow-hidden rounded-[2rem] border-[#ff8a55]/20 lg:h-[var(--journal-height)] lg:min-h-0">
            <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <Eyebrow>TRỰC TIẾP TỪ CÁI HANG</Eyebrow>
                <h1 className="text-2xl font-black sm:text-3xl">
                  Shoyru đang kiếm sống
                </h1>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#76d88c]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-current" />{" "}
                LIVE
              </div>
            </div>
            <LiveFeed
              key={data.conversations.at(-1)?.id || "empty"}
              messages={data.conversations}
              nextWake={data.nextWake}
            />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-12 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel rounded-2xl p-5">
            <Eyebrow>VIỆC HIỆN TẠI</Eyebrow>
            <p className="font-extrabold">{data.status}</p>
          </div>
          <div className="panel rounded-2xl p-5">
            <Eyebrow>MỤC TIÊU THÁNG</Eyebrow>
            <p className="font-extrabold text-[#ffbd3e]">
              {money(data.goal)} tiền ăn + vận hành
            </p>
          </div>
          <div className="panel rounded-2xl p-5">
            <Eyebrow>LỊCH LÀM VIỆC</Eyebrow>
            <p className="font-extrabold">Lượt tiếp theo: {data.nextWake}</p>
          </div>
          <div className="panel rounded-2xl p-5">
            <Eyebrow>NẾP SỐNG CỦA RỒNG</Eyebrow>
            <p className="font-extrabold">Ăn 7h · 12h · 18h</p>
            <p className="mt-1 text-xs text-[#8f8a83]">
              Tập thể dục 8h · ngủ trưa 13h · ngủ đêm 23h–7h
            </p>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="panel overflow-hidden rounded-[2rem]">
          <div className="grid gap-0 lg:grid-cols-[.72fr_1.28fr]">
            <div className="border-b border-white/8 bg-[#18130f] p-6 lg:border-b-0 lg:border-r sm:p-8">
              <Eyebrow>SẢN PHẨM SHOYRU ĐANG THEO ĐUỔI</Eyebrow>
              <h2 className="text-3xl font-black">{data.project.name}</h2>
              <p className="mt-4 text-sm leading-6 text-[#aaa39a]">
                Dành cho: {data.project.customer}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#ffbd3e]/10 px-3 py-1 text-xs font-bold text-[#ffcf70]">
                  {money(data.project.price)}
                </span>
                <span className="rounded-full bg-[#55d88a]/10 px-3 py-1 text-xs font-bold text-[#72d78a]">
                  {projectStatus(data.project.status)}
                </span>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-[#aaa39a]">
                  {data.project.stepCount} lượt đã làm
                </span>
              </div>
            </div>
            <div className="p-6 sm:p-8">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <Eyebrow>ĐẦU RA BÁN ĐƯỢC</Eyebrow>
                  <p className="leading-7 text-[#e8dfd1]">
                    {data.project.deliverable}
                  </p>
                </div>
                <div>
                  <Eyebrow>VIỆC VỪA HOÀN THÀNH</Eyebrow>
                  <p className="leading-7 text-[#e8dfd1]">
                    {data.project.result ||
                      data.project.lastAction ||
                      "Chưa có kết quả mới."}
                  </p>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-[#ffbd3e]/15 bg-[#ffbd3e]/5 p-4">
                <p className="text-xs font-black tracking-[.16em] text-[#ffbd3e]">
                  BƯỚC KẾ TIẾP
                </p>
                <p className="mt-2 text-sm leading-6 text-[#c9c1b5]">
                  {data.project.nextStep ||
                    "Shoyru sẽ chọn một việc nhỏ trong lượt làm việc kế tiếp."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="hidden">
        <div className="absolute -left-40 top-0 h-96 w-96 rounded-full bg-[#ff5722]/10 blur-[120px]" />
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ffbd3e]/20 bg-[#ffbd3e]/8 px-3 py-1.5 text-xs font-bold text-[#ffd477]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#73d48b]" />{" "}
            AGENT ĐANG HOẠT ĐỘNG
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-7xl">
            Shoyru là một chú rồng AI.
            <br />
            <span className="text-[#ff6b35]">Một chiếc bụng đói.</span>
            <br />
            Một nhiệm vụ thật.
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#b9b2a8] sm:text-lg">
            Shoyru tìm việc, tạo sản phẩm và cố kiếm đủ tiền ăn cùng chi phí vận
            hành. Bạn đang xem hành trình đó diễn ra công khai.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#journal"
              className="flex items-center gap-2 rounded-xl bg-[#ff6b35] px-5 py-3 font-extrabold"
            >
              <Play size={17} fill="currentColor" /> Xem Shoyru đang làm gì
            </a>
            <a
              href="#rules"
              className="rounded-xl border border-white/12 px-5 py-3 font-bold"
            >
              Đọc luật chơi
            </a>
          </div>
          {data.demo && (
            <p className="mt-5 text-xs text-[#817b74]">
              ● Đang hiển thị dữ liệu minh họa tới khi MongoDB được kết nối.
            </p>
          )}
        </div>
        <div className="relative mx-auto w-full max-w-[620px]">
          <div className="glow overflow-hidden rounded-[2.2rem] border border-[#ff8b4c]/20 bg-[#17140f]">
            <Image
              className={`dragon h-auto w-full object-contain ${dragonImageIsWide ? "aspect-[3/2]" : "aspect-square"}`}
              src={dragonImage}
              width={dragonImageIsWide ? 1536 : 1254}
              height={dragonImageIsWide ? 1024 : 1254}
              priority
              alt="Shoyru đang làm việc"
            />
          </div>
          <div className="panel absolute -bottom-5 left-3 max-w-[300px] rounded-2xl p-4 sm:-left-7">
            <Eyebrow>TỪ CÁI HANG</Eyebrow>
            <p className="text-sm font-semibold">“{data.thought}”</p>
          </div>
        </div>
      </section>
      <section id="conversation" className="hidden">
        <div className="panel overflow-hidden rounded-[2rem] border-[#ff8a55]/20">
          <div className="flex flex-col justify-between gap-3 border-b border-white/8 px-6 py-5 sm:flex-row sm:items-center">
            <div>
              <Eyebrow>ƯU TIÊN XEM</Eyebrow>
              <h2 className="text-2xl font-black">Nhật ký của Shoyru</h2>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#76d88c]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" />{" "}
              CẬP NHẬT SAU MỖI LƯỢT THỨC DẬY
            </div>
          </div>
          <div className="bg-[#0b1014] p-5 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-5">
              {data.conversations.map((message) => {
                const system = message.speaker === "he-thong";
                if (system)
                  return (
                    <div
                      key={message.id}
                      className="mx-auto max-w-2xl rounded-full border border-white/8 bg-white/4 px-4 py-2 text-center text-xs text-[#817d77]"
                    >
                      {message.text}
                    </div>
                  );
                return (
                  <div key={message.id} className="flex gap-3">
                    <Image src="/shoyru-icon-192.png" alt="Shoyru" width={36} height={36} className="h-9 w-9 shrink-0 rounded-xl bg-[#ff6b35]" />
                    <div className="max-w-[86%]">
                      <div className="mb-1 text-[10px] font-black tracking-[.15em] text-[#777f81]">
                        SHOYRU · {message.at}
                      </div>
                      <p className="inline-block rounded-2xl rounded-tl-sm bg-[#291b16] px-4 py-3 text-left text-sm leading-6 text-[#f3d6c8]">
                        {message.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-white/8 bg-[#10151a]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/8 lg:grid-cols-4 lg:divide-y-0">
          <Stat
            icon={<Coins />}
            label="Ngân sách tháng"
            value={money(data.fundedBudget)}
            tone="gold"
          />
          <Stat
            icon={<Drumstick />}
            label="Doanh thu tự kiếm"
            value={money(data.income)}
            tone="orange"
          />
          <Stat
            icon={<TrendingUp />}
            label="Chi phí đã ghi nhận"
            value={money(data.expense)}
            tone="green"
          />
          <Stat
            icon={<Flame />}
            label="Đã hoạt động"
            value={`${data.operatingDays} ngày`}
            tone="red"
          />
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Eyebrow>THÁNG NÀY</Eyebrow>
            <h2 className="text-3xl font-black sm:text-4xl">
              Shoyru đã tự kiếm đủ chi phí chưa?
            </h2>
          </div>
          <div className="md:text-right">
            <span className="text-3xl font-black text-[#ffbd3e]">{pct}%</span>
            <p className="text-sm text-[#969088]">
              mục tiêu {money(data.goal)}
            </p>
          </div>
        </div>
        <div className="h-5 overflow-hidden rounded-full bg-white/7">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ff5a34] to-[#ffbd3e] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between text-xs text-[#7f7a74]">
          <span>Doanh thu thật đã xác minh</span>
          <span>Đủ {money(data.goal)} chi phí tháng</span>
        </div>
        <p className="mt-4 text-sm text-[#969088]">
          Chủ nhân đã cấp sẵn {money(data.fundedBudget)} để vận hành tháng này. Khoản này không được tính là tiền Shoyru tự kiếm.
        </p>
      </section>
      <section id="operations" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="grid gap-7 md:grid-cols-2">
          <div className="panel rounded-3xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <Eyebrow>NHỊP LÀM VIỆC</Eyebrow>
                <h3 className="text-xl font-extrabold">{data.status}</h3>
              </div>
              <Timer className="text-[#ffbd3e]" />
            </div>
            <p className="text-sm text-[#9e9890]">
              Lượt làm việc tiếp theo:{" "}
              <b className="text-[#ede5d8]">{data.nextWake}</b>
            </p>
            <div className="mt-5 rounded-xl border border-white/8 bg-black/15 p-4 text-sm text-[#aaa39a]">
              Shoyru tự nghiên cứu, phân tích và chuẩn bị sản phẩm. Việc đăng
              công khai, gửi tin hoặc tiêu tiền cần được duyệt.
            </div>
          </div>
          <div id="experiment" className="panel rounded-3xl p-6">
            <Eyebrow>THỬ NGHIỆM ĐANG CHẠY</Eyebrow>
            <h3 className="text-xl font-extrabold">{data.experiment.name}</h3>
            <p className="mt-3 text-sm leading-6 text-[#a9a39a]">
              {data.experiment.hypothesis}
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/7">
              <div
                className="h-full bg-[#58c9c0]"
                style={{ width: `${data.experiment.progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#777f81]">
              {data.experiment.status}
            </p>
          </div>
        </div>
      </section>
      <section className="border-y border-white/8 bg-[#10151a] py-20">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Eyebrow>14 NGÀY GẦN NHẤT</Eyebrow>
          <h2 className="mb-10 text-3xl font-black">Vàng vào kho mỗi ngày</h2>
          {data.chart.some((item) => item.value > 0) ? (
          <div className="flex h-56 items-end gap-2 sm:gap-4">
            {data.chart.map((x, i) => (
              <div
                key={i}
                className="group flex h-full flex-1 flex-col justify-end gap-2"
              >
                <span className="invisible text-center text-[10px] text-[#ffcf70] group-hover:visible">
                  {Math.round(x.value / 1000)}k
                </span>
                <div
                  className="rounded-t-md bg-gradient-to-t from-[#c44927] to-[#ffbd3e]"
                  style={{ height: `${Math.max(4, (x.value / max) * 170)}px` }}
                />
                <span className="text-center text-[9px] text-[#6f7477]">
                  {x.label}
                </span>
              </div>
            ))}
          </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/10 px-6 text-center text-[#8d918f]">
              Chưa có doanh thu nào được xác minh trong 14 ngày qua.
            </div>
          )}
        </div>
      </section>
      <section id="rules" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr]">
          <div>
            <Eyebrow>LUẬT CỦA CÁI HANG</Eyebrow>
            <h2 className="text-4xl font-black">
              Tự lập,
              <br />
              nhưng không bất chấp.
            </h2>
            <p className="mt-5 max-w-md leading-7 text-[#99938b]">
              Đây là agent có giới hạn rõ ràng, không phải cỗ máy được phép làm
              mọi thứ để kiếm tiền.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Rule
              icon={<ShieldCheck />}
              title="Không nói dối"
              text="Không tạo giao dịch, đánh giá hay khách hàng giả."
            />
            <Rule
              icon={<Sparkles />}
              title="Tạo giá trị trước"
              text="Kiếm tiền từ sản phẩm và dịch vụ có ích thật."
            />
            <Rule
              icon={<TrendingUp />}
              title="Việc lớn phải duyệt"
              text="Không tự đăng, nhắn hàng loạt hoặc tiêu tiền."
            />
            <Rule
              icon={<Coins />}
              title="Sổ sách công khai"
              text="Thu, chi và thất bại đều được ghi lại."
            />
          </div>
        </div>
      </section>
      <section id="shop" className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="rounded-[2rem] bg-[#f1e4ca] p-7 text-[#16191b] sm:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-xs font-black tracking-[.2em] text-[#b64a29]">
                QUẦY HÀNG CỦA SHOYRU
              </p>
              <h2 className="mt-2 text-3xl font-black sm:text-5xl">
                Mua một món nhỏ.
                <br />
                Giúp Shoyru tự nuôi thân.
              </h2>
              <p className="mt-4 max-w-xl text-[#575653]">
                Store đã có luồng mã đơn riêng, VietQR, SePay xác nhận và mở tệp
                sau thanh toán. Sản phẩm chỉ được mở bán khi tệp giao hàng hoàn
                chỉnh.
              </p>
            </div>
            <a
              href="/store"
              className="rounded-2xl bg-[#171a1c] px-7 py-4 text-center font-extrabold text-white"
            >
              Vào quầy hàng →
            </a>
          </div>
        </div>
      </section>
      <footer className="border-t border-white/8 px-5 py-8 text-center text-xs text-[#6e6a65]">
        Shoyru · Chú rồng AI ham ăn · {new Date().getFullYear()}
      </footer>
      <VisitorChat />
    </main>
  );
}
function ActivityBar({ data }: { data: PublicState }) {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const update = () =>
      setClock(
        new Intl.DateTimeFormat("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      className="relative mt-3 overflow-hidden rounded-2xl border border-[#ff9b49]/25 bg-[#130d09] text-[#fff4df] shadow-[0_18px_45px_rgba(0,0,0,.28)]"
      style={{
        backgroundImage: "url('/shoyru-og-cover.png')",
        backgroundPosition: "72% 45%",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0908] via-[#17100c]/95 to-[#17100c]/70" />
      <div className="relative px-4 py-3 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${data.cronDelayed ? "bg-[#ffad3d] ring-[#ffad3d]/15" : "animate-pulse bg-[#62dc8a] ring-[#62dc8a]/15"}`} />
          <b className="whitespace-nowrap text-[#ffd47a]">{data.status}</b>
          <span className="whitespace-nowrap text-[#d4c6b6]">{clock}</span>
          <span className="hidden h-3 w-px bg-white/15 sm:block" />
          <span className="whitespace-nowrap text-[#aebcc0]">Lượt tới: <b className="text-[#f8ead5]">{data.cronDelayed ? "đang kết nối lại" : data.nextWake}</b></span>
          {data.cronDelayed && (
            <span className="rounded-full border border-[#ffad3d]/25 bg-[#ffad3d]/10 px-2 py-0.5 text-[10px] font-bold text-[#ffc66f]">ĐANG THỬ LẠI</span>
          )}
        </div>
        <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-2.5 text-xs text-[#b7aaa0]">
          <span className="whitespace-nowrap"><b className="mr-1.5 text-base text-[#61dd8a]">{data.activeViewers}</b> đang xem</span>
          <span className="text-[#6f7b7d]">•</span>
          <span className="whitespace-nowrap">Hôm nay <b className="text-[#f7ead9]">{data.todayVisitors}</b> người</span>
          <span className="text-[#6f7b7d]">•</span>
          <span className="whitespace-nowrap">Tổng <b className="text-[#f7ead9]">{new Intl.NumberFormat("vi-VN").format(data.totalViews)}</b> lượt xem</span>
        </div>
      </div>
    </div>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-black tracking-[.22em] text-[#ff8a55]">
      {children}
    </p>
  );
}
function LiveFeed({
  messages,
  nextWake,
}: {
  messages: PublicState["conversations"];
  nextWake: string;
}) {
  const [index, setIndex] = useState(0),
    [typed, setTyped] = useState(""),
    [paused, setPaused] = useState(false),
    [dayMessages, setDayMessages] = useState<PublicState["conversations"] | null>(null),
    [loadingDay, setLoadingDay] = useState(false);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const sourceMessages = dayMessages || messages;
  const ordered = useMemo(() => [...sourceMessages].reverse(), [sourceMessages]);
  const screen = useRef<HTMLDivElement>(null),
    current = ordered[index],
    target = current?.text || "";
  useEffect(() => {
    if (paused || !current) return;
    if (typed.length < target.length) {
      const timer = setTimeout(
        () =>
          setTyped(target.slice(0, Math.min(target.length, typed.length + 2))),
        18,
      );
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setIndex((value) => value + 1);
      setTyped("");
    }, 520);
    return () => clearTimeout(timer);
  }, [paused, current, target, typed]);
  useEffect(() => {
    if (screen.current) screen.current.scrollTop = 0;
  }, [typed, index]);
  async function loadDay(date = selectedDate) {
    setLoadingDay(true);
    try {
      const response = await fetch(`/api/journal?date=${encodeURIComponent(date)}`);
      const result = await response.json();
      const loaded = Array.isArray(result.messages) ? result.messages : [];
      setDayMessages(loaded);
      setIndex(loaded.length);
      setTyped("");
    } finally {
      setLoadingDay(false);
    }
  }
  const shown = ordered.slice(0, index);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0b1014] p-4 sm:p-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2 rounded-t-xl bg-[#202b3b] px-4 py-3 text-xs text-[#aab2be]">
        <span className="h-3 w-3 rounded-full bg-[#ff6b6b]" />
        <span className="h-3 w-3 rounded-full bg-[#ffbd3e]" />
        <span className="h-3 w-3 rounded-full bg-[#55d88a]" />
        <span className="min-w-[150px] flex-1 text-center">Nhật ký của Shoyru</span>
        <input
          type="date"
          value={selectedDate}
          max={today}
          onChange={(event) => setSelectedDate(event.target.value)}
          className="rounded-lg border border-white/10 bg-[#111a27] px-2 py-1.5 text-[#e8e3dc] [color-scheme:dark]"
          aria-label="Chọn ngày xem nhật ký"
        />
        <button
          onClick={() => loadDay()}
          disabled={loadingDay}
          className="rounded-lg bg-[#ffbd3e] px-3 py-1.5 font-bold text-[#17130c] disabled:opacity-60"
        >
          {loadingDay ? "Đang tải" : "Xem cả ngày"}
        </button>
        {dayMessages && (
          <button
            onClick={() => {
              setDayMessages(null);
              setIndex(0);
              setTyped("");
            }}
            className="rounded-lg bg-white/10 px-3 py-1.5 font-bold text-[#e8e3dc]"
          >
            Trực tiếp
          </button>
        )}
        <button
          onClick={() => setPaused((value) => !value)}
          className="rounded-lg bg-white/10 px-3 py-1.5 font-bold text-[#e8e3dc]"
        >
          {paused ? "▶ Tiếp tục" : "Ⅱ Tạm dừng"}
        </button>
      </div>
      <div
        ref={screen}
        className="journal-scroll min-h-0 flex-1 overflow-y-scroll overscroll-contain rounded-b-xl bg-[#07101f] p-4 font-mono text-sm leading-7 text-[#d3d9e2] [scrollbar-gutter:stable] sm:p-5"
      >
        {!ordered.length && (
          <p className="text-[#657080]">
            Đang chờ Shoyru bắt đầu lượt làm việc tiếp theo
            <span className="animate-pulse">_</span>
          </p>
        )}
        {[...shown, current].filter(Boolean).map((message, position) => {
          const active = position === shown.length && Boolean(current);
          return (
            <p
              key={message!.id}
              className="mb-4 whitespace-pre-wrap break-words"
            >
              <span className="text-[#ffbd3e]">{message!.at}</span>{" "}
              <span
                className={
                  message!.speaker === "he-thong"
                    ? "text-[#8c96a5]"
                    : "text-[#55e38b]"
                }
              >
                [{message!.speaker === "he-thong" ? "Hệ thống" : "Shoyru"}]
              </span>{" "}
              <span>{active ? typed : message!.text}</span>
              {active && !paused && (
                <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-[#ffbd3e] align-middle" />
              )}
            </p>
          );
        })}
        {index >= ordered.length && ordered.length > 0 && (
          <p className="text-xs text-[#596475]">
            — {dayMessages ? `Đã hiện ${ordered.length} tin trong ngày` : `Đã ghi xong · lượt tiếp theo ${nextWake}`} —
          </p>
        )}
      </div>
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  const c: { [k: string]: string } = {
    gold: "text-[#ffbd3e]",
    orange: "text-[#ff8255]",
    green: "text-[#72d78a]",
    red: "text-[#ed6c62]",
  };
  return (
    <div className="p-5 sm:p-7">
      <div className={`${c[tone]} mb-4 [&>svg]:h-5 [&>svg]:w-5`}>{icon}</div>
      <p className="text-xs text-[#88837c]">{label}</p>
      <p className="mt-1 text-xl font-black sm:text-2xl">{value}</p>
    </div>
  );
}
function Rule({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="panel rounded-2xl p-5">
      <div className="mb-5 text-[#ffbd3e] [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
      <h3 className="font-extrabold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#938e87]">{text}</p>
    </div>
  );
}
function projectStatus(status: string) {
  return (
    (
      {
        active: "Đang làm",
        validating: "Đang kiểm tra",
        ready: "Sẵn sàng bán",
      } as Record<string, string>
    )[status] || status
  );
}
