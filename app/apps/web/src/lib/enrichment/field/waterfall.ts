/**
 * Field-level waterfall enrichment (spec 08). Cache-first within TTL (AC1); else
 * query providers in descending (confidence ÷ cost) order and STOP at the first
 * result at/above the field's confidence threshold (AC2); persist provenance +
 * cache with a per-field TTL (AC3/AC5); meter every call and stop on budget
 * exhaustion emitting partial results (AC4). Deterministic.
 */
import { fieldTtlMs } from "./ttl";
import type { EnrichDeps, FieldCacheEntry, FieldProvider, FieldResult } from "./types";

const DEFAULT_THRESHOLD = 0.6;

function ratio(p: FieldProvider, field: string): number {
  return p.expectedConfidence(field) / Math.max(p.cost, 1e-6);
}

export async function enrichField(accountId: string, field: string, deps: EnrichDeps): Promise<FieldResult> {
  const now = deps.now ?? (() => Date.now());

  // AC1 — cache-first within TTL, no provider call.
  const cached = await deps.cache.get(accountId, field);
  if (cached) {
    return {
      field, value: cached.value, provider: cached.provider, confidence: cached.confidence,
      costCredits: cached.costCredits, ttlExpiresAt: cached.ttlExpiresAt, fromCache: true, status: "cached",
    };
  }

  // AC4 — stop before spending if the budget is exhausted.
  if (deps.budgetOk && !(await deps.budgetOk())) return { field, status: "budget-exhausted" };

  const threshold = deps.threshold ? deps.threshold(field) : DEFAULT_THRESHOLD;
  // AC2 — order by (confidence ÷ cost) desc; free providers first.
  const ordered = deps.providers.filter((p) => p.supports(field)).sort((a, b) => ratio(b, field) - ratio(a, field));

  for (const provider of ordered) {
    if (deps.budgetOk && !(await deps.budgetOk())) return { field, status: "budget-exhausted" };
    const res = await deps.meter(
      { workspace: deps.tenantId, kind: "enrich.field", provider: provider.name, amount: provider.cost, ref: `enrich:${accountId}:${field}:${provider.name}` },
      () => provider.fetchField(accountId, field),
    );
    if (res && res.value != null && res.confidence >= threshold) {
      const entry: FieldCacheEntry = {
        value: res.value, provider: provider.name, confidence: res.confidence,
        costCredits: provider.cost, ttlExpiresAt: new Date(now() + fieldTtlMs(field)),
      };
      await deps.cache.set(accountId, field, entry); // AC1 next time
      if (deps.persist) await deps.persist(accountId, field, entry); // AC3
      return {
        field, value: entry.value, provider: entry.provider, confidence: entry.confidence,
        costCredits: entry.costCredits, ttlExpiresAt: entry.ttlExpiresAt, status: "filled",
      };
    }
  }
  return { field, status: "unknown" };
}

/** Enrich several fields; on budget exhaustion, stop and return partial results (AC4). */
export async function enrichAccount(accountId: string, fields: string[], deps: EnrichDeps): Promise<FieldResult[]> {
  const out: FieldResult[] = [];
  for (let i = 0; i < fields.length; i++) {
    const r = await enrichField(accountId, fields[i], deps);
    out.push(r);
    if (r.status === "budget-exhausted") {
      for (let j = i + 1; j < fields.length; j++) out.push({ field: fields[j], status: "budget-exhausted" });
      break;
    }
  }
  return out;
}
