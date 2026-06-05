# AI Cluster — Code Analysis Audit

**Date:** 2026-06-05  
**Repo root:** `C:\Users\marti\leads`  
**Web src root:** `app/apps/web/src`

---

## /chat — route `/chat`

- **Purpose:** Chat-first GTM copilot — the primary user-facing AI surface where a founder interacts with the system in natural language to query their CRM, draft outreach, run analyses, and manage records.

- **Reads (data in):**
  - Transport: `TextStreamChatTransport` via POST `/api/chat` (`chat/page.tsx:29-33`)
  - Thread history: GET `/api/chat/threads/${tid}` on mount (`chat/page.tsx:58-78`)
  - Contextual suggestions: GET `/api/chat/suggestions` (`chat/page.tsx:84-93`)
  - Query params: `?thread=`, `?q=`, `?skill=` (`chat/page.tsx:25,99,106`)
  - **Backend (`/api/chat/route.ts`)** fetches in parallel on every request:
    - CRM snapshot: `companies`, `contacts`, `deals`, `activities` tables (last 10-15 of each, all tenant-scoped) (`route.ts:162-284`)
    - Context graph search: `searchContextGraph` (`route.ts:461`)
    - Vector/RAG search: `searchSimilar` (requires `OPENAI_API_KEY`) (`route.ts:465-468`)
    - Knowledge base: `knowledgeEntries` table via `retrieveKnowledge` with semantic fallback (`route.ts:499-535`)
    - Agent memory: `chatMemories` table (workspace + user scope, last 15) (`route.ts:541-565`)
    - Work queue: `getTopWorkItems` (last 10 items) (`route.ts:568-577`)
    - Tenant settings: `getTenantSettings` for ICP, pipeline stages, custom fields (`route.ts:441`)

- **States handled in code:**
  - Loading/thread-loading: spinner shown until `threadLoaded` is true (`chat/page.tsx:283-290`)
  - Empty (no messages): full-page greeting with suggestion pills (`chat/page.tsx:328-378`)
  - Streaming: `StreamingSkeleton` component renders during `chat.status === "streaming"` (`chat/page.tsx:684`)
  - Populated (messages exist): renders tool-call panels, action cards, markdown, follow-up pills (`chat/page.tsx:382-679`)
  - Error: banner with retry button re-sends last user message (`chat/page.tsx:691-718`)
  - **MISSING:** No distinction between "empty workspace (no CRM data)" and "empty thread" — the empty state shows the same greeting regardless of whether the workspace has any data to query.
  - **MISSING:** No partial-stream state indicator beyond the skeleton — no "thinking" display while the LLM picks tools.

- **Primary CTAs / outbound links (edges OUT):**
  - `+ New chat` button: resets thread, navigates to `/chat` (`chat/page.tsx:313-321`)
  - `Open in Composer` button: opens `EmailComposerPanel` overlay for detected email drafts (`chat/page.tsx:648-653`)
  - Campaign approval action card: SPA push to `/sequences/${seqId}` (`chat/page.tsx:462-466`)
  - Contact/account/deal creation: calls POST `/api/contacts`, `/api/accounts`, `/api/deals` from the action card approval flow (`chat/page.tsx:469-484`)
  - Follow-up pills: send a new message in the same thread (`chat/page.tsx:673`)
  - Suggestion cards on empty state: send a message immediately (`chat/page.tsx:267-269`)

- **Inbound expectations (edges IN):**
  - `?thread=<uuid>`: loads and hydrates an existing thread; messages are fetched and injected via `chat.setMessages()` (`chat/page.tsx:56-78`)
  - `?q=<text>`: auto-sends the query as the first message once the thread is ready (`chat/page.tsx:97-103`)
  - `?skill=<slug>`: pre-fills the input with `"Run skill: <SkillName>"` (NOT auto-sent; user must confirm) (`chat/page.tsx:106-115`)
  - **Seam gap:** When `?skill=` is used, the text is pre-filled as a plain string like `"Run skill: Pipeline Review"`. The chat agent must infer intent from this string. There is no structured payload telling the agent which skill to run — it relies on the LLM to interpret the phrase and call the matching tool.

- **Seam risks:**
  - The `?skill=` pre-fill is fragile: if the skill slug does not match a recognizable phrase the agent knows, it may not invoke the right tool.
  - No `contextType` / `contextId` params are populated from the `/chat` page itself — these are only sent by surfaces that embed the chat component with entity context (e.g., account brain page). The global `/chat` route always starts as `surface: "global"`.
  - Thread save failure is toasted as warning but does not block the user; chat history can be silently lost on reload (`chat/page.tsx:154-157`).
  - `EmailComposerPanel` opens as an overlay but the email is NOT sent through the chat's tool system — it uses a separate panel with its own send mechanism. There is no feedback loop to the chat agent that an email was actually sent.

- **Notable gaps:**
  - File attachment is limited to 2 MB and text-only formats (`.csv,.txt,.md,.json,.pdf`) — no binary or image handling (`chat/page.tsx:233,739`).
  - Voice input uses the Web Speech API with English-only locale hardcoded (`recognition.lang = "en-US"`) (`chat/page.tsx:253`).
  - Action cards for entity creation (`createContact`, `createAccount`, `createDeal`, `campaign`) — but NOT for `updateDeal`, `enrollInSequence`, `sendMeetingFollowUp`, or `bookMeeting`. Those write directly without approval cards.
  - `trackEvent("", "chat_message_sent", ...)` — the event name is an empty string, which means PostHog capture is broken for this event (`chat/page.tsx:221`).
  - After batch-approving multiple proposals, the LLM is notified via `chat.sendMessage(...)` to propose linked records. This sends a user-role message that appears in the conversation history, which may confuse conversational context.

---

### Chat API Route — Tool Inventory and Capabilities

**File:** `app/apps/web/src/app/api/chat/route.ts`  
**Tool registry:** `app/apps/web/src/lib/chat/tools/index.ts`

The chat API assembles tools from 18 sub-modules via `buildAllChatTools(ctx)` (`tools/index.ts:24-44`). The orchestrator (`orchestrate`) and capability resolver (`resolveCapabilities`) may further filter this set per turn (`route.ts:599-627`). Up to ~126 tools exist in the full registry; the router narrows to 40-50 per turn.

#### QUERY tools (`tools/query.ts`) — read-only

| Tool | Entity touched |
|------|---------------|
| `searchCRM` | All entities (vector search) |
| `queryContacts` | contacts table |
| `queryAccounts` | companies table |
| `queryDeals` | deals table |
| `queryActivities` | activities table (email bodies, meeting notes) |
| `queryNotes` | notes table |
| `queryTasks` | tasks table |
| `whoami` | users table |
| `listWorkspaceMembers` | users table |
| `searchMeetings` | activities (channel=meeting) |
| `searchEmailsByMetadata` | activities (channel=email) |
| `runBasicReport` | contacts/companies/deals/activities/tasks (aggregate SQL) |
| `getNoteBody` | notes table (full body) |
| `getCallRecording` | activities (meeting, transcript) |
| `getEmailContent` | activities (email, full body) |
| `semanticSearchNotes` | notes via vector embeddings |
| `semanticSearchEmails` | activities (email) via vector embeddings |
| `semanticSearchCallRecordings` | activities (meeting) via vector embeddings |
| `getRecordsByIds` | contact/company/deal/task/note/activity (batch fetch) |
| `listComments` | comments table |
| `listCommentReplies` | comments table |
| `findDuplicateContacts` | contacts table (dedup by email) |
| `listRecentToolCalls` | toolCallEvents table (audit trail) |
| `listSharedPrompts` | sharedPrompts table |
| `deleteSharedPrompt` | sharedPrompts table (deletes) |

#### CREATE tools (`tools/create.ts`) — write, some with approval gate

| Tool | Entity touched | Approval mode |
|------|---------------|---------------|
| `createContact` | contacts | proposal card in "ask" mode; direct write in "auto" |
| `createAccount` | companies | proposal card in "ask" mode; direct write in "auto" |
| `createDeal` | deals | proposal card in "ask" mode; direct write in "auto" |
| `createNote` | notes + context graph ingest | direct write |
| `logActivity` | activities | direct write |
| `createSequence` | sequences | direct write |
| `addSequenceStep` | sequence_steps | direct write |
| `createTask` | tasks | direct write |
| `createKnowledgeEntry` | knowledgeEntries (admin only) | direct write |
| `upsertContact` | contacts (find-or-create by email) | direct write |
| `upsertAccount` | companies (find-or-create by domain) | direct write |
| `upsertDealByCompany` | deals (find-or-create by name+company) | direct write |
| `createCustomObjectType` | tenant settings (admin only) | direct write |
| `createSavedView` | savedViews table | direct write |
| `createComment` | comments table | direct write |
| `createSharedPrompt` | sharedPrompts table | direct write |

#### UPDATE tools (`tools/update.ts`) — write, no approval gate

| Tool | Entity touched |
|------|---------------|
| `updateContact` | contacts |
| `updateAccount` | companies |
| `updateDeal` | deals + activity log |
| `updateTask` | tasks |
| `updateAccountLifecycle` | companies.properties.lifecycle |
| `updateMeetingNotes` | activities.metadata (structured notes + follow-up draft) |
| `updateSequence` | sequences |
| `updateSequenceStep` | sequence_steps |
| `updateDealStage` | deals + activity log + inngest event on close |
| `completeTask` | tasks |
| `bulkUpdateDeals` | deals (filtered bulk) |
| `bulkUpdateContacts` | contacts (filtered bulk) |
| `updateICP` | tenant.settings (admin only) |
| `updateWorkspace` | tenants + settings |
| `updateUserProfile` | users + tenant.settings |
| `updateNotificationPreferences` | notificationPreferences + tenant.settings |
| `updatePrivacySettings` | tenant.settings (admin only) |
| `updateKnowledgeEntry` | knowledgeEntries (admin only) |
| `updatePipelineStages` | tenant.settings (admin only) |
| `updateCustomFieldSchema` | tenant.settings (admin only) |
| `updateCustomSignalDefinitions` | tenant.settings (admin only) |
| `updateWorkflows` | tenant.settings (admin only) |
| `updateMemberRole` | users (admin only) |
| `updateMailboxSettings` | connectedMailboxes |
| `updateMailCalendarIntegration` | tenant.settings |
| `updateCustomObjectType` | tenant.settings (admin only) |

#### ACTION tools (`tools/action.ts`) — agentic/side-effectful

| Tool | What it does |
|------|-------------|
| `draftEmail` | Fetches contact + history, returns draft context for LLM to render in chat (NOT sent) |
| `generateFollowUpEmail` | LLM-generated follow-up draft from meeting notes (NOT sent — returns to composer) |
| `suggestEmailReply` | Returns 3 reply options for an inbound email (NOT sent) |
| `autoProgressDeal` | Suggests or applies next pipeline stage based on signals |
| `sendMeetingFollowUp` | Actually sends email via Resend from stored draft (REAL send) |
| `bookMeeting` | Creates Google Calendar event + sends invite via Google API (REAL action) |
| `enrollInSequence` | Enrolls contacts in sequence (REAL write to sequenceEnrollments) |
| `runSequenceAutopilot` | Auto-enrolls scored contacts in sequence (REAL write) |
| `launchCampaign` | Transitions draft emails to "queued" for send worker (REAL action) |
| `unsubscribeContact` | Inserts email opt-out + pauses enrollments (REAL write) |
| `proposeCampaign` | Creates sequence + steps in DB, returns proposal card for approval |
| `inviteMember` | Creates pending invite + sends invite email via Resend (REAL action, admin only) |
| `resendInvite` | Rotates invite token + resends email (REAL action, admin only) |
| `addMailbox` | Registers with EmailEngine + inserts connectedMailboxes row (REAL action) |
| `runAiAttribute` | Executes AI-computed custom field on a record, writes result |
| `deleteComment` | Deletes a comment (REAL delete) |
| `deleteSequenceStep` | Deletes a step + renumbers (REAL delete, requires allowDestructive) |
| `mergeContacts` | Re-points all FKs + deletes merged contacts (REAL delete, requires allowDestructive) |

#### SKILLS tools (`tools/skills.ts`) — delegate to skill runner

Each of these tools calls `runSkill(skillDef, params, { tenantId })` against a pre-built skill library. All skills are invocable from chat.

| Tool | Delegates to skill |
|------|--------------------|
| `analyzePipeline` | `pipelineReviewSkill` |
| `scanSignals` | `signalScannerSkill` |
| `generateBattlecard` | `battlecardGeneratorSkill` |
| `researchCompetitor` | `competitorIntelSkill` |
| `detectChurnRisk` | `churnRiskDetectorSkill` |
| `analyzeSequencePerformance` | `sequencePerformanceSkill` |
| `findLeadsAtCompany` | `companyContactFinderSkill` (Apollo) |
| `detectExpansionOpportunities` | `expansionSignalSpotterSkill` |
| `buildTAM` | `tamBuilderSkill` (Apollo) |
| `findLeadsByDomain` | `apolloLeadFinderSkill` (Apollo) |
| `defineICP` | `icpIdentificationSkill` |
| `prepSalesCall` | `salesCallPrepSkill` |
| `qualifyLeads` | `leadQualificationSkill` |
| `qualifyInboundLead` | `inboundLeadQualificationSkill` |
| `enrichContact` | `inboundLeadEnrichmentSkill` (Apollo) |
| `checkDuplicates` | `contactCacheSkill` |
| `trackChampions` | `championTrackerSkill` |
| `checkFundingSignals` | `fundingSignalMonitorSkill` |
| `checkHiringSignals` | `jobPostingIntentSkill` |
| `detectLeadershipChanges` | `leadershipChangeOutreachSkill` |
| `scopePoC` | `scopePocSkill` |
| `draftProposal` | `draftProposalSkill` |
| `handleObjection` | `handleObjectionSkill` |
| `reEngageStalledDeal` | `reEngageStalledSkill` |
| `listProposalTemplates` | DB query (proposalTemplates) |
| `fillProposal` | `proposalFillSkill` |

#### INTELLIGENCE tools (`tools/intelligence.ts`) — analysis, buyer intent, stall prediction

Includes `getDealCoaching`, buyer intent scoring (`scoreBuyerIntent`), stall prediction (`predictStalls`), and related analysis. All read-only analytic output for the LLM to synthesize.

#### MEMORY tools (`tools/memory.ts`), BRIEFING tools (`tools/briefing.ts`), COACHING tools (`tools/coaching.ts`), RESEARCH tools (`tools/research.ts`), FORECAST tools (`tools/forecast.ts`), STAKEHOLDER tools (`tools/stakeholder.ts`), WORKFLOW tools (`tools/workflow.ts`), IMPORT tools (`tools/import.ts`), BRAIN tools (`tools/brain.ts`), SCHEMA tools (`tools/schema.ts`), UNDO tools (`tools/undo.ts`), CODE EXECUTION tools (`tools/code-execution.ts`)

Additional tool groups exist covering: persistent memory (save/recall from chatMemories), daily briefings, deal coaching playbook, competitor research, revenue forecasting, stakeholder mapping, workflow listing, CSV import, account brain queries, custom object schema, and tool-call undo (reversal of writes that were logged with a snapshot). Code execution tool exists but is marked as restricted by the capability resolver.

#### Summary: Can chat ACT?

**YES — chat can act.** The chat agent can:
- **Create** contacts, accounts, deals, notes, tasks, sequences, activities, comments, knowledge entries, saved views
- **Update** every major CRM entity (contact, account, deal, task, sequence, meeting notes)
- **Advance deal stages** including marking as won/lost (triggers Inngest event)
- **Enroll contacts** in sequences (real writes)
- **Launch campaigns** (transitions draft emails to queued send queue)
- **Send emails** via Resend (meeting follow-ups)
- **Book calendar meetings** via Google Calendar API
- **Invite workspace members** via Resend
- **Merge and delete contacts** (requires `allowDestructive` capability)
- **Run any of 26+ skills** (pipeline analysis, TAM building, lead enrichment, battlecards, proposals, etc.)

**Approval mode** (`agentApprovalMode`) gates `createContact`, `createAccount`, `createDeal` behind action-card proposals when set to `"ask"` (`tools/create.ts:57-70`). All other write tools execute immediately without approval cards.

#### Does chat have universal context?

**YES, with caveats.** On every turn the system prompt contains:
1. A CRM snapshot (10 recent accounts, contacts, deals, 15 activities) injected directly
2. Entity-specific context when `contextType`/`contextId` is passed (full contact/account/deal with related records)
3. Knowledge base entries retrieved semantically for the current query
4. Context graph results (relationship facts from email/meeting/note ingestion)
5. Vector similarity search results with source citations
6. Agent memory (persistent `chatMemories` entries)
7. Work queue state

**Dead-ends in universal context:**
- Vector search and knowledge semantic retrieval require `OPENAI_API_KEY`. If absent, the system falls back to keyword search or skips RAG entirely (`route.ts:463-468`, `retrieval.ts:48-60`).
- The CRM snapshot is limited to the 10 most recent records per entity. For workspaces with large data, the agent may not see an account it hasn't recently interacted with unless the user asks explicitly (prompting a `queryAccounts` tool call).
- Custom objects (`customObjectTypes` in tenant settings) are not included in the CRM snapshot — the agent knows their schema from tenant settings but cannot see the actual records without calling the relevant query tool.

---

## /knowledge — route `/knowledge`

- **Purpose:** Knowledge base CRUD — lets the user read, add, edit, and delete workspace knowledge entries that are semantically retrieved into the chat agent's context on every turn.

- **Reads (data in):**
  - GET `/api/settings/knowledge` → fetches `knowledgeEntries` for tenant (`knowledge/page.tsx:24-35`)
  - POST `/api/settings/knowledge` → creates entry (`knowledge/page.tsx:50-65`)
  - PUT `/api/settings/knowledge` → updates entry (`knowledge/page.tsx:68-83`)
  - DELETE `/api/settings/knowledge?id=` → deletes entry (`knowledge/page.tsx:86-97`)

- **States handled in code:**
  - Loading: skeleton sidbar + detail area shown while `loading === true` (`knowledge/page.tsx:100-131`)
  - Empty (no entries + none selected): `KnowledgeDetailEmpty` component renders when `selectedEntry === null` (`knowledge/page.tsx:162`)
  - Populated: `KnowledgeSidebar` lists entries, `KnowledgeDetail` shows selected entry for editing (`knowledge/page.tsx:146-164`)
  - Error: silent — fetch errors are swallowed with empty array as fallback (`knowledge/page.tsx:32-34`)
  - **MISSING:** No error state surface to user when fetch fails — page silently renders empty without a message.
  - **MISSING:** No empty-state CTA on the detail panel (just generic `KnowledgeDetailEmpty`) pointing users to add their first entry.

- **Primary CTAs / outbound links (edges OUT):**
  - `+ Add knowledge` button → opens `AddKnowledgeDialog` (`knowledge/page.tsx:143-145`)
  - No navigation to chat or other surfaces.

- **Inbound expectations (edges IN):**
  - No query params consumed. Always loads fresh list on mount.

- **Seam risks:**
  - Knowledge entries are injected into chat automatically on every turn via `retrieveKnowledge` in the chat API route. However, the Knowledge page has no visual indicator that entries "feed into" chat — the connection is invisible to the user.
  - The `embedKnowledgeEntry` call (for semantic retrieval) is fire-and-forget (`tools/create.ts:477`). If embedding fails silently, the entry still saves but will not appear in semantic search results. No feedback to the user.
  - Knowledge retrieval in chat requires `OPENAI_API_KEY` for embedding. Without it, fallback is keyword search — entries with short or vague titles may not surface.

- **Notable gaps:**
  - No search/filter on the knowledge sidebar. As the list grows, there is no way to find an entry other than scrolling.
  - No usage analytics (how often each entry was retrieved, last retrieved date).
  - Category field exists in schema but is not displayed prominently in the sidebar (not confirmed by reading `knowledge-sidebar.tsx` but the page only calls `KnowledgeSidebar` with `entries`).

---

## /skills — route `/skills`

- **Purpose:** Browse, configure, fork, and create AI skills — reusable parameterized workflows that the chat agent can invoke via `runSkill()`.

- **Reads (data in):**
  - GET `/api/settings/skills` → fetches skill definitions (`skills/page.tsx:42-54`)
  - POST `/api/settings/skills` → creates skill (`skills/page.tsx:74-93`)
  - DELETE `/api/settings/skills/${skill.id}` → deletes skill (from `skill-detail.tsx`)

- **States handled in code:**
  - Loading: full-page spinner (`skills/page.tsx:95-101`)
  - Empty (no skills, list mode): sidebar renders empty sections; detail panel shows "Select a skill to view details" placeholder (`skills/page.tsx:191-199`)
  - Populated (list mode): `SkillSidebar` + `SkillDetail` panel layout (`skills/page.tsx:168-200`)
  - Populated (explore mode): `ExploreGrid` shows system skills only (`skills/page.tsx:203-209`)
  - **MISSING:** No error state — fetch errors silently produce an empty list (`skills/page.tsx:49`)
  - **MISSING:** No loading skeleton for the list/explore grid — just a spinner.

- **Primary CTAs / outbound links (edges OUT):**
  - `Run` button on `SkillDetail`: navigates to `/chat?skill=${encodeURIComponent(skill.slug)}` (`skill-detail.tsx:29-31`)
  - `Fork` button: opens `CreateSkillDialog` pre-filled from the source skill
  - `Create skill` button: opens `CreateSkillDialog` from blank

- **Inbound expectations (edges IN):**
  - No query params consumed by the skills page itself.
  - The `/chat?skill=<slug>` link is the outbound edge FROM skills TO chat (described in /chat section).

- **Seam risks:**
  - The "Run" button navigates to `/chat?skill=<slug>`. The chat page pre-fills the input with `"Run skill: <DisplayName>"`. There is no structured invocation — the LLM must recognize this text and call the right tool. If the skill's display name does not match a tool description closely, the agent may not invoke the correct skill.
  - System skills (scope: "system") are defined in the DB as seed data. The skills visible on the /skills page and the tools wired into the chat API are two separate code paths. It is possible for a skill to appear on the page (as a DB row) without having a corresponding chat tool, or vice versa — there is no compile-time linkage.
  - User-created skills (`scope: "user"` or `"workspace"`) are stored in the DB but are NOT automatically available as chat tools. There is no mechanism to make a custom skill callable from chat unless it maps to a pre-built skill runner module. This is a significant dead-end.

- **Notable gaps:**
  - No skill usage stats surfaced on the /skills page (the `SkillEntry` type has `useCount` and `lastUsedAt` fields but their display is not confirmed from this audit of the page component alone).
  - The `ExploreGrid` in "Explore" mode shows only system skills. There is no discovery mechanism for workspace-scoped skills.
  - No skill execution log or history on the page.

---

## /voice-of-customer — route `/voice-of-customer`

- **Purpose:** Display AI-extracted customer themes (feature requests, pain points, praise, objections, competitor mentions) grouped from email and meeting activities.

- **Reads (data in):**
  - GET `/api/voice-of-customer` → fetches pre-computed insights + total interaction count (`voice-of-customer/page.tsx:41-48`)

- **States handled in code:**
  - Loading: full-page spinner with "Analyzing customer interactions..." label (`voice-of-customer/page.tsx:63-75`)
  - Empty (no themes): `EmptyState` with guidance to connect email (`voice-of-customer/page.tsx:88-93`)
  - Populated: category filter pills + expandable theme cards with mention quotes (`voice-of-customer/page.tsx:93-213`)
  - **MISSING:** No error state — fetch errors silently produce empty list (`voice-of-customer/page.tsx:49`)
  - **MISSING:** No partial state — if some categories have data and others don't, there is no visual differentiation beyond the count badge.

- **Primary CTAs / outbound links (edges OUT):**
  - None. This is a read-only display surface with no navigation links to related entities (contacts, accounts, deals) from the mention cards. The `mention.company` and `mention.contact` fields are rendered as plain text, not as links.

- **Inbound expectations (edges IN):**
  - No query params consumed.

- **Seam risks:**
  - The VoC page is entirely disconnected from chat. There is no way to ask the chat agent about VoC insights directly, no chat tool that queries VoC themes, and no "Ask Elevay about this theme" CTA.
  - Mentions show `mention.company` and `mention.contact` as plain strings — not IDs — so there is no drill-through to the actual CRM records the mention came from.
  - The page does not link to `/chat?q=...` with the theme pre-populated as a query.
  - No refresh mechanism on the page — the data is whatever was returned on mount.

- **Notable gaps:**
  - No audit found for what populates `/api/voice-of-customer` — likely a scheduled job or a manually-triggered analysis. The source of the `insights` data was not verified in this read-only audit.
  - No "last analyzed" timestamp on the page header.

---

## /graph — route `/graph`

- **Purpose:** Visual force-directed graph explorer for the Context Graph — shows entities (persons, companies, deals, topics, events, emails, meetings) and their fact-edges extracted from email/meeting/note ingestion. Admin-facing tool for inspecting and curating knowledge graph quality.

- **Reads (data in):**
  - GET `/api/context-graph?limit=150&includeInvalid=false|true` → nodes + edges (`graph/page.tsx:67-76`)
  - GET `/api/context-graph/stats` → type breakdown + edge counts (`graph/page.tsx:73-79`)
  - POST `/api/context-graph/feedback` → sends thumbs up/down for edge confidence (`graph/page.tsx:161-181`)

- **States handled in code:**
  - Loading: full-page spinner (`graph/page.tsx:194-203`)
  - Empty (no nodes): `EmptyState` with guidance to connect Gmail or ingest content (`graph/page.tsx:220-228`)
  - Populated: SVG canvas with force-directed layout + edge labels + node circles (`graph/page.tsx:262-341`)
  - Selected node: right-side detail panel showing facts/edges + thumbs feedback buttons (`graph/page.tsx:348-446`)
  - **MISSING:** No error state on fetch failure — silently shows loading or empty.
  - **MISSING:** No partial state — the graph either loads fully (150 nodes) or not at all. There is no pagination or progressive loading.

- **Primary CTAs / outbound links (edges OUT):**
  - Refresh button: re-fetches graph data (`graph/page.tsx:256`)
  - Thumbs up/down on edge facts: calls feedback endpoint (`graph/page.tsx:419-430`)
  - No navigation to CRM entity pages from graph nodes (node click selects the node in the panel, does not navigate).

- **Inbound expectations (edges IN):**
  - No query params consumed. Standalone view.

- **Seam risks:**
  - Graph nodes have `id` fields but clicking a node does not navigate to the corresponding CRM record (`/contacts/${id}`, `/accounts/${id}`). The graph is a read-only visualization with no drill-through.
  - The graph is capped at 150 nodes regardless of workspace size — large workspaces see a truncated view with no indication of what is excluded.
  - There is no way to query the graph from chat. The `searchContextGraph` function IS called inside the chat route (`route.ts:461`) but there is no chat tool that exposes the raw graph browsing UI or allows the user to ask the agent to explore graph relationships.
  - The force-directed layout is computed client-side in JavaScript with 50 iterations — it is not reproducible (layout changes on each load/refresh).

- **Notable gaps:**
  - No graph export (JSON, CSV of nodes/edges).
  - No zoom/pan on the SVG canvas — the graph is static after layout.
  - No direct link from a CRM entity page (account, contact) to the graph filtered to that entity.
  - The feedback mechanism (thumbs up/down) updates `confidence` in the DB but there is no visible confidence-based ranking or highlighting of low-confidence edges.

---

## AI Cluster — Seam Summary

### chat → CRM actions

**WIRED.** The chat agent can create, update, and delete CRM entities directly. The full write surface is large: contacts, accounts, deals, tasks, notes, activities, sequences, enrollments, comments, knowledge entries. An approval card gate (`agentApprovalMode`) exists for the three main creates (`createContact`, `createAccount`, `createDeal`) but only when the workspace is configured to `"ask"` mode. All other writes (updates, bulk updates, stage changes, enrollment, campaign launch, email send, meeting booking) execute immediately without confirmation.

**Dead-end:** The action card approval flow (`chat/page.tsx:452-544`) sends `[Approved: ...]` back to the LLM as a user-role message. This is architecturally correct but the message appears in the conversation thread, breaking the visual model of "user says things, AI responds." There is no system-role feedback channel for approval results.

### chat → knowledge retrieval

**WIRED.** On every turn, `retrieveKnowledge(lastUserText, tenantId)` retrieves up to 8 semantically-matched knowledge entries and appends them to the system prompt (`route.ts:499-535`). This is fully automatic — the user does not need to invoke a tool.

**Dead-end (conditional):** Semantic retrieval requires `OPENAI_API_KEY`. Without it, the system falls back to loading all active knowledge entries up to 20 rows by `updatedAt` (`route.ts:505-530`). This fallback is non-semantic and may inject irrelevant entries.

### skills invocation points

**WIRED from chat.** All 26 skill-delegate tools in `buildSkillsTools(ctx)` are available to the chat agent on every turn (subject to orchestrator routing). The agent can invoke any skill by name when the user's intent matches the tool description.

**Dead-end:** User-created or workspace-scoped custom skills (defined via `/skills` page → `POST /api/settings/skills`) are stored in the DB as skill definitions. They are NOT automatically wired as chat tools. Only the hardcoded tools in `tools/skills.ts` (which call specific `runSkill` imports) are callable from chat. There is no dynamic skill-loading mechanism that reads custom skills from the DB at runtime and makes them invokable.

**Dead-end:** The `/skills?skill=<slug>` → `/chat?skill=<slug>` handoff relies on LLM text interpretation. If the user navigates from /skills and the input is pre-filled with `"Run skill: Pipeline Review"`, the agent must recognize "Pipeline Review" as the trigger for `analyzePipeline`. This is fragile: the slug→displayName→tool mapping is implicit.

### graph/VoC consumers

**GRAPH → Chat: WIRED (backend only, not exposed to user).** The context graph is queried on every chat turn via `searchContextGraph` (`route.ts:461`) and injected into the system prompt. However, there is no chat tool that exposes graph browsing to the user — the user cannot ask "show me the graph for Acme" and get a visual or structured list of graph facts. The graph data reaches the agent as unformatted text context.

**VoC → Chat: NOT WIRED.** There is no chat tool that queries Voice of Customer themes. The `/voice-of-customer` page and its backing API are completely isolated from the chat agent. A user cannot ask "what are the top VoC themes this month?" and get an answer from the chat system unless the VoC data happens to appear in a knowledge entry or activity that was semantically retrieved.

**Graph → VoC: NOT WIRED.** The VoC page draws from `/api/voice-of-customer` independently; it does not consume the context graph.

**Graph → Entity pages: NOT WIRED.** Graph nodes do not navigate to CRM entity pages. Entity pages do not surface graph facts about the entity (this would require a graph query filtered to a specific entity ID).

**Summary table:**

| Edge | Status |
|------|--------|
| chat → create/update CRM records | Wired (direct writes + approval mode) |
| chat → email draft | Wired (returns draft to UI, not auto-sent) |
| chat → email send (meeting follow-up) | Wired (real send via Resend) |
| chat → calendar booking | Wired (real event via Google Calendar API) |
| chat → sequence enrollment | Wired (real DB write) |
| chat → campaign launch | Wired (real status change) |
| chat → skill invocation (system skills) | Wired |
| chat → skill invocation (custom/user skills) | NOT WIRED |
| chat → knowledge retrieval (semantic) | Wired (requires OPENAI_API_KEY) |
| chat → context graph retrieval (backend) | Wired (automatic per turn) |
| chat → VoC queries | NOT WIRED |
| /skills → chat | Wired (fragile: text pre-fill only) |
| /knowledge → chat | Wired (via automatic RAG injection) |
| /graph → chat | NOT WIRED (graph is UI-only) |
| /voice-of-customer → chat | NOT WIRED |
| /graph nodes → CRM entity pages | NOT WIRED |
| VoC mention cards → CRM entity pages | NOT WIRED |
