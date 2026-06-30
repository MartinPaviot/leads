"use client";

/**
 * /outbound-mode — the "Outbound du jour" cockpit (P1-15).
 *
 * Renders the single priority-ordered queue from GET /api/outbound/queue:
 * replies first (a prospect answered), then due/upcoming sequence touches,
 * then drafts to approve ranked by qualityScore. One list, colour-coded by
 * kind, each row linking to where the founder acts. The immersive 3-column
 * call-mode-style UI is the follow-up build; this ships the working order.
 */

import { useEffect, useState } from "react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";

type QueueItemKind = "reply" | "reminder" | "draft";

interface QueueItem {
  kind: QueueItemKind;
  id: string;
  qualityScore?: number | null;
  dueAt?: string | null;
  title: string;
  subtitle: string;
  href: string;
}

interface QueueResponse {
  items: QueueItem[];
  counts: { replies: number; reminders: number; drafts: number; total: number };
  generatedAt: string;
}

const KIND_LABEL: Record<QueueItemKind, string> = {
  reply: "Reply",
  reminder: "Touch",
  draft: "Draft",
};

// Dots, not emoji (feedback_no-emoji-in-ui). Hue communicates urgency band.
const KIND_DOT: Record<QueueItemKind, string> = {
  reply: "#16a34a", // green — a human answered
  reminder: "#d97706", // amber — time-bound
  draft: "#2563eb", // blue — to review
};

function qualityBadge(score: number | null | undefined): { label: string; color: string } | null {
  if (score == null) return { label: "unscored", color: "var(--color-text-tertiary)" };
  const pct = Math.round(score * 100);
  if (score >= 0.9) return { label: `${pct}`, color: "#16a34a" };
  if (score >= 0.7) return { label: `${pct}`, color: "#2563eb" };
  if (score >= 0.5) return { label: `${pct}`, color: "#d97706" };
  return { label: `${pct}`, color: "#dc2626" };
}

export default function OutboundModePage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/outbound/queue");
        if (!res.ok) {
          throw new Error(`Failed to load queue (${res.status})`);
        }
        const json = (await res.json()) as QueueResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-4">
        <Breadcrumbs items={[{ label: "Outbound" }, { label: "Outbound du jour" }]} />
        <h1 className="mt-2 text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Outbound du jour
        </h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
          One ordered queue: replies first, then due sequence touches, then drafts to approve
          ranked by quality. Work it top to bottom.
        </p>
        {data && (
          <div className="mt-3 flex gap-4 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            <span>
              <strong style={{ color: "var(--color-text-primary)" }}>{data.counts.replies}</strong> replies
            </span>
            <span>
              <strong style={{ color: "var(--color-text-primary)" }}>{data.counts.reminders}</strong> touches
            </span>
            <span>
              <strong style={{ color: "var(--color-text-primary)" }}>{data.counts.drafts}</strong> drafts
            </span>
          </div>
        )}
      </div>

      <div
        className="mt-4 flex-1 overflow-y-auto border-t px-6 py-4"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        {loading && (
          <ul className="flex flex-col gap-2" aria-hidden>
            {[68, 80, 56, 72, 60].map((titleW, i) => (
              <li key={i}>
                <div
                  className="flex items-center gap-3 rounded-lg border px-4 py-3"
                  style={{
                    borderColor: "var(--color-border-default)",
                    background: "var(--color-bg-card)",
                  }}
                >
                  <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                  <Skeleton className="h-2.5 w-[64px] shrink-0 rounded" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3 rounded" style={{ width: `${titleW}%` }} />
                    <Skeleton className="h-2.5 rounded" style={{ width: `${titleW - 22}%` }} />
                  </span>
                  <Skeleton className="h-4 w-8 shrink-0 rounded" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && !loading && (
          <p className="text-[13px]" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        {!loading && !error && data && data.items.length === 0 && (
          <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            Nothing in the queue — no replies, no due touches, no drafts to approve.
          </p>
        )}

        {!loading && !error && data && data.items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {data.items.map((item) => {
              const badge = item.kind === "draft" ? qualityBadge(item.qualityScore) : null;
              return (
                <li key={`${item.kind}:${item.id}`}>
                  <a
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors hover:opacity-90"
                    style={{
                      borderColor: "var(--color-border-default)",
                      background: "var(--color-bg-card)",
                    }}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: KIND_DOT[item.kind] }}
                      aria-hidden
                    />
                    <span
                      className="w-[64px] shrink-0 text-[11px] font-medium uppercase tracking-wide"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13px] font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {item.title}
                      </span>
                      <span
                        className="block truncate text-[12px]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {item.subtitle}
                      </span>
                    </span>
                    {badge && (
                      <span
                        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{ color: badge.color, border: `1px solid ${badge.color}` }}
                        title="Quality score (0–100)"
                      >
                        {badge.label}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
