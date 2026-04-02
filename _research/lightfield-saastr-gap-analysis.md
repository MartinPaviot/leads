# Lightfield SaaStr Gap Analysis — LeadSens vs The 8 Points

**Date**: 2026-04-01
**Context**: Jason Lemkin / SaaStr analysis of Lightfield identifies 8 architectural differentiators. This document audits our product against each one with surgical precision.
**Sources**: teardown-lightfield-v2/, teardown-monaco-v2/, gap-analysis-v2.md, founder-sanity-check.md, schema.ts, feature_list.json, all 21 checklist audits

---

## METHODOLOGY

For each of the 8 points:
1. **Current state**: What we actually have today (code-verified, not feature_list.json claims)
2. **Target state**: What Lightfield does (from teardown evidence)
3. **Architectural delta**: What needs to change
4. **Effort**: S (days) / M (1-2 weeks) / L (2-4 weeks) / XL (1-2 months) / Ocean (fundamental rethink)
5. **Lake or Ocean**: Can we boil it (complete, bounded work) or is it unbounded?

---

## GAP 1: SCHEMA-LESS DATA MODEL

### SaaStr Claim
> No custom fields, no dropdowns, no predefined pipeline stages. Data model evolves as business evolves. Early-stage companies that change ICP every month don't have to rebuild their CRM.

### Our Current State: STRUCTURED WITH JSONB ESCAPE HATCH

**Schema reality** (`schema.ts`):
- `companies` table: 13 fixed columns (name, domain, industry, size, revenue, description, score, scoreReasons, ownerId, properties, createdAt, updatedAt, tenantId)
- `contacts` table: 13 fixed columns (email, phone, firstName, lastName, title, linkedinUrl, score, scoreReasons, ownerId, properties, companyId, tenantId)
- `deals` table: 14 fixed columns (name, stage [enum: lead/qualification/demo/trial/proposal/negotiation/won/lost], value, currency, expectedCloseDate, score, scoreReasons, summary, ownerId, properties, companyId, contactId, tenantId)
- `activities` table: 13 fixed columns including `rawContent` (full text) and `metadata` (jsonb)

**The escape hatch**: Every core entity has `properties: jsonb("properties").default({})`. This means arbitrary key-value pairs CAN be stored. But:
- ❌ No UI to create/manage field definitions
- ❌ No field type system (Text, Date, Select, URL, etc.)
- ❌ No per-field AI fill modes (Auto/Suggest/Off)
- ❌ No "Data Model" settings page
- ❌ No "Create field" button
- ❌ Properties aren't rendered in tables or detail panels
- ❌ Properties aren't filterable or sortable
- ❌ Pipeline stages are a hardcoded enum, not configurable

**feature_list.json says**: G22 "Custom fields / Data model" passes: true. **This is misleading.** The JSONB column exists but the feature is NOT user-accessible. A founder cannot add a custom field today.

### Lightfield's Implementation (from teardown)

**Data Model settings page** (`settings-020`):
- Three entity tabs: Accounts, Opportunities, Contacts
- Each entity shows ALL fields with:
  - **Name**: field label
  - **Type**: Text, Date & Time, Markdown, Social handle, Single select, Multi select, URL, Address
  - **Editable by**: System only / Anyone
  - **AI fill**: Auto / Suggest / Off (per field!)
- **"Create field" button** — users define new fields with type selection
- System fields (Record ID, Created at) are locked; user fields are editable
- AI auto-generates "Account summary" and "About their business" (Markdown type, System only, AI fill: Auto)

**Opportunity stages** (`settings-021`):
- Stages are configurable (not hardcoded enum)
- Each stage has a DESCRIPTION that the AI reads for auto-progression
- In Progress vs Done categories
- AI fill mode per stage (Auto/Suggest/Off)
- Optional custom AI prompt per stage

### Architectural Delta

| Component | Current | Target | Change |
|-----------|---------|--------|--------|
| Storage | JSONB `properties` column | Same (JSONB is fine) | None needed |
| Field definitions | None | `custom_field_definitions` table | **New table** |
| Field types | None | 8 types with validation | **New system** |
| AI fill modes | None | Auto/Suggest/Off per field | **New column + AI integration** |
| Data model UI | None | Settings page with CRUD | **New page** |
| Table rendering | Fixed columns | Dynamic from field defs | **Refactor tables** |
| Filter/sort | Fixed fields only | Include custom fields | **Extend filter system** |
| Pipeline stages | Hardcoded enum | Configurable per tenant | **Migration + new table** |
| Stage descriptions | None | AI-readable descriptions | **New fields** |

### What Needs to Change

1. **New table: `custom_field_definitions`**
   ```
   id, tenantId, entityType (account/contact/deal), 
   fieldName, fieldLabel, fieldType (text/date/single_select/multi_select/url/social/address/markdown),
   options (jsonb — for select types), 
   aiFillMode (auto/suggest/off),
   editableBy (system/anyone),
   sortOrder, isRequired, isSystem,
   createdAt, updatedAt
   ```

2. **New table: `pipeline_stage_definitions`**
   ```
   id, tenantId, name, description, category (in_progress/done),
   aiFillMode, aiPrompt, color, sortOrder, isSystem,
   createdAt, updatedAt
   ```

3. **Migrate `deal_stage` enum → reference to stage definitions table**

4. **Data Model settings page**: CRUD for field definitions per entity type

5. **Opportunity Stages settings page**: CRUD for stages with descriptions

6. **Refactor entity tables**: Dynamic column rendering from field definitions + properties JSONB

7. **Extend AI system**: Read field definitions, use AI fill modes, populate properties

### Effort: L (2-4 weeks)
### Verdict: 🟡 LAKE — Boilable

The JSONB foundation means we don't need to change our data model. We need a field definition layer on top of it, a settings UI, and dynamic rendering. This is bounded, well-understood work. Lightfield's implementation gives us a clear target.

**Priority: CRITICAL — This is Lightfield's #1 differentiator and our #1 gap.**

---

## GAP 2: UNSTRUCTURED-FIRST ARCHITECTURE

### SaaStr Claim
> Starts from conversation data (emails, transcripts, calls, Slack) and DERIVES structure — not the other way around. This is the core architectural bet that makes them different from every other CRM.

### Our Current State: STRUCTURED-FIRST WITH AI BOLTED ON

**Data flow today:**
```
User signs up
  → Onboarding wizard asks ICP questions
  → Apollo API search → STRUCTURED company records created
  → Enrichment fills in industry, size, revenue
  → Email sync (if connected) adds activities LATER
  → Chat queries this structured data
```

**This is the opposite of Lightfield's approach.** We start with structured enrichment data and bolt conversation capture on afterward. The primary data path is:
1. Apollo search → companies table (structured)
2. Contact enrichment → contacts table (structured)
3. Email sync → activities table (unstructured, secondary)

**What Lightfield does differently:**
```
User connects Gmail/Outlook
  → 24 months of emails synced
  → AI reads emails → creates accounts from email domains
  → AI reads emails → creates contacts from senders
  → AI generates "Account summary" from conversations
  → AI generates "About their business" from conversations
  → User sees DERIVED structure, not manually entered data
```

Lightfield's primary data source is CONVERSATIONS. Structure emerges from content. Our primary data source is ENRICHMENT APIs. Conversations are supplementary.

### Architectural Delta

We partially bridge this gap already:
- ✅ Email sync creates contacts from unknown senders (founder-sanity-check FIX 2)
- ✅ Activities store `rawContent` (full email text)
- ✅ Activities are embedded in pgvector for RAG
- ✅ 2-year email backfill implemented
- ❌ Accounts are NOT auto-created from email domains
- ❌ No "Account summary" auto-generated from conversations
- ❌ No "About their business" auto-generated from conversations
- ❌ Enrichment is the PRIMARY onboarding path, not conversation capture
- ❌ Calendar sync not built (F2.2 passes: false)
- ❌ No Slack message capture
- ❌ No call transcript processing

### What Would It Take to Become Unstructured-First?

**Phase 1 (LAKE — make conversations a first-class data source):**
- Auto-create company records from email domains during sync
- Auto-generate "Account summary" from aggregated email/meeting content
- Auto-generate "About their business" from enrichment + conversation data
- Build calendar sync (F2.2) — meetings are rich conversation data
- Process pasted/uploaded transcripts

**Phase 2 (OCEAN — make conversations the PRIMARY source):**
- Redesign onboarding: Gmail connect FIRST, ICP definition SECOND
- Derive ICP from existing email patterns (who do you email most?)
- Auto-create pipeline from conversation signals (not manual deal creation)
- Slack integration for real-time conversation capture
- Meeting recording for live conversation data

### Effort: Phase 1 = M (1-2 weeks), Phase 2 = Ocean
### Verdict: 🟡 Phase 1 is a LAKE, 🔴 Phase 2 is an OCEAN

**Recommendation**: Execute Phase 1 now. Phase 1 makes conversations a co-equal data source alongside enrichment. Phase 2 (making conversations the ONLY primary source) requires rethinking the entire onboarding flow and would invalidate our TAM-builder differentiator vs Monaco. Flag Phase 2 to Martin — the strategic question is whether we want to be unstructured-first (like Lightfield) or hybrid (structured + unstructured, unique positioning).

---

## GAP 3: COMPLETE CUSTOMER MEMORY

### SaaStr Claim
> Full text of every conversation, every email thread, every meeting transcript stored and NL-queryable. "Which customers asked for this feature, and why?" returns answers with citations to actual conversations. 95%+ recall accuracy.

### Our Current State: INFRASTRUCTURE EXISTS, QUALITY UNKNOWN

**What we have:**
- ✅ `activities` table with `rawContent` field — stores full email text
- ✅ pgvector embeddings for all activities (text-embedding-3-small)
- ✅ `searchSimilar()` with tenantId filter (fixed in FIX 1)
- ✅ 11 AI tools including `queryActivities`, `searchCRM`
- ✅ Chat citations with clickable links `[Name](/contacts/{id})`
- ✅ System prompt includes CRM snapshot (counts + recent records)
- ✅ RAG retrieval in chat pipeline
- ✅ Gmail sync with 2-year backfill
- ✅ Auto-embed on activity creation

**What we DON'T have / haven't tested:**
- ❌ Recall accuracy never measured (Lightfield claims 95%+)
- ❌ Calendar sync not built — meeting data not captured (F2.2)
- ❌ No Slack message capture
- ❌ No call transcript storage/processing
- ❌ Citation quality not verified — do links actually resolve?
- ❌ Cross-entity queries not tested ("which contacts at Company X mentioned pricing?")
- ❌ Date-range queries not tested ("what happened with Company Y last month?")
- ❌ No vector index on pgvector (performance unknown at scale)
- ❌ Embedding coverage unknown — are ALL activities actually embedded?

**Audit results** (checklist-cat-8): 4% passing (0.5/12). "Schema-less data model (partial)" was the only partial pass. Everything else failed including: email auto-capture, calendar auto-capture, meeting recording, 2-year backfill, NL queries with citations, recall accuracy testing.

**BUT** — the founder-sanity-check fixes (FIX 1, FIX 2, FIX 4) addressed many of these:
- Chat now accesses CRM data (FIX 1)
- Email sync now auto-creates contacts and activities (FIX 2)
- Citations now have clickable links (FIX 4)

**Real estimated state post-fixes**: ~40-50% of customer memory works, but recall accuracy is unmeasured.

### Lightfield's Implementation

From teardown:
- Chat answered "How many contacts do I have?" correctly (10/10)
- Chat answered "Show me all contacts at Meridian Labs" correctly with table (9/10)
- Chat answered "What's in my pipeline?" correctly with deal context (9/10)
- Chat answered "What should I focus on today?" with synthesized priorities (9/10)
- Chat FAILED to find Pierre Dubois (existing contact) — data retrieval gap
- Chat drafted personalized email referencing actual SaaStr conversation (10/10)
- Chat generated meeting prep from account data (8/10)

**Lightfield's recall is NOT 95% in practice.** They failed to find an existing contact. But their citation quality is high and cross-entity synthesis works well.

### What Needs to Change

1. **Measure recall accuracy NOW**: Create 20 test questions against known data, run them through chat, score results
2. **Fix embedding coverage**: Verify every activity is actually embedded — check for gaps
3. **Add vector index**: `CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops)` — critical for performance
4. **Build calendar sync (F2.2)**: Meeting data is a rich conversation source
5. **Test cross-entity queries**: "Which contacts at [company] discussed [topic]?"
6. **Test date queries**: "What happened with [company] last week?"
7. **Verify citation links**: Do `/contacts/{id}` links actually resolve in the UI?
8. **Add "About their business" auto-generation**: Aggregate conversation data + enrichment into per-account AI summary

### Effort: M (1-2 weeks) for measurement + fixes, L for calendar sync
### Verdict: 🟢 LAKE — The infrastructure exists. We need quality assurance and gap-filling.

**Priority: CRITICAL — Memory quality is the foundation for everything else (coaching, emails, actions).**

---

## GAP 4: AGENTS THAT TAKE ACTION

### SaaStr Claim
> Draft and send personalized outreach based on what was ACTUALLY discussed. Bulk-update pipeline stages from conversation signals. Identify stale deals, draft revival emails, send them. One user revived 40+ stalled deals in 2 hours.

### Our Current State: TOOLS EXIST, ACTIONS PARTIALLY WIRED

**What we have:**
- ✅ 11 AI tools in chat: createContact, createAccount, createDeal, queryContacts, queryAccounts, queryDeals, queryActivities, searchCRM, getDealCoaching, getAccountIntelligence
- ✅ Email composer side panel (G5 PASS)
- ✅ Signal-based stage progression (F5.2 PASS)
- ✅ Risk/stall detection (F5.3 PASS)
- ✅ Stall nudge AI drafts (G6 PASS)
- ✅ Sequence builder + autopilot enrollment (F4.1, F4.3 PASS)
- ✅ AI email writer with personalization (F4.2 PASS)

**What we DON'T have:**
- ❌ Chat cannot SEND emails (only draft to composer) — no direct send-from-chat
- ❌ No bulk operations from chat ("update all stalled deals", "draft emails for all accounts without recent contact")
- ❌ No "revive stalled deals" workflow — user would have to ask about each deal individually
- ❌ Email sending infrastructure not fully wired (checklist-cat-2: 24% passing, no SMTP worker)
- ❌ Bulk pipeline stage updates from chat not tested
- ❌ No human-in-the-loop approval for agent actions in chat (Lightfield has "Ask every time" / "Auto-run" toggle)

**Lightfield comparison:**
- Email composer opens as side panel with real Send button — we have this (G5)
- Task creation from chat — we have `createDeal`, need `createTask` tool
- Meeting prep document generation — we don't have this
- Agent permissions (Ask every time / Auto-run) — we have this in settings

### What Needs to Change

1. **Add `createTask` AI tool**: Chat should be able to create tasks, not just deals/contacts/accounts
2. **Add `updateDealStage` AI tool**: Chat should be able to move deals through pipeline
3. **Add `sendEmail` AI tool**: Chat should be able to send via connected mailbox (with approval)
4. **Add bulk operation tools**: `bulkUpdateDeals`, `bulkDraftEmails` — operate on filtered sets
5. **Wire email sending**: The SMTP sending worker doesn't exist (checklist-cat-2). Without this, email actions are drafts only
6. **Test "revive stalled deals" flow end-to-end**: Ask chat → it identifies stalled deals → drafts revival emails → user approves → emails send

### Effort: M (1-2 weeks) for tools, L (2-4 weeks) if email sending needs full implementation
### Verdict: 🟡 LAKE — Adding tools is bounded work. Email sending infrastructure is a bigger lift but already partially built.

---

## GAP 5: NATIVE CALL INTELLIGENCE

### SaaStr Claim
> Meeting prep, recording, transcription, follow-up generation — all built in. Replaces Gong/Chorus.

### Our Current State: NOT BUILT

- ❌ F2.2 Calendar sync: passes: false, attempts: 0
- ❌ G31 Meeting recording + AI notes: passes: false, attempts: 0
- ❌ Recall.ai integration blocked — email verification required (escalation.md)
- ❌ No meeting recording capability whatsoever
- ❌ No transcription pipeline
- ❌ No meeting prep generation
- ❌ No post-meeting follow-up generation from transcript

**Lightfield's implementation:**
- Recording toggle in settings (per-user + workspace level)
- Custom recorder name and avatar
- Meeting transcript processing + summarization
- Notifications when transcript is ready
- Chat can generate meeting prep from account data
- Chat can generate follow-up emails from meeting content

**Monaco's implementation:**
- Full video recording with playback (33-min demo call)
- Real-time AI notes alongside video
- Structured data extraction from meeting audio (budget, team size, tools)
- Auto-generated follow-up emails from meeting content

### What We Can Do Without Recording

**Minimum viable call intelligence (no recording needed):**
1. ✅ Calendar sync (F2.2) — detect meetings, extract participants
2. Meeting prep: chat generates briefing from account/contact data + interaction history
3. Transcript processing: user pastes/uploads transcript → AI extracts summary, key points, action items, structured data
4. Post-meeting follow-up: AI drafts follow-up email from processed transcript
5. Structured extraction: budget, team size, competitor tools → auto-populate deal fields

**Full call intelligence (recording needed):**
6. Recall.ai or similar bot joins meetings
7. Real-time transcription
8. Video playback with AI notes overlay
9. Automatic recording for all external meetings

### Effort: Minimum viable = M (1-2 weeks), Full recording = XL (blocked on Recall.ai)
### Verdict: 🟡 Minimum viable is a LAKE, 🔴 Full recording is an OCEAN (external dependency)

**Recommendation**: Build minimum viable (calendar sync + transcript processing + meeting prep + follow-up generation). Flag recording to Martin — needs Recall.ai email verification or alternative provider evaluation.

---

## GAP 6: AGENTIC WORKFLOW BUILDER

### SaaStr Claim
> Multi-step automated processes with agent steps, webhook triggers, HTTP integrations. Custom automations on top of customer memory.

### Our Current State: NO WORKFLOW BUILDER

- ❌ No workflow builder UI
- ❌ No trigger system (webhook, schedule, event-based)
- ❌ No condition/branching logic
- ❌ No HTTP integration step
- ❌ No agent step (AI decision in workflow)

**What we DO have that's adjacent:**
- ✅ Sequences (multi-step email with delays) — this is a workflow, but email-only
- ✅ Inngest for background job orchestration — the infrastructure for workflows exists
- ✅ Signal-based stage progression — event-triggered automation, but hardcoded
- ✅ Auto-enrichment on creation — event-triggered, but single-purpose

**Lightfield's implementation:**
- Workflows page in settings (Beta badge)
- "Create workflow" button
- Table: Name, Status, Runs, Created by, Last edited
- Currently empty in their product — this is EARLY for them too

**Key insight**: Lightfield's workflow builder is Beta and empty. This is NOT a shipped feature yet. They're signaling direction, not delivering value.

### What Would a Minimum Viable Workflow Builder Look Like?

1. **Triggers**: Deal stage changed, New contact created, Email received, Timer/schedule, Manual
2. **Conditions**: If field equals/contains, If score above/below, If days since last interaction
3. **Actions**: Send email, Create task, Update field, Send Slack message, Call webhook
4. **Agent steps**: AI decides next action based on context
5. **UI**: Visual builder with drag-drop steps (like our sequence builder but generalized)

### Effort: XL (1-2 months)
### Verdict: 🔴 OCEAN — But Lightfield hasn't shipped it either. Low priority.

**Recommendation**: Skip for now. Lightfield's is Beta and empty. Our sequences + Inngest-based automations cover the most important use case (email outreach). Revisit after shipping higher-priority gaps (schema-less, memory, call intel). Flag to Martin as future roadmap item.

---

## GAP 7: PRICING & VALUE

### SaaStr Claim
> Free / $36/user (Startup: call intel, enrichment, unlimited queries, 10K records) / $99/user (Pro: 50K records, workflows, migration, CSM)

### Our Current State: PRICING BUILT BUT NOT ACTIVATED

**What we have:**
- ✅ Billing schema (billing-schema.ts) with Stripe integration
- ✅ Subscription model: trialing/active/past_due/canceled
- ✅ Usage tracking: API calls, emails sent, enrichments, AI queries
- ✅ Plan limits enforcement
- ✅ 14-day free trial
- ✅ Pricing page built
- ✅ Self-serve signup (Auth.js)
- ❌ Stripe account not activated (needs Martin)
- ❌ No public pricing visible without Stripe
- ❌ Record limits not enforced at DB level

**Feature-for-feature comparison at $36/mo (Lightfield Startup tier):**

| Feature | Lightfield $36 | LeadSens (current) |
|---------|---------------|-------------------|
| Call intelligence | ✅ Recording + transcription | ❌ Not built |
| Enrichment | ✅ Auto-enrichment | ✅ Apollo integration |
| Unlimited NL queries | ✅ | ✅ (no hard limit) |
| 10K records | ✅ | ❓ Untested at scale |
| Custom fields | ✅ | ❌ Not user-accessible |
| Email sync | ✅ Google + Microsoft | 🟡 Google only |
| Calendar sync | ✅ | ❌ Not built |
| Workflows | ❌ (Pro tier) | ❌ Not built |
| Sequences | ❌ | ✅ Built (ahead of Lightfield!) |
| TAM builder | ❌ | ✅ Built (ahead of Lightfield!) |
| Scoring/signals | ❌ | ✅ Built (ahead of Lightfield!) |
| Deal coaching | ❌ | ✅ Built (ahead of Lightfield!) |
| Dashboard | ❌ | ✅ Built |

**At $99/mo (Lightfield Pro tier):**
- 50K records, workflows, migration assistant, dedicated CSM
- We don't have: migration assistant, CSM, 50K record testing, workflows

### Pricing Recommendation

We have SIGNIFICANT feature advantages over Lightfield in prospecting (TAM, scoring, signals), outreach (sequences), and coaching. Lightfield has advantages in memory (call intel, schema-less) and data capture (calendar sync).

**Proposed pricing:**
- **Free**: 100 accounts, 500 contacts, basic chat, no sequences — try before buy
- **Starter ($49/mo)**: 5K records, enrichment, sequences, scoring, email sync, NL queries
- **Pro ($99/mo)**: 25K records, call intelligence, custom fields, workflows, API access
- **Scale ($199/mo)**: 100K records, priority support, custom integrations, SLA

### Effort: S (days) — pricing page update + Stripe activation
### Verdict: 🟢 LAKE — Pricing infrastructure exists. Needs Martin to activate Stripe.

---

## GAP 8: ARCHITECTURAL POSITIONING

### SaaStr Claim
> Most "AI CRMs" are either ChatGPT wrapper on Salesforce OR modern CRM with AI bolted on. Lightfield is architecturally different. Salesforce/HubSpot are "architecturally trapped."

### Honest Self-Assessment

**Are we a "ChatGPT wrapper on a basic CRM"?**

No — we're substantially more than a wrapper. We have:
- Real enrichment pipeline (Apollo)
- Real scoring with ML-style fit + engagement signals
- Real sequence automation with approve/reject
- Real risk detection with stall alerts
- 11 AI tools for agentic actions
- RAG over full interaction history

**But are we "genuinely architecturally different"?**

No — not yet. Our architecture is:
```
Fixed schema tables (companies, contacts, deals)
  ↓
Apollo enrichment fills structured fields
  ↓ 
Email sync adds activities (secondary data source)
  ↓
AI queries the structured data + RAG over activities
```

This is "modern CRM with AI bolted on" — the same category as Attio, Folk, or Clay with GPT. The AI is a query/action layer on top of structured data.

**Lightfield's architecture is:**
```
Email/Calendar/Slack conversations (primary data source)
  ↓
AI reads conversations → derives accounts, contacts, summaries
  ↓
Custom field definitions + JSONB store flexible properties
  ↓
AI fills fields automatically based on conversation content
  ↓
User queries the derived + conversation data via NL chat
```

The fundamental difference: **who creates the data model and who fills it?**
- In our product: Developer defines schema, Apollo fills it, AI queries it
- In Lightfield: User defines schema, AI fills it from conversations

### What Would Make Us Architecturally Different?

**Option A: Become unstructured-first (like Lightfield)**
- Make email/calendar sync the FIRST onboarding step
- Auto-derive accounts and contacts from conversations
- Make AI the primary data entry mechanism
- Custom fields as the default, fixed fields as the exception
- **Trade-off**: Loses our TAM-builder and proactive-enrichment advantages

**Option B: Stay hybrid, but make it intelligent (RECOMMENDED)**
- Keep Apollo/enrichment as a first-class data source (our advantage over Lightfield)
- Make conversations a co-equal first-class data source (close the gap)
- Schema-less custom fields for user-defined structure
- AI fills fields from BOTH enrichment AND conversations
- Chat as the operating surface for both querying and taking action
- **Positioning**: "The only AI CRM that builds your TAM AND remembers every conversation"

**Option C: Go full Monaco (structured + opinionated)**
- Pre-built TAM with scoring and signals (we have this)
- Opinionated pipeline with coaching (we have this)
- Forward-deployed sales methodology (partially built)
- **Trade-off**: Competes directly with Monaco's $35M+ war chest

### Effort: Option B = L-XL (build schema-less + conversation parity), Options A/C = Ocean
### Verdict: 🟡 Option B is a LAKE. Options A and C are strategic pivots (OCEAN — flag to Martin).

**Recommendation**: Pursue Option B. We become "Monaco's prospecting power + Lightfield's memory depth." This is a genuinely unique position. Neither competitor has both.

---

## SUMMARY TABLE

| Gap | Current | Effort | Lake/Ocean | Priority |
|-----|---------|--------|------------|----------|
| **1. Schema-less data model** | JSONB exists, no UI/types/AI-fill | L (2-4 weeks) | 🟡 LAKE | **P0 — CRITICAL** |
| **2. Unstructured-first** | Structured-first, conversations secondary | M (Phase 1) / Ocean (Phase 2) | 🟡/🔴 | **P1 — Phase 1 only** |
| **3. Complete customer memory** | Infrastructure exists, quality unknown | M (1-2 weeks) | 🟢 LAKE | **P0 — CRITICAL** |
| **4. Agents that take action** | 11 tools, missing bulk ops + email send | M (1-2 weeks) | 🟡 LAKE | **P1** |
| **5. Native call intelligence** | Not built, Recall.ai blocked | M (min viable) / XL (full) | 🟡/🔴 | **P2** |
| **6. Agentic workflow builder** | Nothing, but Lightfield's is Beta too | XL (1-2 months) | 🔴 OCEAN | **P3 — Skip for now** |
| **7. Pricing & value** | Built but Stripe not activated | S (days) | 🟢 LAKE | **P2** |
| **8. Architectural positioning** | "Modern CRM + AI" not differentiated | L-XL (Option B) | 🟡 LAKE | **P0 — Drives everything** |

### Build Order

1. **Gap 1 (Schema-less)** + **Gap 3 (Memory quality)** — These are architectural foundations. Everything depends on them.
2. **Gap 2 Phase 1 (Conversation data source)** — Auto-create accounts from emails, auto-generate summaries
3. **Gap 4 (Agent actions)** — Add missing tools (createTask, updateDeal, sendEmail, bulk ops)
4. **Gap 5 minimum viable (Call intel without recording)** — Calendar sync + transcript processing
5. **Gap 7 (Pricing)** — Needs Martin to activate Stripe
6. **Gap 8 (Positioning)** — Emerges naturally from shipping Gaps 1-5

### Oceans to Flag to Martin

1. **Full unstructured-first architecture (Gap 2 Phase 2)** — Strategic decision: do we want conversation-first onboarding? This would change our product identity.
2. **Meeting recording (Gap 5 full)** — Blocked on Recall.ai. Need alternative provider or manual verification.
3. **Workflow builder (Gap 6)** — 1-2 months, Lightfield hasn't shipped theirs either. Skip for now.
4. **Strategic positioning (Gap 8)** — Recommend Option B (hybrid) but Martin should weigh in on whether we want to compete as "unstructured-first" or "best of both worlds."
