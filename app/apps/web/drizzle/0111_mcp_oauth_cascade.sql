-- CHAT-08 — fix a real bug found via live OAuth verification (2026-07-01):
-- mcp_oauth_authorization_codes / mcp_oauth_tokens referenced tenants(id)
-- and users(id) with NO ON DELETE CASCADE, unlike this codebase's
-- established convention for tenant-scoped tables (see e.g.
-- db/schema/agent.ts, campaign.ts). A tenant (or user) with any
-- outstanding MCP OAuth grant could not be deleted — the delete would
-- throw an FK violation. Reproduced live: the E2E test-cleanup route
-- (which deletes users then tenants) 500'd after registering an OAuth
-- client, authorizing, and exchanging a token for a seeded tenant.
--
-- Constraint names below are Postgres's default `<table>_<column>_fkey`
-- naming (0110 used plain inline REFERENCES, not named constraints) —
-- confirmed against the actual applied schema, not guessed. Additive in
-- effect (DROP CONSTRAINT IF EXISTS + re-add); safe to re-run.

ALTER TABLE mcp_oauth_authorization_codes DROP CONSTRAINT IF EXISTS mcp_oauth_authorization_codes_client_id_fkey;
ALTER TABLE mcp_oauth_authorization_codes DROP CONSTRAINT IF EXISTS mcp_oauth_authorization_codes_tenant_id_fkey;
ALTER TABLE mcp_oauth_authorization_codes DROP CONSTRAINT IF EXISTS mcp_oauth_authorization_codes_app_user_id_fkey;

ALTER TABLE mcp_oauth_authorization_codes
  ADD CONSTRAINT mcp_oauth_authorization_codes_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE;
ALTER TABLE mcp_oauth_authorization_codes
  ADD CONSTRAINT mcp_oauth_authorization_codes_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE mcp_oauth_authorization_codes
  ADD CONSTRAINT mcp_oauth_authorization_codes_app_user_id_fkey
  FOREIGN KEY (app_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE mcp_oauth_tokens DROP CONSTRAINT IF EXISTS mcp_oauth_tokens_client_id_fkey;
ALTER TABLE mcp_oauth_tokens DROP CONSTRAINT IF EXISTS mcp_oauth_tokens_tenant_id_fkey;
ALTER TABLE mcp_oauth_tokens DROP CONSTRAINT IF EXISTS mcp_oauth_tokens_app_user_id_fkey;

ALTER TABLE mcp_oauth_tokens
  ADD CONSTRAINT mcp_oauth_tokens_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE;
ALTER TABLE mcp_oauth_tokens
  ADD CONSTRAINT mcp_oauth_tokens_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE mcp_oauth_tokens
  ADD CONSTRAINT mcp_oauth_tokens_app_user_id_fkey
  FOREIGN KEY (app_user_id) REFERENCES users(id) ON DELETE CASCADE;
