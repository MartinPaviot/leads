# CHAT-08 — Tasks

Copy of the implementation plan. Design rationale lives in office-hours.md + design.md.

## Phase A — Slack integration (≈3 weeks)

- **A.1** ✅ DONE (2026-07-01) — Schema + migration `0109_chat08_slack_and_mcp_traces.sql`
  (`slack_installations` + `pending_slack_approvals` tables). See `src/db/schema/slack.ts`.
- **A.2** 🛑 BLOCKED — needs a human (Martin) to register a Slack app at
  api.slack.com/apps and provide `SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/
  `SLACK_SIGNING_SECRET`. Everything below is deliberately NOT built yet —
  see design.md "don't build the Bolt app wiring speculatively against
  unregistered scopes."
- **A.3** `GET /api/slack/install` + `GET /api/slack/oauth/callback`. UI "Connect Slack" button in /settings/integrations.
- **A.4** `lib/slack/app.ts` factory (per-installation Bolt app); `lib/slack/user-map.ts` Slack↔LeadSens user via email.
- **A.5** `/leadsens` slash command handler. Ack ≤3s, run async, post via response_url. Uses buildAllChatTools + resolver(surface="slack").
- **A.6** `app_mention` event handler. Threaded replies.
- **A.7** Interactive approval for mutations: pending_slack_approvals row + Approve/Deny message.
- **A.8** E2E in a dev Slack workspace.

## Phase B — Public MCP (≈2 weeks)

- **B.1** ✅ DONE (2026-07-01) — Installed `@modelcontextprotocol/sdk@1.29.0`
  (peers cleanly on zod@4.4.3, already this repo's zod version).
- **B.2** ✅ DONE — same migration as A.1 also adds `agent_traces.surface_type`
  + `agent_traces.mcp_client`. Extended `TraceMetadata` (`mcpClient` field)
  and, importantly, fixed all 6 `recordTrace()` call sites in
  `traced-ai.ts` that were silently DROPPING the existing `surfaceType`
  field — a pre-existing bug affecting in-app chat attribution too, not
  just new MCP/Slack traffic. See design.md's "Schema gap found" section.
- **B.3** ❌ REMOVED — moot. `McpServer.registerTool` converts Zod → JSON
  Schema internally (confirmed by reading the SDK source); no custom
  adapter needed. What WAS needed and isn't in the original plan: a
  `.shape`-extraction step, since this SDK version wants a raw
  `ZodRawShape`, not a wrapped `z.object(...)` — see `toMcpShape()` in
  `lib/mcp/build-mcp-server.ts`.
- **B.4** ✅ DONE — `lib/mcp/build-mcp-server.ts#buildMcpServerForContext()` +
  `lib/mcp/identify-client.ts#identifyMcpClient()`. Builds a fresh,
  stateless, per-request `McpServer` from `buildAllChatTools` +
  `resolveCapabilities(surface: {type:"mcp"}, allowDestructive: false — HARD-CODED, not a param)`.
  15 tests (10 unit + regression coverage for the traced-ai.ts fix).
  Independently correct and tested WITHOUT a transport/OAuth in front of it.
- **B.5 / B.6** ✅ DONE (2026-07-01) — full OAuth 2.1 authorization server,
  hand-rolled as plain Next.js Route Handlers (the SDK's
  `ProxyOAuthServerProvider` is Express-`Response`-coupled, confirmed via
  source read — not usable inside a Route Handler). RFC 7591 dynamic
  client registration (`POST /api/mcp/register`), RFC 7636 PKCE-mandatory
  (S256-only) authorization code flow (`GET /api/mcp/authorize` →
  `/mcp/consent` → `POST /api/mcp/authorize/decision`), refresh-token
  rotation (`POST /api/mcp/token`), RFC 8414 metadata discovery at
  `/.well-known/oauth-authorization-server` (via a `next.config.ts`
  rewrite, not a literal dot-folder route). New tables
  `mcp_oauth_clients` / `mcp_oauth_authorization_codes` / `mcp_oauth_tokens`
  (migration `0110_mcp_oauth.sql`, applied to localdev). Tokens stored
  SHA-256-hashed (never raw); auth-code consumption and refresh rotation
  are both atomic (`UPDATE ... WHERE ... IS NULL RETURNING`, so a race
  loses the second caller instead of double-issuing). 46 tests
  (pkce/tokens/clients/authorization-codes/access-tokens + authorize/token
  route tests), tsc clean, full suite green (894 files / 8205 tests, 5
  unrelated pre-existing LLM-tier eval-gate timeouts excluded).

  **Mid-build discovery — legacy MCP server replaced.** Found a
  pre-existing, live, hand-rolled JSON-RPC MCP server at `/api/mcp/route.ts`
  (created 2026-05-05, ~2 months before CHAT-08): 12 tools, auth via
  tenant-wide bcrypt-hashed API keys (`tenants.settings.mcpApiKeys`), zero
  role-based filtering (any key could call create_contact/create_deal).
  Verified every legacy tool has a superior equivalent in the modern
  `buildAllChatTools` registry before touching anything. Asked the founder
  how to reconcile (replace / coexist / just patch the legacy bug) —
  **decision: replace legacy entirely.** `/api/mcp/route.ts` now serves
  only the OAuth-authenticated transport; `POST /api/mcp/keys` (create-key)
  returns 410 with a clear message; GET/DELETE stay so existing tenants
  can still see/revoke old keys; `settings/mcp/mcp-client.tsx` rewritten
  to describe OAuth setup instead of API keys. See design.md for the full
  decision record.
- **B.7** Subdomain `mcp.leadsens.com` via DNS + route config. Infra change — confirm with Martin first.
- **B.8** E2E with Claude Desktop, Cursor, ChatGPT.

## Phase C — Hardening + launch (≈1 week)

- **C.1** Rate limits: Slack per-tenant, MCP per-user. PARTIAL — MCP OAuth
  endpoints are rate-limited (`register`: 20/hour/IP, `token`: 60/min/IP);
  per-user tool-call rate limiting on the transport itself is still open.
- **C.2** /admin/evals per-surface dashboard overlap (CHAT-09).
- **C.3** Public docs at docs.leadsens.com/mcp + /slack.
- **C.4** Feature flag flip to true.

## Exit criteria

All 8 AC items in requirements.md pass. agentTraces shows surfaceType attribution across `global`, surface variants, `slack`, `mcp`. No regression in in-app chat.
