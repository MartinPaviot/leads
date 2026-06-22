/**
 * deriveLookalike (spec 12). Enriches a user-supplied customer sample (spec-08,
 * injected), computes attribute frequencies deterministically (AC1/AC2), then
 * uses the injected spec-04 runAgent ONLY to select causal attributes + set
 * weights over those measured frequencies — never to invent (AC3/AC5) — and
 * writes the result as a draft ICP version via spec-11 (AC4, injected).
 */
import { computeFrequencies, type AttributeFrequency, type SampleAccount } from "./frequency";

export interface LookalikeCriterion {
  fieldKey: string;
  operator: "equals";
  value: string;
  weight: number;
  /** The measured evidence this criterion traces to (AC2/AC5). */
  evidence: { coverage: number; count: number; sampleSize: number };
}

export interface DraftIcp {
  name: string;
  criteria: LookalikeCriterion[];
  status: "draft";
}

export interface SampleInput {
  domain: string;
  /** Pre-enriched fields; if absent and deps.enrich is set, it is enriched. */
  fields?: Record<string, unknown>;
}

export interface WeightingAgentResult {
  evalPassed: boolean;
  value?: { selected: Array<{ fieldKey: string; value: string; weight: number }> };
  reason?: string;
}

export interface DeriveDeps {
  tenantId: string;
  /** spec-08 enrich, injected. */
  enrich?(domain: string): Promise<Record<string, unknown>>;
  /** spec-04 runAgent (selects causal + weights), injected. */
  runAgent(args: { tenantId: string; kind: string; requestId: string; input: unknown }): Promise<WeightingAgentResult>;
  /** spec-11 draft write, injected (AC4). */
  saveDraft?(draft: DraftIcp): Promise<void>;
  fields?: string[];
  minCoverage?: number;
  name?: string;
}

export type DeriveOutcome =
  | { ok: true; draft: DraftIcp; frequencies: AttributeFrequency[] }
  | { ok: false; reason: string };

export async function deriveLookalike(sample: SampleInput[], deps: DeriveDeps): Promise<DeriveOutcome> {
  if (sample.length === 0) return { ok: false, reason: "empty sample" };

  // AC1 — enrich the sample.
  const enriched: SampleAccount[] = [];
  for (const s of sample) {
    const fields = s.fields ?? (deps.enrich ? await deps.enrich(s.domain) : {});
    enriched.push({ domain: s.domain, fields });
  }

  // AC1/AC2 — deterministic frequencies + evidence.
  const frequencies = computeFrequencies(enriched, deps.fields, deps.minCoverage ?? 0.3);
  if (frequencies.length === 0) return { ok: false, reason: "no attribute reached the coverage floor" };

  // AC3/AC5 — the agent sees ONLY the measured frequencies; it weights, never invents.
  const res = await deps.runAgent({
    tenantId: deps.tenantId,
    kind: "lookalike-weighting",
    requestId: `lookalike:${enriched.length}:${frequencies.map((f) => f.fieldKey + f.value).join("|").slice(0, 60)}`,
    input: { frequencies },
  });
  if (!res.evalPassed || !res.value) return { ok: false, reason: res.reason ?? "eval failed" };

  // AC5 — enforce traceability: drop any selected attribute not in the measured table.
  const byKey = new Map(frequencies.map((f) => [`${f.fieldKey}|${f.value}`, f]));
  const criteria: LookalikeCriterion[] = [];
  for (const sel of res.value.selected) {
    const f = byKey.get(`${sel.fieldKey}|${String(sel.value).toLowerCase().trim()}`);
    if (!f) continue; // invented attribute → dropped (AC3 never invent)
    criteria.push({
      fieldKey: sel.fieldKey,
      operator: "equals",
      value: f.value,
      weight: sel.weight,
      evidence: { coverage: f.coverage, count: f.count, sampleSize: f.sampleSize },
    });
  }
  if (criteria.length === 0) return { ok: false, reason: "agent proposed no attribute traceable to the sample" };

  const draft: DraftIcp = { name: deps.name ?? "Lookalike ICP", criteria, status: "draft" };
  if (deps.saveDraft) await deps.saveDraft(draft); // AC4 — draft, never active
  return { ok: true, draft, frequencies };
}
