# CHAT-08 — Design

Referenced by tasks.md but never written until now (2026-07-01). Grounded in
the actual installed SDKs, not the spec's illustrative sketch — several
details below correct or sharpen office-hours.md's assumptions after reading
real type definitions instead of guessing.

## Architecture overview

Two independent external surfaces, both terminating in the SAME
`buildAllChatTools(ctx)` + `resolveCapabilities(tools, {role, surface, allowDestructive: false, ...})`
pipeline the in-app chat already uses (`src/app/api/chat/route.ts`). Neither
surface reimplements tool logic — they adapt transport only.

```
Slack workspace ──Bolt app (Events API + slash cmd)──┐
                                                        ├─> resolveCapabilities(surface) ─> tool.execute(args)
MCP client (Claude Desktop/Cursor/ChatGPT) ──MCP JSON-RPC┘
```

## Part A — Slack (blocked on human step at A.2)

Schema (`slack_installations`, `pending_slack_approvals`) is fully
unblocked and specified below. Everything past A.2 needs
`SLACK_CLIENT_ID`/`SLACK_CLIENT_SECRET`/`SLACK_SIGNING_SECRET` from a Slack
app registered at api.slack.com/apps — a human (Martin) step, not
guessable. **STOP HERE until those three secrets exist** — don't build the
Bolt app wiring speculatively against unregistered scopes.

### slack_installations
- `id`, `tenantId` (FK tenants), `slackTeamId` (unique per tenant — one
  workspace per tenant for v1, matches requirements' "out of scope: cross-tenant
  Slack"), `slackTeamName`, `botTokenEncrypted` (AES-256-GCM via
  `lib/crypto/settings-encryption.ts`'s existing `encryptSecret`/`decryptSecret`
  — same pattern as `connectedMailboxes.secretEncrypted`, NOT a new crypto
  scheme), `installedByUserId`, `status` (active/revoked), timestamps.
- Unique index on `slackTeamId` alone (not just tenant+team) — a Slack
  workspace can only be installed to ONE LeadSens tenant at a time; this
  is what makes AC edge-case 2 ("Slack user in multiple LeadSens tenants")
  a genuine edge case rather than the default.

### pending_slack_approvals
- `id`, `tenantId`, `slackTeamId`, `requestedByUserId` (LeadSens app user,
  resolved via `slack_user_id` -> email -> `users` lookup), `toolName`,
  `args` (jsonb, the proposed tool call), `slackChannelId`,
  `slackMessageTs` (to edit the interactive message in place on
  approve/deny), `status` (pending/approved/denied/expired),
  `expiresAt` (15 min per office-hours pitfall #5 — Slack's own interactive
  button UX degrades past that window regardless of what we set here, so
  this is a floor not a UX promise), timestamps.
- No FK to `toolCallEvents` — the approval row is created BEFORE the tool
  runs (unlike toolCallEvents, which records AFTER). On approve, the
  handler calls the tool's `execute()` directly (same registry, same
  `resolveCapabilities` gate re-checked at approval time in case role/plan
  changed between propose and approve) then writes a toolCallEvents row
  exactly like the in-app path does — no parallel bookkeeping.

## Part B — MCP (unblocked through B.6; B.7 DNS needs Martin; OAuth is the real remaining unknown)

### Correction to office-hours.md's premise

"MCP requires a stable OAuth provider (we already have NextAuth)" undersells
this. NextAuth makes US a Google/Microsoft OAuth **client** (we consume their
login). MCP needs LeadSens to act as an OAuth **authorization server** —
issuing access tokens to third-party native apps (Claude Desktop, Cursor)
that have never talked to Google/MS on our behalf. This is new
infrastructure, not a reuse. Confirmed by reading the installed
`@modelcontextprotocol/sdk@1.29.0`'s `server/auth/` module: it ships
`ProxyOAuthServerProvider` for exactly "delegate OAuth to an upstream IdP"
— but that class is Express-`Response`-coupled (imports `express`), not
Fetch-API compatible, so it can't be dropped into a Next.js Route Handler
as-is. The SDK's lower-level `OAuthServerProvider` interface (`provider.d.ts`)
is transport-agnostic — implementing THAT directly, with our own
`/api/mcp/authorize` + `/api/mcp/token` route handlers wrapping Google/MS
sign-in as the consent step, is the right shape. **This is its own
multi-day sub-task, not part of this pass** — flagged in tasks.md's B.5/B.6,
not built here.

### What IS built this pass (transport-and-tool-list core, no OAuth yet)

- **Package**: `@modelcontextprotocol/sdk@1.29.0` (installed; peers on
  zod@4.4.3, which this repo already uses — no version conflict, unlike a
  naive read of the office-hours doc's "Layer 2, fast-moving" warning might
  suggest for the zod side specifically).
- **Transport**: `WebStandardStreamableHTTPServerTransport` (NOT the Node/Express
  `StreamableHTTPServerTransport` wrapper office-hours.md's illustrative
  snippets might imply) — its `handleRequest(req: Request): Promise<Response>`
  signature is the exact Fetch API shape Next.js Route Handlers use natively.
  Confirmed via the installed package's own `.d.ts`, not assumed.
- **Mode**: stateless (`sessionIdGenerator: undefined`). Vercel Functions don't
  share memory across invocations/cold starts, so the SDK's stateful mode
  (in-memory `_streamMapping`) would silently break the moment two requests
  land on different instances. A fresh `McpServer` + fresh transport are
  built PER REQUEST inside the route handler, mirroring the SDK's own
  documented "Per-Request MCP Handler with Authentication Context" pattern.
- **Tool registration shape**: `registerTool(name, {description, inputSchema}, execute)`
  where `inputSchema` in this installed version is a **raw `ZodRawShape`**
  (`{key: zodType, ...}`), NOT a wrapped `z.object({...})` — confirmed by
  reading the SDK's own shipped example
  (`dist/esm/examples/server/simpleStatelessStreamableHttp.js`), which
  contradicts some newer/`main`-branch doc snippets that show a full
  `z.object()`. Our registry's tools store a full `ZodObject` via
  `makeTool<I>({inputSchema: z.ZodType<I>, ...})`, so the MCP adapter
  extracts `.shape` before calling `registerTool` — see
  `lib/mcp/build-mcp-server.ts`.
- **No custom zod→JSON-Schema adapter needed** (tasks.md's B.3 as originally
  scoped is moot): `McpServer.registerTool` converts the Zod shape to JSON
  Schema 2020-12 internally. Deleted that task; kept the file name as a
  comment pointer in case a future SDK major version changes this.

### `lib/mcp/build-mcp-server.ts` (this pass)

```ts
export function buildMcpServerForContext(toolCtx: ToolContext, resolveInput: Omit<ResolveInput, "surface">): McpServer
```
- Calls `buildAllChatTools(toolCtx)` then `resolveCapabilities(tools, {...resolveInput, surface: {type: "mcp"}, allowDestructive: false})`
  — `allowDestructive` is HARD-CODED false here (not merely defaulted), so a
  caller can never accidentally enable destructive tools over MCP; matches
  AC5 + pitfall #3's spirit extended to MCP (the spec only says this for
  Slack, but the same reasoning — no reliable two-step confirmation in an
  external client — applies at least as strongly to MCP, so this pass
  hard-gates it there too; flag to revisit if MCP later grows its own
  confirmation UX).
- For each surviving tool, extracts `.shape` from its Zod `inputSchema` and
  calls `server.registerTool(name, {description, inputSchema: shape}, async (args) => { const result = await tool.execute(args); return { content: [{ type: "text", text: JSON.stringify(result) }] }; })`.
  MCP's `content` array wants text/structured blocks, not our tools' raw
  JS return values — this pass always wraps as a single JSON text block;
  richer `structuredContent` per-tool is a v2 refinement, not required by
  AC5's bar ("createContact via MCP persists a contact visible in the UI").
- Every tool call is wrapped in a `recordTrace`/`agentTraces` write with
  `agentId: "mcp"`, `metadata: {surfaceType: "mcp", mcpTool: name}` — see the
  schema gap below.

### Schema gap found while building this: `agentTraces` has no queryable `surfaceType`/`mcpClient` columns

AC6 requires `agentTraces GROUP BY surfaceType` — but `surfaceType` today
only exists on `toolCallEvents` (CHAT-04's undo table), not on `agentTraces`.
The in-app chat route already passes `surfaceType` into `_trace` (see
`traced-ai.ts`'s `TraceMetadata.surfaceType`), but `recordTrace`'s actual
`db.insert(agentTraces).values({...})` call never reads it — it silently
drops on the floor today, in-app included, not just for future MCP/Slack
traffic. Fixed as part of this pass:
- Migration adds `agent_traces.surface_type TEXT` + `agent_traces.mcp_client TEXT`
  (nullable, additive).
- `recordTrace()` now writes `surfaceType: ctx.surfaceType ?? null` and
  `mcpClient: ctx.mcpClient ?? null` as first-class columns.
- This is a real, if small, pre-existing bug fix (in-app `surfaceType`
  attribution was silently broken before CHAT-08 touched anything) — noted
  here rather than folded silently into "MCP setup."

### `mcpClient` (User-Agent parsing)

Claude Desktop / Cursor / ChatGPT send distinguishable `User-Agent` headers.
`lib/mcp/identify-client.ts#identifyMcpClient(userAgent: string | null): string`
does simple substring matching (`"claude"`, `"cursor"`, `"chatgpt"`/`"openai"`),
falling back to `"unknown"` — no exhaustive registry; add cases as new
clients are tested (AC5's "Claude Desktop" is the only one in v1 exit
criteria; Cursor/ChatGPT are mentioned but not gated on).

## Part B, second pass (2026-07-01) — the OAuth 2.1 authorization server (B.5/B.6)

Built as plain Next.js Route Handlers, not the SDK's auth layer — confirmed
via source read that `ProxyOAuthServerProvider` imports `express` directly
(`import { Response } from "express"`), and that the SDK's actual
Express-based auth router (`mcpAuthRouter`) lives in the older
`@modelcontextprotocol/server-legacy` package per Context7. Neither is
Fetch-API compatible, so the whole authorization server is hand-rolled
against the SDK's reusable Zod wire-format schemas
(`OAuthClientMetadataSchema`, `OAuthClientInformationFullSchema`,
`OAuthTokensSchema`, `OAuthMetadataSchema`, `shared/auth.js`) rather than
its Express router.

- **Discovery**: `GET /.well-known/oauth-authorization-server` (RFC 8414),
  routed via a `next.config.ts` `rewrites()` entry to
  `/api/mcp/well-known-metadata` — avoids relying on undocumented literal
  dot-folder App Router behavior.
- **Registration**: `POST /api/mcp/register` (RFC 7591), rate-limited
  20/hour/IP. Public clients (Claude Desktop, Cursor) get no secret;
  confidential clients get a one-time-shown secret, stored hashed.
- **Authorization**: `GET /api/mcp/authorize` validates `response_type=code`,
  `code_challenge_method=S256`-only, and — critically — validates
  `isRedirectUriRegistered` **before issuing any redirect** (open-redirect
  prevention; a request naming an unregistered `redirect_uri` gets a plain
  400, never a 307 to the attacker-controlled URL — this exact case is a
  dedicated test). No session → redirects to `/sign-in?callbackUrl=<relative
  /mcp/consent?...>` (uses the existing `sanitizeCallbackUrl` contract,
  which requires a relative path). Session exists → redirects straight to
  `/mcp/consent`.
- **Consent**: `app/mcp/consent/page.tsx`, a Server Component that
  independently RE-validates auth + client + redirect_uri rather than
  trusting the `/authorize` redirect as proof (defense in depth — a forged
  direct hit on `/mcp/consent` re-derives everything from scratch). Plain
  HTML form posting to `/api/mcp/authorize/decision`.
- **Decision + code issuance**: `POST /api/mcp/authorize/decision` —
  `deny` redirects back with `error=access_denied`; `approve` calls
  `issueAuthorizationCode` (5-min TTL) and 303-redirects with `code`+`state`.
- **Token exchange + refresh**: `POST /api/mcp/token` (rate-limited
  60/min/IP), `grant_type=authorization_code` (consumes the code, verifies
  PKCE, issues tokens) and `grant_type=refresh_token` (rotates: old token
  revoked and a new pair issued atomically, never a bare update-in-place).
  Access tokens: 1hr TTL. Refresh tokens: 90-day TTL.
- **Storage**: 3 new tables (`mcp_oauth_clients`,
  `mcp_oauth_authorization_codes`, `mcp_oauth_tokens`; migration
  `0110_mcp_oauth.sql`, applied to localdev). Access/refresh tokens and
  the client secret are stored **SHA-256-hashed, never raw** — deliberately
  different from `lib/crypto/oauth-token-crypto.ts`'s reversible AES-256-GCM
  (used for Google/MS tokens we must show the provider again); MCP tokens
  are ours to verify, never to display again after issuance, so a one-way
  hash is the correct primitive here, not encryption.
- **Race safety**: both `consumeAuthorizationCode` and `refreshTokens` use
  `UPDATE ... WHERE ... IS NULL RETURNING` (mirrors the optimistic-lock
  pattern already used in `sequence-drafts/approve`) — a racing double-use
  updates 0 rows and is rejected, rather than double-issuing tokens.
- **`/api/mcp/route.ts`** (the transport itself) now requires a Bearer
  token verified via `verifyAccessToken` before building the MCP server —
  no more direct transport access without OAuth.
- **Tests**: 32 unit tests (pkce/tokens/clients/authorization-codes/
  access-tokens) + 17 route tests (authorize: 8, token: 9) = 49 new tests.
  tsc clean; full suite green (894 files / 8205 tests; 5 unrelated
  pre-existing LLM-tier eval-gate timeouts in `inbox-*-gate.test.ts`,
  gated behind `HAS_LLM` and hitting real models, excluded as unrelated).

### Mid-build discovery: a live legacy MCP server already existed — replaced, not merged

While about to write the new `/api/mcp/route.ts`, the Write tool refused
with "File has not been read yet" — the file already existed. Investigation
(`git log --oneline --follow`) found a hand-rolled JSON-RPC 2.0 MCP server,
created 2026-05-05 (commit "feat: custom objects system + MCP server"),
~2 months before this spec. It had:
- 12 tools (search_records/get_contact/get_company/get_deal/list_contacts/
  list_companies/list_deals/create_contact/create_deal/log_note/
  list_activities/search_crm), no SDK, no Zod-to-JSON-Schema layer.
- Auth via bcrypt-hashed `mcp_`-prefixed API keys stored **tenant-wide** in
  `tenants.settings.mcpApiKeys` (type `McpApiKeyEntry`, `lib/config/tenant-settings.ts`)
  — one key, shared by the whole tenant, not per-user.
- **Zero role-based filtering** — any valid key could call
  create_contact/create_deal regardless of who generated it or what role
  they hold today.
- A real, live settings UI (`settings/mcp/mcp-client.tsx`) and key-management
  route (`api/mcp/keys/route.ts`, GET list + POST create + DELETE revoke).

Before touching anything, verified every one of the 12 legacy tools has a
strictly superior equivalent already in the modern `buildAllChatTools`
registry (queryContacts/queryAccounts/queryDeals/createContact/createDeal/
createNote/logActivity/queryActivities/searchCRM — all Zod-validated,
role-filtered via `resolveCapabilities`, MCP-scoped `allowDestructive:false`
that the legacy server never had). No functional regression from removal.

Per CLAUDE.md's "unfamiliar file/branch/configuration → investigate before
deleting or overwriting" and this session's own earlier lesson about
verifying current state before building, this was NOT guessed — the founder
was asked directly: replace the legacy system with OAuth, make both
coexist at different paths, or just patch the legacy auth bug and stop.
**Decision: replace.** Executed as:
- `/api/mcp/route.ts` — fully replaced; now OAuth-only.
- `POST /api/mcp/keys` — returns 410 `mcp_api_keys_deprecated` with a clear
  message; **GET (list) and DELETE (revoke) still work** — existing keys
  stay visible/revocable, not silently deleted (no data loss, no silent
  breakage).
- `settings/mcp/mcp-client.tsx` — rewritten to describe the OAuth
  connection (no key to copy/manage); the API key section is relabeled
  "Legacy API Keys (deprecated)", explains they no longer work, and only
  offers revoke.

## Deferred out of this pass (tracked in tasks.md, not silently dropped)

- A.2–A.8 (Slack Bolt app, OAuth, slash command, mentions, interactive
  approval, e2e) — blocked on Martin registering a Slack app.
- B.7 (DNS subdomain `mcp.leadsens.com`) — infra change, confirm with
  Martin before touching DNS.
- B.8 (E2E with a REAL Claude Desktop/Cursor/ChatGPT client) — not
  attempted this pass; setting up a live external OAuth client round-trip
  is its own step and hasn't been raised with the founder yet.
- Phase C entirely (per-user MCP rate limiting on the transport itself,
  /admin/evals per-surface dashboard, public docs, feature flag flip).

## Exit bar for THIS pass specifically (not all of CHAT-08)

- `slack_installations` + `pending_slack_approvals` tables exist, migrated,
  covered by a schema-shape test (mirroring `outbound-persistence-schema.test.ts`'s
  pattern).
- `agent_traces.surface_type`/`mcp_client` columns exist; `recordTrace`
  writes them; a unit test proves the in-app chat's existing
  `surfaceType` finally lands in the DB (regression-proofing the fix, not
  just the new MCP path).
- `buildMcpServerForContext` unit-tested: given a fixed tool registry +
  role, produces the expected filtered tool count/names (mirrors
  `capability-resolver.test.ts`'s style), `allowDestructive` is provably
  always false regardless of input, and calling a registered tool's
  handler actually invokes the underlying `tool.execute` and records a
  trace.
- tsc clean, full vitest green, no OAuth/transport route shipped yet (that
  route would be untestable dead code without the OAuth piece behind it).
