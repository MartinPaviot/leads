-- Spec 14 — observe-phase collision log. One row each time the enrollment guard
-- turned a contact away (lost the lock). `enforced` records whether the block was
-- actually applied: in observe mode (ANTI_COLLISION_ENFORCE off) it is false, so a
-- row means "we WOULD have blocked this double-enrollment" — the measurable signal
-- the founder reads before flipping to enforce. Written best-effort from the guard.
CREATE TABLE IF NOT EXISTS enrollment_collision (
  id                    text PRIMARY KEY,
  tenant_id             text REFERENCES tenants(id),
  contact_id            text NOT NULL,
  blocked_enrollment_id text NOT NULL,
  held_by               text,
  enforced              boolean NOT NULL DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrollment_collision_tenant_created_idx ON enrollment_collision (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS enrollment_collision_contact_idx ON enrollment_collision (contact_id);

ALTER TABLE enrollment_collision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_enrollment_collision ON enrollment_collision;
CREATE POLICY tenant_isolation_enrollment_collision ON enrollment_collision
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
