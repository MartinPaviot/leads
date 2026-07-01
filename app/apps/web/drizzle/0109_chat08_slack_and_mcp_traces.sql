-- CHAT-08 — Part A schema (Slack integration) + the agentTraces surface-
-- attribution columns needed for both Slack and MCP (Part B). Additive +
-- idempotent so the custom runner (scripts/apply-migrations.ts) can
-- re-apply safely.
--
-- slack_installations + pending_slack_approvals: see
-- _specs/CHAT-08-external-reach/design.md for the full rationale. Nothing
-- past this schema is wired yet — the Bolt app/OAuth flow is blocked on a
-- human registering a Slack app (SLACK_CLIENT_ID/SECRET/SIGNING_SECRET).
--
-- agent_traces.surface_type / mcp_client: fixes a pre-existing gap — the
-- in-app chat route already computed `surfaceType` (traced-ai.ts's
-- TraceMetadata) but recordTrace() never persisted it to a queryable
-- column, only toolCallEvents had one. CHAT-08's AC6 needs
-- `agentTraces GROUP BY surfaceType`, so this fixes attribution for ALL
-- surfaces (global/contact/.../slack/mcp), not just the new ones.

DO $$ BEGIN
  CREATE TYPE slack_installation_status AS ENUM ('active', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pending_slack_approval_status AS ENUM ('pending', 'approved', 'denied', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS slack_installations (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  slack_team_id          TEXT NOT NULL,
  slack_team_name        TEXT,
  bot_token_encrypted    TEXT NOT NULL,
  installed_by_user_id   TEXT REFERENCES users(id),
  status                 slack_installation_status NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS slack_installations_team_idx ON slack_installations (slack_team_id);
CREATE INDEX IF NOT EXISTS slack_installations_tenant_idx ON slack_installations (tenant_id);

CREATE TABLE IF NOT EXISTS pending_slack_approvals (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  slack_team_id          TEXT NOT NULL,
  requested_by_user_id   TEXT NOT NULL REFERENCES users(id),
  tool_name              TEXT NOT NULL,
  args                   JSONB NOT NULL DEFAULT '{}',
  slack_channel_id       TEXT NOT NULL,
  slack_message_ts       TEXT NOT NULL,
  status                 pending_slack_approval_status NOT NULL DEFAULT 'pending',
  expires_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_slack_approvals_tenant_idx ON pending_slack_approvals (tenant_id);
CREATE INDEX IF NOT EXISTS pending_slack_approvals_status_idx ON pending_slack_approvals (status);

ALTER TABLE agent_traces ADD COLUMN IF NOT EXISTS surface_type TEXT;
ALTER TABLE agent_traces ADD COLUMN IF NOT EXISTS mcp_client TEXT;
CREATE INDEX IF NOT EXISTS at_surface_type_idx ON agent_traces (surface_type);
