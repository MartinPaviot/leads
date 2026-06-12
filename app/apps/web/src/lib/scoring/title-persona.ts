/**
 * Title → persona resolution (_specs/title-persona-fit).
 *
 * An ICP's `person_titles` criterion holds persona LABELS ("ceo",
 * "head of hr"); contacts hold free-text, multilingual TITLES
 * ("Directeur Général adjoint"). Literal compare can't bridge them, a
 * hardcoded synonym table is banned (it only covers the terms someone
 * thought of) — so, like `lib/search/industry-match.ts`, an LLM
 * reasons over the REAL labels each time and the output is validated
 * verbatim against the vocabulary. Fail-closed everywhere: no model,
 * an error, or a missing echo resolves to "unresolved", which the
 * scorer treats as not-evaluated (no penalty) — never a zero.
 *
 * Resolutions are cached per contact under
 * `properties.title_personas = { h, p }` where `h` is the hash of the
 * persona vocabulary that produced it — editing any ICP's personas
 * changes the hash and re-resolves on the next run. `p: []` is a VALID
 * negative result (evaluated, no persona matches), distinct from
 * unresolved (absent key / stale hash). A cache entry left behind by a
 * since-cleared title is never pruned — dead weight, ignored by the
 * reader (the scorer only consults it when the contact HAS a title).
 */

import { createHash } from "crypto";
import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { norm } from "@/lib/icp/criteria-engine";
import type { ActiveIcp } from "@/lib/icp/fit-recompute-core";

/** Max titles per LLM call — keeps the prompt small and the output
 *  reliable; a 446-title cold run is ⌈446/50⌉ = 9 haiku calls, then 0. */
export const TITLE_RESOLVE_BATCH = 50;

/** Union of every active ICP's person_titles values (first-seen casing,
 *  norm-deduped). Empty array = the feature is dormant for the tenant. */
export function personaVocabulary(activeIcps: ActiveIcp[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const icp of activeIcps) {
    for (const c of icp.criteria) {
      if (c.fieldKey !== "person_titles") continue;
      const values = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of values) {
        if (typeof v !== "string" || v.trim() === "") continue;
        const k = norm(v);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v.trim());
      }
    }
  }
  return out;
}

/** Stable id of a vocabulary: order- and casing-insensitive. NUL as the
 *  join separator because norm() output can contain spaces — a space
 *  join would collide ["head of","hr"] with ["head","of hr"]. */
export function vocabHash(vocab: string[]): string {
  const canon = [...new Set(vocab.map(norm))].sort().join("\u0000");
  return createHash("sha256").update(canon).digest("hex").slice(0, 12);
}

/** Cached resolution for the CURRENT vocabulary, else null.
 *  `[]` is a valid negative result. */
export function readCachedPersonas(
  properties: Record<string, unknown> | null | undefined,
  hash: string,
): string[] | null {
  const cache = (properties ?? {})["title_personas"] as
    | { h?: unknown; p?: unknown }
    | undefined;
  if (!cache || cache.h !== hash || !Array.isArray(cache.p)) return null;
  return cache.p.filter((v): v is string => typeof v === "string");
}

/**
 * Resolve titles to persona subsets via the LLM, batched. Returns a Map
 * keyed by `norm(title)`; a missing key means UNRESOLVED (model down,
 * call failed, or the model did not echo the title) — the caller must
 * not treat it as a negative.
 */
export async function resolveTitles(
  titles: string[],
  vocab: string[],
  tenantId: string,
): Promise<Map<string, string[]>> {
  const resolved = new Map<string, string[]>();
  const todo = [...new Map(titles.filter((t) => t.trim()).map((t) => [norm(t), t.trim()])).values()];
  if (todo.length === 0 || vocab.length === 0) return resolved;

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;
  if (!model) return resolved;

  // Verbatim validation maps: norm(label) → original label.
  const vocabByNorm = new Map(vocab.map((v) => [norm(v), v]));
  const requested = new Set(todo.map((t) => norm(t)));

  for (let i = 0; i < todo.length; i += TITLE_RESOLVE_BATCH) {
    const batch = todo.slice(i, i + TITLE_RESOLVE_BATCH);
    try {
      const { object } = await tracedGenerateObject({
        model,
        schema: z.object({
          mappings: z
            .array(
              z.object({
                title: z.string().describe("One job title, copied verbatim from the list"),
                personas: z
                  .array(z.string())
                  .describe("Persona labels copied verbatim from the vocabulary that this title's FUNCTION matches; empty when none"),
              }),
            )
            .describe("Exactly one entry per job title"),
        }),
        prompt: `You match job titles to a CRM's target persona labels.

TARGET PERSONA LABELS (the only allowed outputs):
${vocab.map((v) => `- ${v}`).join("\n")}

JOB TITLES to classify (one entry each in your answer):
${batch.map((t) => `- ${t}`).join("\n")}

For EACH job title, return the subset of persona labels whose FUNCTION the title matches, across languages (French, German, Italian, English, ...). Reasoning examples: "Directeur Général" / "Geschäftsführer" / "Managing Director" match a CEO-like label; "DRH" / "Head of People" match an HR-leader label; "Directeur Financier" / "CFO" match a finance-leader label. Seniority alone is not a match — the FUNCTION must correspond. A title matching no label gets an empty array. Echo every job title exactly once, verbatim.`,
        _trace: {
          agentId: "title-persona-match",
          tenantId,
          inputPreview: `${batch.length} titles vs ${vocab.length} personas`,
        },
      });

      for (const m of (object.mappings as Array<{ title: string; personas: string[] }>) ?? []) {
        const key = norm(m.title);
        if (!requested.has(key)) continue; // hallucinated title — ignore
        const personas = [
          ...new Set(
            (m.personas ?? [])
              .map((p) => vocabByNorm.get(norm(p)))
              .filter((p): p is string => !!p), // outside the vocabulary — dropped
          ),
        ];
        resolved.set(key, personas);
      }
    } catch {
      // fail closed: this batch stays unresolved; later batches still try
    }
  }
  return resolved;
}

/**
 * Consensus resolution for DESTRUCTIVE decisions (archive/purge flows).
 *
 * A single pass flickers on borderline titles (~6% observed on the
 * 2026-06-12 purge — compound titles like "Deputy Director & Head of
 * Shared Services" flipped between runs). For decisions that delete
 * data, run `passes` independent resolutions and take majorities:
 *   - a PERSONA is kept only when ≥⌈passes/2⌉ passes returned it;
 *   - a title is a confirmed NEGATIVE ([]) only when ≥⌈passes/2⌉
 *     passes EXPLICITLY returned empty for it;
 *   - a split verdict (passes disagree, no majority either way) stays
 *     UNRESOLVED — and a destructive caller must treat unresolved as
 *     "do not touch".
 * Scoring keeps using the single-pass resolveTitles (non-destructive,
 * cached, self-correcting on the next run).
 */
export async function resolveTitlesConsensus(
  titles: string[],
  vocab: string[],
  tenantId: string,
  passes = 3,
): Promise<Map<string, string[]>> {
  const runs: Array<Map<string, string[]>> = [];
  for (let i = 0; i < passes; i++) {
    runs.push(await resolveTitles(titles, vocab, tenantId));
  }
  const majority = Math.ceil(passes / 2);

  const out = new Map<string, string[]>();
  for (const t of new Set(titles.filter((x) => x.trim()).map((x) => norm(x)))) {
    const answered = runs.filter((r) => r.has(t));
    if (answered.length < majority) continue; // unresolved — never destructive

    const counts = new Map<string, number>();
    let explicitlyEmpty = 0;
    for (const r of answered) {
      const personas = r.get(t) ?? [];
      if (personas.length === 0) explicitlyEmpty++;
      for (const p of personas) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const personas = [...counts.entries()]
      .filter(([, n]) => n >= majority)
      .map(([p]) => p);
    if (personas.length > 0) {
      out.set(t, personas);
    } else if (explicitlyEmpty >= majority) {
      out.set(t, []); // confirmed negative
    }
    // split verdict → stays unresolved (absent)
  }
  return out;
}
