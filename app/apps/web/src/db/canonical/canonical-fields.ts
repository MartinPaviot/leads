/**
 * Canonical-field recomputation (spec 00, AC6). Pure — no DB. Given the
 * *_field_source rows for one entity, resolve each field to its winning value
 * by provider precedence and project the winners onto the entity's scalar
 * columns. Tracked fields + precedence are authoritative in
 * _specs/00-canonical-data-model/data-contract.md.
 */
import { pickWinner, type SourceRow } from "./precedence";

/** Scalar columns mirrored from canonical_fields onto the company row. */
export const ACCOUNT_CANONICAL_FIELDS = [
  "name",
  "domain",
  "industry",
  "size",
  "revenue",
  "description",
] as const;

/** Scalar columns mirrored from canonical_fields onto the contact row. */
export const CONTACT_CANONICAL_FIELDS = [
  "email",
  "firstName",
  "lastName",
  "title",
  "phone",
  "linkedinUrl",
] as const;

export interface FieldSourceRow extends SourceRow {
  field: string;
}

export interface CanonicalField {
  value: unknown;
  provider: string;
  observedAt: string; // ISO
}

export type CanonicalFields = Record<string, CanonicalField>;

function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

/**
 * Resolve every field to its precedence winner. Rows with a null/undefined
 * value are ignored (a provider that has nothing to say does not overwrite a
 * provider that does). Order-independent: the result depends only on the set of
 * rows, not their arrival order.
 */
export function computeCanonicalFields(rows: FieldSourceRow[]): CanonicalFields {
  const byField = new Map<string, FieldSourceRow[]>();
  for (const r of rows) {
    if (r.value === null || r.value === undefined) continue;
    const arr = byField.get(r.field) ?? [];
    arr.push(r);
    byField.set(r.field, arr);
  }
  const out: CanonicalFields = {};
  for (const [field, frows] of byField) {
    const winner = pickWinner(frows);
    if (winner) {
      out[field] = {
        value: winner.value,
        provider: winner.provider,
        observedAt: toIso(winner.observedAt),
      };
    }
  }
  return out;
}

/**
 * Project the canonical winners onto a scalar-column patch, restricted to the
 * entity's tracked fields. Only fields present in canonical_fields appear in
 * the patch, so a recompute never clobbers a column with null.
 */
export function projectScalars(
  canonical: CanonicalFields,
  allowed: readonly string[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of allowed) {
    if (canonical[field]) patch[field] = canonical[field].value;
  }
  return patch;
}
