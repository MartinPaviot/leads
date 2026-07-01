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
- **B.5 / B.6** 🛑 NOT STARTED — the real remaining unknown. Needs an actual
  OAuth 2.1 **authorization server** implementation (LeadSens issuing
  tokens to external clients), not just "reuse NextAuth" (NextAuth makes
  US a Google/MS OAuth *client*, not a *provider* — see design.md's
  correction to office-hours.md's premise). The SDK's `ProxyOAuthServerProvider`
  is Express-`Response`-coupled, not Fetch-API compatible — using it as-is
  inside a Next.js Route Handler doesn't work. The transport itself IS
  solved: `WebStandardStreamableHTTPServerTransport.handleRequest(req: Request): Promise<Response>`
  maps directly onto a Next.js route handler once auth exists in front of
  it. This is its own multi-day pass.
- **B.7** Subdomain `mcp.leadsens.com` via DNS + route config. Infra change — confirm with Martin first.
- **B.8** E2E with Claude Desktop, Cursor, ChatGPT.

## Phase C — Hardening + launch (≈1 week)

- **C.1** Rate limits: Slack per-tenant, MCP per-user.
- **C.2** /admin/evals per-surface dashboard overlap (CHAT-09).
- **C.3** Public docs at docs.leadsens.com/mcp + /slack.
- **C.4** Feature flag flip to true.

## Exit criteria

All 8 AC items in requirements.md pass. agentTraces shows surfaceType attribution across `global`, surface variants, `slack`, `mcp`. No regression in in-app chat.
