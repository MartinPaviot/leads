"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles, Send } from "lucide-react";

export function PersistentChatBar({ forceShow }: { forceShow?: boolean } = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  if (!forceShow) {
    // Only show on Up Next (/) — hide on Chat page which has its own input
    const isUpNext = pathname === "/" || pathname === "/home";
    if (!isUpNext) return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
  }

  return (
    <div className="relative px-4 pb-3 pt-2">
      {/* Fade gradient — messages dissolve behind the input */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-full h-8"
        style={{
          background: "linear-gradient(to bottom, transparent, var(--color-bg-base))",
        }}
      />
      <form onSubmit={handleSubmit} className="relative mx-auto max-w-2xl">
        <Sparkles
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--color-text-tertiary)" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask Elevay..."
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
