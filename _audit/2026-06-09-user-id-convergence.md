# User-ID convergence audit (auth_user.id vs users.id)

Date: 2026-06-09. Scope: every site that crosses the AUTH-user id (`auth_user.id` =
`authCtx.userId`) and the APP-user id (`users.id` = `authCtx.appUserId`) spaces.
Method: built the authoritative column→FK-space map from `db/schema/*.ts`, then
grepped every write / filter / compare / join over those columns in
`app/apps/web/src/{app/api,inngest,lib,skills}` and cross-referenced the value's
space against the column's space. Only CONFIRMED mismatches are flagged.

Bridge helpers: `lib/auth/user-id.ts` (`appToAuthUserId` / `authToAppUserId`).
`authCtx` exposes both `userId` (auth) and `appUserId` (app).

---

## Authoritative space map (user-ish columns)

APP `users.id`: companies.ownerId, contacts.ownerId, deals.ownerId, notes.authorId,
tasks.assigneeId, chatThreads.userId, sharedPrompts.authorId, chatMemories.userId,
comments.authorId, toolCallEvents.userId, importHistory.userId, coachingInsights.userId,
aePerformanceSnapshots.userId, customSkillTemplates.createdByUserId,
customSignals.createdByUserId, pendingInvites.invitedByUserId,
pendingInvites.acceptedByUserId, proposalTemplates.createdByUserId,
proposalTemplates.mappedByUserId, proposals.createdByUserId, calls.userId,
callCampaigns.ownerId, callScripts.updatedBy, notifications.userId,
notificationPreferences.userId, tamProposals.reviewedByUserId, icps.createdByUserId.

AUTH `auth_user.id`: savedViews.userId, userPreferences.userId,
passwordResetTokens.userId, emailVerificationTokens.userId, and ALL agent.ts tables
(agentTasks.userId, codeExecutions.userId, agentActions.userId/reversedByUserId,
trustEvents.userId, knowledgeEntries.createdBy, sendingInfraRequests.requestedByUserId).

NO-FK text (convention only, no cross-space FK): activities.actorId (actorType-disc.),
captureApprovals.reviewedByUserId, accountSuppressions.createdBy, sequences.createdBy
(auth convention), sequenceDrafts.reviewedBy, connectedMailboxes.userId (auth convention).

---

## WRITE bugs (auth id written into an app `users.id` FK column, or vice-versa)

| file:line | offending line | column / table | FK space | value used | fix |
|---|---|---|---|---|---|
| `app/apps/web/src/app/api/proposals/templates/route.ts:93` | `createdByUserId: authCtx.userId,` | proposalTemplates.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | `authCtx.appUserId` — NOTE line 79 in the SAME file already uses `appUserId` for the same column (the failed-extraction insert). |
| `app/apps/web/src/app/api/proposals/templates/[id]/route.ts:78` | `mappedByUserId: authCtx.userId,` | proposalTemplates.mappedByUserId | APP `users.id` | `authCtx.userId` (auth) | `authCtx.appUserId` (the known example). |
| `app/apps/web/src/lib/proposals/fill.ts:401` (caller `app/apps/web/src/app/api/proposals/templates/[id]/fill/route.ts:20`) | `createdByUserId: opts.userId ?? null,` ← `userId: authCtx.userId` | proposals.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | route.ts:20 → `userId: authCtx.appUserId` (fill.ts just forwards opts.userId). |
| `app/apps/web/src/skills/custom/executor.ts:369` (caller `app/apps/web/src/app/api/settings/skills/route.ts:62-66`, forkSkill) | `createdByUserId: userId,` ← `forkSkill(..., authCtx.userId, ...)` | customSkillTemplates.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | route.ts:65 → pass `authCtx.appUserId`. (The POST-create path at skills/route.ts:116 already writes `appUserId` — fork is the inconsistent one.) |
| `app/apps/web/src/lib/chat/tools/create.ts:469` (createKnowledgeEntry tool) | `createdBy: userId,` (userId = ctx.userId = appUserId) | knowledgeEntries.createdBy | AUTH `auth_user.id` (onDelete cascade) | `appUserId` (app) | `createdBy: authCtx.userId` — the HTTP route `settings/knowledge/route.ts:103` correctly writes `authCtx.userId`; the chat tool writes the app id. |
| `app/apps/web/src/lib/chat/tools/import.ts:124` (importContacts tool → `createTask`) | `userId,` (= ctx.userId = appUserId) | agentTasks.userId | AUTH `auth_user.id` (onDelete cascade) | `appUserId` (app) | pass `authCtx.userId`. createTask has no other caller; the agent-tasks list route filters by `authCtx.userId` (auth), so this write never matches its own owner filter. |
| `app/apps/web/src/lib/chat/tools/code-execution.ts:32` (executeCode tool → `executeInSandbox`) | `userId,` (= ctx.userId = appUserId) | codeExecutions.userId | AUTH `auth_user.id` (onDelete cascade) | `appUserId` (app) | pass `authCtx.userId`. |

## FILTER / COMPARE bugs

| file:line | offending line | column / table | FK space | value used | fix |
|---|---|---|---|---|---|
| `app/apps/web/src/app/api/settings/skills/[id]/route.ts:62` (PATCH owner-check) | `existing.createdByUserId !== authCtx.userId &&` | customSkillTemplates.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | `!== authCtx.appUserId`. The row stores the app id (create path), so the real creator is always denied (falls through to the admin-only branch). |
| `app/apps/web/src/app/api/settings/skills/[id]/route.ts:117` (DELETE owner-check) | `existing.createdByUserId !== authCtx.userId &&` | customSkillTemplates.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | `!== authCtx.appUserId` (same as above). |
| `app/apps/web/src/skills/custom/executor.ts:305` (listAvailableSkills, caller `settings/skills/route.ts:16` passes `authCtx.userId`) | `eq(customSkillTemplates.createdByUserId, userId)` | customSkillTemplates.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | route.ts:16 → `listAvailableSkills(authCtx.tenantId, authCtx.appUserId)`. User-scoped (scope='user') skills created by the caller never list. |
| `app/apps/web/src/skills/custom/executor.ts:319` (listAvailableSkills isEditable) | `isEditable: s.createdByUserId === userId || s.scope === "user",` | customSkillTemplates.createdByUserId | APP `users.id` | `authCtx.userId` (auth) | same fix as above (pass appUserId from the route). |
| `app/apps/web/src/app/api/search/quick/route.ts:69` | `eq(chatThreads.userId, authCtx.userId),` | chatThreads.userId | APP `users.id` | `authCtx.userId` (auth) | `eq(chatThreads.userId, authCtx.appUserId)`. Threads are created with `appUserId` (chat/threads/route.ts:15, chat tools/query.ts:296), so this quick-search panel returns zero chat threads for everyone. |

## JOIN bugs

None found. No join was found that equates a `users.id`-FK column to an `auth_user.id`-FK
column (the only user↔user join idiom in the codebase is the inline bridge
`eq(users.clerkId, authCtx.userId)`, which is correct).

---

## Verified-correct / excluded (ambiguous items the prompt named — now settled)

- **savedViews.userId** → FK `auth_user.id` (AUTH). All sites use `authCtx.userId` (views/route.ts:52/85/94/123, chat tools/create.ts:799/808). Consistent. Correct.
- **userPreferences.userId** → FK `auth_user.id` (AUTH). All sites use `authCtx.userId` (user-preferences/route.ts:42/74/88). Consistent. Correct.
- **knowledgeEntries.createdBy** → FK `auth_user.id` (AUTH, onDelete cascade). HTTP routes correctly use `authCtx.userId` (settings/knowledge/route.ts:28/46/103/167/242; chat/route.ts:529; retrieveKnowledge at chat/route.ts:508). The ONE wrong site is the chat tool `create.ts:469` (flagged above as a WRITE bug) — it writes the app id.
- **sequenceDrafts.reviewedBy** → NO FK (plain text). Only ever written (`authCtx.userId` at approve:99 / reject:92 / bulk-approve:119, or `"system"`) and displayed as a string (drafts/route.ts:97). No cross-space comparison anywhere. Not a bug (auth-id convention).
- **customer_requests.captured_by** → NOT a column. `customerRequests` (voice-of-customer.ts) has no `capturedBy` field; customer-requests/route.ts:104 writes `capturedBy` inside the free-form `metadata` JSONB. No FK → not a bug; any stable id is fine.
- **mcp keys (keyOwnerId / revokedBy)** → NOT DB columns. Stored in `tenants.settings.mcpApiKeys` JSONB (mcp/keys/route.ts:86/98) and a log field (`revokedBy`, :160). No FK → `authCtx.userId` is fine.
- **tamProposals.reviewedByUserId** → FK `users.id` (APP). Caller `tam/proposals/decide/route.ts:53` passes `authCtx.appUserId`. Correct.
- **captureApprovals.reviewedByUserId** → NO FK. Written with `authCtx.userId` (capture-approvals/[id]/route.ts:26/31 → approval.ts:131/147). No cross-space compare. Fine.
- **agentActions.approvedByUserId** → NOT a column (agentActions only has userId/reversedByUserId, both AUTH). agent-actions/[id]/approve/route.ts:35 forwards `approvedByUserId: authCtx.userId` into a helper that records the agent-space trust event (AUTH) — auth id is correct.
- **accountSuppressions.createdBy** → NO FK (text). Written consistently with `authCtx.appUserId` across delete/exclude/batch routes (contacts/[id]/route.ts:195, accounts/exclude:128, accounts/batch:110). Internally consistent; not an FK so no space bug.
- **activities.actorId** → NO FK (actorType-discriminated). Written with the app id by convention everywhere (chat tools use ctx.userId=app; HTTP routes use `authCtx.appUserId`; calls-post-process uses calls.userId=app). Consistent; out of scope (no two-space FK).
- **agentTasks.userId filter** (agent-tasks/route.ts:35) uses `authCtx.userId` (AUTH) — correct for the AUTH column; it is the chat-tool WRITE (import.ts:124) that is the inconsistent side.

## Not-a-bug but worth noting (no concrete mismatch confirmed)

- Event-driven inngest writers to APP columns (coachingInsights.userId, chatMemories.userId,
  tasks.assigneeId via workflow-engine) read `userId` from their inngest event payload. The
  emitters traced all pass app ids or null: `memory/auto-extract` is emitted from
  chat/route.ts:699 with `authCtx.appUserId`; `coaching/pre-send-analysis`
  (email-send-worker.ts:436) carries NO userId → writes null. No auth id was found being
  injected into these app columns. The custom `workflow/trigger → tasks.assigneeId` chain
  (nl-workflow-builder.ts:412, workflow-engine.ts:79) depends on a workflow-definition
  `context.userId` whose origin is internal; no concrete auth-id source confirmed, so not flagged.
- `reports/schedule/route.ts:33` sends `userId: authCtx.userId` into a `reports/schedule.requested`
  inngest event that has NO handler in the codebase — currently inert, no DB write.
