import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { industryStyle, type IndustryFamily } from "@/lib/ui/industry-style";
import { FAMILY_KEYS, FAMILY_LABELS } from "./industry-family-util";

/**
 * Classify each raw industry label into one of the 14 sector families, so the
 * Filtres panel can offer a short "Secteur" pill list instead of 100+ raw
 * industries — the family cut a GTM rep thinks in (santé, fondations, public…).
 *
 * Done by an LLM reasoning over the REAL labels (same spirit as matchIndustries),
 * NOT a hardcoded synonym map and NOT the English-only curated map in
 * industry-style.ts: that map hashes anything it doesn't know to a pseudo-random
 * family, which mis-buckets the French Apollo labels this tenant is full of
 * ("Activités hospitalières" -> health, "Enseignement secondaire" -> education).
 *
 * Cached per tenant + label-set (1h) so the LLM runs at most once per distinct
 * set. On no-key / failure / timeout it degrades to the curated family but only
 * where that was an EXPLICIT (non-hashed) match — never the random hash — so a
 * degraded state under-groups rather than mis-groups.
 */

// Re-export the pure helpers + taxonomy so callers keep one import surface.
export { FAMILY_KEYS, FAMILY_LABELS, familiesToIndustries, familyCounts } from "./industry-family-util";
export type { IndustryFamily } from "./industry-family-util";

const TTL_MS = 60 * 60 * 1000;
const LLM_TIMEOUT_MS = 20000;
const cache = new Map<string, { at: number; map: Record<string, IndustryFamily> }>();

function cacheKey(tenantId: string, distinct: string[]): string {
  return `${tenantId}::${[...distinct].sort().join("|")}`;
}

/** Curated family, but only when industry-style matched it explicitly (never
 *  the hashed fallback). Null when unknown — left ungrouped on purpose. */
function explicitFamily(industry: string): IndustryFamily | null {
  const st = industryStyle(industry);
  return st.explicit ? st.family : null;
}

function buildFallback(distinct: string[]): Record<string, IndustryFamily> {
  const out: Record<string, IndustryFamily> = {};
  for (const ind of distinct) {
    const f = explicitFamily(ind);
    if (f) out[ind] = f;
  }
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("llm-timeout")), ms)),
  ]);
}

/** industry (verbatim) -> family key. Cached; safe to call on any path. */
export async function classifyIndustryFamilies(
  industries: string[],
  tenantId: string,
): Promise<Record<string, IndustryFamily>> {
  const distinct = [...new Set(industries.filter(Boolean))];
  if (distinct.length === 0) return {};
  const key = cacheKey(tenantId, distinct);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.map;

  const fallback = buildFallback(distinct);
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return fallback; // no key (e.g. tests) — explicit-only, uncached

  try {
    const { object } = await withTimeout(
      tracedGenerateObject({
        model,
        schema: z.object({
          assignments: z.array(
            z.object({
              industry: z.string().describe("Exact industry label, copied verbatim from the list"),
              family: z.enum(FAMILY_KEYS as [string, ...string[]]).describe("Single best-fit family key"),
            }),
          ),
        }),
        prompt: `Classify each industry label into exactly ONE sector family.

Use these EXACT family keys: ${FAMILY_KEYS.join(", ")}.
Guidance (labels may be French): health = hospitals/clinics/medical/pharma/wellness (e.g. "Activités hospitalières"); education = schools/universities/training (e.g. "Enseignement secondaire général"); nonprofit = charities, foundations, associations, NGOs; public = government, public administration, parapublic; finance = banking, insurance, VC/PE, financial services; tech = software, IT, SaaS, internet; manufacturing = industrial production; services = consulting, staffing, professional/business services; consumer = retail, hospitality, food service, consumer goods; media = publishing, broadcast, marketing, advertising, entertainment; construction = building, real estate, architecture; transport = logistics, shipping, aviation, mobility; energy = utilities, oil/gas, renewables; agrifood = farming, agriculture, food production.

Classify every label below; copy each label verbatim:
${distinct.map((i) => `- ${i}`).join("\n")}`,
        _trace: { agentId: "industry-family", tenantId, inputPreview: `${distinct.length} industries` },
      }),
      LLM_TIMEOUT_MS,
    );

    const allow = new Set(distinct);
    const validFamily = new Set<string>(FAMILY_KEYS);
    const map: Record<string, IndustryFamily> = { ...fallback };
    for (const a of (object.assignments as Array<{ industry: string; family: string }>) || []) {
      if (allow.has(a.industry) && validFamily.has(a.family)) {
        map[a.industry] = a.family as IndustryFamily;
      }
    }
    cache.set(key, { at: Date.now(), map });
    return map;
  } catch (e) {
    console.warn("[industry-family] classify failed:", (e as Error)?.message);
    return fallback; // timeout / failure — degrade, don't cache (retry next time)
  }
}
