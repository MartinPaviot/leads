# INBOX-G13 — MCP server + agent Skills (GTM-grounded inbox/CRM)
> Theme: T7 · Autonomy rung: agent · Priority: P1
> Pillar: P5 GTM moat / cross (trust)

## User story
As a founder who lives in Claude / Cursor / ChatGPT, I want Elevay to expose my GTM-grounded inbox
**and** CRM as an MCP server — search mail, read the cited deal/signal/last-interaction graph, draft
in my voice, log interactions — plus a set of revenue-native Skills (a "Deal Tracker", a "Morning
Briefing") I can schedule, all tenant-scoped and authed, so my external AI tools act on my real
pipeline, not a generic CRM.

## Why (audit anchor)
Superhuman ships an **MCP Server** (Claude Desktop / Code / ChatGPT / Cursor / Gemini connect to its
inbox + calendar) **and** pre-built **Skills** — Morning Briefing, End-of-Day Wrap-Up, Batch Draft
Writer, **Deal Tracker** (summarizes comms history with a contact/company), Meeting Scheduler
(`ai-feature-deep-dive.md` §"MCP"). Its CRM, though, is an *external* Salesforce/HubSpot sidebar view
(`ai-feature-deep-dive.md` §"Superhuman for Sales"). We already run a **native CRM MCP server**
(`app/api/mcp/route.ts` — 12 JSON-RPC tools: search/get/list contacts·companies·deals, create_contact/
deal, log_note, list_activities, semantic search_crm) with Bearer-key auth + tenant resolution +
audit logging. G13 extends it to cover the **inbox** (search mail, summarize threads, draft grounded
replies, book sovereign visios) and ships **revenue-native Skills** — so external agents act on the
whole GTM graph with citations, something Superhuman's external-CRM MCP can't reach.

## Requirements (EARS)
- The system SHALL extend the existing MCP server (`/api/mcp`) with inbox/GTM tools: `search_inbox`
  (NL search over the user's scoped mail), `summarize_thread` (cited TL;DR, INBOX-S01/S08),
  `draft_reply` (voice-matched + GTM-grounded + cited, reusing INBOX-C01/G08), `list_signals`
  (freshness-gated, INBOX-G04), `last_interaction` (INBOX-G03), `book_meeting` (sovereign visio,
  INBOX-G10), `log_interaction` (capture-approval-gated, INBOX-G02).
- The system SHALL authenticate every MCP call by Bearer token (`mcp_…`), resolve it to a tenant via
  the hashed key (reusing `authenticateMcpRequest`), and SHALL hard-scope every tool to that tenant —
  no tool may read or write outside it.
- WHEN a tool reads mail, the system SHALL additionally enforce the per-user mailbox scope tied to the
  key's `keyOwnerId` (mail is personal: `lib/inbox/user-scope.ts`), so a workspace key cannot read a
  teammate's private inbox.
- The system SHALL keep mutating tools (create/advance deal, log interaction, book) bound by the
  capture-approval mode and the autonomy dial (INBOX-T11) — a `draft_reply` returns a draft and SHALL
  NOT send; `log_interaction` honours `review` mode; nothing auto-sends.
- The system SHALL ship schedulable **Skills** (revenue-native): **Deal Tracker** (summarize comms +
  deal/signal state for a contact/company, cited), **Morning Briefing** (overnight replies, at-risk
  deals, today's bookings), **End-of-Day Wrap-Up**, **Batch Draft Writer** (grounded drafts for
  flagged threads) — each composed from the tools above, each citing its sources.
- The system SHALL keep the MCP admin surface (key create/list/revoke) admin-only and prod-gated as
  today (`MCP_PAGE_ENABLED`), and SHALL log every authentication + every tool call (tenant, keyId,
  tool, timestamp) for audit.
- The system SHALL return JSON-RPC 2.0 (initialize / tools/list / tools/call / ping), exactly as the
  current server, so existing MCP clients connect unchanged.
- The system SHALL be sovereign-friendly: self-hostable, no provider names in tool output ("via
  Elevay"), and SHALL honour the zero-retention AI option for `summarize_thread`/`draft_reply`.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a valid `mcp_` key WHEN a client calls `tools/list` THEN the response includes the existing CRM
  tools PLUS `search_inbox`, `summarize_thread`, `draft_reply`, `list_signals`, `last_interaction`,
  `book_meeting`, `log_interaction`.
- GIVEN a key for tenant A WHEN any tool runs THEN it returns only tenant-A data; a request for a
  tenant-B id returns not-found, never B's record.
- GIVEN a workspace key owned by user U WHEN `search_inbox` runs THEN it returns only U's mailbox mail
  (per-user scope), not a teammate's.
- GIVEN `draft_reply` WHEN called THEN it returns a voice-matched, GTM-grounded draft with citations
  and does NOT send the email.
- GIVEN `log_interaction` on a `review`-mode tenant WHEN called THEN it parks a capture approval (no
  activity yet), mirroring INBOX-G02.
- GIVEN the **Deal Tracker** Skill WHEN run for a company THEN it returns a cited summary of comms +
  deal stage + fresh signals + last interaction.
- GIVEN an invalid/revoked key WHEN any call is made THEN it returns UNAUTHORIZED and is not executed.
- GIVEN the MCP settings page in production WHEN a non-admin loads it THEN it 404s (`MCP_PAGE_ENABLED`).

## Edge cases & failure handling
- Key with no `keyOwnerId` (legacy) → inbox tools requiring per-user scope refuse with a clear error
  (workspace-scoped CRM tools still work); prompt to re-issue a key.
- `book_meeting` with no connected calendar → returns the honest "no mailbox connected" error (G10),
  no fabricated event.
- `summarize_thread`/`draft_reply` with LLM unavailable → returns a structured error, never a guess.
- Tenant-key lookup at scale → the current full-tenant scan is acceptable at pilot scale; flag the
  index-on-key_prefix optimization (already noted in the server) as a follow-up, not a blocker.
- Tool returns large result → cap + paginate (the CRM tools already cap at 100–200).
- Zero-retention tenant → summaries/drafts not persisted beyond the call; tools say so.
- Rate/abuse → per-key rate limiting on generative tools; audit every call.
- Cross-tenant via forged id in args → every handler filters by the auth-resolved `tenantId`, never a
  client-supplied tenant.

## Best-in-class bar
- **Native GTM MCP, not an external-CRM bridge**: external agents act on our own deal/signal/last-
  interaction graph with citations — Superhuman's MCP can search its inbox but its CRM is a third-party
  sidebar. Ours exposes the moat itself.
- **Revenue-native Skills**: a Deal Tracker / Morning Briefing grounded in the pipeline (cited),
  reusing the inbox's own grounded-draft + signal + timeline engines — not a generic mail assistant.
- **Trust-preserving by construction**: tenant + per-user scope, capture-approval + autonomy gating,
  never-auto-send, full audit, zero-retention option, sovereign/self-hostable — the same guarantees the
  inbox keeps, extended to every external agent.

## Design sketch
- **Data:** keys in `tenants.settings.mcpApiKeys` (`McpApiKeyEntry` — `keyHash`, `keyPrefix`,
  `keyOwnerId`, `lastUsedAt`); reads over `activities`/`contacts`/`companies`/`deals`/`outbound_emails`
  with tenant + (for mail) per-user scope (`lib/inbox/user-scope.ts`).
- **API:** extend `MCP_TOOLS` + `handleTool` in `app/api/mcp/route.ts` with the inbox/GTM tools, each
  delegating to existing seams: `search_inbox` → `loadConversationRows` + `scopeConversationRows`;
  `summarize_thread` → INBOX-S01 summarizer; `draft_reply` → INBOX-C01/G08 (`lib/inbox/draft-context.ts`
  + the draft route); `list_signals` → `filterFreshSignals`; `last_interaction` → the G03 timeline query;
  `book_meeting` → `POST /api/meetings/book` (sovereign); `log_interaction` → `recordCapturedActivity`.
  Skills = scheduled jobs (Inngest cron) composing these tools, written to a Skills registry; reuse the
  key auth + per-tool audit logging already in `authenticateMcpRequest`.
- **UI:** the existing `/settings/mcp` admin page (`app/(dashboard)/settings/mcp/page.tsx`, sidebar
  entry `MCP Integration`, lucide `Plug`, `MCP_PAGE_ENABLED`) gains: the new tool catalog (read-only
  list), a per-key **owner** + **mail-scope** indicator, and a Skills panel (enable + schedule Deal
  Tracker / Morning Briefing). Connection snippet for Claude/Cursor. `--color-bg-card`, `--shadow-card`,
  Inter; light+dark via tokens, no emoji, no provider name, outputs cited "via Elevay". Stays admin-only.
- **AI:** `summarize_thread`/`draft_reply` reuse the inbox's models (`claude-sonnet-4-6` via
  `tracedGenerateObject`) + the cited GTM bundle; honour zero-retention (P03). Skills are agentic
  compositions, each transparent about its sources.
- **Security/perf:** tenant scope on every handler (auth-resolved, never client-supplied);
  per-user mailbox scope on mail tools (key `keyOwnerId`); capture-approval + autonomy gating on writes;
  never-auto-send; audit every auth + tool call; rate-limit generative tools; admin-only + prod-gated UI.

## Tasks (ordered)
1. Add inbox/GTM tools to `MCP_TOOLS` + `handleTool`, each delegating to the existing seam and enforcing
   tenant + (mail) per-user scope. (verify: `tools/list` includes them; each returns scoped data) (test:
   MCP route tests — per tool: scope enforced, tenant-B id → not found)
2. Per-user mailbox scope on mail tools via the key's `keyOwnerId` + `lib/inbox/user-scope.ts`. (verify:
   workspace key reads only the owner's mailbox) (test: cross-user mail-scope test)
3. Gate mutating tools: `draft_reply` never sends; `log_interaction` honours capture-approval mode;
   `book_meeting` sovereign + honest not-connected error. (verify: review-mode log parks an approval;
   draft returns without sending) (test: gating tests)
4. Revenue-native Skills (Deal Tracker, Morning Briefing, End-of-Day, Batch Draft Writer) as scheduled
   compositions of the tools, each cited. (verify: Deal Tracker returns a cited comms+deal+signal summary)
   (test: skill-output tests asserting citations)
5. `/settings/mcp` UI: tool catalog + per-key owner/mail-scope + Skills enable/schedule + connection
   snippet (admin-only, `MCP_PAGE_ENABLED`). (verify: admin sees catalog+Skills; non-admin 404 in prod)
   (test: visibility + render)
6. Audit + rate-limit generative tools. (verify: every auth + tool call logged; generative tools
   rate-limited) (test: audit-log + rate-limit tests)

## Current-state notes (VERIFY before building — code moves)
- MCP server EXISTS and is native-CRM: `app/api/mcp/route.ts` — `MCP_TOOLS` (12 tools, `:19`),
  `authenticateMcpRequest` (Bearer `mcp_`, hashed-key tenant resolution + `lastUsedAt` + audit log,
  `:230`), `handleTool` switch (`:293`), JSON-RPC `initialize`/`tools/list`/`tools/call`/`ping`
  (`:917`), `GET` discovery (`:991`). **Extend this — do not stand up a second server.**
- Key management EXISTS: `app/api/mcp/keys/route.ts` (admin-only `requireAdmin`, `mcp_<32hex>` gen,
  bcrypt hash, max 5 keys, `keyOwnerId` captured, create/list/revoke + audit, `:11`–`:169`). Keys live
  in `tenants.settings.mcpApiKeys` (`McpApiKeyEntry`, `lib/config/tenant-settings.ts`).
- Settings UI EXISTS + is admin-only + prod-hidden: `app/(dashboard)/settings/mcp/page.tsx`; sidebar
  entry "MCP Integration" gated by `MCP_PAGE_ENABLED` (`settings-sidebar.tsx:107`,
  `lib/settings/admin-tools-visibility.ts`). Admin tools must stay prod-hidden (`feedback_admin-features`,
  MEMORY [Admin tools prod-hidden]).
- **Gaps G13 fills:** (a) no inbox/mail tools (only CRM); (b) no per-user mailbox scope on the server —
  auth resolves a *tenant*, mail is personal so a per-user gate via `keyOwnerId` + `lib/inbox/user-scope.ts`
  is required; (c) no Skills; (d) no zero-retention path on generative tools; (e) tenant-key lookup is a
  full scan (`route.ts:243`, the server itself flags an index-on-prefix optimization for scale).
- Reused seams: `loadConversationRows`/`scopeConversationRows` (`lib/inbox/load.ts`, `user-scope.ts`);
  `recordCapturedActivity` (`lib/capture/approval.ts:80`); `filterFreshSignals` (`lib/signals/freshness.ts:100`);
  last-interaction union (`lib/accounts/last-interaction.ts:36`); sovereign booking
  (`app/api/meetings/book/route.ts`); grounded draft (INBOX-C01/G08, `lib/inbox/draft-context.ts`);
  summarizer (INBOX-S01).
- **README catalog:** add `INBOX-G13 — MCP server + agent Skills` to the T7 list (done in this change).
