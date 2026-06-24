/**
 * Provider precedence for canonical-field resolution (spec 00, AC6). Pure — no
 * DB. The winning value for a field is the *_field_source row with the highest
 * provider rank; ties break to the most-recent observed_at. Order is
 * authoritative in _specs/00-canonical-data-model/data-contract.md.
 */

/** Higher = wins. Unlisted providers get DEFAULT_RANK. */
export const PROVIDER_RANK: Record<string, number> = {
  manual: 100, // user-entered, always wins
  zefix: 80, // official CH registry
  sirene: 80, // official FR registry (INSEE)
  insee: 80,
  pappers: 78, // FR registry aggregator
  apollo: 50, // vendor enrichment
  apollo_search: 48,
  tam: 45, // sourcing pipeline
  csv: 40, // bulk import
  inbound: 40, // captured inbound
  inferred: 20, // model-derived
  llm: 20,
};

export const DEFAULT_RANK = 30;

export function providerRank(provider: string): number {
  return PROVIDER_RANK[provider] ?? DEFAULT_RANK;
}

export interface SourceRow {
  provider: string;
  value: unknown;
  observedAt: Date | string;
}

function toMillis(d: Date | string): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

/**
 * Pick the winning source for a single field. Highest provider rank wins; on a
 * tie, the most recently observed wins; on a further tie, the last in input
 * order (stable). Returns null for an empty list.
 */
export function pickWinner<T extends SourceRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  let best = rows[0];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rRank = providerRank(r.provider);
    const bestRank = providerRank(best.provider);
    if (rRank > bestRank) {
      best = r;
    } else if (rRank === bestRank && toMillis(r.observedAt) >= toMillis(best.observedAt)) {
      best = r;
    }
  }
  return best;
}
