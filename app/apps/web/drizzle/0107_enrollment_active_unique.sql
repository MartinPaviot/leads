-- At most ONE active enrollment per (sequence, contact) — closes the
-- duplicate-active-enrollment race. PARTIAL on status='active' so a contact can
-- still be re-enrolled after a terminal status (completed/replied/bounced/...):
-- nurture-recycle (inngest/nurture-recycle-d30.ts) and future re-engagement
-- flows rely on that, so a FULL unique index would be wrong. Every enrollment
-- insert pairs with .onConflictDoNothing() so the loser of a race skips quietly.
-- Additive + idempotent (IF NOT EXISTS) so the custom runner can re-apply.
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_active_unique_idx
  ON sequence_enrollments (sequence_id, contact_id)
  WHERE status = 'active';
