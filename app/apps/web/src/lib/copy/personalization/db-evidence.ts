/**
 * Spec 19 — map the live ProspectContext into the grounded-personalization
 * Citation[] generateMessage consumes. CRITICAL for the never-invent guarantee:
 * only VERIFIED / CITED facts become evidence — public-content quotes, firmographic
 * facts, funding, tech, real signals. Inferred items (pain points, bestAngle) are
 * deliberately EXCLUDED — they are model guesses, not groundable facts. Confidence
 * reflects how hard the fact is; generateMessage's floor (0.6) drops the weak ones.
 * Pure; unit-tested without a model or DB.
 */

import type { ProspectContext } from "@/lib/context/prospect-context";
import type { Citation } from "./generate-message";

const clip = (s: string, n = 240) => (s.length > n ? s.slice(0, n) : s);

/** Verified, citable facts from a prospect context → Citation[] (highest-signal first). */
export function prospectContextToEvidence(ctx: ProspectContext): Citation[] {
  const out: Citation[] = [];
  const brief = ctx.researchBrief;

  // Public content — real quotes the prospect/company published (the strongest, most personal).
  for (const [i, pc] of (brief?.publicContent ?? []).entries()) {
    const fact = (pc.quote || pc.title || "").trim();
    if (fact) out.push({ id: `pc-${i}`, fact: clip(fact), source: pc.type || "public_content", confidence: 0.85 });
  }

  // Funding — verified firmographic event.
  if (ctx.funding?.stage || ctx.funding?.amountPrinted) {
    const fact = [ctx.funding.stage, ctx.funding.amountPrinted].filter(Boolean).join(" · ");
    out.push({ id: "funding", fact: clip(fact), source: "enrichment", confidence: 0.8 });
  }

  // Best enrichment signal — a real, dated buying signal.
  if (ctx.bestSignal) {
    const sig = ctx.bestSignal as { type?: string; detail?: string; description?: string };
    const fact = (sig.detail || sig.description || "").trim();
    if (fact) out.push({ id: "signal", fact: clip(fact), source: sig.type || "signal", confidence: 0.7 });
  }

  // Technologies — verified stack (group as one fact; the model picks the relevant one).
  if (ctx.technologies?.length) {
    out.push({ id: "tech", fact: `Uses ${ctx.technologies.slice(0, 8).join(", ")}`, source: "enrichment", confidence: 0.7 });
  }

  // Warmth signals — real relationship hooks (mutual connection, alumni, shared investor...).
  for (const [i, w] of (brief?.warmthSignals ?? []).entries()) {
    const fact = (w.detail || "").trim();
    if (fact) out.push({ id: `warmth-${i}`, fact: clip(fact), source: w.type || "warmth", confidence: 0.6 });
  }

  return out;
}
