/**
 * Spec 19 — map the live ProspectContext into the grounded-personalization
 * Citation[] generateMessage consumes. CRITICAL for the never-invent guarantee.
 *
 * TWO TRUST TIERS, because the post-check (personalizationViolations) verifies the
 * agent CITED something in the evidence list — NOT that the evidence itself is real.
 * So the evidence boundary is where truth must be enforced:
 *  - PROVIDER-VERIFIED facts (funding, tech) come as structured data from an
 *    enrichment provider (Apollo/BuiltWith). Groundable: confidence >= the 0.6 floor.
 *  - LLM-SYNTHESIZED prose (public-content quotes, signal detail, warmth detail) is
 *    produced by the brief-synthesizer model with NO verbatim source check — it can
 *    paraphrase or hallucinate. Grounding on it WOULD be inventing. So it is emitted
 *    BELOW the grounding floor (UNVERIFIED_CONFIDENCE) — generateMessage drops it, so
 *    the engine never grounds a "fact" we haven't verified. (Follow-up: thread the
 *    source url through ResearchBriefContext + verbatim-verify to promote these.)
 * Inferred items (pain points, bestAngle) are excluded entirely — pure model guesses.
 * Pure; unit-tested without a model or DB.
 */

import type { ProspectContext } from "@/lib/context/prospect-context";
import type { Citation } from "./generate-message";

const clip = (s: string, n = 240) => (s.length > n ? s.slice(0, n) : s);

/** Below generateMessage's 0.6 grounding floor — LLM-synthesized, not verbatim-verified. */
const UNVERIFIED_CONFIDENCE = 0.5;

/** Verified, citable facts from a prospect context → Citation[] (provider-verified ground; synthesized doesn't). */
export function prospectContextToEvidence(ctx: ProspectContext): Citation[] {
  const out: Citation[] = [];
  const brief = ctx.researchBrief;

  // Public content — LLM-extracted quotes (NOT verbatim-verified). Sub-floor: never
  // grounds until a verbatim-verification step exists, so we can't cite a hallucination.
  for (const [i, pc] of (brief?.publicContent ?? []).entries()) {
    const fact = (pc.quote || pc.title || "").trim();
    if (fact) out.push({ id: `pc-${i}`, fact: clip(fact), source: pc.type || "public_content", confidence: UNVERIFIED_CONFIDENCE });
  }

  // Funding — provider-verified firmographic event. Groundable.
  if (ctx.funding?.stage || ctx.funding?.amountPrinted) {
    const fact = [ctx.funding.stage, ctx.funding.amountPrinted].filter(Boolean).join(" · ");
    out.push({ id: "funding", fact: clip(fact), source: "enrichment", confidence: 0.8 });
  }

  // Best enrichment signal — the detail prose is model-written; sub-floor (don't ground on it).
  if (ctx.bestSignal) {
    const sig = ctx.bestSignal as { type?: string; detail?: string; description?: string };
    const fact = (sig.detail || sig.description || "").trim();
    if (fact) out.push({ id: "signal", fact: clip(fact), source: sig.type || "signal", confidence: UNVERIFIED_CONFIDENCE });
  }

  // Technologies — provider-verified stack (structured data). Groundable.
  if (ctx.technologies?.length) {
    out.push({ id: "tech", fact: `Uses ${ctx.technologies.slice(0, 8).join(", ")}`, source: "enrichment", confidence: 0.7 });
  }

  // Warmth signals — LLM-synthesized relationship hooks; sub-floor (don't ground on them).
  for (const [i, w] of (brief?.warmthSignals ?? []).entries()) {
    const fact = (w.detail || "").trim();
    if (fact) out.push({ id: `warmth-${i}`, fact: clip(fact), source: w.type || "warmth", confidence: UNVERIFIED_CONFIDENCE });
  }

  return out;
}
