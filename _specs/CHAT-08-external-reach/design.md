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

## Deferred out of this pass (tracked in tasks.md, not silently dropped)

- A.2–A.8 (Slack Bolt app, OAuth, slash command, mentions, interactive
  approval, e2e) — blocked on Martin registering a Slack app.
- B.5/B.6's OAuth wiring (`/api/mcp/authorize`, `/api/mcp/token`, the
  `OAuthServerProvider` implementation, dynamic client registration) — the
  MCP tool-list/tool-call core (this pass) is complete and independently
  testable, but unreachable by a REAL external client until OAuth exists.
  This is the single largest remaining unknown in the whole spec and
  deserves its own dedicated pass, not a rushed implementation here.
- B.7 (DNS subdomain `mcp.leadsens.com`) — infra change, confirm with
  Martin before touching DNS.
- B.8, Phase C entirely.

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
