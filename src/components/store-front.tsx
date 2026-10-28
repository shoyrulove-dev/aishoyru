"use client";
/* eslint-disable @next/next/no-img-element -- VietQR is generated dynamically by the payment API. */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

type Product = {
  slug: string;
  name: string;
  description: string;
  price: number;
  format: string;
  prepared: boolean;
  ready: boolean;
};
type Order = { code: string; amount: number; qrUrl: string };
const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + "đ";

function visitorId() {
  let value = localStorage.getItem("shoyru_visitor_id");
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem("shoyru_visitor_id", value);
  }
  return value;
}

function track(type: string) {
  fetch("/api/engagement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: visitorId(), type, path: location.pathname }),
    keepalive: true,
  }).catch(() => {});
}

export function StoreFront({
  products,
  affiliates,
  productOnly = false,
}: {
  products: Product[];
  affiliates: { name: string; url: string; commission: string }[];
  productOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Product | null>(null),
    [name, setName] = useState(""),
    [contact, setContact] = useState(""),
    [order, setOrder] = useState<Order | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (productOnly) track("product_view");
  }, [productOnly]);
  async function createOrder() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/store/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: selected.slug, name, contact, sessionId: visitorId() }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Chưa thể tạo đơn.");
      return;
    }
    setOrder(data);
    track("qr_created");
  }
  async function verify() {
    if (!order) return;
    setBusy(true);
    setMessage("Đang kiểm tra giao dịch…");
    const response = await fetch("/api/store/orders/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: order.code }),
    });
    const data = await response.json();
    setBusy(false);
    if (data.paid && data.downloadUrl) {
      setMessage("Đã nhận thanh toán. Tệp của bạn đã sẵn sàng.");
      window.location.href = data.downloadUrl;
      return;
    }
    if (data.paid && data.support) {
      setMessage("Shoyru đã nhận được bữa ăn bạn mời. Cảm ơn bạn rất nhiều!");
      return;
    }
    setMessage(
      data.error ||
        "Chưa thấy giao dịch đúng mã và số tiền. Bạn thử lại sau ít phút nhé.",
    );
  }
  return (
    <>
      <div
        className={`grid gap-6 ${products.length > 1 ? "md:grid-cols-2" : ""}`}
      >
        {products.map((product) => (
          <article
            key={product.slug}
            className="panel overflow-hidden rounded-3xl"
          >
            <div className="relative aspect-[3/2] bg-[#18130f] p-3">
              <Image
                src={
                  product.slug === "moi-shoyru-mot-bua"
                    ? "/be-rong-mascot.png"
                    : "/be-rong-mascot.png"
                }
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-contain p-3"
              />
            </div>
            <div className="p-6">
              <p className="text-xs font-black tracking-[.18em] text-[#ff8255]">
                {product.slug === "moi-shoyru-mot-bua"
                  ? "ỦNG HỘ MINH BẠCH"
                  : product.slug === "bo-khoi-tao-ai-shoyru"
                    ? "SẢN PHẨM CHỦ LỰC"
                    : "QUÀ TẶNG SỐ"}
              </p>
              <h2 className="mt-2 text-2xl font-black">{product.name}</h2>
              <p className="mt-3 leading-7 text-[#a9a39a]">
                {product.description}
              </p>
              {product.slug === "bo-khoi-tao-ai-shoyru" && (
                <Link
                  href="/store/bo-khoi-tao-ai-shoyru"
                  className="mt-3 inline-block text-sm font-bold text-[#ff9b72]"
                >
                  Xem thử nội dung và lộ trình →
                </Link>
              )}
              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <b className="text-2xl text-[#ffbd3e]">
                    {money(product.price)}
                  </b>
                  <p className="text-xs text-[#77736d]">{product.format}</p>
                </div>
                <button
                  disabled={!product.ready}
                  onClick={() => {
                    setSelected(product);
                    setOrder(null);
                    setMessage("");
                    track("checkout_start");
                  }}
                  className="rounded-xl bg-[#ff6b35] px-5 py-3 font-extrabold disabled:cursor-not-allowed disabled:bg-[#4c4944]"
                >
                  {product.ready
                    ? "Mua ngay"
                    : product.prepared
                      ? "Chờ mở thanh toán"
                      : "Đang làm sản phẩm"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {products.some((product) => product.prepared && !product.ready) && (
        <div className="mt-7 rounded-2xl border border-[#55d88a]/20 bg-[#102019] p-5 text-sm leading-6 text-[#c9dbce]">
          <b className="text-[#72d78a]">Hàng đã sẵn sàng.</b> Store đang chờ cấu
          hình tài khoản nhận tiền và SePay; trước khi đủ thông tin, hệ thống
          không cho tạo đơn để tránh nhận tiền mà không đối soát được.
        </div>
      )}
      {!productOnly && (
        <section className="mt-10">
          <p className="text-xs font-black tracking-[.2em] text-[#ff8255]">
            LIÊN KẾT TIẾP THỊ
          </p>
          <h2 className="mt-2 text-3xl font-black">
            Đồ nghề Shoyru giới thiệu
          </h2>
          {affiliates.length ? (
            <div
              className={`mt-5 grid gap-3 ${affiliates.length > 1 ? "sm:grid-cols-2" : ""}`}
            >
              {affiliates.map((offer) => (
                <a
                  key={offer.url}
                  href={offer.url}
                  target="_blank"
                  rel="sponsored noopener"
                  onClick={() => track("affiliate_click")}
                  className="panel max-w-3xl rounded-2xl p-5 font-extrabold"
                >
                  {offer.name} →
                  <span className="mt-2 block text-sm font-normal leading-6 text-[#8f8a83]">
                    Liên kết tiếp thị · Shoyru nhận {offer.commission}; bạn
                    không trả thêm phí.
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-white/8 p-5 text-sm text-[#8f8a83]">
              Chưa có đối tác phù hợp. Shoyru chỉ đăng liên kết đã được chủ nhân
              kiểm tra và luôn ghi rõ khả năng nhận hoa hồng.
            </p>
          )}
        </section>
      )}
      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelected(null)
          }
        >
          <div className="w-full max-w-md rounded-3xl bg-[#f5ead8] p-6 text-[#17191b]">
            <button
              className="float-right text-xl"
              onClick={() => setSelected(null)}
              aria-label="Đóng"
            >
              ×
            </button>
            <h2 className="pr-8 text-2xl font-black">{selected.name}</h2>
            {!order ? (
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-bold">
                  Tên người nhận
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/15 bg-white px-4 py-3 font-normal"
                    placeholder="Ví dụ: Minh"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Email hoặc Zalo nhận hỗ trợ
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/15 bg-white px-4 py-3 font-normal"
                    placeholder="Email hoặc số Zalo"
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={createOrder}
                  className="w-full rounded-xl bg-[#17191b] px-5 py-3 font-extrabold text-white"
                >
                  {busy ? "Đang tạo…" : "Tạo mã đơn và VietQR"}
                </button>
              </div>
            ) : (
              <div className="mt-5 text-center">
                <p>
                  Mã đơn: <b>{order.code}</b>
                </p>
                <img
                  src={order.qrUrl}
                  alt={`VietQR cho đơn ${order.code}`}
                  className="mx-auto my-4 h-64 w-64 rounded-xl bg-white object-contain"
                />
                <p className="text-sm">
                  Chuyển đúng <b>{money(order.amount)}</b> và giữ nguyên nội
                  dung <b>{order.code}</b>.
                </p>
                <button
                  disabled={busy}
                  onClick={verify}
                  className="mt-4 w-full rounded-xl bg-[#138a55] px-5 py-3 font-extrabold text-white"
                >
                  Tôi đã chuyển khoản
                </button>
              </div>
            )}
            {message && (
              <p className="mt-4 rounded-xl bg-black/8 p-3 text-sm">
                {message}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
