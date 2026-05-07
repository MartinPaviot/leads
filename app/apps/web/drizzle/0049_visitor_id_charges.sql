-- P0-2 follow-up — charge ledger for visitor-ID provider calls.
--
-- Spend tracking currently estimates cost via :
--   identified_visits_this_month × DEFAULT_RATE_PER_MATCH_USD
--
-- That works when the rate is constant + every paid call produces a
-- match. Both assumptions break in production :
--  - Snitcher tier-pricing changes when monthly volume crosses
--    thresholds ($0.10 → $0.06 → $0.04). The estimate gets stale.
--  - Some providers charge per LOOKUP regardless of whether they
--    matched. Counting only matches under-reports actual spend.
--
-- A dedicated ledger row per call gives :
--  - Exact cost per call (provider tells us the price in the
--    response, or we attribute the rate at write time).
--  - Audit trail — we can show "X calls cost $Y" in the dashboard.
--  - Future per-tenant billing — the ledger is the source of truth.
--
-- Retention : the data-retention worker purges this table for
-- canceled tenants after 30d alongside the other tenant-scoped
-- tables. Disk footprint stays bounded.

CREATE TABLE IF NOT EXISTS visitor_id_charges (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL,
  /** The visit that triggered the lookup. NULL when the worker
      retried for an already-deleted visit (rare ; defensive). */
  visit_id        TEXT,
  /** Provider name : "snitcher" | "rb2b" | "clearbit_reveal". */
  provider        TEXT NOT NULL,
  /** USD cost rounded to 6 decimals — the same precision we use
      on `llm_calls.cost_usd`. NULL when we can't price (provider
      didn't return rate ; the worker falls back to the default
      rate at evaluation time). */
  cost_usd        DOUBLE PRECISION,
  /** True when the provider returned a company match. False on
      no-match. Some providers charge regardless ; others only on
      match — the dashboard groups by `matched` to surface the
      ROI conversation. */
  matched         BOOLEAN NOT NULL DEFAULT FALSE,
  /** Provider's raw response metadata — confidence, request id,
      etc. Bounded by the worker (capped at 1KB on insert). */
  response_meta   JSONB NOT NULL DEFAULT '{}'::jsonb,
  charged_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot-path indexes : monthly-spend query + per-tenant audit.
CREATE INDEX IF NOT EXISTS visitor_id_charges_tenant_charged_at_idx
  ON visitor_id_charges (tenant_id, charged_at DESC);
CREATE INDEX IF NOT EXISTS visitor_id_charges_provider_idx
  ON visitor_id_charges (provider);

-- Diagnostic view : the dashboard tile reads this to show
-- "this-month spend by provider".
CREATE OR REPLACE VIEW visitor_id_monthly_spend_by_tenant AS
SELECT
  tenant_id,
  provider,
  date_trunc('month', charged_at AT TIME ZONE 'UTC') AS month_utc,
  COUNT(*)                                          AS calls,
  COUNT(*) FILTER (WHERE matched)                   AS matches,
  COALESCE(SUM(cost_usd), 0)::float8                AS cost_usd
FROM visitor_id_charges
GROUP BY 1, 2, 3;
