-- Anti-ICP exclusion flag on companies (B1, _specs/pilae-machine/spec-v2.md).
--
-- When a company matches the tenant's anti-ICP rules (industry, size, geo,
-- "do not contact" request, ...), we tag the row instead of deleting it.
-- The enrollment paths (manual /api/sequences/:id/enroll and the auto
-- signals/auto-enroll Inngest function) must skip companies whose
-- `excluded_reason IS NOT NULL` so anti-ICP rules can't be bypassed by
-- re-enrolling a previously-flagged contact.
--
-- Reason is a free-form short tag — examples in lib/sequences/enrollment-eligibility.ts:
--   "anti_icp_industry", "anti_icp_size", "do_not_contact_request",
--   "competitor", "former_customer_churn_risk".
--
-- Idempotent. Hand-crafted (drizzle-kit's journal is stuck at 0014 — see
-- scripts/apply-migrations.ts header for context).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS excluded_reason TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS companies_excluded_at_idx
  ON companies (excluded_at);
