"use client";

import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useState } from "react";

type ChatMessage = { role: "visitor" | "shoyru"; text: string };

function sessionId() {
  let value = localStorage.getItem("shoyru_visitor_id");
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem("shoyru_visitor_id", value);
  }
  return value;
}

export function VisitorChat() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "shoyru",
      text: "Chào bạn, mình là Shoyru. Bạn muốn hỏi chuyện hay góp ý cho mình?",
    },
  ]);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const track = (type: "page_view" | "presence") => fetch("/api/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId(),
        type,
        path: location.pathname,
        ...(type === "page_view"
          ? {
              referrer: document.referrer || undefined,
              utmSource: query.get("utm_source") || undefined,
              utmMedium: query.get("utm_medium") || undefined,
              utmCampaign: query.get("utm_campaign") || undefined,
            }
          : {}),
      }),
    }).catch(() => {});
    track("page_view");
    track("presence");
    const chatTimer = setInterval(() => {
      fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId())}`)
        .then((response) => response.json())
        .then((data) => data.messages?.length && setMessages(data.messages))
        .catch(() => {});
    }, 10000);
    const presenceTimer = setInterval(() => track("presence"), 30000);
    return () => {
      clearInterval(chatTimer);
      clearInterval(presenceTimer);
    };
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next)
      fetch("/api/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionId(),
          type: "chat_open",
          path: location.pathname,
        }),
      }).catch(() => {});
  }

  async function send() {
    const value = text.trim();
    if (!value || busy) return;
    setMessages((items) => [...items, { role: "visitor", text: value }]);
    setText("");
    setBusy(true);
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionId(),
        name: name.trim() || "Bạn mới",
        text: value,
      }),
    });
    const data = await response.json();
    setBusy(false);
    setMessages((items) => [
      ...items,
      {
        role: "shoyru",
        text: data.reply || data.error || "Mình chưa trả lời được lúc này.",
      },
    ]);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <section className="mb-3 flex h-[min(560px,75vh)] w-[min(390px,calc(100vw-40px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#10161c] shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 bg-[#18222d] px-5 py-4">
            <div>
              <b>Trò chuyện với Shoyru</b>
              <p className="text-xs text-[#72d78a]">● đang ở trong hang</p>
            </div>
            <button onClick={toggle} aria-label="Đóng">
              <X size={20} />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === "visitor" ? "justify-end" : "justify-start"}`}
              >
                <p
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "visitor" ? "bg-[#ff6b35] text-white" : "bg-[#202b36] text-[#e7e2da]"}`}
                >
                  {message.text}
                </p>
              </div>
            ))}
            {busy && (
              <p className="text-xs text-[#8e98a3]">Shoyru đang trả lời…</p>
            )}
          </div>
          <div className="border-t border-white/10 p-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tên của bạn (không bắt buộc)"
              className="mb-2 w-full rounded-xl bg-white/7 px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="Nhắn Shoyru…"
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-xl bg-white/7 px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={send}
                disabled={busy || !text.trim()}
                className="grid w-12 place-items-center rounded-xl bg-[#ff6b35] disabled:opacity-40"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="mt-2 text-[10px] text-[#77818b]">
              Không gửi mật khẩu, OTP hoặc thông tin ngân hàng.
            </p>
          </div>
        </section>
      )}
      <button
        onClick={toggle}
        className="ml-auto grid h-14 w-14 place-items-center rounded-full bg-[#ff6b35] text-white shadow-xl"
        aria-label="Trò chuyện với Shoyru"
      >
        {open ? <X /> : <MessageCircle />}
      </button>
    </div>
  );
}
