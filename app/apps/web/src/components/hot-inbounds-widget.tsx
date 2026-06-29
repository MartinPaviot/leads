"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flame, ArrowUpRight, AlertCircle, X } from "lucide-react";

/**
 * Hot Inbounds Widget — surfaces newly-arrived demo-form leads who
 * scored as `hot` priority during qualification. Mirrors the
 * Monaco-equivalent "speed-to-lead" expectation: a hot inbound under 5
 * minutes converts ~9x higher than one under an hour, so the widget is
 * positioned for *immediate* visibility on the dashboard.
 *
 * Data shape comes from `/api/dashboard/hot-inbounds`. We hide the
 * widget entirely when the list is empty — empty-state padding on the
 * dashboard is more harmful than absence (signals "feature broken").
 */
interface HotInbound {
  notificationId: string;
  contactId: string | null;
  name: string;
  email: string | null;
  title: string | null;
  score: number | null;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  source: string;
  requiresManualMatch: boolean;
  submittedAt: string;
  read: boolean;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso).getTime();
  if (!Number.isFinite(dt)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - dt) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function HotInboundsWidget() {
  const [items, setItems] = useState<HotInbound[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/hot-inbounds?days=7&limit=10");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: HotInbound[] };
        if (!cancelled) setItems(data.items);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const markNotALead = async (item: HotInbound) => {
    if (!item.contactId) return;
    // Optimistic: drop the row. The human verdict overrides upstream stages
    // (see lib/inbound/lead-status.ts).
    setItems((prev) =>
      prev ? prev.filter((i) => i.notificationId !== item.notificationId) : prev,
    );
    try {
      await fetch(`/api/contacts/${item.contactId}/lead-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLead: false }),
      });
    } catch {
      /* optimistic — a later refresh re-derives the list */
    }
  };

  // Render nothing until we KNOW there's something to show — same reasoning as
  // HotVisitorsWidget: a self-hiding widget that resolves to empty for most
  // tenants must not flash a placeholder card above the greeting on every load.
  if (loading) return null;

  if (!items || items.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame size={14} style={{ color: "var(--color-warning, #d97706)" }} />
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Hot inbounds
          </h3>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: "rgba(217,119,6,0.10)",
              color: "var(--color-warning, #d97706)",
            }}
          >
            {items.length}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          Last 7 days
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const href = item.contactId ? `/contacts/${item.contactId}` : "#";
          return (
            <li key={item.notificationId} className="flex items-center gap-1">
              <Link
                href={href}
                className="flex flex-1 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--color-bg-hover)]"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase"
                  style={{
                    background: item.read
                      ? "var(--color-bg-hover)"
                      : "rgba(217,119,6,0.12)",
                    color: item.read
                      ? "var(--color-text-secondary)"
                      : "var(--color-warning, #d97706)",
                  }}
                  aria-hidden
                >
                  {(item.name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate text-[12px] font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {item.name}
                    </span>
                    {item.requiresManualMatch && (
                      <span
                        title="Personal email — match the right account manually"
                        className="inline-flex items-center"
                      >
                        <AlertCircle size={11} style={{ color: "var(--color-text-tertiary)" }} />
                      </span>
                    )}
                  </div>
                  <div
                    className="truncate text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {item.companyName ? `${item.companyName} · ` : ""}
                    {item.title ?? item.email ?? ""}
                    {item.score != null ? ` · score ${Math.round(item.score)}` : ""}
                  </div>
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 text-[11px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  <span>{relativeTime(item.submittedAt)}</span>
                  <ArrowUpRight size={11} />
                </div>
              </Link>
              {item.contactId && (
                <button
                  type="button"
                  onClick={() => void markNotALead(item)}
                  title="Not a lead — hide"
                  aria-label="Not a lead"
                  className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--color-bg-hover)]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  <X size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
