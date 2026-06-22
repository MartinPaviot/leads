/**
 * P1-11 — derive the draft's personalizationSources from the ProspectContext, so
 * the citation gate (at approval + send) and the freshness gate have real
 * {kind, label, href, quote} entries to verify instead of the hard-coded [].
 *
 * Pure. Only emits an href when the source carries a real http(s) URL — never
 * fabricated — so the URL gate can re-verify it. (The LLM-emitted, sentence-
 * anchored claims for inline highlighting are a follow-up; this is the
 * deterministic, deploy-safe substrate.)
 */

import type { ProspectContext } from "@/lib/context/prospect-context";

export interface DraftSource {
  kind: string; // "funding" | "signal" | "news" | "blog_post" | ...
  label: string;
  href?: string;
  quote?: string;
}

function asUrl(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function deriveSourcesFromContext(ctx: ProspectContext): DraftSource[] {
  const sources: DraftSource[] = [];

  // Funding — a volatile fact the freshness gate watches (kind: "funding").
  if (ctx.funding?.stage) {
    const label = [ctx.funding.stage, ctx.funding.amountPrinted].filter(Boolean).join(" ");
    sources.push({ kind: "funding", label });
  }

  // Buying signals — href only when dataSource is a real URL.
  for (const s of ctx.signals ?? []) {
    if (!s.title) continue;
    sources.push({ kind: "signal", label: s.title, href: asUrl(s.dataSource), quote: s.description || undefined });
  }

  // Research-brief public content (citable snippets).
  for (const p of ctx.researchBrief?.publicContent ?? []) {
    if (!p.title && !p.quote) continue;
    sources.push({ kind: p.type || "news", label: p.title || p.type, quote: p.quote || undefined });
  }

  return sources;
}
