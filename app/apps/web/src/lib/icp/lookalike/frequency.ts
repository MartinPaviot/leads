/**
 * Attribute-frequency analysis over a customer sample (spec 12, AC1/AC2). Pure +
 * deterministic: for each tracked field, count each value's occurrences across
 * the enriched sample and compute coverage (count / sampleSize). This is the
 * evidence a founder vetoes on; the agent (AC3) only weights these, never invents.
 */

export interface SampleAccount {
  domain: string;
  /** Enriched canonical fields. */
  fields: Record<string, unknown>;
}

export interface AttributeFrequency {
  fieldKey: string;
  value: string;
  count: number;
  sampleSize: number;
  /** count / sampleSize, in [0,1]. */
  coverage: number;
}

export const DEFAULT_LOOKALIKE_FIELDS = ["industry", "sizeRange", "country", "fundingStage"];

export function computeFrequencies(
  sample: SampleAccount[],
  fields: string[] = DEFAULT_LOOKALIKE_FIELDS,
  minCoverage = 0.3,
): AttributeFrequency[] {
  const n = sample.length;
  if (n === 0) return [];
  const out: AttributeFrequency[] = [];
  for (const field of fields) {
    const counts = new Map<string, number>();
    for (const a of sample) {
      const v = a.fields[field];
      if (v == null || v === "") continue;
      const key = String(v).toLowerCase().trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [value, count] of counts) {
      const coverage = count / n;
      if (coverage >= minCoverage) out.push({ fieldKey: field, value, count, sampleSize: n, coverage });
    }
  }
  // Deterministic order: highest coverage first, then field/value for ties.
  return out.sort((a, b) => b.coverage - a.coverage || a.fieldKey.localeCompare(b.fieldKey) || a.value.localeCompare(b.value));
}
