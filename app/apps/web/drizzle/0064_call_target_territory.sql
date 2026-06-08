-- Territory exclusivity for per-user Call Mode.
--
-- Call Mode is individualised per rep, and a given account must not appear in
-- two reps' call lists at once. This partial unique index enforces that at the
-- DB level: across a tenant, a contact can have at most ONE non-terminal
-- (queued / in_progress) campaign target — i.e. it is "owned" by a single
-- rep's active cadence. Once that target reaches a terminal state
-- (connected / converted / exhausted / dnc) it leaves the index, freeing the
-- contact to be re-engaged later.
--
-- Paired with onConflictDoNothing on the daily-list top-up insert, this also
-- closes the select->insert race between two reps' concurrent list builds.
CREATE UNIQUE INDEX IF NOT EXISTS call_campaign_targets_tenant_contact_active_uniq
  ON call_campaign_targets (tenant_id, contact_id)
  WHERE status IN ('queued', 'in_progress');
