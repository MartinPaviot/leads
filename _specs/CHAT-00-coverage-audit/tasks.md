# CHAT-00 — Tasks

This file lists the concrete work. For **CHAT-00 itself** (documentation), see tasks 0.1–0.5.

For **CHAT-01** (the first real implementation phase — tool registry completeness), tasks 1.1–1.50 are pre-enumerated here so CHAT-01 can start immediately after CHAT-00 merges.

---

## CHAT-00 tasks (documentation Phase)

### 0.1 — Scaffold Kiro spec folder ✅
- **Action**: create `_specs/CHAT-00-coverage-audit/` with `office-hours.md`, `requirements.md`, `design.md`.
- **Verify**: all three files exist.
- **Status**: done.

### 0.2 — Produce coverage-matrix.md ✅
- **Action**: enumerate 129 mutating endpoints × 51 tools, tier gaps A/B/C/excluded.
- **Verify**: summary table counts sum correctly (26+23+22+28+30=129).
- **Status**: done.

### 0.3 — Produce tasks.md (this file)
- **Action**: write pre-enumerated tasks for CHAT-01 so the next spec can start cold.
- **Verify**: each task cites file path, approx line range, backing endpoint, zod source, test path.

### 0.4 — Create feature_list.json at `_specs/feature_list.json`
- **Action**: entries CHAT-00 through CHAT-09 with id, title, dependencies, milestone, status.
- **Verify**: parses as valid JSON; CHAT-00 status is `completed` on merge.

### 0.5 — Commit on `feat/CHAT-00-coverage-audit`
- **Action**: `git add _specs/CHAT-00-coverage-audit _specs/feature_list.json` then commit with trailer.
- **Verify**: `git log -1` shows the Rippletide + Claude trailers; `git status` clean.

---

## CHAT-01 tasks (deferred — Phase 1 of meta-plan)

> Each task below is a tool creation ticket. Format:
>
> **Subject** — backing endpoint — zod source — registry insertion point — test path — acceptance.

Insertion point reference: all tool definitions currently live in `app/apps/web/src/app/api/chat/route.ts` (tools defined around lines 450–1700). CHAT-01 may refactor into `lib/chat/tools/*.ts` modules (one file per category) as task 1.0.

### 1.0 — Refactor chat tool registry (foundational)

- **Action**: extract tools from `route.ts` into `lib/chat/tools/{schema,query,semantic-search,get,create,update,upsert,bulk,action,destructive,intelligence,long-running,memory}.ts`. Each file exports a `Record<string, Tool>`. `route.ts` imports and spreads them into a single registry.
- **Rationale**: 87KB file is unmaintainable. Refactor now before adding 50+ new tools.
- **Verify**: all 264 tests still pass; tool count unchanged post-refactor.
- **Size**: 1 day.

---

### Wave 1 — Gap-A tools (26 tasks, ~2 weeks)

Ordered by dependency: generalizations first (update*, create*), then bulk, then action, then destructive (gated pending CHAT-04).

#### 1.1 — `updateContact` tool
- Endpoint: `PUT /api/contacts/[id]`
- Zod: reuse `updateContactSchema` from `app/apps/web/src/app/api/contacts/[id]/route.ts`
- File: `lib/chat/tools/update.ts`
- Test: `__tests__/chat/tools/update-contact.test.ts` — happy path + invalid email + cross-tenant denial
- Acceptance: chat "change John's title to VP" → ActionCard with editable fields → approve → contact.title=VP

#### 1.2 — `updateAccount` tool
- Endpoint: `PUT /api/accounts/[id]`
- Zod: reuse from `app/apps/web/src/app/api/accounts/[id]/route.ts`
- File: `lib/chat/tools/update.ts`
- Test: `__tests__/chat/tools/update-account.test.ts`

#### 1.3 — `updateDeal` tool (generalize `updateDealStage`)
- Endpoint: `PUT /api/opportunities/[id]`
- Zod: from `app/apps/web/src/app/api/opportunities/[id]/route.ts`
- File: `lib/chat/tools/update.ts`
- Supersedes `updateDealStage` (keep as alias for 1 sprint, then remove).
- Acceptance: "change Acme Renewal value to 120k and push close date to May" → single card, two fields.

#### 1.4 — `updateTask` tool (generalize `completeTask`)
- Endpoint: `PATCH /api/tasks/[id]`
- Zod: from tasks/[id]/route.ts
- Keep `completeTask` as alias → `updateTask({taskId, status:"completed"})` internally.

#### 1.5 — `createNote` tool
- Endpoint: `POST /api/notes`
- Zod: from `/api/notes/route.ts`
- File: `lib/chat/tools/create.ts`
- Params: `entityType, entityId, title?, content`
- Acceptance: "add a note on Acme that they mentioned budget concerns" → card → approve → note attached.

#### 1.6 — `logActivity` tool
- Endpoint: `POST /api/activities`
- Params: `entityType, entityId, activityType (meeting|call|note|email), summary, occurredAt?`
- Use case: "I just had a call with Jane, note that she's interested in tier 2"

#### 1.7 — `sendEmail` tool (mutation, currently `draftEmail` only)
- Endpoint: `POST /api/emails`
- Params: `contactId, subject, body, threadId?`
- Gate: requires `mailboxConnected=true` + approval card with editable subject/body + explicit "Send" button (not just Approve).
- Acceptance: "send my follow-up draft to John" → card with draft preview → Send → email dispatched.

#### 1.8 — `generateFollowUpEmail` tool
- Endpoint: `POST /api/emails/follow-up`
- Params: `contactId, context?`
- Returns draft (doesn't send) → pipes into `sendEmail` for approval.

#### 1.9 — `suggestEmailReply` tool
- Endpoint: `POST /api/emails/suggest-reply`
- Params: `emailId`
- Returns 2-3 reply drafts → UI shows as carousel in card.

#### 1.10 — `linkContactToAccount` tool
- Endpoint: `POST /api/accounts/[id]/contacts`
- Params: `accountId, contactId, role?`
- Acceptance: "Jane works at Acme now" → card → approve → relation created.

#### 1.11 — `updateAccountLifecycle` tool
- Endpoint: `POST /api/accounts/[id]/lifecycle`
- Params: `accountId, stage (prospect|customer|churned|lost)`

#### 1.12 — `autoProgressDeal` tool
- Endpoint: `POST /api/opportunities/[id]/auto-progress`
- Params: `dealId, dryRun?`
- Returns suggested new stage + reasoning; `dryRun:false` applies.

#### 1.13 — `updateMeetingNotes` tool
- Endpoint: `PATCH /api/meetings/[id]/notes`
- Params: `meetingId, notes (summary?, keyPoints?, actionItems?, decisions?, buyingSignals?)`

#### 1.14 — `sendMeetingFollowUp` tool
- Endpoint: `POST /api/meetings/[id]/notes/send-follow-up`
- Params: `meetingId, tone?, extraContext?`
- Composes email from meeting notes → preview → Send.

#### 1.15 — `bookMeeting` tool
- Endpoint: `POST /api/meetings/book`
- Params: `contactId, proposedTimes[], duration?, agenda?`
- Requires Calendar connection.

#### 1.16 — `createSequence` tool
- Endpoint: `POST /api/sequences`
- Params: `name, description?, status?`
- Note: higher-level `proposeCampaign` already creates a draft sequence; this tool is the primitive.

#### 1.17 — `updateSequence` tool — `PUT /api/sequences/[id]`
#### 1.18 — `addSequenceStep` tool — `POST /api/sequences/[id]/steps`
#### 1.19 — `updateSequenceStep` tool — `PATCH /api/sequences/[id]/steps/[stepId]`
#### 1.20 — `enrollInSequence` tool
- Endpoint: `POST /api/sequences/[id]/enroll`
- Params: `sequenceId, contactIds[]`
- Acceptance: "enroll the 12 Series A CMOs in 'warm intro'" → preview list → Approve → enrolled.

#### 1.21 — `toggleSequenceAutopilot` tool — `POST /api/sequences/[id]/autopilot`
#### 1.22 — `launchCampaign` tool
- Endpoint: `POST /api/campaigns/[sequenceId]/launch`
- Gate: approval required, shows preview of recipients + first-touch subject/body.

#### 1.23 — `unsubscribeContact` tool — `POST /api/unsubscribe`
- Admin/compliance operation; exposed for "mark Jane as unsubscribed because she asked"

#### 1.24 — fold `extract-intel` into `getDealCoaching`
- No new tool; refactor `getDealCoaching` to internally hit `/api/opportunities/[id]/extract-intel` when fresher signals needed.

#### 1.25 — `mergeContacts` tool (DESTRUCTIVE — gated)
- Endpoint: `POST /api/contacts/merge`
- **Gate**: do NOT expose until CHAT-04 (undo) ships. Scaffold the tool in CHAT-01 with `enabled=false` flag so registry shape is final, but resolver filters it out.

#### 1.26 — `deleteSequenceStep` tool (DESTRUCTIVE — gated as above)
- Endpoint: `DELETE /api/sequences/[id]/steps/[stepId]`
- Same gating as 1.25.

---

### Wave 2 — Gap-B tools (23 tasks, ~1.5 weeks)

Settings / admin. Same format as Wave 1.

#### 1.27 — `updateICP` tool — `PUT /api/settings/icp`
#### 1.28 — `createKnowledgeEntry` — `POST /api/settings/knowledge`
#### 1.29 — `updateKnowledgeEntry` — `PUT /api/settings/knowledge`
#### 1.30 — `deleteKnowledgeEntry` (DESTR — gated) — `DELETE /api/settings/knowledge`
#### 1.31 — `updatePipelineStages` — `PUT /api/settings/stages`
#### 1.32 — `updateCustomFieldSchema` — `PUT /api/settings/data-model`
#### 1.33 — `updateCustomSignalDefinitions` — `PUT /api/settings/custom-signals`
#### 1.34 — `updateWorkflows` — `PUT /api/settings/workflows`
#### 1.35 — `updateWorkspace` — `PUT /api/settings/workspace`
#### 1.36 — `updatePrivacySettings` — `PUT /api/settings/privacy`
#### 1.37 — `updateUserProfile` — `PUT /api/settings/profile`
#### 1.38 — `updateNotificationPreferences` — `PUT /api/notifications/preferences`
#### 1.39 — `addMailbox` — `POST /api/settings/mailboxes` (returns OAuth URL)
#### 1.40 — `updateMailboxSettings` — `PATCH /api/settings/mailboxes`
#### 1.41 — `removeMailbox` (DESTR — gated) — `DELETE /api/settings/mailboxes`
#### 1.42 — `updateMailCalendarIntegration` — `PUT /api/settings/mail-calendar`
#### 1.43 — `inviteMember` — `POST /api/settings/members/invite`
#### 1.44 — `resendInvite` — `POST /api/settings/members/invites/[id]`
#### 1.45 — `revokeInvite` (DESTR — gated) — `DELETE /api/settings/members/invites/[id]`
#### 1.46 — `updateMemberRole` — `PUT /api/settings/members`
#### 1.47 — `createCustomObjectType` — `POST /api/custom-objects`
#### 1.48 — `updateCustomObjectType` — `PUT /api/custom-objects`
#### 1.49 — `createSavedView` — `POST /api/views`

---

### Wave 3 — New-tool-needs-new-endpoint (25 tasks — parallel with Waves 1–2)

Each task requires both endpoint + tool. Assign to a separate developer stream.

#### 1.50 — `listSchema` + `GET /api/settings/schema`
- Endpoint returns `{objectTypes, customFields, pipelineStages, savedViews, listsDefined}` for the tenant.
- Tool reads from endpoint, returned to LLM as compressed JSON (<2KB).
- **Highest priority new tool** — unblocks custom schema support across all tools.

#### 1.51 — `listAttributeDefinitions` + `GET /api/settings/data-model`
- Verify endpoint exists for GET; if only PUT, add GET.
- Tool returns per-object attribute list with types.

#### 1.52 — `upsertContact` + extend `POST /api/contacts?upsert=true`
#### 1.53 — `upsertAccount` + extend `POST /api/accounts?upsert=true`
#### 1.54 — `upsertRecord` + extend `POST /api/custom-objects/[type]?upsert=true`

#### 1.55 — `getRecordsByIds` + `POST /api/records/batch-get`
- New route; takes `{type, ids[]}`, returns records. Reduces LLM roundtrips.

#### 1.56 — `createComment` + `POST /api/comments` — requires new `comments` table migration
- Schema: `{id, tenantId, entityType, entityId, parentCommentId, authorId, body, createdAt}`
- Acceptance: "add a comment on this deal: @jane can you check?" → mention parsing → notification.

#### 1.57 — `listComments` + `GET /api/comments?entityType&entityId`
#### 1.58 — `listCommentReplies` + `GET /api/comments/[id]/replies`
#### 1.59 — `deleteComment` (DESTR — gated) + `DELETE /api/comments/[id]`

#### 1.60 — `semanticSearchNotes` + `POST /api/notes/search`
- Vector search over `notes.content` via `embeddings.ts`.

#### 1.61 — `getNoteBody` + verify `GET /api/notes/[id]` exists; add if missing.
#### 1.62 — `searchMeetings` + verify `GET /api/meetings?filters`.
#### 1.63 — `semanticSearchCallRecordings` + `POST /api/meetings/search`
- Vector over `meetings.transcript + meetings.summary`.

#### 1.64 — `getCallRecording` + verify `GET /api/meetings/[id]`.
#### 1.65 — `searchEmailsByMetadata` + verify `GET /api/emails?filters`.
#### 1.66 — `semanticSearchEmails` + `POST /api/emails/search`.
#### 1.67 — `getEmailContent` + verify `GET /api/emails/[id]`.
#### 1.68 — `listWorkspaceMembers` + verify `GET /api/settings/members` returns list.
#### 1.69 — `listWorkspaceTeams` + new `GET /api/settings/teams`
- Depends on new `teams` table migration (see CHAT-01 task 1.69a: schema migration).

#### 1.70 — `whoami` + `GET /api/auth/me` (verify / add).

#### 1.71 — `runBasicReport` + `POST /api/reports/aggregate`
- Takes `{objectType, filters, groupBy, aggregates[{field, op:count|sum|avg}]}`.
- Returns aggregated rows.

#### 1.72 — `addRecordToList` + `POST /api/views/[id]/records`
- If saved views can function as lists (as in Attio), add membership endpoint.

#### 1.73 — `updateListEntryByRecordId` + `PATCH /api/views/[id]/records/[recordId]`

#### 1.74 — `researchAgent` + `POST /api/agents/research` (Inngest-backed)
- **Defer to CHAT-06** (long-running agent phase). Scaffold registration only in CHAT-01.

---

## Tasks dependency graph

```
1.0 refactor → {1.1..1.49 parallel} → merge CHAT-01
1.50 listSchema → unblocks {1.52, 1.53, 1.54, 1.63, 1.71} that reference custom schema
1.56 createComment schema migration → {1.57, 1.58, 1.59}
1.69 teams migration → 1.69
```

## Exit criteria for CHAT-01

- ≥ 95 chat tools defined (51 existing + 44 new from 1.1–1.49 excluding gated destructive).
- 100% of Gap-A non-destructive tools shipped.
- Refactor to `lib/chat/tools/*` complete.
- Existing 264 tests pass; 100+ new tests added (≥2 per new tool).
- `regression.sh` clean.
- `_research/teardown-attio.md` side-by-side: our registry ≥ 35 MCP tools × 1.5 coverage.
- Phase 6 evaluation (EVAL_RUBRIC.md) scores ≥ 0.8 on "action completeness" dimension.
