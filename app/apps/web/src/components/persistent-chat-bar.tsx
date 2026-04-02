"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Send } from "lucide-react";

export function PersistentChatBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  if (pathname === "/chat" || pathname?.startsWith("/chat?")) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
  }

  return (
    <div className="px-4 pb-3 pt-2" style={{ borderTop: "1px solid var(--color-border-default)" }}>
      <form onSubmit={handleSubmit} className="relative mx-auto max-w-2xl">
        <Sparkles
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-text-tertiary)" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask LeadSens..."
          className="w-full rounded-xl py-2.5 pl-10 pr-10 text-[14px] outline-none transition-all"
          style={{
            background: "var(--color-bg-card)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-default)",
            boxShadow: "var(--shadow-card)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-border-focus)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--color-border-default)"; }}
        />
        {query.trim() && (
          <button
            type="submit"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md"
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            <Send size={13} />
          </button>
        )}
      </form>
    </div>
  );
}
