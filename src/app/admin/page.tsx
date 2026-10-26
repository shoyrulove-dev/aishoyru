"use client";

import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  Globe2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageCircle,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  ShoppingBag,
  Target,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createElement, useState } from "react";

type Approval = {
  _id: string;
  title: string;
  details: string;
  type: string;
  channel?: string;
  destination?: string;
  email?: { to: string; subject: string; body: string };
};
type AgentRun = {
  _id: string;
  provider?: string;
  model?: string;
  createdAt?: string;
  decision?: {
    status?: string;
    action?: { type?: string; title?: string; details?: string };
  };
  workResult?: { summary?: string; artifact?: string; nextStep?: string };
};
type Overview = {
  approvals: Approval[];
  projects: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
  runs: AgentRun[];
  orders: Array<Record<string, unknown>>;
  published: Array<Record<string, unknown>>;
  chats: Array<Record<string, unknown>>;
  aiHealth: Array<{
    provider: string;
    model?: string;
    status?: string;
    totalSuccess?: number;
    totalFailure?: number;
    consecutiveFailures?: number;
    lastLatencyMs?: number;
    cooldownUntil?: string;
    lastError?: string;
  }>;
  metrics: {
    revenue: number;
    pending: number;
    leads: number;
    orders: number;
    views24h: number;
    visitors24h: number;
    chatOpens24h: number;
    unreadChats: number;
    productViews24h: number;
    checkoutStarts24h: number;
    qrCreated24h: number;
    payments24h: number;
    downloads24h: number;
  };
  channels: Array<{ id: string; name: string; status: string; detail: string }>;
};
const money = (value: number) =>
  new Intl.NumberFormat("vi-VN").format(value) + "đ";

export default function Admin() {
  const [key, setKey] = useState(""),
    [data, setData] = useState<Overview | null>(null),
    [msg, setMsg] = useState(""),
    [loading, setLoading] = useState(false),
    [tab, setTab] = useState("overview");
  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/overview", {
      headers: { Authorization: `Bearer ${key}` },
    });
    setLoading(false);
    if (!r.ok) {
      setData(null);
      setMsg("Mã quản trị không đúng hoặc dịch vụ dữ liệu chưa sẵn sàng.");
      return;
    }
    setData(await r.json());
    setMsg("");
  }
  async function decide(id: string, status: string) {
    const r = await fetch("/api/admin/approvals", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status }),
    });
    const result = await r.json();
    if (!r.ok) {
      setMsg(result.error || "Không thể thực hiện hành động.");
      return;
    }
    setMsg(
      result.sent
        ? "Email đã được gửi thật."
        : result.published
          ? `Đã đăng tại ${result.url}.`
          : "Đã cập nhật.",
    );
    await load();
  }
  async function replyChat(sessionId: string, text: string) {
    const r = await fetch("/api/admin/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, text }),
    });
    const result = await r.json();
    setMsg(
      r.ok
        ? "Đã gửi lời nhắn cho khách."
        : result.error || "Không gửi được tin nhắn.",
    );
    if (r.ok) await load();
  }
  if (!data)
    return (
      <Login
        keyValue={key}
        setKey={setKey}
        load={load}
        loading={loading}
        message={msg}
      />
    );
  const nav = [
    { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
    {
      id: "actions",
      label: "Hành động",
      icon: Zap,
      count: data.metrics.pending,
    },
    {
      id: "pipeline",
      label: "Cơ hội",
      icon: Target,
      count: data.metrics.leads,
    },
    { id: "channels", label: "Kênh bán", icon: Radio },
    { id: "work-log", label: "Nhật ký việc", icon: Check },
    { id: "ai-health", label: "Sức khỏe AI", icon: Zap },
    {
      id: "visitors",
      label: "Khách & chat",
      icon: MessageCircle,
      count: data.metrics.unreadChats,
    },
  ];
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-[#17202a]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#e3e7eb] bg-white px-4 py-5 lg:flex">
        <Brand />
        <p className="mt-8 px-3 text-[10px] font-bold tracking-[.16em] text-[#9aa3ad]">
          ĐIỀU HÀNH
        </p>
        <nav className="mt-2 space-y-1">
          {nav.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${tab === item.id ? "bg-[#17202a] text-white" : "text-[#66717c] hover:bg-[#f2f4f6]"}`}
            >
              <item.icon size={17} />
              <span className="flex-1 text-left">{item.label}</span>
              {Boolean(item.count) && (
                <span className="rounded-full bg-[#ff6b35] px-2 py-0.5 text-[10px] text-white">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#fff4ee] p-4">
          <Rocket className="text-[#ff6b35]" size={20} />
          <p className="mt-3 text-sm font-bold">Shoyru đang trực tuyến</p>
          <p className="mt-1 text-xs leading-5 text-[#7a6d66]">
            Tự chạy mỗi giờ, chỉ dừng ở hành động cần quyền truy cập.
          </p>
        </div>
        <button
          onClick={() => {
            setData(null);
            setKey("");
          }}
          className="mt-3 flex items-center gap-2 px-3 py-2 text-sm font-semibold text-[#7b858f]"
        >
          <LogOut size={16} />
          Đăng xuất
        </button>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-[#e3e7eb] bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-5 lg:px-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden lg:block">
              <p className="text-sm font-bold">Shoyru OS</p>
              <p className="text-xs text-[#8b949e]">
                Trung tâm tăng trưởng và vận hành
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-2 rounded-full bg-[#eaf8ef] px-3 py-1.5 text-xs font-bold text-[#25864b] sm:flex">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#38ad62]" />
                Agent đang chạy
              </span>
              <button
                onClick={load}
                className="grid h-9 w-9 place-items-center rounded-xl border border-[#dfe4e8] bg-white"
              >
                <RefreshCw
                  className={loading ? "animate-spin" : ""}
                  size={16}
                />
              </button>
              <Link
                href="/"
                target="_blank"
                className="grid h-9 w-9 place-items-center rounded-xl border border-[#dfe4e8] bg-white"
              >
                <ExternalLink size={16} />
              </Link>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
            {nav.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === item.id ? "bg-[#17202a] text-white" : "bg-[#f1f3f5] text-[#66717c]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] p-5 lg:p-8">
          {msg && (
            <div className="mb-5 rounded-xl border border-[#b9e7c8] bg-[#effaf3] px-4 py-3 text-sm font-semibold text-[#277346]">
              {msg}
            </div>
          )}
          {tab === "overview" && <OverviewPanel data={data} setTab={setTab} />}{" "}
          {tab === "actions" && (
            <Actions approvals={data.approvals} decide={decide} />
          )}{" "}
          {tab === "pipeline" && <Pipeline data={data} />}{" "}
          {tab === "channels" && <Channels channels={data.channels} />}
          {tab === "work-log" && <WorkLog runs={data.runs} />}
          {tab === "ai-health" && <AiHealth providers={data.aiHealth} />}
          {tab === "visitors" && <Visitors data={data} reply={replyChat} />}
        </div>
      </div>
    </main>
  );
}

function Login({
  keyValue,
  setKey,
  load,
  loading,
  message,
}: {
  keyValue: string;
  setKey: (v: string) => void;
  load: () => void;
  loading: boolean;
  message: string;
}) {
  return (
    <main className="grid min-h-screen bg-[#e7e3db] text-[#17202a] lg:grid-cols-[1.1fr_.9fr]">
      <section className="relative hidden overflow-hidden bg-[#101923] p-14 text-white lg:flex lg:flex-col">
        <div className="absolute -right-28 -top-20 h-96 w-96 rounded-full bg-[#ff6b35]/20 blur-3xl" />
        <Brand dark />
        <div className="relative my-auto max-w-3xl">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-[#ffb08f]">
            SHOYRU AGENT OPERATING SYSTEM
          </span>
          <h1 className="mt-6 text-5xl font-black leading-[1.04] tracking-[-.045em] xl:text-6xl">
            <span className="block">Biến ý tưởng thành</span>
            <span className="block">hành động kiếm tiền thật.</span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-[#aeb8c2]">
            Theo dõi sản phẩm, khách hàng tiềm năng, kênh phân phối và những
            hành động cần bạn cấp quyền.
          </p>
        </div>
        <p className="text-xs text-[#74808b]">
          Mọi khoản thu đều được xác minh. Không bịa khách hàng, không tự tiêu
          tiền.
        </p>
      </section>
      <section className="grid place-items-center bg-[#e7e3db] px-5 py-12 text-[#17202a]">
        <div className="w-full max-w-md">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="mt-10 rounded-3xl border border-[#d5cec2] bg-[#fbf8f2] p-7 text-[#17202a] shadow-[0_24px_80px_rgba(20,31,44,.12)] sm:p-9">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0e9] text-[#f45d28]">
              <KeyRound size={22} />
            </div>
            <h2 className="mt-6 text-3xl font-black tracking-tight text-[#17202a]">
              Đăng nhập quản trị
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#77818b]">
              Dùng mã bí mật để mở trung tâm điều hành.
            </p>
            <label className="mt-7 block text-xs font-bold text-[#4f5963]">
              Mã quản trị
            </label>
            <input
              autoFocus
              type="password"
              value={keyValue}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Nhập ADMIN_API_KEY"
              className="mt-2 w-full rounded-xl border border-[#d9d5ce] bg-white px-4 py-3.5 text-[#17202a] outline-none placeholder:text-[#9aa1a8] focus:border-[#ff6b35]"
            />
            <button
              onClick={load}
              disabled={!keyValue || loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#17202a] px-5 py-3.5 font-bold text-white disabled:bg-[#d2cec7] disabled:text-[#747b82]"
            >
              {loading ? (
                <RefreshCw className="animate-spin" size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}
              Mở trung tâm
            </button>
            {message && (
              <p className="mt-4 rounded-xl bg-[#fff5e6] px-4 py-3 text-sm text-[#9b611b]">
                {message}
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function OverviewPanel({
  data,
  setTab,
}: {
  data: Overview;
  setTab: (tab: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold text-[#f2612c]">
            Tổng quan vận hành
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            Chào buổi làm việc 👋
          </h1>
          <p className="mt-2 text-sm text-[#77818b]">
            Đây là dữ liệu thật từ hành trình kiếm sống của Shoyru.
          </p>
        </div>
        <Link
          href="/store"
          target="_blank"
          className="flex w-fit items-center gap-2 rounded-xl bg-[#17202a] px-4 py-2.5 text-sm font-bold text-white"
        >
          Xem cửa hàng <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Doanh thu xác minh"
          value={money(data.metrics.revenue)}
          color="green"
        />
        <Metric
          icon={ShoppingBag}
          label="Đơn đã thanh toán"
          value={String(data.metrics.orders)}
          color="blue"
        />
        <Metric
          icon={Target}
          label="Cơ hội đã tìm thấy"
          value={String(data.metrics.leads)}
          color="orange"
        />
        <Metric
          icon={Zap}
          label="Chờ bạn cấp quyền"
          value={String(data.metrics.pending)}
          color="purple"
        />
      </div>
      <section className="mt-6 rounded-2xl border border-[#dfe4e8] bg-white p-6">
        <p className="text-xs font-bold tracking-[.14em] text-[#929ba4]">PHỄU 24 GIỜ</p>
        <h2 className="mt-2 text-xl font-black">Từ người xem đến khách hàng</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {[
            ["Xem sản phẩm", data.metrics.productViews24h],
            ["Mở thanh toán", data.metrics.checkoutStarts24h],
            ["Nhận VietQR", data.metrics.qrCreated24h],
            ["Đã thanh toán", data.metrics.payments24h],
            ["Đã tải tệp", data.metrics.downloads24h],
          ].map(([label, value], index) => (
            <div key={String(label)} className="relative rounded-xl bg-[#f6f7f8] p-4">
              <p className="text-2xl font-black">{String(value)}</p>
              <p className="mt-1 text-xs text-[#7b858f]">{String(label)}</p>
              {index < 4 && <ChevronRight className="absolute -right-3 top-1/2 hidden text-[#c8ced4] sm:block" size={16} />}
            </div>
          ))}
        </div>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-2xl border border-[#dfe4e8] bg-white p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold tracking-[.14em] text-[#929ba4]">
                PIPELINE KIẾM SỐNG
              </p>
              <h2 className="mt-2 text-xl font-black">
                Từ ý tưởng đến khách hàng
              </h2>
            </div>
            <button
              onClick={() => setTab("pipeline")}
              className="text-sm font-bold text-[#ef612f]"
            >
              Xem chi tiết
            </button>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-4">
            {[
              [Search, "Tìm cơ hội", data.metrics.leads],
              [
                Target,
                "Đánh giá",
                data.opportunities.filter((x) => x.status === "qualified")
                  .length,
              ],
              [
                Mail,
                "Tiếp cận",
                data.approvals.filter((x) => x.type === "email").length,
              ],
              [CircleDollarSign, "Có doanh thu", data.metrics.orders],
            ].map(([Icon, label, value], i) => (
              <div
                key={String(label)}
                className="relative rounded-xl bg-[#f6f7f8] p-4"
              >
                {createElement(Icon as React.ElementType, {
                  size: 18,
                  className: "text-[#f2612c]",
                })}
                <p className="mt-4 text-2xl font-black">{String(value)}</p>
                <p className="text-xs text-[#7b858f]">{String(label)}</p>
                {i < 3 && (
                  <ChevronRight
                    className="absolute -right-3 top-1/2 hidden text-[#c8ced4] sm:block"
                    size={16}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl bg-[#17202a] p-6 text-white">
          <p className="text-xs font-bold tracking-[.14em] text-[#8f9aa5]">
            VIỆC CẦN BẠN
          </p>
          <p className="mt-3 text-4xl font-black">{data.metrics.pending}</p>
          <p className="mt-2 text-sm leading-6 text-[#aeb7c0]">
            Chỉ báo bạn khi cần gửi email, cấp tài khoản, API, vốn hoặc quyết
            định bên ngoài.
          </p>
          <button
            onClick={() => setTab("actions")}
            className="mt-6 flex items-center gap-2 text-sm font-bold text-[#ff956f]"
          >
            Mở hàng chờ duyệt <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}

function Actions({
  approvals,
  decide,
}: {
  approvals: Approval[];
  decide: (id: string, status: string) => void;
}) {
  return (
    <SectionTitle
      eyebrow="ACTION QUEUE"
      title="Hành động cần cấp quyền"
      text="Mỗi thẻ cho biết chính xác Shoyru sẽ làm gì và ở đâu."
    >
      <div className="space-y-4">
        {!approvals.length && <Empty text="Không có hành động nào đang chờ." />}
        {approvals.map((item) => (
          <article
            key={item._id}
            className="rounded-2xl border border-[#dfe4e8] bg-white p-6"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.type === "email" ? "bg-[#eaf2ff] text-[#2868b2]" : item.type === "support" ? "bg-[#fff1e8] text-[#b44d1f]" : "bg-[#edf8f0] text-[#267e46]"}`}
                  >
                    {item.type === "email"
                      ? "GỬI EMAIL THẬT"
                      : item.type === "support"
                        ? "CẦN CHỦ NHÂN HỖ TRỢ"
                        : "ĐĂNG WEBSITE THẬT"}
                  </span>
                  <span className="text-xs text-[#89939d]">
                    {item.type === "support" ? "Người xử lý" : "Đích đến"}:{" "}
                    {item.destination || item.email?.to || "/updates"}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-black">{item.title}</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#66717c]">
                  {item.details}
                </p>
                {item.email && (
                  <div className="mt-4 rounded-xl bg-[#f6f8fa] p-4 text-sm">
                    <b>Người nhận:</b> {item.email.to}
                    <br />
                    <b>Tiêu đề:</b> {item.email.subject}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-2 lg:flex-col">
                <button
                  onClick={() => decide(item._id, "approved")}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#17202a] px-4 py-2.5 text-sm font-bold text-white"
                >
                  <Check size={16} />
                  {item.type === "email"
                    ? "Duyệt & gửi"
                    : item.type === "support"
                      ? "Đã cung cấp"
                      : "Duyệt & đăng"}
                </button>
                <button
                  onClick={() => decide(item._id, "rejected")}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#dfe4e8] px-4 py-2.5 text-sm font-bold text-[#68737e]"
                >
                  <X size={16} />
                  Bỏ qua
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </SectionTitle>
  );
}

function Pipeline({ data }: { data: Overview }) {
  return (
    <SectionTitle
      eyebrow="GROWTH PIPELINE"
      title="Cơ hội và sản phẩm"
      text="Các đầu mối Shoyru tự tìm thấy phải có nguồn, độ phù hợp và bước tiếp theo."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#dfe4e8] bg-white">
          <PanelHead title="Cơ hội mới" count={data.opportunities.length} />
          <div className="divide-y divide-[#edf0f2]">
            {!data.opportunities.length && (
              <Empty text="Chưa tìm thấy cơ hội đủ điều kiện." />
            )}
            {data.opportunities.map((item, i) => (
              <div key={String(item._id || i)} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      {String(item.title || "Cơ hội chưa đặt tên")}
                    </p>
                    <p className="mt-1 text-xs text-[#89939d]">
                      {String(item.channel || "Nguồn công khai")}
                    </p>
                  </div>
                  {Boolean(item.sourceUrl) && (
                    <a
                      href={String(item.sourceUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#f2612c]"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-[#66717c]">
                  {String(item.fit || item.nextAction || "")}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#dfe4e8] bg-white">
          <PanelHead title="Sản phẩm đang làm" count={data.projects.length} />
          <div className="divide-y divide-[#edf0f2]">
            {data.projects.map((item, i) => (
              <div key={String(item._id || i)} className="p-5">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{String(item.name)}</p>
                  <span className="rounded-full bg-[#fff2eb] px-2.5 py-1 text-[11px] font-bold text-[#e85c28]">
                    {String(item.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#75808a]">
                  {String(item.deliverable || "")}
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#edf0f2]">
                  <div className="h-full w-3/4 rounded-full bg-[#ff6b35]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionTitle>
  );
}

function Visitors({
  data,
  reply,
}: {
  data: Overview;
  reply: (sessionId: string, text: string) => Promise<void>;
}) {
  const latest = Array.from(
    new Map(data.chats.map((item) => [String(item.sessionId), item])).values(),
  );
  return (
    <section>
      <div className="mb-6">
        <p className="text-xs font-bold tracking-[.16em] text-[#ff6b35]">
          KHÁCH GHÉ TRONG 24 GIỜ
        </p>
        <h1 className="mt-2 text-3xl font-black">Lượt xem và trò chuyện</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric
          label="Lượt xem"
          value={String(data.metrics.views24h)}
          icon={Globe2}
          color="blue"
        />
        <Metric
          label="Khách duy nhất"
          value={String(data.metrics.visitors24h)}
          icon={Target}
          color="green"
        />
        <Metric
          label="Mở khung chat"
          value={String(data.metrics.chatOpens24h)}
          icon={MessageCircle}
          color="orange"
        />
        <Metric
          label="Chưa đọc"
          value={String(data.metrics.unreadChats)}
          icon={Mail}
          color="purple"
        />
      </div>
      <div className="mt-7 grid gap-4 xl:grid-cols-2">
        {!latest.length && <Empty text="Chưa có khách nào nhắn Shoyru." />}
        {latest.map((item) => (
          <ChatCard key={String(item.sessionId)} item={item} reply={reply} />
        ))}
      </div>
    </section>
  );
}

function ChatCard({
  item,
  reply,
}: {
  item: Record<string, unknown>;
  reply: (sessionId: string, text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const sessionId = String(item.sessionId || "");
  return (
    <article className="rounded-2xl border border-[#e1e5e9] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <b>{String(item.name || "Bạn mới")}</b>
          <p className="text-xs text-[#8b949e]">
            Phiên {sessionId.slice(0, 8)}…
          </p>
        </div>
        {!item.read && (
          <span className="rounded-full bg-[#fff0e9] px-3 py-1 text-xs font-bold text-[#d95b2e]">
            Tin mới
          </span>
        )}
      </div>
      <p className="mt-4 rounded-xl bg-[#f4f6f8] p-4 text-sm leading-6 text-[#46515c]">
        {String(item.text || "")}
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && text.trim()) {
              reply(sessionId, text.trim());
              setText("");
            }
          }}
          placeholder="Trả lời với tư cách Shoyru…"
          className="min-w-0 flex-1 rounded-xl border border-[#dfe4e8] px-4 py-2.5 text-sm outline-none focus:border-[#ff6b35]"
        />
        <button
          onClick={() => {
            if (text.trim()) {
              reply(sessionId, text.trim());
              setText("");
            }
          }}
          className="rounded-xl bg-[#17202a] px-4 py-2.5 text-sm font-bold text-white"
        >
          Gửi
        </button>
      </div>
    </article>
  );
}

function Channels({ channels }: { channels: Overview["channels"] }) {
  return (
    <SectionTitle
      eyebrow="DISTRIBUTION"
      title="Kênh bán và tiếp cận"
      text="Shoyru chỉ có thể tự hành động trên kênh đã kết nối bằng API hợp lệ."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {channels.map((channel) => (
          <div
            key={channel.id}
            className="rounded-2xl border border-[#dfe4e8] bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1f3f5]">
                <Globe2 size={19} />
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${channel.status === "connected" ? "bg-[#eaf8ef] text-[#25864b]" : "bg-[#fff3e8] text-[#a86120]"}`}
              >
                {channel.status === "connected" ? "ĐÃ KẾT NỐI" : "CHƯA KẾT NỐI"}
              </span>
            </div>
            <h3 className="mt-5 font-black">{channel.name}</h3>
            <p className="mt-1 text-sm leading-6 text-[#77818b]">
              {channel.detail}
            </p>
          </div>
        ))}
      </div>
    </SectionTitle>
  );
}

function AiHealth({ providers }: { providers: Overview["aiHealth"] }) {
  const labels: Record<string, string> = {
    healthy: "Ổn định",
    degraded: "Có lỗi",
    cooldown: "Đang tạm nghỉ",
  };
  return (
    <SectionTitle
      eyebrow="HẠ TẦNG AI"
      title="Sức khỏe bộ não Shoyru"
      text="Nguồn lỗi ba lần liên tiếp sẽ tạm nghỉ 20 phút trước khi thử lại."
    >
      {providers.length === 0 ? (
        <div className="rounded-2xl border border-[#dfe4e8] bg-white">
          <Empty text="Chưa có lượt gọi AI nào sau khi bật theo dõi." />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {providers.map((provider) => {
            const success = Number(provider.totalSuccess || 0);
            const failure = Number(provider.totalFailure || 0);
            const total = success + failure;
            const rate = total ? Math.round((success / total) * 100) : 0;
            const healthy = provider.status === "healthy";
            const cooling = provider.status === "cooldown";
            return (
              <article key={provider.provider} className="rounded-2xl border border-[#dfe4e8] bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black capitalize">{provider.provider}</h2>
                    <p className="mt-1 truncate text-xs text-[#7b858f]">{provider.model || "Chưa ghi nhận model"}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${healthy ? "bg-[#eaf8ef] text-[#27854b]" : cooling ? "bg-[#fff0e9] text-[#d95628]" : "bg-[#fff6dc] text-[#9a6a12]"}`}>
                    {labels[provider.status || ""] || "Chưa rõ"}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  <AiStat label="Thành công" value={String(success)} />
                  <AiStat label="Tỷ lệ tốt" value={`${rate}%`} />
                  <AiStat label="Độ trễ" value={provider.lastLatencyMs ? `${provider.lastLatencyMs} ms` : "—"} />
                </div>
                {provider.lastError && (
                  <p className="mt-4 break-words rounded-xl bg-[#fff6f1] px-3 py-2 text-xs leading-5 text-[#9b4b2e]">
                    Lỗi gần nhất: {provider.lastError}
                  </p>
                )}
                <p className="mt-4 text-xs text-[#8b949e]">
                  {provider.consecutiveFailures || 0} lỗi liên tiếp
                  {provider.cooldownUntil ? ` · thử lại sau ${new Date(provider.cooldownUntil).toLocaleString("vi-VN")}` : ""}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </SectionTitle>
  );
}

function WorkLog({ runs }: { runs: AgentRun[] }) {
  return (
    <SectionTitle
      eyebrow="CÔNG VIỆC THỰC TẾ"
      title="Shoyru đã làm được gì?"
      text="Mỗi lượt ghi rõ việc đã làm, đầu ra, bước tiếp theo và nguồn AI thực hiện."
    >
      <div className="space-y-4">
        {runs.length === 0 && (
          <div className="rounded-2xl border border-[#dfe4e8] bg-white">
            <Empty text="Chưa có lượt làm việc nào." />
          </div>
        )}
        {runs.map((run) => (
          <article key={run._id} className="rounded-2xl border border-[#dfe4e8] bg-white p-5">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.12em] text-[#f2612c]">
                  {run.decision?.action?.type || "sinh hoạt"}
                </p>
                <h2 className="mt-2 text-lg font-black">{run.decision?.action?.title || run.decision?.status || "Một lượt của Shoyru"}</h2>
              </div>
              <p className="text-xs text-[#8b949e]">
                {run.createdAt ? new Date(run.createdAt).toLocaleString("vi-VN") : ""} · {run.provider || "hệ thống"}
              </p>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <WorkField label="Đã làm" value={run.workResult?.summary || run.decision?.action?.details || "Chưa có mô tả."} />
              <WorkField label="Kết quả" value={run.workResult?.artifact || "Chưa có đầu ra riêng."} />
              <WorkField label="Việc tiếp theo" value={run.workResult?.nextStep || "Chờ lượt kế tiếp."} />
            </div>
          </article>
        ))}
      </div>
    </SectionTitle>
  );
}

function WorkField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f6f7f8] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b949e]">{label}</p>
      <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-[#46515c]">{value}</p>
    </div>
  );
}

function AiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f4f6f8] p-3">
      <p className="text-sm font-black">{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-[#818b95]">{label}</p>
    </div>
  );
}

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 font-black ${dark ? "text-white" : "text-[#17202a]"}`}
    >
      <Image src="/shoyru-icon-192.png" alt="Logo Shoyru AI" width={40} height={40} className="rounded-xl bg-[#ff6b35]" />
      <span>
        Shoyru <span className="text-[#ff6b35]">OS</span>
      </span>
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "bg-[#eaf8ef] text-[#27854b]",
    blue: "bg-[#eaf2ff] text-[#2868b2]",
    orange: "bg-[#fff0e9] text-[#e65b29]",
    purple: "bg-[#f2ecff] text-[#7250b5]",
  };
  return (
    <div className="rounded-2xl border border-[#dfe4e8] bg-white p-5">
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${colors[color]}`}
      >
        <Icon size={19} />
      </div>
      <p className="mt-5 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs font-semibold text-[#828c96]">{label}</p>
    </div>
  );
}
function SectionTitle({
  eyebrow,
  title,
  text,
  children,
}: {
  eyebrow: string;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="text-xs font-bold tracking-[.15em] text-[#f2612c]">
        {eyebrow}
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
      <p className="mb-7 mt-2 text-sm text-[#77818b]">{text}</p>
      {children}
    </>
  );
}
function PanelHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf0f2] p-5">
      <h2 className="font-black">{title}</h2>
      <span className="rounded-full bg-[#f1f3f5] px-2.5 py-1 text-xs font-bold">
        {count}
      </span>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="p-10 text-center">
      <ShieldCheck className="mx-auto text-[#9aa3ad]" />
      <p className="mt-3 text-sm text-[#7b858f]">{text}</p>
    </div>
  );
}
