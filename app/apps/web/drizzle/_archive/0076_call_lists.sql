-- Sector call lists — named segments selectable in "To call now" (model A2a, _specs/call-lists).
-- A list is a named SprintAudience (segment) + one sort key; the active list's
-- segment is mirrored onto call_campaigns.target_filter.audience so the daily
-- top-up draws from it. System by-day lists are derived, never stored.
-- Additive + idempotent (IF NOT EXISTS everywhere) so the custom runner
-- (scripts/apply-migrations.ts) can re-apply safely.

CREATE TABLE IF NOT EXISTS call_lists (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  campaign_id  TEXT NOT NULL REFERENCES call_campaigns(id) ON DELETE CASCADE,
  owner_id     TEXT REFERENCES users(id),
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'sector',
  segment      JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort         TEXT NOT NULL DEFAULT 'fit',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_lists_tenant_campaign_idx ON call_lists (tenant_id, campaign_id);
CREATE INDEX IF NOT EXISTS call_lists_owner_idx ON call_lists (tenant_id, owner_id);
