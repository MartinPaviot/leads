/**
 * Collapse a duplicate group into one survivor (spec 07, AC2). Unions every
 * member's provenance and resolves each field by provider precedence (the
 * injected spec-00 pickWinner), preserving every source. Deterministic survivor
 * (smallest id) → order-independent → idempotent (AC5). Pure.
 */
import type { DedupAccount, FieldSource, MergedGroup, PickWinner } from "./types";

export function collapseGroup(key: string, members: DedupAccount[], pickWinner: PickWinner): MergedGroup {
  const ids = members.map((m) => m.id).sort();
  const survivorId = ids[0];
  const absorbedIds = ids.slice(1);

  const byField = new Map<string, FieldSource[]>();
  for (const m of members) {
    for (const s of m.sources) {
      const arr = byField.get(s.field) ?? [];
      arr.push(s);
      byField.set(s.field, arr);
    }
  }

  const canonicalFields: Record<string, { value: unknown; provider: string }> = {};
  for (const [field, rows] of byField) {
    const w = pickWinner(rows);
    if (w && w.value !== null && w.value !== undefined) {
      canonicalFields[field] = { value: w.value, provider: w.provider };
    }
  }
  return { key, survivorId, absorbedIds, canonicalFields };
}
