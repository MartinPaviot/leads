"use client";

/**
 * Ask about this thread (INBOX-Q07) — on-demand Q&A grounded in the open thread,
 * with citations. The self-contained slice; the dock-pinned, CRM-grounded version
 * is the follow-up. Fetched only when the user asks (opening a thread spends no
 * token). Fail-soft: a model/route error reads as "couldn't find that".
 */

import { useState } from "react";
import { Sparkles, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SourceLink } from "@/components/ai-ui";

interface ThreadAnswer {
  answer: string;
  citations: number[];
  answered: boolean;
}

interface InboxAnswer {
  answer: string;
  citations: Array<{ key: string; subject: string }>;
  answered: boolean;
}

export function ThreadAskSection({ conversationKey }: { conversationKey: string }) {
  const [question, setQuestion] = useState("");
  const [data, setData] = useState<ThreadAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  // Whole-inbox escalation (INBOX-Q02) when the thread can't answer.
  const [inboxData, setInboxData] = useState<InboxAnswer | null>(null);
  const [inboxLoading, setInboxLoading] = useState(false);

  async function run() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setInboxData(null);
    try {
      const r = await fetch("/api/inbox/conversations/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: conversationKey, question: q }),
      });
      setData(r.ok ? (((await r.json()) as { result: ThreadAnswer }).result ?? null) : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function runInbox() {
    const q = question.trim();
    if (!q || inboxLoading) return;
    setInboxLoading(true);
    try {
      const r = await fetch("/api/inbox/ask-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      setInboxData(r.ok ? (((await r.json()) as { result: InboxAnswer }).result ?? null) : null);
    } catch {
      setInboxData(null);
    } finally {
      setInboxLoading(false);
    }
  }

  return (
    <div
      className="mb-3 rounded-lg border p-3"
      style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
    >
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        <Sparkles size={12} /> Ask about this thread
      </span>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="What are they actually asking for?"
          className="min-w-0 flex-1 rounded-md border px-2 py-1 text-[12px] outline-none"
          style={{
            borderColor: "var(--color-border-default)",
            background: "var(--color-bg-page)",
            color: "var(--color-text-primary)",
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void run()}
          disabled={loading || !question.trim()}
          className="shrink-0 gap-1.5"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? "Asking…" : "Ask"}
        </Button>
      </div>

      {data && !loading && (
        <div className="mt-2">
          {data.answer && (
            <p className="text-[12px] leading-snug" style={{ color: "var(--color-text-primary)" }}>
              {data.answer}
            </p>
          )}
          {data.answered && data.citations.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>From</span>
              {data.citations.map((c) => (
                <SourceLink key={c} kind="email" label={`Message #${c + 1}`} href={`#thread-msg-${c}`} />
              ))}
              <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>· via Elevay</span>
            </div>
          )}
          {!data.answered && (
            <div className="mt-1.5">
              <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                Not answered by this thread.
              </p>
              {!inboxData && (
                <button
                  type="button"
                  onClick={() => void runInbox()}
                  disabled={inboxLoading}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: "var(--color-accent)" }}
                >
                  {inboxLoading ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  {inboxLoading ? "Searching your inbox…" : "Search across your whole inbox"}
                </button>
              )}
            </div>
          )}

          {inboxData && (
            <div
              className="mt-2 rounded-md border p-2"
              style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-page)" }}
            >
              <span
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: "var(--color-text-muted)" }}
              >
                Across your inbox
              </span>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--color-text-primary)" }}>
                {inboxData.answered
                  ? inboxData.answer
                  : "I couldn't find that anywhere in your inbox."}
              </p>
              {inboxData.answered && inboxData.citations.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {inboxData.citations.map((c) => (
                    <SourceLink
                      key={c.key}
                      kind="email"
                      label={c.subject || "Thread"}
                      href={`/inbox?conversation=${encodeURIComponent(c.key)}`}
                    />
                  ))}
                  <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>· via Elevay</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
