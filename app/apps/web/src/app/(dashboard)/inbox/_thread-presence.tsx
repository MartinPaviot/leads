"use client";

/**
 * Live thread presence (INBOX-X03). Heartbeats the open thread and polls who else
 * is on it, so a teammate sees "Ada is here" before they both reply. Best-effort
 * + self-cleaning: inert when nobody else is viewing or the table isn't migrated.
 */

import { useState, useEffect } from "react";
import { Eye } from "lucide-react";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/inbox/presence";

export function ThreadPresence({ conversationKey }: { conversationKey: string }) {
  const [summary, setSummary] = useState("");

  useEffect(() => {
    let cancelled = false;

    const beat = () => {
      fetch("/api/inbox/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey }),
      }).catch(() => {});
    };
    const poll = () => {
      fetch(`/api/inbox/presence?key=${encodeURIComponent(conversationKey)}`)
        .then((r) => (r.ok ? r.json() : { summary: "" }))
        .then((d: { summary?: string }) => {
          if (!cancelled) setSummary(d.summary || "");
        })
        .catch(() => {});
    };

    setSummary("");
    beat();
    poll();
    const id = setInterval(() => {
      beat();
      poll();
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [conversationKey]);

  if (!summary) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: "var(--color-warning-soft, var(--color-accent-soft))", color: "var(--color-warning, var(--color-accent))" }}
      title="Someone else is on this conversation"
    >
      <Eye size={11} className="shrink-0" />
      {summary}
    </span>
  );
}
