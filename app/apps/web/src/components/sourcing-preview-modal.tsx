"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, AlertTriangle, Mail, MailX } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface PreviewAccount {
  accountId: string;
  name: string;
  domain: string | null;
  score: number | null;
  grade: string | null;
  inIcp: boolean;
  hasDomain: boolean;
}
interface PreviewSummary {
  total: number;
  inIcp: number;
  outIcp: number;
  noDomain: number;
  unscored: number;
}
interface SamplePerson {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  seniority: string | null;
  hasEmail: boolean;
}
interface PreviewSample {
  accountId: string;
  name: string;
  totalFound: number;
  people: SamplePerson[];
}
interface PreviewData {
  targeting: { titles: string[]; seniorities: string[]; source: string };
  summary: PreviewSummary;
  accounts: PreviewAccount[];
  samples: PreviewSample[];
  apolloAvailable: boolean;
}

/** "c_suite" → "C suite", "head_of_hr" → "Head of hr". Provider enums are
 *  snake_case; show them readable, never a raw token. */
function pretty(s: string): string {
  const t = s.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function Chip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" }) {
  const bg =
    tone === "good" ? "rgba(34,197,94,0.12)" : tone === "warn" ? "rgba(217,119,6,0.12)" : "var(--color-bg-hover)";
  const color =
    tone === "good" ? "#16a34a" : tone === "warn" ? "var(--color-warning, #d97706)" : "var(--color-text-secondary)";
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

export function SourcingPreviewModal({
  open,
  accountIds,
  onConfirm,
  onClose,
}: {
  open: boolean;
  accountIds: string[];
  onConfirm: (keptIds: string[]) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setError(null);
    setRemoved(new Set());
    fetch("/api/accounts/extract-contacts/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((d as { error?: string })?.error || `HTTP ${r.status}`);
        return d as PreviewData;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Pre-remove out-of-ICP accounts so "don't go anywhere" is the default,
        // but leave them visible + re-addable (the chosen UX).
        setRemoved(new Set(d.accounts.filter((a) => a.score !== null && !a.inIcp).map((a) => a.accountId)));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Preview failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, accountIds]);

  const toggleRemoved = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const keptIds = (data?.accounts ?? [])
    .filter((a) => a.hasDomain && !removed.has(a.accountId))
    .map((a) => a.accountId);

  const footer = (
    <>
      <Button variant="outline" size="sm" onClick={onClose}>
        Cancel
      </Button>
      <Button size="sm" disabled={loading || !!error || keptIds.length === 0} onClick={() => onConfirm(keptIds)}>
        <UserPlus size={13} /> Source {keptIds.length} account{keptIds.length === 1 ? "" : "s"}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title="Before sourcing contacts" size="lg" footer={footer}>
      {loading && (
        <div className="flex items-center gap-2 py-6 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={14} className="animate-spin" /> Checking your selection against your ICP…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 py-4 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
          <AlertTriangle size={14} style={{ color: "var(--color-warning, #d97706)" }} />
          <span>Couldn&apos;t preview: {error}</span>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Targeting — the heart of the ask: exactly what will be searched. */}
          <section>
            <div className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Targeted search — from your ICP
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {data.targeting.titles.length === 0 && data.targeting.seniorities.length === 0 ? (
                <span className="text-[12px]" style={{ color: "var(--color-warning, #d97706)" }}>
                  No titles or seniorities targeted — configure your ICP, or the search runs too broad.
                </span>
              ) : (
                <>
                  {data.targeting.titles.map((t) => (
                    <Chip key={`t-${t}`} label={pretty(t)} tone="neutral" />
                  ))}
                  {data.targeting.seniorities.map((s) => (
                    <Chip key={`s-${s}`} label={pretty(s)} tone="neutral" />
                  ))}
                </>
              )}
            </div>
          </section>

          {/* Summary chips */}
          <section className="flex flex-wrap gap-1.5">
            <Chip label={`${data.summary.inIcp} in ICP`} tone="good" />
            {data.summary.outIcp > 0 && <Chip label={`${data.summary.outIcp} out of ICP`} tone="warn" />}
            {data.summary.noDomain > 0 && <Chip label={`${data.summary.noDomain} no domain`} tone="warn" />}
            {data.summary.unscored > 0 && <Chip label={`${data.summary.unscored} unscored`} tone="neutral" />}
          </section>

          {/* Live Apollo sample for the top accounts */}
          {data.samples.length > 0 && (
            <section>
              <div className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Preview — who will be found (live sample)
              </div>
              <div className="mt-1.5 space-y-2">
                {data.samples.map((s) => (
                  <div key={s.accountId} className="rounded-md p-2.5" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                    <div className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {s.name} · <span style={{ color: "var(--color-text-tertiary)" }}>{s.totalFound} match{s.totalFound === 1 ? "" : "es"}</span>
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {s.people.map((p, i) => (
                        <li key={i} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                          {p.hasEmail ? (
                            <Mail size={10} style={{ color: "#16a34a" }} />
                          ) : (
                            <MailX size={10} style={{ color: "var(--color-text-tertiary)" }} />
                          )}
                          <span>{[p.firstName, p.lastName].filter(Boolean).join(" ") || "—"}</span>
                          {p.title && <span style={{ color: "var(--color-text-tertiary)" }}>· {p.title}</span>}
                        </li>
                      ))}
                      {s.people.length === 0 && (
                        <li className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>No contact matches the targeting.</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Accounts — out-of-ICP flagged + removable (pre-removed by default) */}
          <section>
            <div className="text-[12px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Accounts ({keptIds.length} kept)
            </div>
            <div className="mt-1.5 max-h-52 space-y-1 overflow-y-auto">
              {data.accounts.map((a) => {
                const isRemoved = removed.has(a.accountId) || !a.hasDomain;
                const tone = !a.hasDomain ? "warn" : a.inIcp ? "good" : a.score === null ? "neutral" : "warn";
                return (
                  <div
                    key={a.accountId}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
                    style={{ background: "var(--color-bg-page)", opacity: isRemoved ? 0.5 : 1 }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[12px]" style={{ color: "var(--color-text-primary)", textDecoration: isRemoved ? "line-through" : "none" }}>
                        {a.name}
                      </span>
                      <Chip
                        label={!a.hasDomain ? "no domain" : a.grade ? `ICP ${a.grade}` : "unscored"}
                        tone={tone as "neutral" | "good" | "warn"}
                      />
                    </div>
                    {a.hasDomain && (
                      <button
                        type="button"
                        onClick={() => toggleRemoved(a.accountId)}
                        className="shrink-0 text-[11px] hover:underline"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {removed.has(a.accountId) ? "Re-add" : "Remove"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
