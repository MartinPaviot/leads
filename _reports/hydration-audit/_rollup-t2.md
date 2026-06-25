# Hydration Audit — rollup Tier 2 (Settings, 38 pages)

_Généré 2026-06-24._

## Distribution

| État | Pages |
|------|-------|
| H4 (non câblé) | 2 |
| H2 (partiel) | 17 |
| H1 (fidèle) | 16 |
| H0 (statique) | 3 |

## Pages triées par sévérité

| # | Page | Route | État | #él. | Verdict |
|---|------|-------|------|------|---------|
| S04 | settings-notifications | `/settings/notifications` | **H4** | 7 | The email and in-app per-preference toggles are faithfully wired: their values load from the user's persisted notificationPreferences jsonb, each flip PUTs through one shared endpoint, and they round-trip on reload (H1,  |
| S32 | settings-billing | `/settings/billing` | **H4** | 11 | Most of the billing page is genuinely wired: plan, trial countdown, renewal date, Stripe portal/checkout actions, and three of four usage meters all load real tenant-scoped data via GET /api/billing/subscription and /api |
| S01 | settings-index | `/settings` | **H2** | 7 | The /settings page is the Profile tab and is largely faithful: every editable control (first/last name, language, timezone) loads its current value from real, tenant/user-scoped persisted config (users table + tenants.se |
| S05 | settings-stages | `/settings/stages` | **H2** | 8 | The page is largely faithful: stages load from the real tenant config (tenants.settings.pipelineStages, scoped by eq(tenants.id, authCtx.tenantId)) with a loading skeleton, an error string, and a whole-list PUT that pers |
| S07 | settings-objects | `/settings/objects` | **H2** | 4 | A genuinely faithful CRUD-on-config page. The object-types list loads from real, DB-backed, tenant-scoped persisted config (tenants.settings.customObjectTypes via getTenantSettings, filtered by the session JWT's tenantId |
| S08 | settings-data-model | `/settings/data-model` | **H2** | 8 | The custom-fields manager is genuinely wired: it loads from a real tenant-scoped GET (tenant.settings.customFields filtered by eq(tenants.id, authCtx.tenantId)) and every mutation (add/remove/rename/options/AI-fill mode) |
| S09 | settings-workflows | `/settings/workflows` | **H2** | 8 | This is a genuinely wired Settings page: the workflow list, toggles, run counts, and editor all load from and persist to the tenant's real config at tenants.settings.workflows, fully tenant-scoped via eq(tenants.id, auth |
| S10 | settings-plays | `/settings/plays` | **H2** | 5 | A genuinely well-wired tenant-scoped CRUD page. The plays list loads from the real custom_skill_templates table scoped by eq(tenantId), create/edit/toggle/delete all persist via tenant-scoped API routes and round-trip ba |
| S14 | settings-evals | `/settings/evals` | **H2** | 8 | This is an admin-only eval-harness CRUD dashboard (dev-only: page 404s in production via EVALS_PAGE_ENABLED), not a settings-toggle page. Every data-bearing element is wired to real, correctly tenant-scoped data — datase |
| S18 | settings-mailboxes | `/settings/mailboxes` | **H2** | 9 | /settings/mailboxes is a pure server redirect to /settings/mail-calendar; the effective page is well-wired. Connected accounts and all three sync-preference controls (contact-creation mode, backsync range, ignored domain |
| S20 | settings-mail-calendar | `/settings/mail-calendar` | **H2** | 11 | The page is genuinely wired: it fetches GET /api/settings/mail-calendar on mount (real, tenant+user-scoped reads of authAccounts, connectedMailboxes, and tenants.settings) and persists sync preferences via PUT → updateTe |
| S21 | settings-writing-style | `/settings/writing-style` | **H2** | 10 | A genuinely well-wired settings surface: every control (about-me, role, sign-off, scheduling link, the editable prompt with server-supplied default, tone preset, per-audience variants) loads its current value from real o |
| S22 | settings-inbox-voice | `/settings/inbox-voice` | **H2** | 4 | A genuinely well-wired settings page. Both controls load their current values from real owner-scoped persisted config (user_preferences JSONB, scoped by eq(userId)) via GET /api/inbox/voice and GET /api/inbox/auto-draft, |
| S24 | settings-inbox-autonomy | `/settings/inbox-autonomy` | **H2** | 3 | A genuinely well-wired settings page. The autonomy dial catalog and the viewer's persisted choices both come from GET /api/inbox/autonomy, which reads owner-scoped user_preferences JSONB (resource "inbox"/key "autonomy") |
| S26 | settings-inbox-notifications | `/settings/inbox-notifications` | **H2** | 5 | A genuinely wired settings page. All controls load their current value from real owner-scoped persisted config (GET /api/inbox/notifications -> getNotificationPrefs(userId), user_preferences JSONB keyed on userId+resourc |
| S31 | settings-agent-memory | `/settings/agent-memory` | **H2** | 9 | This is a read-only memory-inspection panel, not a control/toggle settings page — there are no editable controls, only a display of the tenant's aggregated memory plus an Export JSON button. Every data-bearing element is |
| S33 | settings-security | `/settings/security` | **H2** | 6 | This page is genuinely wired, not a stub. The password form is a write-only credential control (passwords are never pre-loaded by design); its POST to /api/account/password verifies the current password via bcrypt agains |
| S34 | settings-privacy | `/settings/privacy` | **H2** | 6 | The page is mostly faithfully wired: it loads a single tenant-scoped ComplianceData blob from GET /api/settings/compliance (backed by getTenantSettings(authCtx.tenantId)), and the Data Visibility selector both reads its  |
| S38 | settings-autonomy | `/settings/autonomy` | **H2** | 10 | A genuinely well-wired settings page: every control hydrates from a real tenant-scoped GET (autonomyConfig + systemTrustScore + tenant settings.learnedThresholds, all eq(tenantId)) and saves round-trip via PUT followed b |
| S02 | settings-workspace | `/settings/workspace` | **H1** | 4 | This page is faithfully data-hydrated. All three data-bearing controls (workspace name, logo, domains) load their current value from the real tenant-scoped GET /api/settings/workspace (eq(tenants.id, authCtx.tenantId)) a |
| S03 | settings-members | `/settings/members` | **H1** | 6 | The members settings page is faithfully hydrated: the roster, member count, per-member role select, pending-invite list, and self-avatar all load from real tenant-scoped Postgres queries (every GET filters eq(users.tenan |
| S06 | settings-signals | `/settings/signals` | **H1** | 4 | This is a custom-signals config page that is faithfully wired to real tenant-scoped data. The "Your signals" list loads from GET /api/custom-signals (tenant-scoped via eq(customSignals.tenantId, authCtx.tenantId)), the c |
| S11 | settings-icp | `/settings/icp` | **H1** | 12 | The ICP settings page is faithfully data-hydrated end to end. Every data-bearing element — the profile list with computed criteria/fit counts, drag-priority, the editor's guided criteria widgets, sourcing-only filters, s |
| S13 | settings-knowledge | `/settings/knowledge` | **H1** | 8 | The Knowledge settings page is faithfully wired to real tenant-scoped data. Every data-bearing control (topic title, content, stage chips) loads its current value from GET /api/settings/knowledge, which selects knowledge |
| S15 | settings-llm-evals | `/settings/llm-evals` | **H1** | 9 | This is an admin-gated global LLM observability dashboard, not a conventional tenant settings page with persisted toggles. Every data-bearing element is wired to real DB tables (llm_calls, llm_eval_runs, llm_eval_case_ru |
| S16 | settings-llm-budget | `/settings/llm-budget` | **H1** | 7 | This page is fully and faithfully data-hydrated. Every data-bearing element reads from real tenant-scoped sources: the cap value loads from tenants.settings.llmMonthlyCostCapUsd (eq(tenants.id,tenantId)) and the spend ca |
| S17 | settings-mcp | `/settings/mcp` | **H1** | 10 | The MCP settings page is data-faithful (H1). Its one data-bearing element — the API Keys list — loads from real tenant-scoped persisted config (getTenantSettings via eq(tenants.id, tenantId)), with create/revoke fully ro |
| S19 | settings-mailbox-identity | `/settings/mailbox-identity` | **H1** | 6 | This settings page is faithfully data-hydrated. Both data sources (GET /api/settings/mailboxes and GET /api/inbox/mailbox-identity) are auth + tenant/owner scoped, every control (display name, signature, voice) loads its |
| S23 | settings-inbox-ai-profile | `/settings/inbox-ai-profile` | **H1** | 4 | The single data-bearing control — the AI data-handling profile radio group (standard / zero_retention / off) — is faithfully hydrated: its current value is loaded from the viewer's real owner-scoped persisted config (use |
| S25 | settings-inbox-memory | `/settings/inbox-memory` | **H1** | 6 | A fully faithful, cleanly-wired settings page. Every data-bearing control (standing-instruction list, sign-off name, company line) loads its current value from a real owner-scoped store (user_preferences JSONB, resource  |
| S27 | settings-recording | `/settings/recording` | **H1** | 9 | This page is faithfully data-hydrated. Every control (auto-record toggle, bot name, branding policy, opt-out reason, primary domain, domain aliases) loads its current value from real tenant-scoped persisted config (tenan |
| S28 | settings-sending-infrastructure | `/settings/sending-infrastructure` | **H1** | 10 | This Settings page is hydration-faithful: every data-bearing control loads its current value from real tenant-scoped persisted config and round-trips on save. Caps + cold-allowed read from tenants.settings JSONB (eq(tena |
| S29 | settings-capture-approvals | `/settings/capture-approvals` | **H1** | 6 | This Settings page is data-faithful end to end. The capture-mode toggle and per-field hybrid rules load their current values from the tenant's real persisted settings blob (tenants.settings.captureApprovalMode / captureF |
| S35 | settings-product | `/settings/product` | **H1** | 5 | Fully faithful settings page. All four controls (product description, sales motion, primary challenge, AI tone) load their current value from real tenant-scoped persisted config via GET /api/settings/product, which reads |
| S36 | settings-guardrails | `/settings/guardrails` | **H1** | 6 | The Guardrails settings page is faithfully hydrated. Every data-bearing control loads its current value from real tenant-scoped persisted config (both GET routes scope on authCtx.tenantId), the approval-mode selector rou |
| S12 | settings-icp-profiles | `/settings/icp-profiles` | **H0** | 1 | This route is a pure server-side redirect (Next `redirect("/settings/icp")`) with no UI and no data-bearing elements. The rule-builder that once lived here was unified into /settings/icp; this file survives only to prese |
| S30 | settings-agent | `/settings/agent` | **H0** | 1 | The /settings/agent page is a pure server-side redirect (`redirect("/settings/guardrails")`) with zero UI or data-bearing elements — it is a deliberate WS-1 migration stub that forwards bookmarks/deep-links to the consol |
| S37 | settings-docs | `/settings/docs` | **H0** | 3 | This is "The Method" — a static documentation index, not a settings/config page. It renders entirely from hardcoded content libraries (docSteps assembled from static step files in lib/docs/steps/*) with zero tenant-scope |

## Défauts P0 — pages H5 (cassé) et H4 (non câblé)

### S04 — settings-notifications (`/settings/notifications`) — H4

The email and in-app per-preference toggles are faithfully wired: their values load from the user's persisted notificationPreferences jsonb, each flip PUTs through one shared endpoint, and they round-trip on reload (H1, tenant/user-scoped). The Slack integration block is the defect: the page reads data.slackWebhook on load (page.tsx:68) and PUT persists the webhook to tenants.settings.slackWebhookUrl (route.ts:57-66), but the GET handler never returns slackWebhook (route.ts:39-43), so the webhook input and the derived Connected badge / Slack toggle column always rehydrate to their default empty/disconnected state after reload — the saved value is silently lost on read. Header and preference labels are correctly static H0.

- Slack webhook input never hydrates: GET handler omits slackWebhook from its response (route.ts:39-43) while the client reads data.slackWebhook (page.tsx:68) — saved webhook persists to tenants.settings but reloads blank (H4 unwired load).
- Slack 'Connected' badge + the entire Slack toggle column are gated on slackConnected (page.tsx:163,234), which depends on the non-hydrating webhook — after any reload they always show disconnected/'--' regardless of stored config (route.ts:39-43).
- Default GET preferences payload (route.ts:24-35) omits a slack channel key for every preference, so new users' Slack toggles can never reflect a stored value and always default to false.

### S32 — settings-billing (`/settings/billing`) — H4

Most of the billing page is genuinely wired: plan, trial countdown, renewal date, Stripe portal/checkout actions, and three of four usage meters all load real tenant-scoped data via GET /api/billing/subscription and /api/billing/usage (both filter on eq(tenantId)), with a shared spinner loading state, zero-fallback empties, and a global error banner. The single meaningful defect is the "Mailboxes" usage meter, which is hardcoded to current={0} and never queries the tenant's actual connected-mailbox count, so it always under-reports regardless of stored state. Note: the entire page is gated off in production (BILLING_PAGE_ENABLED = NODE_ENV !== 'production' -> notFound), so this only renders on next dev.

- Mailboxes usage meter is hardcoded current={0} and never loads the tenant's real connected-mailbox count — always shows 0/limit (app/apps/web/src/app/(dashboard)/settings/billing/billing-client.tsx:439).
- Whole page is hidden in production via notFound() — BILLING_PAGE_ENABLED = process.env.NODE_ENV !== 'production' (app/apps/web/src/lib/billing/page-visibility.ts:9; gate at app/apps/web/src/app/(dashboard)/settings/billing/page.tsx:6), so prod users never see any of this real data.
- Loading/empty/error are coarse-grained: a single shared spinner + one global error banner cover all lanes (billing-client.tsx:91,227-237), so usage and subscription cannot degrade independently — if /api/billing/usage returns null the meters silently render zeros rather than a written empty state (billing-client.tsx:421-433).

## CORRECTION (2026-06-25) — H1 ratings revised after hostile re-verification

Re-verifying the 16 "H1" settings pages (workflow `verify-h1-settings-pages`) found this
distribution was **over-generous: 14 of 16 were actually H2** (same error-as-empty /
swallowed-save / silent-stale class). Genuinely H1 (re-confirmed): **S16 llm-budget,
S29 capture-approvals** only.

Fixed (commits `aabea9e9` A, `1906768a` B, `7ef6aa69` C+D): S02 · S03 · S06 · S11 · S13 ·
S15 · S19 · S23 · S25 · S27 · S35 · S36. S17 verified actually-fine (agent over-reported —
fetchKeys already setError's). S28 sending-infrastructure has real defects but was EXCLUDED
(parallel-session WIP — hand to them). Detail: `_h1-settings-reverify-worklist.md` +
`_specs/hydration-fidelity/tasks.md`. Lesson: don't trust an LLM audit's H1 rating — across
T1+T2 it was wrong ~73% of the time (4/7 product + 14/16 settings).
