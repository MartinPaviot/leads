/**
 * Per-field enrichment TTLs (spec 08, AC5). Long for stable firmographics
 * (headcount, industry, founded), short for fast-moving signals (funding,
 * hiring). Mirrors the signals/freshness.ts pattern, keyed by enrichment field.
 */
const DAY = 24 * 60 * 60 * 1000;

const FIELD_TTL_MS: Record<string, number> = {
  name: 180 * DAY,
  domain: 180 * DAY,
  foundedYear: 365 * DAY,
  industry: 120 * DAY,
  employeeCount: 120 * DAY,
  sizeRange: 120 * DAY,
  country: 180 * DAY,
  // fast-moving
  fundingStage: 21 * DAY,
  totalFunding: 21 * DAY,
  hiring: 14 * DAY,
};

const DEFAULT_TTL_MS = 60 * DAY;

export function fieldTtlMs(field: string): number {
  return FIELD_TTL_MS[field] ?? DEFAULT_TTL_MS;
}
