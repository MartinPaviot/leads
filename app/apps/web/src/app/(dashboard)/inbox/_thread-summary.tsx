"use client";

/**
 * On-demand thread summary (INBOX-S01/S08) in the reading pane. Fetched only
 * when the user clicks "Summarize thread" — opening a conversation spends no
 * token. Renders the TL;DR + key points + which messages it cited. Fail-soft.
 */

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceLink } from "@/components/ai-ui";

interface ThreadSummary {
  tldr: string;
  keyPoints: string[];
  citations: number[];
}

export function ThreadSummarySection({ conversationKey }: { conversationKey: string }) {
  const [data, setData] = useState<ThreadSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const r = await fetch("/api/inbox/conversations/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey }),
      });
      setData(r.ok ? (((await r.json()) as { summary: ThreadSummary }).summary ?? null) : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setDone(true);
    }
  }

  if (!done) {
    return (
      <div className="mb-3">
        <Button size="sm" variant="outline" onClick={() => void run()} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? "Summarizing…" : "Summarize thread"}
        </Button>
      </div>
    );
  }

  if (!data || (!data.tldr && data.keyPoints.length === 0)) {
    return (
      <div className="mb-3 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        No summary available for this thread.
      </div>
    );
  }

  return (
    <div
      className="mb-3 rounded-lg border p-3"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
        <Sparkles size={12} /> Thread summary
      </span>
      {data.tldr && (
        <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--color-text-primary)" }}>
          {data.tldr}
        </p>
      )}
      {data.keyPoints.length > 0 && (
        <ul className="mt-1.5 list-inside list-disc space-y-0.5">
          {data.keyPoints.map((k, i) => (
            <li key={i} className="text-[12px] leading-snug" style={{ color: "var(--color-text-secondary)" }}>
              {k}
            </li>
          ))}
        </ul>
      )}
      {data.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
            From
          </span>
          {data.citations.map((c) => (
            <SourceLink key={c} kind="email" label={`Message #${c + 1}`} href={`#thread-msg-${c}`} />
          ))}
        </div>
      )}
    </div>
  );
}
