"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw, Ban, Check, X, Loader2, Inbox } from "lucide-react";

interface Proposal {
  id: string;
  kind: "add" | "refresh" | "exclude" | string;
  status: string;
  summary: string | null;
  reason: string | null;
  source: string | null;
  payload: Record<string, unknown> | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string | null;
}

const KIND_META: Record<
  string,
  { label: string; icon: React.ReactNode; tint: string }
> = {
  add: { label: "Add", icon: <Plus size={13} />, tint: "var(--color-accent)" },
  refresh: { label: "Refresh", icon: <RotateCcw size={13} />, tint: "var(--color-text-secondary)" },
  exclude: { label: "Exclude", icon: <Ban size={13} />, tint: "var(--color-error, #b91c1c)" },
};

/**
 * TAM proposal review — the human-in-the-loop surface for the living TAM.
 * The loops propose add / refresh / exclude changes here; nothing is
 * applied (or spends enrichment credits) until approved.
 */
export default function TamReviewPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/tam/proposals?status=pending&limit=200");
      if (!res.ok) {
        // Used to silently return, leaving the "No pending proposals" empty
        // state — a 500 looked identical to a genuinely empty review queue.
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setProposals(data.proposals ?? []);
      setCounts(data.counts ?? {});
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = useCallback(
    async (action: "approve" | "reject", ids?: string[], all?: boolean) => {
      setBusy(all ? `all:${action}` : (ids?.[0] ?? action));
      setNote(null);
      try {
        const res = await fetch("/api/tam/proposals/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(all ? { all: true, action } : { ids, action }),
        });
        if (!res.ok) {
          setNote("Action failed.");
          return;
        }
        const r = await res.json();
        setNote(
          action === "approve"
            ? `Approved ${r.approved}${r.failed ? `, ${r.failed} failed` : ""}.`
            : `Rejected ${r.rejected}.`,
        );
        await load();
      } catch {
        setNote("Action failed.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const pending = counts.pending ?? proposals.length;

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-page)" }}>
      <div
        className="flex items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <div className="flex items-center gap-2">
          <Inbox size={16} style={{ color: "var(--color-text-secondary)" }} />
          <span className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            TAM proposals
          </span>
          <span className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            {pending} pending
          </span>
        </div>
        {proposals.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Check size={13} />}
              disabled={busy !== null}
              onClick={() => decide("approve", undefined, true)}
            >
              Approve all
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<X size={13} />}
              disabled={busy !== null}
              onClick={() => decide("reject", undefined, true)}
            >
              Reject all
            </Button>
          </div>
        )}
      </div>

      {note && (
        <div
          className="px-5 py-2 text-[13px]"
          style={{ color: "var(--color-text-secondary)", background: "var(--color-bg-card)" }}
        >
          {note}
        </div>
      )}

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Loader2 size={14} className="animate-spin" /> Loading proposals…
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="mx-auto mt-16 max-w-md rounded-lg border p-8 text-center"
            style={{ borderColor: "var(--color-error, #b91c1c)", color: "var(--color-text-secondary)" }}
          >
            <Ban size={24} className="mx-auto mb-3" style={{ color: "var(--color-error, #b91c1c)" }} />
            <div className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              Couldn&apos;t load proposals
            </div>
            <div className="mt-1 text-[13px]">
              Something went wrong fetching the review queue. This is not an empty
              queue.
            </div>
            <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={load} className="mt-4">
              Retry
            </Button>
          </div>
        ) : proposals.length === 0 ? (
          <div
            className="mx-auto mt-16 max-w-md rounded-lg border p-8 text-center"
            style={{ borderColor: "var(--color-border-default)", color: "var(--color-text-secondary)" }}
          >
            <Inbox size={24} className="mx-auto mb-3" style={{ color: "var(--color-text-tertiary)" }} />
            <div className="text-[14px] font-medium" style={{ color: "var(--color-text-primary)" }}>
              No pending proposals
            </div>
            <div className="mt-1 text-[13px]">
              The living-TAM loops will surface net-new accounts, stale rows to
              refresh, and anti-ICP exclusions here for your approval.
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => {
              const meta = KIND_META[p.kind] ?? {
                label: p.kind,
                icon: null,
                tint: "var(--color-text-secondary)",
              };
              const rowBusy = busy === p.id;
              return (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2.5"
                  style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}
                >
                  <span
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                    style={{ color: meta.tint, border: `1px solid var(--color-border-default)` }}
                  >
                    {meta.icon}
                    {meta.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]" style={{ color: "var(--color-text-primary)" }}>
                      {p.summary || describeProposal(p)}
                    </div>
                    {(p.reason || p.source) && (
                      <div className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {[p.reason, p.source].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={rowBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      disabled={busy !== null}
                      onClick={() => decide("approve", [p.id])}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<X size={13} />}
                      disabled={busy !== null}
                      onClick={() => decide("reject", [p.id])}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function describeProposal(p: Proposal): string {
  const payload = p.payload ?? {};
  if (p.kind === "add") {
    return (payload.name as string) || (payload.domain as string) || "New account";
  }
  if (p.kind === "refresh") return `Refresh ${p.entityType ?? "record"}`;
  if (p.kind === "exclude") return `Exclude ${p.entityType ?? "record"}`;
  return p.kind;
}
