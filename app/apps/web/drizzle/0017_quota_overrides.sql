-- WS-2 T3: per-tenant quota overrides.
--
-- Shape: {"contacts"?: number|null, "emailsPerMonth"?: number|null, "aiQueriesPerMonth"?: number|null}
-- null / missing key = inherit from plan default. A finite number (incl. 0) overrides.
-- Used by lib/pricing/tiers.ts#getLimitsForTenant.
ALTER TABLE "tenants"
  ADD COLUMN "quota_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb;
