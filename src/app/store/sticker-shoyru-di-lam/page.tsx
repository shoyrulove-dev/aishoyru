import {
  Check,
  Download,
  FileArchive,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bộ sticker Shoyru Đi Làm",
  description: "Bộ sticker rồng con Shoyru dùng trong tin nhắn và bài đăng.",
  alternates: { canonical: "/store/sticker-shoyru-di-lam" },
};
import { connection } from "next/server";
import { StoreFront } from "@/components/store-front";
import { productPrepared, productReady, products } from "@/lib/store";

export const instant = false;

export default async function StickerProductPage() {
  await connection();
  const product = products.find(
    (item) => item.slug === "sticker-shoyru-di-lam",
  )!;
  const ready = productReady(product.slug);
  return (
    <main className="min-h-screen bg-[#f6f0e5] text-[#1b1c1e]">
      <nav className="border-b border-black/8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link href="/store" className="font-black">
            ← Quầy hàng Shoyru
          </Link>
          <span className="rounded-full bg-[#e2f5e8] px-3 py-1.5 text-xs font-bold text-[#257344]">
            {ready ? "Đang mở bán" : "Đang hoàn thiện"}
          </span>
        </div>
      </nav>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#dc6b3e]/20 bg-[#fff7ef] px-3 py-1.5 text-xs font-bold text-[#c84f25]">
            <Sparkles size={14} /> SẢN PHẨM SỐ ĐẦU TIÊN CỦA SHOYRU
          </div>
          <h1 className="mt-5 text-5xl font-black leading-[.98] tracking-[-.055em] sm:text-7xl">
            Bộ sticker
            <br />
            <span className="text-[#ef6130]">Shoyru Đi Làm</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#68645e]">
            6 biểu cảm của chú rồng ham ăn dành cho tin nhắn, bài đăng và những
            ngày vừa muốn làm việc vừa muốn kiếm đồ ăn.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="#mua-ngay"
              className="rounded-xl bg-[#1c2024] px-6 py-3.5 font-extrabold text-white"
            >
              Mua và tải ngay · 39.000đ
            </a>
            <a
              href="#xem-truoc"
              className="rounded-xl border border-black/12 px-6 py-3.5 font-bold"
            >
              Xem trọn bộ
            </a>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#716d67]">
            <span className="flex items-center gap-2">
              <Check size={16} className="text-[#258a50]" />6 tệp PNG riêng
            </span>
            <span className="flex items-center gap-2">
              <Check size={16} className="text-[#258a50]" />
              Tải tự động sau thanh toán
            </span>
            <span className="flex items-center gap-2">
              <Check size={16} className="text-[#258a50]" />
              Dùng nhiều lần
            </span>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-black/8 bg-[#211813] p-3 shadow-[0_30px_90px_rgba(71,42,24,.18)]">
          <Image
            src="/shoyru-sticker-pack-preview.png"
            width={1536}
            height={1024}
            priority
            alt="Bản xem trước 6 sticker Shoyru Đi Làm"
            className="h-auto w-full rounded-[1.4rem]"
          />
          <span className="absolute bottom-6 left-6 rounded-full bg-white/90 px-3 py-1.5 text-xs font-black backdrop-blur">
            BẢN XEM TRƯỚC
          </span>
        </div>
      </section>
      <section id="xem-truoc" className="bg-[#171b20] py-16 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-black tracking-[.2em] text-[#ff8a55]">
            TRONG GÓI CÓ GÌ?
          </p>
          <h2 className="mt-3 text-3xl font-black sm:text-5xl">
            Một bộ nhỏ, đủ sáu tâm trạng.
          </h2>
          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [
                "💻",
                "Đang cày",
                "Shoyru ôm laptop, hợp lúc báo đang làm việc.",
              ],
              ["🙌", "Hoàn thành rồi", "Ăn mừng khi chốt xong một đầu việc."],
              ["😴", "Đi ngủ", "Báo nghỉ đúng lúc, không phải biến mất."],
              ["🥣", "Đói bụng", "Chiếc bát trống nói thay mọi lời."],
              ["📦", "Giao hàng", "Dùng khi gửi tệp, quà hoặc đơn hàng."],
              ["🪙", "Có tiền về", "Ăn mừng một giao dịch thật."],
            ].map(([icon, title, text]) => (
              <article
                key={title}
                className="rounded-2xl border border-white/8 bg-white/[.04] p-5"
              >
                <span className="text-2xl">{icon}</span>
                <h3 className="mt-4 font-extrabold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#9fa7af]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black tracking-[.2em] text-[#e65b2c]">
              NHẬN FILE NHƯ THẾ NÀO?
            </p>
            <h2 className="mt-3 text-3xl font-black">
              Không cần nhắn tin chờ gửi file.
            </h2>
            <div className="mt-7 space-y-5">
              <Step
                icon={<MessageCircle />}
                n="01"
                title="Tạo mã đơn riêng"
                text="Nhập tên và email hoặc Zalo hỗ trợ. Hệ thống sinh mã SHO riêng cho đơn của bạn."
              />
              <Step
                icon={<Zap />}
                n="02"
                title="Quét VietQR"
                text="Chuyển đúng 39.000đ và giữ nguyên mã đơn trong nội dung chuyển khoản."
              />
              <Step
                icon={<Download />}
                n="03"
                title="Tải ZIP ngay"
                text="SePay xác nhận đúng mã và số tiền, nút tải tệp riêng sẽ mở tự động."
              />
            </div>
          </div>
          <div className="rounded-3xl border border-black/8 bg-white p-7">
            <ShieldCheck className="text-[#27834b]" />
            <h3 className="mt-5 text-2xl font-black">Bán hàng minh bạch</h3>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-[#65615c]">
              <li>
                • Không ghi nhận doanh thu trước khi SePay xác minh giao dịch
                thật.
              </li>
              <li>• Mỗi đơn có mã riêng, tránh giao nhầm file.</li>
              <li>• Liên kết tải chỉ mở cho đơn đã thanh toán.</li>
              <li>
                • Tệp được lưu riêng trên Vercel Blob, không đặt công khai trong
                website.
              </li>
            </ul>
            <div className="mt-7 flex items-center gap-3 rounded-2xl bg-[#f5f1ea] p-4">
              <FileArchive className="text-[#e65b2c]" />
              <div>
                <b>shoyru-stickers-v1.zip</b>
                <p className="text-xs text-[#7b766f]">
                  Khoảng 10 MB · 6 tệp PNG
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-black/8 bg-white py-14">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black tracking-[.2em] text-[#e65b2c]">
              QUYỀN SỬ DỤNG
            </p>
            <h2 className="mt-3 text-3xl font-black">
              Mua một lần, dùng lâu dài.
            </h2>
            <p className="mt-4 leading-7 text-[#716d67]">
              Bạn được dùng sticker trong tin nhắn, hồ sơ cá nhân và nội dung
              mạng xã hội của mình. Không được bán lại, chia sẻ lại gói tệp, đưa
              vào kho tài nguyên hoặc nhận là tác phẩm của mình.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "Tin nhắn cá nhân",
              "Bài đăng mạng xã hội",
              "Ảnh đại diện và story",
              "Nội dung của chính bạn",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-xl bg-[#f5f1ea] p-4 text-sm font-bold"
              >
                <Check size={17} className="text-[#27834b]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="mua-ngay" className="bg-[#0d1217] py-16 text-[#f8f1df]">
        <div className="mx-auto max-w-3xl px-5">
          <div className="mb-8 text-center">
            <p className="text-xs font-black tracking-[.2em] text-[#ff8a55]">
              MUA SẢN PHẨM
            </p>
            <h2 className="mt-3 text-4xl font-black">
              Lấy bộ sticker của Shoyru
            </h2>
            <p className="mt-3 text-[#999f9f]">
              39.000đ · tạo mã đơn và VietQR riêng ngay bên dưới.
            </p>
          </div>
          <StoreFront
            products={[
              { ...product, prepared: productPrepared(product.slug), ready },
            ]}
            affiliates={[]}
            productOnly
          />
        </div>
      </section>
    </main>
  );
}

function Step({
  icon,
  n,
  title,
  text,
}: {
  icon: React.ReactNode;
  n: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e65b2c] [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black tracking-[.16em] text-[#a59f96]">
          BƯỚC {n}
        </p>
        <h3 className="font-extrabold">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#716d67]">{text}</p>
      </div>
    </div>
  );
}
