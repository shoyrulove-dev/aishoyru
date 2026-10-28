import Link from "next/link";
import type { Metadata } from "next";
import { CheckCircle2, ShieldCheck, Workflow } from "lucide-react";
import { StoreFront } from "@/components/store-front";
import { productPrepared, productReady, products } from "@/lib/store";

export const metadata: Metadata = {
  title: "Bộ khởi tạo AI sinh tồn Shoyru — hướng dẫn từng bước",
  description:
    "Bộ thực hành 12 bước để dựng AI agent có trí nhớ, lịch chạy, fallback, dashboard, cửa hàng số và thanh toán tự động. Tặng 6 sticker Shoyru PNG.",
  alternates: {
    canonical: "https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru",
  },
  openGraph: {
    title: "Tự dựng một AI agent biết làm việc từng giờ",
    description:
      "Hướng dẫn thực hành, file mẫu, checklist E2E và quà tặng 6 sticker Shoyru PNG.",
    url: "https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru",
    type: "website",
    images: ["/be-rong-mascot.png"],
  },
};

const chapters = [
  [
    "01",
    "Định hình nhân vật và luật sinh tồn",
    "Chọn mục tiêu, giọng nói, giới hạn tự chủ và những việc bắt buộc cần con người.",
  ],
  [
    "02",
    "Dựng bộ nhớ bằng MongoDB",
    "Tách trạng thái, lịch sử chạy, dự án, cơ hội, đơn hàng và giao dịch để không biến database thành một mớ nhật ký.",
  ],
  [
    "03",
    "Nối bộ não AI có fallback",
    "Dùng Groq làm chính, OpenRouter và Kilo dự phòng; ép JSON schema để dữ liệu sai không lọt vào hệ thống.",
  ],
  [
    "04",
    "Cho agent thức dậy mỗi giờ",
    "Cấu hình GitHub Actions, cron secret, timeout và cơ chế mỗi lượt chỉ làm đúng một việc.",
  ],
  [
    "05",
    "Biến suy nghĩ thành công việc thật",
    "Pipeline nghiên cứu → sản phẩm → kiểm tra → xuất bản → tìm khách, kèm chống chờ và chống lặp.",
  ],
  [
    "06",
    "Dựng dashboard và trang quản trị",
    "Tách phần công khai hấp dẫn khỏi trung tâm điều hành, chỉ đưa việc cần cấp quyền vào hàng chờ.",
  ],
  [
    "07",
    "Mở cửa hàng và giao file tự động",
    "Tạo mã đơn, VietQR, webhook SePay, chống giao dịch trùng và liên kết tải riêng.",
  ],
  [
    "08",
    "Vận hành an toàn và đo kết quả",
    "Không bịa doanh thu, không spam, không tự chi tiền; kiểm thử đầu cuối và đọc log khi có lỗi.",
  ],
];

export default function AgentKitPage() {
  const product = products.find(
    (item) => item.slug === "bo-khoi-tao-ai-shoyru",
  )!;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url: "https://shoyruai.blissbiovn.com/store/bo-khoi-tao-ai-shoyru",
    offers: {
      "@type": "Offer",
      priceCurrency: "VND",
      price: product.price,
      availability: "https://schema.org/InStock",
    },
  };
  return (
    <main className="noise min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <Link href="/store" className="font-black text-[#ffbd3e]">
          ← Về hang Shoyru
        </Link>
        <span className="text-xs font-bold tracking-[.18em] text-[#87827b]">
          BỘ THỰC HÀNH V1.0
        </span>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
        <div>
          <p className="text-xs font-black tracking-[.2em] text-[#ff8255]">
            TỪ MỘT NHÂN VẬT ĐẾN MỘT HỆ THỐNG THẬT
          </p>
          <h1 className="mt-4 text-5xl font-black leading-[1.02] tracking-[-.045em] sm:text-7xl">
            Tự dựng một AI biết làm việc từng giờ.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#aaa39a]">
            Quy trình thực hành để tạo một nhân vật AI có trí nhớ, nhật ký công
            khai, cửa hàng số và thanh toán tự động — theo kiến trúc đang vận
            hành Shoyru.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm font-bold">
            <span className="rounded-full border border-white/10 px-4 py-2">
              Không cần tự huấn luyện model
            </span>
            <span className="rounded-full border border-white/10 px-4 py-2">
              Có prompt và file mẫu
            </span>
            <span className="rounded-full border border-white/10 px-4 py-2">
              Checklist kiểm thử thật
            </span>
            <span className="rounded-full border border-[#ffbd3e]/30 bg-[#ffbd3e]/8 px-4 py-2 text-[#ffd477]">
              Tặng bộ 6 sticker PNG
            </span>
          </div>
        </div>
        <div className="panel rounded-[2rem] p-7">
          <Workflow className="text-[#ff8255]" size={34} />
          <h2 className="mt-5 text-3xl font-black">
            Bộ này không bán giấc mơ “AI tự in tiền”.
          </h2>
          <p className="mt-4 leading-7 text-[#aaa39a]">
            Bạn nhận một quy trình có thể kiểm tra: AI thức dậy, đọc trạng thái,
            chọn việc, tạo đầu ra, ghi lại kết quả và báo đúng thứ đang thiếu.
          </p>
          <p className="mt-5 rounded-2xl bg-[#17120f] p-4 text-sm leading-6 text-[#d8cdbf]">
            Doanh thu vẫn phụ thuộc vào sản phẩm và khách hàng thật. Agent chỉ
            giúp vận hành đều, minh bạch và có hệ thống.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <p className="text-xs font-black tracking-[.2em] text-[#ff8255]">
          XEM TRƯỚC MỤC LỤC
        </p>
        <h2 className="mt-3 text-4xl font-black">Tám chặng làm theo thứ tự</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {chapters.map(([number, title, text]) => (
            <article key={number} className="panel rounded-2xl p-6">
              <div className="flex gap-4">
                <span className="text-xl font-black text-[#ff8255]">
                  {number}
                </span>
                <div>
                  <h3 className="text-xl font-black">{title}</h3>
                  <p className="mt-2 leading-7 text-[#96918a]">{text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <p className="text-xs font-black tracking-[.2em] text-[#ff8255]">HỎI NGẮN, ĐÁP THẲNG</p>
        <h2 className="mt-3 text-4xl font-black">Trước khi bạn mua</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {[
            ["Có cần biết lập trình không?", "Bạn nên biết cách chạy dự án Node.js và sửa biến môi trường. Bộ này tập trung vào kiến trúc và quy trình thực hành."],
            ["Có cam kết kiếm được tiền không?", "Không. Bộ này giúp dựng hệ thống làm việc và đo kết quả; doanh thu phụ thuộc sản phẩm, khách hàng và cách bạn vận hành."],
            ["Tôi nhận được gì sau thanh toán?", "Một tệp ZIP gồm hướng dẫn 12 bước, prompt, schema MongoDB, workflow GitHub Actions, mẫu ENV, checklist E2E và thư mục quà tặng 6 sticker Shoyru PNG."],
            ["Tệp có chứa API key của Shoyru không?", "Không. Mọi khóa, dữ liệu ngân hàng và thông tin riêng đều đã được loại bỏ."],
          ].map(([question, answer]) => (
            <article key={question} className="panel rounded-2xl p-6">
              <h3 className="text-lg font-black">{question}</h3>
              <p className="mt-2 leading-7 text-[#96918a]">{answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Sách hướng dẫn thực hành 12 bước",
            "Prompt hệ thống và schema MongoDB",
            "GitHub Actions, mẫu ENV và checklist E2E",
            "Quà tặng 6 sticker Shoyru PNG",
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 p-5">
              <CheckCircle2 className="text-[#65d68b]" />
              <b className="mt-4 block text-lg">{item}</b>
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-3 rounded-2xl border border-[#65d68b]/20 bg-[#102019] p-5 text-sm leading-6 text-[#c9dbce]">
          <ShieldCheck className="shrink-0 text-[#65d68b]" /> Bộ mẫu không chứa
          API key thật, tài khoản ngân hàng hay dữ liệu riêng của Shoyru.
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="mb-7">
          <p className="text-xs font-black tracking-[.2em] text-[#ff8255]">
            LẤY BỘ KHỞI TẠO
          </p>
          <h2 className="mt-3 text-4xl font-black">
            79.000đ · gồm bộ Starter và 6 sticker PNG
          </h2>
        </div>
        <StoreFront
          products={[
            {
              ...product,
              prepared: productPrepared(product.slug),
              ready: productReady(product.slug),
            },
          ]}
          affiliates={[]}
          productOnly
        />
      </section>
    </main>
  );
}
