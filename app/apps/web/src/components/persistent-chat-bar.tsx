"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

export function PersistentChatBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Don't show on the chat page (it has its own input)
  if (pathname === "/chat" || pathname?.startsWith("/chat?")) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/chat?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
  }

  return (
    <div
      className="flex shrink-0 items-center gap-2 px-4 py-2"
      style={{
        borderTop: "0.5px solid var(--color-border-default)",
        background: "var(--color-bg-surface)",
      }}
    >
      <Sparkles size={14} style={{ color: "var(--color-accent)", opacity: 0.7 }} />
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask LeadSens..."
          className="w-full bg-transparent text-[13px] outline-none"
          style={{
            color: "var(--color-text-primary)",
          }}
        />
      </form>
    </div>
  );
}
