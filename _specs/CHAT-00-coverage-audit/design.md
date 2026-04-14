# CHAT-00 — Design

## System fit

This ticket produces **documentation artifacts** only (no code change). It defines the contract that CHAT-01 through CHAT-09 build against.

The artifacts live in `_specs/CHAT-00-coverage-audit/`:

```
office-hours.md       # problem framing + alternatives (already present)
requirements.md       # user story + acceptance criteria
design.md             # this file — taxonomy + prioritization rubric
coverage-matrix.md    # the actual audit table
tasks.md              # ordered tickets for implementing gaps in CHAT-01
```

And at `_specs/feature_list.json` — the cross-spec index for CHAT-00 → CHAT-09.

## Taxonomy of tools

Every tool falls into exactly one category. The taxonomy drives both the system-prompt grouping and the capability-resolver filter (CHAT-02).

| Category | Purpose | Example tools | Approval policy |
|---|---|---|---|
| **schema** | Let the model discover workspace-specific custom objects, fields, stages, views | `listSchema`, `listAttributeDefinitions`, `listPipelineStages`, `listSavedViews` | no-op (read) |
| **query** | Read data from any entity with filters/pagination | `queryContacts`, `queryAccounts`, `queryDeals`, `queryNotes`, `queryTasks`, `queryActivities`, `querySequences`, `queryMeetings` | no-op |
| **semantic-search** | Vector search over text corpora | `searchCRM`, `semanticSearchNotes`, `semanticSearchEmails`, `semanticSearchCallRecordings` | no-op |
| **get** | Fetch one record by id (cheaper than filter) | `getContact`, `getAccount`, `getDeal`, `getMeeting`, `getEmail`, `getNote`, `getRecordsByIds` | no-op |
| **create** | Insert a new record | `createContact`, `createAccount`, `createDeal`, `createTask`, `createNote`, `createComment`, `createSequence`, `createView`, `createKnowledgeEntry` | approval-gated (unless `agentApprovalMode=auto`) |
| **update** | Patch an existing record | `updateContact`, `updateAccount`, `updateDeal`, `updateDealStage`, `updateTask`, `updateNote`, `updateSequenceStep`, `updateICP`, `updatePipelineStages`, `updateWorkspace`, `updateNotificationPreferences` | approval-gated |
| **upsert** | Find-or-create by natural key | `upsertContact` (by email), `upsertAccount` (by domain), `upsertRecord` | approval-gated |
| **bulk** | Apply same change to N records | `bulkUpdateDeals`, `bulkUpdateContacts`, `bulkEnrollContacts`, `bulkScoreContacts`, `bulkEnrichContacts` | approval-gated with preview |
| **action** | Side-effect ops (send, book, process) | `sendEmail`, `bookMeeting`, `launchCampaign`, `enrollInSequence`, `processTranscript`, `autoProgressDeal`, `runWorkflow`, `inviteMember` | approval-gated |
| **destructive** | Delete / merge / revoke | `deleteRecord`, `mergeContacts`, `deleteSequenceStep`, `revokeInvite`, `deleteView`, `deleteKnowledgeEntry`, `removeMailbox` | **double-confirmation** + auto-create undo marker |
| **intelligence** | Higher-order synthesis (no single endpoint) | `getDealCoaching`, `getAccountIntelligence`, `analyzePipeline`, `scanSignals`, `detectChurnRisk`, `detectExpansionOpportunities`, `generateMeetingPrep`, `prepSalesCall`, `generateBattlecard`, `researchCompetitor`, `defineICP`, `qualifyLeads`, `qualifyInboundLead`, `trackChampions`, `checkFundingSignals`, `checkHiringSignals`, `detectLeadershipChanges` | no-op or approval-gated depending on side effect |
| **long-running** | Jobs streamed back via SSE | `researchAgent`, `runAiAttribute`, `bulkEnrich`, `buildTAM`, `campaignGeneration` | approval before launch + cancel button |
| **memory** | Persistent memory R/W | `rememberContext`, `recallMemories`, `forgetMemory` | user confirm on write |

## Prioritization rubric for gap closure

Every gap gets a tier based on two axes:

**Axis 1 — user frequency** (how often the action is taken in a typical day):
- 🔥 Daily (contacts CRUD, tasks, notes, emails, deal stages)
- ⚡ Weekly (sequences, meetings, enrichment, bulk ops)
- 🌱 Monthly+ (settings, admin, GDPR, custom objects schema changes)

**Axis 2 — chat affinity** (how much value comes from being in chat vs UI):
- ✨ High — natural-language beats UI ("draft a note", "merge these two Johns")
- ⭐ Medium — chat convenient but UI works fine
- · Low — chat would be awkward (file upload, drag-drop stage reorder)

Tier assignment:

| Tier | Frequency × Affinity | Ship in |
|---|---|---|
| **A** | 🔥 × ✨ or 🔥 × ⭐ | CHAT-01 Wave 1 |
| **B** | ⚡ × ✨ or 🌱 × ✨ | CHAT-01 Wave 2 |
| **C** | ⚡ × ⭐ or 🌱 × ⭐ | CHAT-06/CHAT-07 |
| **excluded** | anything · Low, or webhooks/cron/test | never in chat |

## Tool naming convention

- Verb-first, camelCase: `createContact`, `updateDealStage`, `mergeContacts`.
- Bulk variants: `bulk<Verb><Resource>` → `bulkUpdateDeals`.
- Semantic variants: `semanticSearch<Resource>` → `semanticSearchNotes`.
- Intelligence compositions use noun-first domain terms: `getDealCoaching`, `analyzePipeline`.
- Destructive verbs never aliased: `deleteContact` not `removeContact` not `archiveContact` (unless a dedicated archive endpoint exists).

## Contract between tools and endpoints

1. **Tools wrap endpoints, never duplicate logic.** If an endpoint does validation or side-effects, the tool calls the endpoint (internal `fetch` or direct handler invocation via shared lib).
2. **Tool zod schema is derived from endpoint zod schema when possible.** Reuse `createContactSchema` from `/api/contacts/route.ts` in the `createContact` tool.
3. **Tool permission check is the endpoint's auth check.** Tools run as the authenticated user. No tool-specific auth layer in CHAT-00; CHAT-02 adds the capability resolver on top.
4. **Tool errors propagate user-readable messages.** Endpoints return `{ error: string }`, tools surface that verbatim to the LLM to reason about.
5. **Tool results are serializable JSON**, ≤ 10 KB per call. Large results paginated; offer `nextCursor`.

## Data model — no schema change for CHAT-00

This ticket touches zero DB tables. Foreshadowing CHAT-04:
- `toolCallEvents` (future): `{ id, tenantId, userId, threadId, messageId, toolName, args JSONB, result JSONB, status, revertedAt, reverseOpId, executedAt }`.

## Failure handling

CHAT-00 itself can't "fail at runtime" — it's markdown. Failure modes to watch:
1. Audit matrix misses an endpoint (regression risk). Mitigation: `tasks.md` task #0 = a grep script that walks `app/apps/web/src/app/api/**/route.ts` and diffs against the matrix, committed so it runs in CI.
2. Coverage matrix drifts as new endpoints land. Mitigation: document the regen command in `design.md` (below) and schedule a weekly Inngest task (CHAT-09) to re-run it and open a PR if drift detected.

## Regen command (for future drift detection)

```bash
# From repo root:
node _tools/coverage-audit.js > _specs/CHAT-00-coverage-audit/coverage-matrix.generated.md
diff _specs/CHAT-00-coverage-audit/coverage-matrix.md \
     _specs/CHAT-00-coverage-audit/coverage-matrix.generated.md
```

`_tools/coverage-audit.js` (to be created in CHAT-09): AST-parses each `route.ts`, extracts exported HTTP methods + zod schemas + leading JSDoc, compares against tool registry introspected from `app/apps/web/src/app/api/chat/route.ts`.

## Security considerations

- No new attack surface in CHAT-00 (docs only).
- Flag in matrix: destructive endpoints MUST go through approval + undo in CHAT-04 before being exposed as tools. Premature exposure risk: a prompt-injection tricks the model into `deleteContact`. Mitigation: the `destructive` category requires the `agentApprovalMode ≠ auto` check regardless of tenant setting.
- Admin endpoints (`admin/*`, `gdpr/*`, `test-e2e/*`) stay excluded by default; explicit Martin sign-off per endpoint to include.
