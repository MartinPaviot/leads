/**
 * P1-11 — freshness gate for NON-URL volatile facts (funding, headcount). The
 * citation gate re-verifies URLs; a funding/headcount figure has no URL to HEAD,
 * so it goes stale silently. This recalls a draft whose volatile facts are older
 * than the brief-freshness TTL. Pure.
 *
 * Fail-open when the brief date is unknown (null) — we never recall on a fact we
 * can't date.
 */

const FACT_FRESHNESS_TTL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const VOLATILE_KINDS = new Set(["funding", "headcount"]);

export function isVolatileSource(s: { kind?: unknown } | null | undefined): boolean {
  return !!s && typeof s.kind === "string" && VOLATILE_KINDS.has(s.kind);
}

export function decideFreshnessGate(
  sources: Array<{ kind?: unknown }>,
  briefGeneratedAt: Date | null,
  now: Date,
): { ok: true } | { ok: false; reviewReason: string; staleKinds: string[] } {
  const volatile = (sources ?? []).filter(isVolatileSource);
  if (volatile.length === 0) return { ok: true };
  if (!briefGeneratedAt) return { ok: true }; // can't date it → don't recall (R4.3)

  const ageDays = (now.getTime() - briefGeneratedAt.getTime()) / DAY_MS;
  if (ageDays <= FACT_FRESHNESS_TTL_DAYS) return { ok: true };

  const staleKinds = [...new Set(volatile.map((s) => String((s as { kind: string }).kind)))];
  return {
    ok: false,
    staleKinds,
    reviewReason:
      `Time-sensitive facts (${staleKinds.join(", ")}) are ${Math.floor(ageDays)} days old ` +
      `(> ${FACT_FRESHNESS_TTL_DAYS}d) — re-research before sending so you don't cite stale numbers.`,
  };
}
