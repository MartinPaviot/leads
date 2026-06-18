/**
 * International-institution classifier — LLM wrapper around the pure core.
 * Mirrors lib/scoring/title-persona.ts: batched haiku calls, verbatim-validated
 * output, fail-closed (no model / error / missing ref ⇒ unresolved, never a
 * false negative written as truth).
 */
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import {
  buildInstitutionPrompt,
  institutionResultSchema,
  parseInstitutionVerdicts,
  type CompanyToClassify,
  type InstitutionVerdict,
} from "./institution-classifier-core";

/** Companies per LLM call — small enough to keep the output reliable. */
export const INSTITUTION_BATCH = 40;

/**
 * Classify companies as international institution vs commercial. Returns a Map
 * keyed by company id; a MISSING id means unresolved (model down / call failed /
 * not echoed) — the caller must not treat it as a negative.
 */
export async function classifyInstitutions(
  companies: CompanyToClassify[],
  tenantId: string,
): Promise<Map<string, InstitutionVerdict>> {
  const out = new Map<string, InstitutionVerdict>();
  const todo = companies.filter((c) => c.id && (c.name || c.domain));
  if (todo.length === 0) return out;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return out;

  for (let i = 0; i < todo.length; i += INSTITUTION_BATCH) {
    const slice = todo.slice(i, i + INSTITUTION_BATCH);
    const refToId = new Map<number, string>();
    const batch = slice.map((company, idx) => {
      const ref = i + idx + 1;
      refToId.set(ref, company.id);
      return { ref, company };
    });
    try {
      const { object } = await tracedGenerateObject({
        model,
        schema: institutionResultSchema,
        prompt: buildInstitutionPrompt(batch),
        _trace: {
          agentId: "institution-classifier",
          tenantId,
          inputPreview: `${batch.length} companies`,
        },
      });
      const verdicts = parseInstitutionVerdicts(
        (object as { results?: Array<{ ref: number; isInstitution: boolean; kind: string; confidence: number }> }).results,
        refToId,
      );
      for (const [id, v] of verdicts) out.set(id, v);
    } catch (e) {
      if (process.env.CLASSIFY_DEBUG) console.error("[institution-classifier] batch failed:", (e as Error)?.message || e);
      // fail closed: this batch stays unresolved; later batches still try
    }
  }
  return out;
}
