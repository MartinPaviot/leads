# CHAT-00 — Coverage Matrix

**Audit date**: 2026-04-14
**Repo state**: `feat/CHAT-00-coverage-audit` off `main@76a3d32`
**Chat registry source**: `app/apps/web/src/app/api/chat/route.ts` (51 tools defined)
**Endpoint source**: `app/apps/web/src/app/api/**/route.ts` (129 mutating endpoints)

## Summary

| Metric | Count |
|---|---|
| Mutating endpoints total | **129** |
| Chat tools total | **51** (18 mutating, 15 intelligence, 9 query, 6 get, 3 other) |
| Endpoints covered by a chat tool | **28** |
| **Gap-A** (high-priority — ship in CHAT-01 Wave 1) | **26** |
| **Gap-B** (medium — ship in CHAT-01 Wave 2) | **23** |
| **Gap-C** (low — defer to CHAT-06/07) | **22** |
| **Excluded** (webhooks/cron/test/auth/admin) | **30** |
| Destructive endpoints (flagged for CHAT-04) | **14** |

Note: 26 + 23 + 22 + 28 + 30 = 129 ✓

## Legend

- **Status**: `covered` / `gap-A` / `gap-B` / `gap-C` / `excluded`
- **Cat**: taxonomy category from `design.md` §Taxonomy of tools
- **Destr**: `Y` if operation is destructive (delete / merge / revoke / purge)
- **Tool**: mapping chat tool name (if covered), else proposed tool name (if gap), else `—`
- **Reason**: for excluded, why

---

## 1. COVERED (28 endpoints)

| # | Endpoint | Method | Cat | Tool | Notes |
|---|---|---|---|---|---|
| C01 | `/api/contacts` | POST | create | `createContact` | canonical |
| C02 | `/api/contacts/[id]` | PUT | update | `bulkUpdateContacts` | loop-based, covers field updates |
| C03 | `/api/accounts` | POST | create | `createAccount` | |
| C04 | `/api/opportunities` | POST | create | `createDeal` | canonical (deals alias below) |
| C05 | `/api/opportunities/[id]` | PUT | update | `updateDealStage` | only stage covered; full update is **gap-A** (see G-A01) |
| C06 | `/api/deals/[id]` | PUT | update | `updateDealStage` | legacy alias of opportunities |
| C07 | `/api/tasks` | POST | create | `createTask` | |
| C08 | `/api/tasks/[id]` | PATCH | update | `completeTask` | only status=completed covered; full update is **gap-A** (G-A02) |
| C09 | `/api/score` | POST | intelligence | `qualifyLeads` | |
| C10 | `/api/score-contacts` | POST | intelligence | `qualifyLeads` | |
| C11 | `/api/score/contacts` | POST | intelligence | `qualifyLeads` | canonical |
| C12 | `/api/signals` | POST | intelligence | `scanSignals` | |
| C13 | `/api/search` | POST | semantic-search | `searchCRM` | |
| C14 | `/api/search/tam` | POST | intelligence | `buildTAM` | |
| C15 | `/api/tam` | POST | intelligence | `buildTAM` | canonical |
| C16 | `/api/campaigns/generate` | POST | action | `proposeCampaign` | |
| C17 | `/api/deals/analyze` | POST | intelligence | `analyzePipeline` | |
| C18 | `/api/meetings/prep` | POST | intelligence | `generateMeetingPrep` | |
| C19 | `/api/context-graph/ingest` | POST | memory | `rememberContext` | via memory tool |
| C20 | `/api/chat/threads` | POST | — | (self-reference) | chat internals |
| C21 | `/api/chat/threads/[id]` | POST | — | (self-reference) | chat internals |
| C22 | `/api/chat` | POST | — | (self-reference) | chat internals |
| C23 | `/api/enrich` | POST | action | `enrichContact` | partial — skill-based |
| C24 | `/api/enrich-batch` | POST | bulk | `findLeadsByDomain` | partial |
| C25 | `/api/enrich-contacts` | POST | bulk | `findLeadsByDomain` | partial |
| C26 | `/api/accounts/[id]/summarize` | POST | intelligence | `getAccountIntelligence` | synthesis |
| C27 | `/api/deals/[id]/extract` | POST | intelligence | `getDealCoaching` | synthesis |
| C28 | `/api/reports/generate` | POST | intelligence | `analyzePipeline` | partial |

### Chat-only higher-order compositions (18 tools, no 1:1 endpoint — intentionally)

These are Layer-3 synthesis tools that combine multiple reads + LLM reasoning. They stay as-is — **do not** back them with new endpoints.

- `getDealCoaching`, `getAccountIntelligence`, `analyzePipeline`, `scanSignals`, `detectChurnRisk`, `detectExpansionOpportunities`, `generateMeetingPrep`, `prepSalesCall`, `generateBattlecard`, `researchCompetitor`, `defineICP`, `qualifyLeads`, `qualifyInboundLead`, `trackChampions`, `checkFundingSignals`, `checkHiringSignals`, `detectLeadershipChanges`, `exploreGraph`

---

## 2. GAP-A (26 endpoints) — ship CHAT-01 Wave 1

Daily-use mutations the chat refuses today.

| # | Endpoint | Method | Cat | Destr | Proposed tool | Frequency | Affinity |
|---|---|---|---|---|---|---|---|
| G-A01 | `/api/opportunities/[id]` | PUT | update | — | `updateDeal` (generalize beyond stage) | 🔥 | ✨ |
| G-A02 | `/api/tasks/[id]` | PATCH | update | — | `updateTask` (title, due, priority, desc) | 🔥 | ✨ |
| G-A03 | `/api/notes` | POST | create | — | `createNote` | 🔥 | ✨ |
| G-A04 | `/api/accounts/[id]` | PUT | update | — | `updateAccount` | 🔥 | ✨ |
| G-A05 | `/api/contacts/[id]` | PUT (direct) | update | — | `updateContact` (direct, not bulk-loop) | 🔥 | ✨ |
| G-A06 | `/api/contacts/merge` | POST | destructive | **Y** | `mergeContacts` | ⚡ | ✨ |
| G-A07 | `/api/emails` | POST | action | — | `sendEmail` (currently only `draftEmail`) | 🔥 | ✨ |
| G-A08 | `/api/emails/follow-up` | POST | action | — | `generateFollowUpEmail` | 🔥 | ✨ |
| G-A09 | `/api/emails/suggest-reply` | POST | action | — | `suggestEmailReply` | 🔥 | ✨ |
| G-A10 | `/api/sequences` | POST | create | — | `createSequence` | ⚡ | ✨ |
| G-A11 | `/api/sequences/[id]` | PUT | update | — | `updateSequence` | ⚡ | ✨ |
| G-A12 | `/api/sequences/[id]/enroll` | POST | action | — | `enrollInSequence` | 🔥 | ✨ |
| G-A13 | `/api/sequences/[id]/steps` | POST | create | — | `addSequenceStep` | ⚡ | ✨ |
| G-A14 | `/api/sequences/[id]/steps/[stepId]` | PATCH | update | — | `updateSequenceStep` | ⚡ | ✨ |
| G-A15 | `/api/sequences/[id]/steps/[stepId]` | DELETE | destructive | **Y** | `deleteSequenceStep` | ⚡ | ✨ |
| G-A16 | `/api/sequences/[id]/autopilot` | POST | action | — | `toggleSequenceAutopilot` | ⚡ | ✨ |
| G-A17 | `/api/campaigns/[sequenceId]/launch` | POST | action | — | `launchCampaign` | ⚡ | ✨ |
| G-A18 | `/api/meetings/book` | POST | action | — | `bookMeeting` | ⚡ | ✨ |
| G-A19 | `/api/meetings/[id]/notes` | PATCH | update | — | `updateMeetingNotes` | 🔥 | ✨ |
| G-A20 | `/api/meetings/[id]/notes/send-follow-up` | POST | action | — | `sendMeetingFollowUp` | 🔥 | ✨ |
| G-A21 | `/api/opportunities/[id]/auto-progress` | POST | action | — | `autoProgressDeal` | ⚡ | ✨ |
| G-A22 | `/api/opportunities/[id]/extract-intel` | POST | intelligence | — | fold into `getDealCoaching` | ⚡ | ⭐ |
| G-A23 | `/api/accounts/[id]/contacts` | POST | action | — | `linkContactToAccount` | ⚡ | ✨ |
| G-A24 | `/api/accounts/[id]/lifecycle` | POST | action | — | `updateAccountLifecycle` | ⚡ | ✨ |
| G-A25 | `/api/activities` | POST | create | — | `logActivity` (log a manual call / meeting note) | 🔥 | ✨ |
| G-A26 | `/api/unsubscribe` | POST | action | — | `unsubscribeContact` | ⚡ | ✨ |

---

## 3. GAP-B (23 endpoints) — ship CHAT-01 Wave 2

Settings / admin operations the user sometimes does via chat.

| # | Endpoint | Method | Cat | Destr | Proposed tool |
|---|---|---|---|---|---|
| G-B01 | `/api/settings/icp` | PUT | update | — | `updateICP` |
| G-B02 | `/api/settings/knowledge` | POST | create | — | `createKnowledgeEntry` |
| G-B03 | `/api/settings/knowledge` | PUT | update | — | `updateKnowledgeEntry` |
| G-B04 | `/api/settings/knowledge` | DELETE | destructive | **Y** | `deleteKnowledgeEntry` |
| G-B05 | `/api/settings/stages` | PUT | update | — | `updatePipelineStages` |
| G-B06 | `/api/settings/data-model` | PUT | update | — | `updateCustomFieldSchema` |
| G-B07 | `/api/settings/custom-signals` | PUT | update | — | `updateCustomSignalDefinitions` |
| G-B08 | `/api/settings/workflows` | PUT | update | — | `updateWorkflows` |
| G-B09 | `/api/settings/workspace` | PUT | update | — | `updateWorkspace` |
| G-B10 | `/api/settings/privacy` | PUT | update | — | `updatePrivacySettings` |
| G-B11 | `/api/settings/profile` | PUT | update | — | `updateUserProfile` |
| G-B12 | `/api/settings/notification-preferences` (via `/api/notifications/preferences`) | PUT | update | — | `updateNotificationPreferences` |
| G-B13 | `/api/settings/mailboxes` | POST | action | — | `addMailbox` (returns OAuth URL; user approves) |
| G-B14 | `/api/settings/mailboxes` | PATCH | update | — | `updateMailboxSettings` |
| G-B15 | `/api/settings/mailboxes` | DELETE | destructive | **Y** | `removeMailbox` |
| G-B16 | `/api/settings/mail-calendar` | PUT | update | — | `updateMailCalendarIntegration` |
| G-B17 | `/api/settings/members/invite` | POST | action | — | `inviteMember` |
| G-B18 | `/api/settings/members/invites/[id]` | POST | action | — | `resendInvite` |
| G-B19 | `/api/settings/members/invites/[id]` | DELETE | destructive | **Y** | `revokeInvite` |
| G-B20 | `/api/settings/members` | PUT | update | — | `updateMemberRole` |
| G-B21 | `/api/custom-objects` | POST | create | — | `createCustomObjectType` |
| G-B22 | `/api/custom-objects` | PUT | update | — | `updateCustomObjectType` |
| G-B23 | `/api/views` | POST | create | — | `createSavedView` |

---

## 4. GAP-C (22 endpoints) — defer to CHAT-06 / CHAT-07

Power-user or low-frequency. Needed for 100% parity but not blocking daily value.

| # | Endpoint | Method | Cat | Destr | Proposed tool | Defer to |
|---|---|---|---|---|---|---|
| G-C01 | `/api/custom-objects` | DELETE | destructive | **Y** | `deleteCustomObjectType` | CHAT-06 |
| G-C02 | `/api/custom-objects/[type]` | POST | create | — | `createCustomRecord` | CHAT-06 |
| G-C03 | `/api/custom-objects/[type]/[id]` | PUT | update | — | `updateCustomRecord` | CHAT-06 |
| G-C04 | `/api/custom-objects/[type]/[id]` | DELETE | destructive | **Y** | `deleteCustomRecord` | CHAT-06 |
| G-C05 | `/api/views` | DELETE | destructive | **Y** | `deleteSavedView` | CHAT-06 |
| G-C06 | `/api/user-preferences` | PUT | update | — | `updateUserPreferences` | CHAT-06 |
| G-C07 | `/api/notifications` | POST | create | — | `createNotification` (mostly programmatic) | CHAT-06 |
| G-C08 | `/api/import` | POST | action | — | `importData` (requires file upload — low chat affinity) | CHAT-07 |
| G-C09 | `/api/import/smart` | POST | action | — | `smartImport` | CHAT-07 |
| G-C10 | `/api/outbound/review` | POST | intelligence | — | `reviewOutboundEmail` | CHAT-06 |
| G-C11 | `/api/outbound/review` | PUT | update | — | `updateOutboundDraft` | CHAT-06 |
| G-C12 | `/api/skills/[slug]` | POST | action | — | `runSkill` (generic dispatcher) | CHAT-06 |
| G-C13 | `/api/embed` | POST | memory | — | `embedEntity` (usually auto-triggered) | CHAT-06 |
| G-C14 | `/api/context-graph/feedback` | POST | memory | — | `reportGraphFeedback` | CHAT-09 |
| G-C15 | `/api/deliverability` | POST | action | — | `updateDeliverabilitySettings` | CHAT-06 |
| G-C16 | `/api/deliverability/verify` | POST | action | — | `verifyDeliverability` | CHAT-06 |
| G-C17 | `/api/onboarding/analyze-website` | POST | intelligence | — | fold into onboarding flow | CHAT-07 |
| G-C18 | `/api/onboarding/enrich-icp` | POST | intelligence | — | fold into onboarding | CHAT-07 |
| G-C19 | `/api/onboarding/find-contacts` | POST | intelligence | — | fold into onboarding | CHAT-07 |
| G-C20 | `/api/onboarding/save` | POST | action | — | fold into onboarding | CHAT-07 |
| G-C21 | `/api/mcp` | POST | action | — | — (admin) | **excluded-review** |
| G-C22 | `/api/meetings/upload-transcript` | POST | action | — | `uploadMeetingTranscript` (requires file) | CHAT-07 |

---

## 5. EXCLUDED (30 endpoints)

Never exposed to the LLM. Explicit rationale per row.

| # | Endpoint | Method | Reason |
|---|---|---|---|
| E01 | `/api/webhooks/emailengine` | POST | External webhook — not user-invokable |
| E02 | `/api/webhooks/recall` | POST | External webhook |
| E03 | `/api/webhooks/resend` | POST | External webhook |
| E04 | `/api/webhooks/stripe` | POST | External webhook |
| E05 | `/api/cron/stale-deals` | POST | Inngest scheduled task |
| E06 | `/api/cron/world-model` | POST | Inngest scheduled task |
| E07 | `/api/test-e2e/seed` | POST | E2E test fixture |
| E08 | `/api/test-e2e/cleanup` | POST | E2E test fixture |
| E09 | `/api/recall-test` | POST | Dev probe |
| E10 | `/api/auth/forgot-password` | POST | Auth flow — must be unauthenticated + email-gated |
| E11 | `/api/auth/reset-password` | POST | Auth flow — token-gated |
| E12 | `/api/auth/invite/accept` | POST | Auth flow — token-gated |
| E13 | `/api/account/password` | POST | Security-sensitive, UI-only |
| E14 | `/api/account` | DELETE | Security-sensitive, UI-only, confirmation dialog required |
| E15 | `/api/billing/checkout` | POST | Stripe flow — UI redirect required |
| E16 | `/api/billing/portal` | POST | Stripe flow — UI redirect required |
| E17 | `/api/admin/purge-fake-data` | POST | Admin-only destructive (**excluded-review**, flag Martin) |
| E18 | `/api/gdpr/delete` | POST | GDPR irreversible (**excluded-review**) |
| E19 | `/api/calendar/sync` | POST | Triggered automatically after mailbox connect |
| E20 | `/api/calendar/sync/microsoft` | POST | Triggered automatically |
| E21 | `/api/email/sync` | POST | Triggered automatically |
| E22 | `/api/eval/datasets` | POST | Admin-only eval tooling |
| E23 | `/api/eval/datasets/[id]/cases` | POST | Admin-only eval tooling |
| E24 | `/api/eval/runs` | POST | Admin-only eval tooling |
| E25 | `/api/eval/run-all` | POST | Admin-only eval tooling |
| E26 | `/api/eval/seed` | POST | Admin-only eval tooling |
| E27 | `/api/eval` | POST | Admin-only eval tooling |
| E28 | `/api/mcp/keys` | POST | User must see key material in UI once (not chat-safe) |
| E29 | `/api/mcp/keys` | DELETE | Revocation UI confirmation required |
| E30 | `/api/meetings/process-transcript` | POST | Triggered automatically post-upload (internal) |

---

## 6. NEW TOOLS NEEDED (not backed by an existing endpoint)

Needed for Attio parity but no endpoint exists yet. Requires CHAT-01 to build **both** the endpoint and the tool.

| # | Tool | Endpoint to build | Category | Notes |
|---|---|---|---|---|
| N01 | `listSchema` | `GET /api/settings/schema` (new) | schema | Returns `{objectTypes, customFields, pipelineStages, savedViews, listsDefined}` — critical for tenant-specific discovery |
| N02 | `listAttributeDefinitions` | `GET /api/settings/data-model` (exists GET? verify) | schema | Per-object attribute list |
| N03 | `upsertContact` | extend POST `/api/contacts` with `upsert=true` flag | upsert | match-by-email, idempotent |
| N04 | `upsertAccount` | extend POST `/api/accounts` with `upsert=true` | upsert | match-by-domain |
| N05 | `upsertRecord` | extend POST `/api/custom-objects/[type]` | upsert | parameterized by natural key |
| N06 | `getRecordsByIds` | `POST /api/records/batch-get` (new) | get | batch getter across types |
| N07 | `createComment` | `POST /api/comments` (new) | create | polymorphic on entityType/entityId |
| N08 | `listComments` | `GET /api/comments?entityType&entityId` (new) | query | |
| N09 | `listCommentReplies` | `GET /api/comments/[id]/replies` (new) | query | |
| N10 | `deleteComment` | `DELETE /api/comments/[id]` (new) | destructive | |
| N11 | `semanticSearchNotes` | extend POST `/api/notes/search` (new) | semantic-search | |
| N12 | `getNoteBody` | `GET /api/notes/[id]` (verify exists) | get | |
| N13 | `searchMeetings` | `GET /api/meetings?filters` (exists? verify) | query | |
| N14 | `semanticSearchCallRecordings` | `POST /api/meetings/search` (new) | semantic-search | |
| N15 | `getCallRecording` | `GET /api/meetings/[id]` (verify) | get | full transcript + summary |
| N16 | `searchEmailsByMetadata` | `GET /api/emails?filters` (verify) | query | |
| N17 | `semanticSearchEmails` | `POST /api/emails/search` (new) | semantic-search | |
| N18 | `getEmailContent` | `GET /api/emails/[id]` (verify) | get | |
| N19 | `listWorkspaceMembers` | `GET /api/settings/members` (verify) | query | |
| N20 | `listWorkspaceTeams` | `GET /api/settings/teams` (new — no teams table yet) | query | defer schema add |
| N21 | `whoami` | `GET /api/auth/me` (verify) | query | returns current user+tenant+role |
| N22 | `runBasicReport` | `POST /api/reports/aggregate` (new) | intelligence | count/sum/avg groupBy on any record+attribute |
| N23 | `addRecordToList` | `POST /api/views/[id]/records` (new) | action | adds record to a saved view (list) |
| N24 | `updateListEntryByRecordId` | `PATCH /api/views/[id]/records/[recordId]` (new) | update | |
| N25 | `researchAgent` | `POST /api/agents/research` (new — Inngest-backed) | long-running | streamed back via SSE |

---

## 7. DESTRUCTIVE OPS — flag list for CHAT-04 (undo)

These **never ship as chat tools** until CHAT-04 delivers `toolCallEvents` + reverse-op support.

1. G-A06 `mergeContacts` — reverse: un-merge (requires snapshot of both pre-merge records)
2. G-A15 `deleteSequenceStep` — reverse: re-create at position
3. G-B04 `deleteKnowledgeEntry` — reverse: re-insert
4. G-B15 `removeMailbox` — reverse: re-OAuth flow (complex — may stay UI-only)
5. G-B19 `revokeInvite` — reverse: reissue
6. G-C01 `deleteCustomObjectType` — reverse: restore schema + records (hard — stay UI-only)
7. G-C04 `deleteCustomRecord` — reverse: restore (soft-delete)
8. G-C05 `deleteSavedView` — reverse: restore
9. E14 `deleteAccount` — never in chat
10. E17 `purgeFakeData` — never in chat
11. E18 `gdprDelete` — never in chat
12. N10 `deleteComment` — reverse: restore
13. Bulk destructive variants — per-record undo (CHAT-04 event log handles this)
14. `deleteContact` — **not in matrix yet** — check if endpoint exists (verify in CHAT-01 task #0); if not, stays UI-only

---

## 8. Known duplicates / aliases to dedupe

- `deals/[id]` PUT is legacy alias of `opportunities/[id]` PUT → keep `updateDeal` tool, aim `opportunities` as canonical route.
- `score` / `score-contacts` / `score/contacts` all POST → one canonical `/api/score/contacts`; other two are aliases. CHAT-01 should consolidate routes if cheap.
- `tam` / `search/tam` → one canonical; aliases bad for maintenance.
- `enrich` / `enrich-batch` / `enrich-contacts` — overlapping scopes: single vs batch vs list-enrich. Keep 3 tools (`enrichContact`, `bulkEnrichContacts`, `enrichContactsByDomain`) rather than 3 endpoints.

## 9. Drift alarm — newly-added routes since last audit

None to report (audit is first of its kind). Going forward, `_tools/coverage-audit.js` (built in CHAT-09) will run weekly and flag drift.
