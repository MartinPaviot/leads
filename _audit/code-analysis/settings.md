# Settings / Config / Governance — Page Audit

Generated: 2026-06-05. Source: static analysis of `app/apps/web/src`.

---

## Sidebar structure

File: `app/apps/web/src/app/(dashboard)/settings/settings-sidebar.tsx`

Hidden items (sidebar-filtered, `ready: false`, still URL-accessible):
- Custom Objects — `ready: false` (line 77)
- Plays — `ready: false` (line 79)
- Recording — `ready: false` (line 80)
- Signals — `ready: false` (line 81)
- Workflows — `ready: false` (line 82)

Admin-only section (hidden unless `isAdmin`) — line 86:
- Evaluations, LLM Budget, MCP Integration

ICP-related pages in sidebar but not in the original spec list:
- ICP & Product (`/settings/icp`) — visible
- ICP Profiles (`/settings/icp-profiles`) — visible

---

## ACCOUNT section

### Profile — route `/settings` — [ready]
- Purpose: Edit first name, last name, language, timezone; email is read-only.
- State: Real. Loads from `GET /api/settings/profile`, saves via `PUT /api/settings/profile`. (page.tsx:23–56)
- Writes: `firstName`, `lastName`, `language`, `timezone` to the user record. Language and timezone are persisted but not consumed by any visible downstream surface in this codebase (no locale-based rendering found that reads the user's `language` preference at runtime).
- Gaps: Email disabled — no change flow. Language/timezone stored but no runtime effect confirmed.

### Guardrails — route `/settings/guardrails` — [ready]
- Purpose: Approval mode selector + sending-infrastructure summary + LLM budget link.
- State: Real. Loads approval mode from `GET /api/settings/workspace` (`agentApprovalMode` field); saves via `PUT /api/settings/workspace`. Sending infra summary from `GET /api/settings/sending-infra`. (guardrails/page.tsx:83–127)
- Writes: `agentApprovalMode` (one of `review-each | batch-daily | auto-high-confidence`). This is actively consumed in:
  - `app/api/chat/route.ts` — passed into `buildChatSystemPrompt()` (route.ts:451)
  - `lib/guardrails/approval-mode.ts` — enforcement logic
  - `inngest/agent-reactor.ts` — agent action gating
  - `lib/migrations/ws-1-guardrail-defaults.ts` — migration
  - Tests: `__tests__/guardrails-approval-mode.test.ts`, `__tests__/agent-reactor.test.ts`
- The Guardrails page is the primary control for whether the agent can act autonomously. **Genuinely wired.**

### Privacy & data — route `/settings/privacy` — [ready]
- Purpose: GDPR controls — data region display, default data visibility, sub-processor DPA status, data export (SAR), delete-all.
- State: Real. Loads from `GET /api/settings/compliance`; updates visibility via `PUT /api/settings/workspace { defaultDataVisibility }`. GDPR export via `GET /api/gdpr/export`; delete via `POST /api/gdpr/delete`. (privacy/page.tsx:80–177)
- Writes:
  - `defaultDataVisibility` — stored in tenant settings (`lib/config/tenant-settings.ts:86`) but no access-control enforcement found in the CRM query layer. The value is persisted, not enforced.
  - DPA status — read-only display from compliance endpoint; no user-editable status toggle.
  - Data export and delete-all are wired to real API endpoints.
- Gaps: `defaultDataVisibility` is stored but no query-layer guard enforces "private" vs "everyone" filtering on records. DPA status is display-only, no UI to mark as "requested" or "signed".

### Security — route `/settings/security` — [ready]
- Purpose: Password change for credential accounts; SSO users told to use their provider.
- State: Real. `POST /api/account/password` with `{ currentPassword, newPassword }`. (security/page.tsx:28–42)
- Writes: Password hash in DB.
- Gaps: No 2FA, no active-session list (commented as "v2 ideas", security/page.tsx:12).

---

## WORKSPACE section

### General — route `/settings/workspace` — [ready]
- Purpose: Workspace name and company domain list; danger-zone "Delete workspace" button.
- State: Real. Loads from `GET /api/settings/workspace`, saves via `PUT`. Domains list and name are persisted. (workspace/page.tsx:17–73)
- Writes:
  - `name` — display name, used in recording bot branding (`lib/recording/branding.ts`).
  - `companyDomains` — used by email sync to skip internal addresses as external prospects.
- Gaps: "Delete workspace" button is `disabled` (workspace/page.tsx:138) — contact-support-only.

### ICP & Product — route `/settings/icp` — [ready]
- Purpose: Single-profile ICP definition — product description, sales motion, challenge, AI tone, target industries/sizes/roles/geographies.
- State: Real. Loads from `GET /api/settings/icp`, saves via `PUT /api/settings/icp`. (icp/page.tsx:29–68)
- Writes: `productDescription`, `salesMotion`, `primaryChallenge`, `aiTone`, `targetIndustries`, `targetCompanySizes`, `targetRoles`, `targetGeographies`.
  - These are consumed in: `lib/agents/sequence-generator.ts`, `lib/scoring/scoring.ts`, `lib/context/prospect-context.ts`, `lib/research/dossier-builder.ts`, `lib/agent-reactor/context-loader.ts`, `lib/icp/inference-prompt.ts`. **Genuinely wired into scoring, outbound, and agent context.**
- Gaps: Legacy single-ICP; superseded by ICP Profiles but kept for retro-compat ("Default ICP").

### ICP Profiles — route `/settings/icp-profiles` — [ready]
- Purpose: Multi-ICP rule builder; composable criteria over the field catalog; "Build TAM" button triggers Apollo prospecting stream.
- State: Real. `GET/POST/PATCH/DELETE /api/icps`; catalog from `GET /api/icp-catalog`; TAM build from `POST /api/tam/build` (NDJSON streaming). (icp-profiles/page.tsx:78–232)
- Writes: ICP definitions + criteria stored in DB; "Build TAM" triggers real Apollo sourcing. **Core prospecting workflow — wired.**
- Gaps: No delete confirmation dialog (bare `remove()` call without confirm, line 297).

### Mail & Calendar — route `/settings/mail-calendar` — [ready]
- Purpose: Connect Google/Microsoft OAuth, manage mailboxes, warmup progress, force sync, sync preferences (contact creation mode, backsync range, ignored domains).
- State: Real. Load: `GET /api/settings/mail-calendar`. OAuth via NextAuth `signIn()`. Delete mailbox: `DELETE /api/settings/mailboxes?id=`. Disconnect OAuth: `DELETE /api/settings/oauth?provider=`. Skip warmup: `PATCH /api/settings/mailboxes?id=&action=skip-warmup`. Force sync: `POST /api/email/sync`. Save prefs: `PUT /api/settings/mail-calendar`. (mail-calendar/page.tsx throughout)
- Writes:
  - `contactCreationMode` — consumed in `inngest/sync-functions.ts` and `app/api/email/sync/route.ts` to decide whether new senders become contacts. **Wired.**
  - `backsyncRange` — controls email history lookback on new account connection. Consumed in sync pipeline.
  - `doNotTrackDomains` — consumed in `lib/config/tenant-settings.ts` and sync functions to skip company creation. **Wired.**
- Gaps: Warmup progress is display-only; no way to configure warmup target from this page (set server-side).

### Capture Approvals — route `/settings/capture-approvals` — [ready]
- Purpose: Human-in-the-loop queue for interactions captured from email/meetings/calls before CRM insertion.
- State: Real. `GET /api/capture-approvals`; approve/reject via `POST /api/capture-approvals/:id`. (capture-approvals/page.tsx:39–83)
- Writes: Approve inserts activity into CRM; reject discards. Only populated when workspace `captureApprovalMode = 'review'`.
- Gaps: No UI in settings to set `captureApprovalMode` — it must be set elsewhere or via API. The page is the action queue, not the mode toggle.

### Members — route `/settings/members` — [ready]
- Purpose: List workspace members, change roles, send/resend/cancel invitations.
- State: Real. Members: `GET /api/settings/members`, role update `PUT`, invite `POST /api/settings/members/invite`, resend `POST /api/settings/members/invites/:id`, cancel `DELETE`. (members/page.tsx throughout)
- Writes: Member roles in DB; invitation records. Role gates admin-only sections in the sidebar (`settings-sidebar.tsx:114`).
- Gaps: Email delivery of invites depends on Resend domain verification — known broken in prod (memory note: all transactional email goes only to resend-signup@elevay.dev).

### Knowledge — route `/settings/knowledge` — [ready]
- Purpose: Add/edit/delete knowledge topics that are injected as context into AI requests.
- State: Real. `GET /api/settings/knowledge`, `POST`, `PUT`, `DELETE`. (knowledge/page.tsx:22–102)
- Writes: Knowledge topics stored in DB. Consumed in `app/api/chat/route.ts:451` as `knowledgeContext` (parallel fetch with RAG), then injected into `buildChatSystemPrompt()` (chat-system-prompt.ts:12–13, 343). **Wired into every chat request.**
- Gaps: No reordering; no per-topic enable/disable toggle.

### Notifications — route `/settings/notifications` — [ready]
- Purpose: Per-event toggles for in-app, email, Slack; Slack webhook URL.
- State: Real. `GET/PUT /api/notifications/preferences`. (notifications/page.tsx:47–78)
- Writes: Preferences stored per user. Consumed in `lib/emails/notifications.ts:48–50` — `sendNotification()` reads `typePrefs` and gates email/in-app delivery. **Wired.** Slack column visible but delivery via webhook is conditional on `slackConnected`; no evidence of actual Slack webhook dispatch in `lib/emails/notifications.ts` (reads preferences, sends email/in-app, Slack webhook call not confirmed in the notification library).
- Gaps: Slack notifications column visible but dispatch implementation unclear. In-app notification rendering pipeline exists but not audited here.

### Opportunity Stages — route `/settings/stages` — [ready]
- Purpose: Define pipeline stages (in-progress/done), per-stage AI fill mode, WIP limits.
- State: Real. `GET /api/settings/stages`, `PUT`. (stages/page.tsx:22–66)
- Writes: `stages` array with `name`, `description`, `category`, `aiFillMode`, `wipLimit`. Consumed in:
  - `lib/config/tenant-settings.ts` (stages field)
  - `lib/chat/tools/update.ts` and `lib/chat/tools/schema.ts` — stage names used in deal update tool
  - `inngest/ai-autofill.ts` — `aiFillMode` drives auto vs suggest behavior
  - `app/(dashboard)/opportunities/page.tsx` — kanban column rendering
  **Wired into the kanban and AI autofill.**
- Gaps: WIP limit (`wipLimit`) persisted but no enforcement found in the kanban or deal creation flows.

### Data Model — route `/settings/data-model` — [ready, `ready: false` in sidebar hidden state not set — it IS visible]
- Purpose: Custom fields for companies/contacts/deals; per-field AI fill mode.
- State: Real. `GET/PUT /api/settings/data-model`. (data-model/page.tsx:50–166)
- Writes: Custom field definitions. Consumed in:
  - `lib/context/custom-fields.ts` — includes custom fields in chat context
  - `lib/chat/tools/schema.ts` — custom field schema for tool calls
  - `lib/chat/tools/update.ts` and `create.ts` — field resolution
  - `inngest/ai-autofill.ts` — `aiFillMode` gates autofill behavior
  **Wired into chat tools and AI autofill.**
- Gaps: Built-in field display is purely cosmetic (hardcoded list, no DB backing). `aiFillMode` enforcement depends on autofill cron running.

### Custom Objects — route `/settings/objects` — [not-ready]
- Purpose: Define custom entity types beyond contact/company/deal.
- State: Functional CRUD against `GET/POST/PUT/DELETE /api/custom-objects`. (objects/page.tsx:97–212)
- Writes: Object type definitions stored in DB. No evidence of any UI or routing that renders a custom object list, detail, or chat context injection.
- Gaps: `ready: false` in sidebar. The objects can be created and stored, but no product surface consumes them — they appear in no kanban, no chat context, no enrichment pipeline.

### Plays — route `/settings/plays` — [not-ready]
- Purpose: Codify sales plays (qualification/discovery/proposal/objection/closing) with guidelines and trigger text; agent uses active plays as context.
- State: Functional CRUD against `GET /api/settings/plays`, `POST`, `PUT /:id`, `DELETE /:id`. Toggle active/inactive. (plays/page.tsx:48–143)
- Writes: Plays stored with `isActive` flag and `guidelines`. The page description says "agent uses active plays as context when drafting proposals, handling objections, or coaching deals" — but no consumption in `lib/prompts/chat-system-prompt.ts` or `app/api/chat/route.ts` found. `lib/chat/tools/skills.ts` was in the search hit for `salesMotion` but not for plays.
- Gaps: `ready: false`. Data persists but active plays are not injected into chat prompts or agent reactor context.

### Recording — route `/settings/recording` — [not-ready]
- Purpose: Auto-record meetings toggle, bot display name, branding policy (branded/always-silent/per-meeting), primary domain for internal detection.
- State: Real. Loads/saves via `GET/PUT /api/settings/workspace` for recording fields. (recording/page.tsx:62–100)
- Writes: `recordingEnabled`, `recordingBotName`, `recordingPolicy`, `recordingOptOutReason`, `primaryDomain`, `domainAliases`. Consumed in `lib/recording/branding.ts` and `lib/recording/bot-deployment.ts`. **Wired for recording behavior when Recall.ai is configured.**
- Gaps: `ready: false` in sidebar. The page is functional, but Recall.ai credentials must be configured separately. French-language copy in the UI (le bot, per the helper text).

### Signals — route `/settings/signals` — [not-ready]
- Purpose: Create custom boolean signals detected across TAM; appear as chip columns on Accounts page.
- State: Real. `GET/POST /api/custom-signals`; polls every 5s while backfilling. (signals/page.tsx:39–95)
- Writes: Signal definitions with LLM-generated detection plan; backfill runs against company TAM. Consumed by accounts table rendering (signals appear as columns).
- Gaps: `ready: false` in sidebar. No delete/edit UI (delete = recreate, noted in code). Backfill status polling may not correctly reflect completion in all cases.

### Workflows — route `/settings/workflows` — [not-ready]
- Purpose: Event-triggered automation — trigger types (deal stage, new contact, email received, etc.) + action chain (send notification, create task, send email, enroll sequence, etc.); NL builder via `POST /api/chat`.
- State: Functional. `GET/PUT /api/settings/workflows`. Engine: `inngest/workflow-engine.ts`. (workflows/page.tsx:147–175)
- Writes: Workflow definitions. Consumed in `inngest/workflow-engine.ts` — `sendNotification` calls are real; `send_email` and `enroll_sequence` actions depend on Inngest Cloud being configured (known broken in prod — `/api/inngest` returns 500).
- Gaps: `ready: false` in sidebar. NL builder calls `POST /api/chat` and parses response as JSON — fragile. Action params for `send_email` accept static strings only (no template variables). Inngest Cloud not configured in prod.

---

## ADMIN section (adminOnly: true, gated by `isAdmin` in sidebar:114)

### Evaluations — route `/settings/evals` — [admin-only]
- Purpose: Agent eval harness — datasets, per-case inputs/expected outputs, triggered runs, per-case pass/fail with LLM-as-judge grading, regression detection.
- State: Real. Server component enforces `adminOnlyOrRedirect()` (evals/page.tsx:2). Client fetches `GET /api/eval/datasets`, `/api/eval/runs`, datasets/:id/cases, runs/:id`. Seed from chat: `POST /api/eval/seed`. Run: `POST /api/eval/runs`. (evals-client.tsx throughout)
- Writes: Eval datasets + cases + run results to DB.
- Gaps: Grader model is set server-side — not configurable from the UI.

### LLM Budget — route `/settings/llm-budget` — [admin-only]
- Purpose: Monthly spend cap on AI calls; live spend breakdown by feature.
- State: Real. `GET /api/settings/llm-budget` (live data); `PUT` to set cap. Cap enforced server-side — "new AI calls are rejected with a human-readable reason once spend reaches the cap" (llm-budget/page.tsx:174). (llm-budget/page.tsx:37–85)
- Writes: `capUsd` stored in workspace settings; consumed in the LLM call wrapper (30s cache per the page description). **Wired — hard enforcement.**
- Gaps: No per-feature budget split. Breakdown is read-only.

### MCP Integration — route `/settings/mcp` — [admin-only]
- Purpose: Generate/revoke API keys for connecting external AI tools (Claude Desktop, Cursor, etc.) to the CRM via MCP.
- State: Real. Server `adminOnlyOrRedirect()` guard. `GET/POST/DELETE /api/mcp/keys`. MCP server endpoint at `/api/mcp` (JSON-RPC over HTTP). (mcp-client.tsx:29–98)
- Writes: API key records (hashed); key prefix shown only on creation.
- Gaps: No key rotation (revoke + create new). `lastUsedAt` shown but no usage analytics beyond that.

---

## BILLING section

### Billing — route `/settings/billing` — [ready]
- Purpose: Show current plan + trial status; usage meters; upgrade CTAs to Stripe checkout; link to Stripe customer portal.
- State: Real. `GET /api/billing/usage`, `GET /api/billing/subscription`. Checkout: `POST /api/billing/checkout`. Portal: `POST /api/billing/portal`. (billing/page.tsx:82–147)
- Writes: Redirects to Stripe-hosted checkout or portal.
- Gaps: Plan prices in billing page ($49/$149) diverge from the pricing page ($49/$99). Stripe price IDs must be configured via `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID` / `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`; shows "Billing not configured" warning if absent (billing/page.tsx:185–225). Mailboxes usage meter is hardcoded `current={0}` (billing/page.tsx:440) — never populated.

---

## OTHER / OUTSIDE SETTINGS FOLDER

### Autonomy — route `(rest)/settings/autonomy` — [ready]
- Purpose: Autonomy level (copilot/guided/autonomous/strategic), trust score display, numeric guardrails (max emails/day, max prospects/week, max emails per prospect, never-contact domains).
- State: Real. `GET/PUT /api/settings/autonomy`. (autonomy/page.tsx:44–89)
- Writes: `level` + `guardrails` object (rate limits + never-contact list). Consumed in `lib/guardrails/trust-score.ts` and the agent pipeline for rate enforcement.
- Gaps: This page is NOT in the settings sidebar — it is only reachable via direct URL or if the chat agent surfaces it. No sidebar link. Overlaps conceptually with `/settings/guardrails` (which handles approval mode). The two pages are not integrated: editing one does not affect the other's display.

### Pricing — route `/pricing` — [ready]
- Purpose: Public-facing pricing page with 3-tier cards (Free/Starter/Pro); "Get Started" triggers Stripe checkout.
- State: Functional. Uses `POST /api/billing/checkout` when a price key is configured. (pricing/page.tsx:60–end)
- Writes: Redirects to Stripe checkout.
- Gaps: Pro price shown as $99 on this page; billing page shows $149 for Pro — mismatch. CTA wording assumes the visitor is not yet a customer but the page is inside the `(dashboard)` route group (auth required).

### Mailboxes — route `/settings/mailboxes` — redirect
- Purpose: Server-side redirect to `/settings/mail-calendar`.
- State: Pure redirect, no UI. (mailboxes/page.tsx:1–5)

### Agent — route `/settings/agent` — redirect
- Purpose: Server-side redirect to `/settings/guardrails` (superseded during WS-1 consolidation).
- State: Pure redirect. (agent/page.tsx:1–16)

### Agent Memory — route `/settings/agent-memory` — [ready, not in sidebar]
- Purpose: Read-only snapshot of everything the agent knows (inferred from website/inbox, explicit settings, knowledge, conversation summaries, learned preferences) + trust-score change log; JSON export.
- State: Real. `GET /api/agent-memory`. Visiting this page flips `agentMemoryPanelDiscovered` server-side (per comment, agent-memory/page.tsx:12). (agent-memory/page.tsx:76–85)
- Writes: `agentMemoryPanelDiscovered` flag (unlocks progressive-autonomy nudge engine). Snapshot itself is read-only.
- Gaps: No per-entry edit/delete ("follow-up scoped as a small PR", agent-memory/page.tsx:17). Not in the sidebar — requires direct URL.

### LLM Evals — route `/settings/llm-evals` — [admin-only, not in Admin sidebar section]
- Purpose: LLM observability dashboard — calls aggregate per surface (cost/latency/retry/fallback), eval-suite drift timeline, recent terminal failures; drilldown to per-case results.
- State: Real. `GET /api/admin/llm-evals?days=N` (403 if not admin). (llm-evals/page.tsx:96–118)
- Writes: None — read-only observability.
- Gaps: Not listed in the settings sidebar under Admin, only accessible via direct URL. The `adminOnlyOrRedirect()` guard is absent in the page.tsx (it's a client component that just checks for 403 from the API). An unauthenticated user can render the shell — the API rejects the data fetch.

### Sending Infrastructure — route `/settings/sending-infrastructure` — [ready, not in sidebar]
- Purpose: Primary inbox daily cap, cold-outreach allow/block; Instantly API key connect/disconnect; Voice (Twilio) phone number provisioning; Elevay-managed domain request.
- State: Real. `GET/PUT /api/settings/sending-infra`; Instantly connect/disconnect via dedicated endpoints; voice: `GET /api/calls/config`, `POST /api/calls/numbers`. (sending-infrastructure/page.tsx throughout)
- Writes:
  - `sendingDailyCapPrimary`, `sendingAllowColdOnPrimary` — enforced in email sending pipeline.
  - Instantly API key — encrypted at rest, controls outbound routing.
  - Twilio phone pool — gates Call Mode.
  - Managed-domain request — creates a pending record for ops review.
- Gaps: Not in the sidebar; only reachable from the "Manage" button on `/settings/guardrails`. Helper text is in French (for voice section). Elevay-managed request is ops-manual (no automation beyond storing the request record).

---

## Settings — inert vs wired

### (a) Settings that genuinely drive product behavior

| Setting | Where consumed | Evidence |
|---|---|---|
| `agentApprovalMode` (Guardrails) | `app/api/chat/route.ts:451`, `lib/guardrails/approval-mode.ts`, `inngest/agent-reactor.ts` | Passed to system prompt and enforced in agent reactor |
| Knowledge topics (Knowledge) | `app/api/chat/route.ts:451` as `knowledgeContext`, injected via `buildChatSystemPrompt` (`lib/prompts/chat-system-prompt.ts:343`) | Parallel fetch on every chat request |
| ICP & Product fields (`productDescription`, `targetIndustries`, `aiTone`, etc.) | `lib/scoring/scoring.ts`, `lib/agents/sequence-generator.ts`, `lib/context/prospect-context.ts`, `lib/research/dossier-builder.ts`, `lib/agent-reactor/context-loader.ts` | Core input to scoring and outbound generation |
| ICP Profiles + criteria | `POST /api/tam/build` (Apollo sourcing), matrix recompute | Creates the actual prospect TAM |
| Opportunity stages (`name`, `description`, `aiFillMode`) | `inngest/ai-autofill.ts`, `lib/chat/tools/update.ts`, kanban rendering | Drives pipeline UI and AI autofill |
| Custom fields (`aiFillMode`) | `inngest/ai-autofill.ts`, `lib/chat/tools/schema.ts`, `lib/context/custom-fields.ts` | AI autofill gating and chat tool schema |
| Mail & Calendar sync preferences (`contactCreationMode`, `doNotTrackDomains`, `backsyncRange`) | `inngest/sync-functions.ts`, `app/api/email/sync/route.ts` | Controls what the email sync pipeline creates |
| LLM budget cap | LLM call wrapper (30s cache) | Hard-block on AI calls when cap reached |
| Sending infra caps (`sendingDailyCapPrimary`, `sendingAllowColdOnPrimary`) | Email sending pipeline | Enforced per-send |
| Notifications preferences (email, inApp toggles) | `lib/emails/notifications.ts:48–50` — `sendNotification()` checks per-event prefs before delivery | Conditional delivery of email and in-app notifications |
| Custom signals | Accounts table column rendering; backfill job runs against TAM | Adds filterable columns to accounts view |
| Autonomy level + rate guardrails (Autonomy) | `lib/guardrails/trust-score.ts`, agent pipeline rate enforcement | Caps outbound actions per day/week |
| Recording policy (`recordingEnabled`, `recordingBotName`, `recordingPolicy`) | `lib/recording/branding.ts`, `lib/recording/bot-deployment.ts` | Controls bot join behavior |
| Workspace domains (`companyDomains`) | Email sync — internal address exclusion | Prevents self-company creation from own email |

### (b) Settings that are cosmetic / stubbed / not-ready

| Setting | Status | Evidence |
|---|---|---|
| Language / Timezone (Profile) | Stored, not rendered. No locale switching in the app at runtime. | No downstream read of `language` in rendering pipeline found. |
| Default data visibility (Privacy) | Stored (`defaultDataVisibility`), no query-level enforcement. | `lib/config/tenant-settings.ts:86` stores it; no filter applied in CRM queries. |
| DPA status (Privacy sub-processors) | Display-only. No user action can change status; no workflow triggered. | Privacy page renders hardcoded `DPA_PROVIDER_LABELS` + status badge. |
| Plays (`isActive`, `guidelines`) | CRUD works, persists to DB. Not injected into chat prompts or agent context. | Not found in `lib/prompts/chat-system-prompt.ts` or `app/api/chat/route.ts`. |
| Custom Objects | CRUD works, persists. No UI renders custom object records; no chat injection. | No routing, no context injection found. |
| WIP limit on stages | Persisted with stages. No enforcement found in deal creation or kanban. | Stage update logic in tools stores it; no WIP-check in deal creation. |
| Slack notifications channel | Webhook URL saved; preferences saved. Slack dispatch not confirmed in `lib/emails/notifications.ts`. | Notification library sends email + in-app; Slack webhook call absent. |
| Workflows (most action types) | `send_notification` and `create_task` fire via Inngest. `send_email`, `enroll_sequence`, `call_webhook`, `ai_action`, `assign_owner`, `add_tag`, `update_field` — wired in engine but Inngest Cloud not configured in prod. | Memory note: `/api/inngest 500 (no Inngest Cloud keys)`. |
| Agent Memory (edits) | Read-only. Per-entry edit/delete not implemented. | agent-memory/page.tsx:17: "Edit / delete per-entry is a follow-up scoped as a small PR." |
| Pricing page Pro price | $99 on pricing page vs $149 on billing page — discrepancy, one is wrong. | pricing/page.tsx:49 vs billing/page.tsx:54. |
| Billing mailboxes usage meter | Always shows `current={0}` — hardcoded. | billing/page.tsx:440. |
| Workspace "Delete workspace" | Button rendered but `disabled`. | workspace/page.tsx:138. |
| LLM Evals (sidebar entry absent) | Functional admin-only page, but not linked from Admin sidebar — URL-only. | Not present in `settingsNav`. |
| Agent Memory (sidebar entry absent) | Functional page, not in sidebar. | Not present in `settingsNav`. |
| Autonomy page (sidebar entry absent) | Functional page, not in sidebar — only reachable from chat agent suggestion or direct URL. | Not in `settingsNav` at any level. |

---

## Settings — admin vs user-facing

### Admin-only
These pages enforce `adminOnlyOrRedirect()` server-side or are in the `adminOnly: true` sidebar section:

| Page | Guard |
|---|---|
| Evaluations (`/settings/evals`) | `adminOnlyOrRedirect()` in `evals/page.tsx:2` |
| LLM Budget (`/settings/llm-budget`) | In `Admin` sidebar section (`settings-sidebar.tsx:88`); no server-side guard in page.tsx — sidebar section is hidden, but the URL is not protected at the page level. |
| MCP Integration (`/settings/mcp`) | `adminOnlyOrRedirect()` in `mcp/page.tsx:2` |
| LLM Evals (`/settings/llm-evals`) | Client-side only — 403 from API on non-admin, but page shell renders. No `adminOnlyOrRedirect()`. |

**Security gap**: LLM Budget page (`/settings/llm-budget`) is in the Admin sidebar section (hidden from non-admins) but has no server-side `adminOnlyOrRedirect()` guard — a non-admin who navigates directly to the URL can see and potentially change the spending cap.

### User-facing (all authenticated users)
All other pages — Profile, Guardrails, Privacy, Security, Workspace, ICP & Product, ICP Profiles, Mail & Calendar, Capture Approvals, Members, Knowledge, Notifications, Stages, Data Model, Billing, Autonomy, Agent Memory, Sending Infrastructure, Recording, Signals, Workflows, Custom Objects.

Note: per product docs and memory, Context Graph + Graph Evals are admin-only. The "Evaluations" page here is the agent eval harness (not Graph Evals), and is correctly guarded. LLM Evals is the LLM observability dashboard — also intended admin-only, partially guarded (API-level 403, no page-level guard).
