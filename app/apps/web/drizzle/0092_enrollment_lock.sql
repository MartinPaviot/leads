-- Spec 14 — anti-collision enrollment lock. A contact may be in exactly ONE
-- active sequence at a time across every campaign. contact_id is the PK, so the
-- acquire upsert (INSERT ... ON CONFLICT (contact_id) DO UPDATE ... WHERE
-- expired-or-same-holder) is atomic: exactly one of two racing enrollments wins.
-- expires_at is a TTL safety net so a crashed enrollment self-heals.
CREATE TABLE IF NOT EXISTS enrollment_lock (
  contact_id    text PRIMARY KEY,
  tenant_id     text REFERENCES tenants(id),
  enrollment_id text NOT NULL,
  expires_at    timestamptz NOT NULL,
  acquired_at   timestamptz DEFAULT now()
);

-- holder()/reclaim probe expired locks by expires_at.
CREATE INDEX IF NOT EXISTS enrollment_lock_expires_idx ON enrollment_lock (expires_at);

-- Tenant isolation, mirroring the other tenant tables (allow-all when the
-- session var is unset; the app binds tenant_id on every row + filters by the
-- globally-unique contact_id).
ALTER TABLE enrollment_lock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_enrollment_lock ON enrollment_lock;
CREATE POLICY tenant_isolation_enrollment_lock ON enrollment_lock
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
