"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, ArrowUpRight, Briefcase, Send } from "lucide-react";

/**
 * MONACO-PARITY-04 surface — companies that just visited the
 * marketing site and resolved (via Snitcher) to an A/B-grade TAM
 * account. Same speed-to-lead philosophy as hot-inbounds but
 * triggered by browsing intent rather than form submissions.
 *
 * The widget hides itself when there are no items, so the dashboard
 * never carries empty-state padding for tenants without the pixel
 * installed.
 */
interface HotVisitor {
  visitorId: string;
  companyId: string | null;
  companyName: string | null;
  companyDomain: string | null;
  companyScore: number | null;
  lastUrl: string | null;
  lastVisitAt: string;
  visitCount: number;
  /** P0-2 task 2.4 — operational state the founder needs to know
   *  whether the system is already on it. */
  openDeal: { id: string; name: string; stage: string } | null;
  activeEnrollments: number;
}

function relativeTime(iso: string): string {
  const dt = new Date(iso).getTime();
  if (!Number.isFinite(dt)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - dt) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function pathFromUrl(raw: string | null): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.pathname + (u.search ? u.search : "");
  } catch {
    return raw;
  }
}

export function HotVisitorsWidget() {
  const [items, setItems] = useState<HotVisitor[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/hot-visitors?days=7&limit=10");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { items: HotVisitor[] };
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

  // Render nothing until we KNOW there's something to show. This widget
  // resolves to empty for any tenant without the visitor pixel installed
  // (the steady state), so a loading skeleton would flash a placeholder card
  // above the dashboard greeting on every load and then collapse to nothing —
  // empty-state padding the docstring above promises never to carry. A real
  // hot-visitor card just pops in when the fetch lands.
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
          <Eye size={14} style={{ color: "var(--color-accent, #6366f1)" }} />
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Hot visitors
          </h3>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              background: "var(--color-accent-soft, rgba(99,102,241,0.10))",
              color: "var(--color-accent, #6366f1)",
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
        {items.map((v) => {
          const href = v.companyId ? `/accounts/${v.companyId}` : "#";
          // P0-2 follow-up : when nobody is working this account
          // (no open deal AND no active enrollment), surface inline
          // "Create deal" + "Add to sequence" CTAs so the founder
          // can act without leaving the dashboard.
          const showActionRow =
            !!v.companyId && !v.openDeal && v.activeEnrollments === 0;
          return (
            <li
              key={`${v.visitorId}-${v.companyId}`}
              className="rounded-lg transition-colors hover:bg-[var(--color-bg-hover)]"
            >
              <Link
                href={href}
                className="flex items-center gap-3 px-2 py-2"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase"
                  style={{
                    background: "var(--color-accent-soft, rgba(99,102,241,0.10))",
                    color: "var(--color-accent, #6366f1)",
                  }}
                  aria-hidden
                >
                  {(v.companyName?.[0] ?? v.companyDomain?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="truncate text-[12px] font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {v.companyName ?? v.companyDomain ?? "Unknown"}
                    </span>
                    {v.visitCount > 1 && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{
                          background: "var(--color-bg-hover)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {v.visitCount} visits
                      </span>
                    )}
                  </div>
                  <div
                    className="truncate text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {pathFromUrl(v.lastUrl)}
                    {v.companyScore != null ? ` · score ${Math.round(v.companyScore)}` : ""}
                  </div>
                  {(v.openDeal || v.activeEnrollments > 0) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {v.openDeal && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                          style={{
                            background: "var(--color-success-soft, rgba(16,185,129,0.10))",
                            color: "var(--color-success, #059669)",
                            border: "1px solid rgba(16,185,129,0.25)",
                          }}
                          title={`Open deal in ${v.openDeal.stage}`}
                        >
                          Open deal · {v.openDeal.stage}
                        </span>
                      )}
                      {v.activeEnrollments > 0 && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            background: "var(--color-accent-soft, rgba(99,102,241,0.10))",
                            color: "var(--color-accent, #6366f1)",
                            border: "1px solid rgba(99,102,241,0.25)",
                          }}
                          title="Contacts at this company are active in a sequence"
                        >
                          {v.activeEnrollments} in sequence
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div
                  className="flex shrink-0 items-center gap-1 text-[11px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  <span>{relativeTime(v.lastVisitAt)}</span>
                  <ArrowUpRight size={11} />
                </div>
              </Link>
              {showActionRow && (
                <div
                  className="flex flex-wrap items-center gap-1.5 px-2 pb-2 pl-12"
                  // pl-12 indents past the avatar circle so the CTAs
                  // visually align under the company info, not the
                  // avatar — keeps the row's reading rhythm.
                >
                  <Link
                    href={`/opportunities?companyId=${encodeURIComponent(v.companyId!)}&action=new`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: "var(--color-bg-card)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                    title="Create a deal for this account"
                  >
                    <Briefcase size={10} aria-hidden /> Create deal
                  </Link>
                  <Link
                    href={`/sequences?companyId=${encodeURIComponent(v.companyId!)}&action=enroll`}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: "var(--color-bg-card)",
                      color: "var(--color-text-secondary)",
                      border: "1px solid var(--color-border-default)",
                    }}
                    title="Pick a sequence to enroll a contact at this account"
                  >
                    <Send size={10} aria-hidden /> Add to sequence
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
