/**
 * P0-4 — pre-send spam gate. A FAIL-SOFT sibling of the citation gate
 * (citations.ts): a heuristic spam false positive must never silently drop a
 * founder-approved send, so ONLY a `high` severity (score >= 50) recalls the
 * draft to review. medium/low/clean pass through. Pure + deterministic.
 */

import type { SpamCheckResult } from "@/lib/emails/email-spam-check";

export type SpamGateDecision =
  | { ok: true }
  | { ok: false; reviewReason: string; codes: string[]; score: number };

export function decideSpamGate(result: SpamCheckResult): SpamGateDecision {
  if (result.severity !== "high") return { ok: true };
  const codes = result.warnings.map((w) => w.code);
  const top = result.warnings.slice(0, 3).map((w) => w.message).join(" ");
  return {
    ok: false,
    score: result.score,
    codes,
    reviewReason:
      `High spam risk (score ${result.score}/100) — sending would hurt your domain ` +
      `reputation. Fix before resending: ${top}`,
  };
}
