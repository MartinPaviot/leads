-- Spec 31 — weekly-optimizer proposal audit. One row per (tenant, week, agent
-- proposalId) so a same-week re-run upserts (idempotent). Persists every proposal
-- the weekly review produced plus its deterministic route/decision — the gated
-- queue a human reviews. `applied` is only true under the apply flag on an
-- autonomous campaign; observe-mode rows are all gated.
CREATE TABLE IF NOT EXISTS optimizer_proposal (
  id                    text PRIMARY KEY,
  tenant_id             text REFERENCES tenants(id),
  week                  text NOT NULL,
  proposal_id           text NOT NULL,
  type                  text NOT NULL,
  target                text NOT NULL,
  rationale             text NOT NULL,
  risk                  text NOT NULL,
  cited_metric          jsonb,
  significance_verdict  text,
  route                 text NOT NULL,
  applied               boolean NOT NULL DEFAULT false,
  reason                text NOT NULL,
  created_at            timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS optimizer_proposal_dedup_idx ON optimizer_proposal (tenant_id, week, proposal_id);
CREATE INDEX IF NOT EXISTS optimizer_proposal_tenant_created_idx ON optimizer_proposal (tenant_id, created_at);

ALTER TABLE optimizer_proposal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_optimizer_proposal ON optimizer_proposal;
CREATE POLICY tenant_isolation_optimizer_proposal ON optimizer_proposal
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
