-- CHAT-08 Part B — MCP OAuth 2.1 authorization server tables. LeadSens
-- acting as an OAuth PROVIDER (issuing tokens to external MCP clients),
-- distinct from NextAuth (LeadSens as an OAuth CLIENT consuming Google/MS).
-- See _specs/CHAT-08-external-reach/design.md. Additive + idempotent.

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id                   TEXT PRIMARY KEY,
  client_secret_hash          TEXT,
  client_name                 TEXT,
  redirect_uris                JSONB NOT NULL DEFAULT '[]',
  token_endpoint_auth_method  TEXT NOT NULL DEFAULT 'none',
  grant_types                 JSONB NOT NULL DEFAULT '["authorization_code", "refresh_token"]',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
  code                    TEXT PRIMARY KEY,
  client_id               TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  auth_user_id            TEXT NOT NULL,
  app_user_id             TEXT NOT NULL REFERENCES users(id),
  role                    TEXT NOT NULL,
  redirect_uri            TEXT NOT NULL,
  code_challenge          TEXT NOT NULL,
  code_challenge_method   TEXT NOT NULL DEFAULT 'S256',
  scope                   TEXT NOT NULL DEFAULT '',
  expires_at              TIMESTAMPTZ NOT NULL,
  consumed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_oauth_codes_client_idx ON mcp_oauth_authorization_codes (client_id);

CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  access_token_hash          TEXT PRIMARY KEY,
  refresh_token_hash         TEXT,
  client_id                  TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id),
  tenant_id                  TEXT NOT NULL REFERENCES tenants(id),
  auth_user_id               TEXT NOT NULL,
  app_user_id                TEXT NOT NULL REFERENCES users(id),
  role                       TEXT NOT NULL,
  scope                      TEXT NOT NULL DEFAULT '',
  access_token_expires_at    TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at   TIMESTAMPTZ,
  revoked_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_oauth_tokens_refresh_idx ON mcp_oauth_tokens (refresh_token_hash);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_client_idx ON mcp_oauth_tokens (client_id);
CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_tenant_idx ON mcp_oauth_tokens (tenant_id);
