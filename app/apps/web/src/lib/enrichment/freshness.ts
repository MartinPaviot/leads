/**
 * Enrichment freshness predicate for the TAM refresh loop.
 *
 * A record is "stale" when it has never been enriched (lastEnrichedAt is
 * null) or its last enrichment is older than the TTL. The refresh cron
 * (tam.refresh.daily, later phase) orders by last_enriched_at asc (nulls
 * first) and proposes the stalest slice for re-enrichment within a daily
 * budget — nothing spends credits without approval.
 */
export const DEFAULT_ENRICHMENT_TTL_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isEnrichmentStale(
  lastEnrichedAt: Date | string | null | undefined,
  ttlDays: number = DEFAULT_ENRICHMENT_TTL_DAYS,
  now: Date = new Date(),
): boolean {
  if (!lastEnrichedAt) return true; // never enriched → stale
  const last =
    lastEnrichedAt instanceof Date ? lastEnrichedAt : new Date(lastEnrichedAt);
  if (Number.isNaN(last.getTime())) return true; // unparseable → treat as stale
  return now.getTime() - last.getTime() >= ttlDays * DAY_MS;
}
