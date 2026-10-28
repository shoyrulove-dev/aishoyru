"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";

function visitorId() {
  let value = localStorage.getItem("shoyru_visitor_id");
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem("shoyru_visitor_id", value);
  }
  return value;
}

export function ShareActions({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const absolute = url.startsWith("http") ? url : `https://shoyruai.blissbiovn.com${url}`;
  const tracked = `${absolute}${absolute.includes("?") ? "&" : "?"}utm_source=share&utm_medium=organic&utm_campaign=shoyru`;

  function track(channel: string) {
    fetch("/api/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: visitorId(),
        type: "share_click",
        path: location.pathname,
        utmSource: channel,
      }),
    }).catch(() => {});
  }

  async function copy() {
    await navigator.clipboard.writeText(tracked);
    track("copy");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const button = "inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2.5 text-sm font-bold transition hover:border-[#ff9a55]/60 hover:bg-white/5";
  return (
    <div className="flex flex-wrap gap-2">
      <a
        className={button}
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tracked)}`}
        target="_blank"
        rel="noreferrer"
        onClick={() => track("facebook")}
      >
        <Share2 size={16} /> Facebook
      </a>
      <a
        className={button}
        href={`https://zalo.me/share?url=${encodeURIComponent(tracked)}&title=${encodeURIComponent(title)}`}
        target="_blank"
        rel="noreferrer"
        onClick={() => track("zalo")}
      >
        <Share2 size={16} /> Zalo
      </a>
      <button className={button} onClick={copy} type="button">
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "Đã chép link" : "Sao chép link"}
      </button>
    </div>
  );
}

export function FreeDownloadButton() {
  function download() {
    fetch("/api/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: visitorId(),
        type: "free_download",
        path: location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  }
  return (
    <a
      href="/api/free-starter"
      onClick={download}
      className="rounded-xl bg-[#ff6b35] px-6 py-3.5 font-black text-white"
    >
      Tải Starter Mini miễn phí ↓
    </a>
  );
}
