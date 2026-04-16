# Phase 1 — Strategic Analysis: Lightfield Post Decomposition

**Date**: 2026-04-15
**Applying rules**: none returned by hook

---

## Executive Summary

Lightfield's post describes 7 capabilities (C1-C7). Elevay already has **production infrastructure** for 6 of them. The gap is not in raw capability — it's in **composition and UX**. The pieces exist; the compound agent that chains them into a coherent "brief me on all deals" experience does not.

This analysis maps each Lightfield capability to exact Elevay code, identifies what's missing, and sizes the actual build effort.

---

## C1 — Deal Briefing Agent

> "Brief me on every open deal — what was discussed, what was promised, what stalled and why"

### What it does
User says "brief me on my deals" and gets a structured report per open deal: summary of discussions, commitments made, stall reasons, recommended next action. Covers ALL open deals, not one at a time.

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Deal data model (stages, value, score) | DONE | `src/db/schema.ts` — `deals` table |
| Activity log (all interactions) | DONE | `src/db/schema.ts` — `activities` table with 20+ activity types |
| Single deal coaching tool | DONE | `src/lib/chat/tools/intelligence.ts:11` — `getDealCoaching` |
| Stall detection | DONE | `src/lib/deal-helpers.ts:74` — `ageInStage()` with fresh/watch/stalled/frozen buckets |
| Deal velocity tracking | DONE | `src/lib/deal-velocity.ts` |
| Opportunity health scoring | DONE | `src/lib/opportunity-health.ts` |
| Pipeline analysis skill | DONE | `src/skills/intelligence/pipeline-review.ts` via `analyzePipeline` tool |
| Meeting notes retrieval | DONE | `src/lib/chat/tools/intelligence.ts:314` — `getMeetingNotes` |
| Context graph (promises, objections) | DONE | `src/db/schema.ts` — `contextGraphEdges` with REQUESTED, OBJECTED_TO relations |

### What's missing

1. **Multi-deal briefing orchestrator** — `getDealCoaching` handles ONE deal. There's no compound agent that queries all open deals, aggregates interactions per deal, extracts promises/objections from the context graph, detects stalls, and produces a structured multi-deal brief.
2. **Promise extraction** — The context graph has REQUESTED/OBJECTED_TO edges, but no automated extraction of "what was promised" from email bodies and meeting transcripts. The enrichment-email-extract pipeline (just committed) extracts objections and next_steps but not explicit commitments.
3. **Stall reasoning** — `ageInStage()` detects staleness by time, but doesn't explain WHY a deal stalled (last conversation topic, unanswered objection, missing champion).

### Data required
- Source: `deals` (stage, value, updatedAt) + `activities` (all interactions linked to deal or contact) + `contextGraphEdges` (facts/relations)
- Format: Already in Drizzle/Postgres
- Ingestion: Already running — Gmail sync (15min cron), calendar sync (15min cron), Recall.ai bots (5min cron)

### Intelligence level
**Reasoning** — Not simple retrieval. The agent must synthesize across 10-50 interactions per deal, identify patterns (unanswered objections, promised follow-ups not sent), and produce actionable recommendations. Requires LLM with full deal context.

### Moat
Low technical moat, high data moat. The hard part is having all the interactions ingested and linked to the right deal. Elevay already does this. The briefing agent itself is a well-crafted prompt + retrieval pattern.

---

## C2 — Full-Context Retrieval

> "Every meeting transcript, every email thread, every note is queryable — the exact words customers used"

### What it does
Any piece of customer communication is retrievable verbatim. The AE can ask "what did Sarah say about pricing on the last call?" and get the exact quote.

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Email sync (Gmail) | DONE | `src/inngest/sync-functions.ts` — `syncEmails` |
| Email sync (Outlook) | DONE | `src/inngest/sync-functions.ts` — Microsoft Graph path |
| Calendar sync | DONE | `src/inngest/sync-functions.ts` — `syncCalendar` |
| Meeting transcript (Recall.ai) | DONE | `src/lib/recall.ts` — `getBotTranscript()` |
| Recall bot scheduling | DONE | `src/inngest/recall-functions.ts` — `scheduleRecallBots` 5min cron |
| Activity storage with body | DONE | `activities.body` column + `activities.metadata` JSON |
| Structured meeting notes | DONE | `metadata.structuredNotes` on meeting activities |
| Chat tools for querying | DONE | `src/lib/chat/tools/query.ts` — `queryActivities`, `searchCRM` |
| Meeting notes retrieval | DONE | `intelligence.ts:314` — `getMeetingNotes` with structured notes |
| Context graph entity extraction | DONE | `src/lib/context-graph.ts` — `extractEntitiesAndFacts()` |
| Chat memory (cross-session) | DONE | `chatMemories` table |

### What's missing

1. **Verbatim quote retrieval** — `queryActivities` returns summaries, not raw text. When the user asks "what exact words did Sarah use about pricing?", the system needs to search through `activities.body` (email bodies) and transcript segments, find relevant passages, and return them with source attribution. Today it returns `activity.summary` which is an LLM-generated summary, not the original words.
2. **Full-text search on activity bodies** — No `tsvector` / full-text index on `activities.body`. Searching "exact words" requires either FTS or embedding-based retrieval. The `embeddings.ts` file exists but isn't wired to activity bodies.
3. **Transcript segment search** — Recall.ai transcripts are fetched on-demand via `getBotTranscript()` but not persisted as searchable text in the DB. Each query re-downloads from Recall's S3.

### Data required
- Source: Already ingested (emails, calendar, transcripts)
- Missing: Transcript text persistence in DB, FTS indexes on activity bodies

### Intelligence level
**Retrieval + Light reasoning** — Primary need is search quality (finding the right passage). The reasoning is in presenting the result with context ("Sarah said X during the pricing discussion on March 12, in response to your proposal for $50K/yr").

### Moat
High. Ingestion coverage is the moat — capturing every email, every call, every note requires deep OAuth integrations, reliable sync, and user trust. Elevay has the integrations; the gap is in search quality over the stored data.

---

## C3 — Contextual Follow-up Drafting

> "Follow-ups that referenced specific conversations and objections"

### What it does
Draft follow-up emails that include specific references: "As you mentioned on our March 5th call, your team's concern about migration complexity..." — not generic templates, but deeply contextual drafts.

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Prospect context builder | DONE | `src/lib/prospect-context.ts` — full dossier with interactions |
| Email drafting skill | DONE | `src/skills/outreach/email-drafting.ts` |
| Cold email outreach skill | DONE | `src/skills/outreach/cold-email-outreach.ts` |
| Sequence personalization | DONE | `src/inngest/functions.ts` — `sendSequenceStep` with LLM personalization |
| Chat email sending | DONE | `src/lib/chat/tools/action.ts` — `sendEmail` tool |
| Writing profile matching | DONE | `src/lib/writing-profile.ts` |
| Reply handler | DONE | `src/inngest/reply-handler.ts` |
| Follow-up timing | DONE | `src/lib/follow-up-timing.ts` |

### What's missing

1. **Deep conversation reference injection** — `buildProspectContext()` includes `previousEmails` (subject + sentAt) and `recentActivities` (type + summary), but NOT the full email bodies or transcript segments. The LLM gets "Email sent: Re: Demo follow-up (2026-03-12)" but not "Sarah said she needs to convince her CFO first." The enrichment-email-extract pipeline extracts signals (objections, next_steps) but these aren't yet fed into `ProspectContext`.
2. **"What was promised" awareness** — The follow-up drafter doesn't know what commitments were made in previous interactions. It can't write "As I mentioned, I'll send the technical spec by Friday" because that promise isn't extracted or stored.
3. **Objection-aware drafting** — The email-extract pipeline now captures objections, but the email drafting skill doesn't consume them yet. The draft should address known objections proactively.

### Data required
- Source: `activities.body` (emails), transcript text, enrichment extraction results
- Missing: Wiring enrichment signals into `ProspectContext`, promise tracking

### Intelligence level
**Generation** — Requires LLM to synthesize conversation history into natural, specific references and generate a contextually appropriate email. High-quality generation, not just retrieval.

### Moat
Medium. The generation quality depends on context quality. Anyone with an LLM can draft emails; the moat is in having the right context injected (all prior conversations, extracted objections, known commitments).

---

## C4 — Sales Process as Skills

> "Sales process codified as Skills — everything from scoping PoCs to drafting proposals with a single prompt"

### What it does
The company's sales methodology is encoded as executable templates. "Draft a proposal for Acme" triggers a Skill that knows: what a proposal looks like, what context to pull, what sections to include, what tone to use.

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Skill framework (typed, validated) | DONE | `src/skills/types.ts` — SkillDefinition with Zod I/O schemas |
| Skill registry | DONE | `src/skills/registry.ts` — registerSkill, getSkill, listSkills |
| Skill runner (tracing, dry-run) | DONE | `src/skills/runner.ts` — runSkill with observability |
| 24 registered skills | DONE | `src/skills/register-all.ts` |
| Skills via chat | DONE | `src/lib/chat/tools/skills.ts` — 17 chat-accessible skills |
| Sales call prep | DONE | `src/skills/intelligence/sales-call-prep.ts` |
| Sales coaching | DONE | `src/skills/intelligence/sales-coaching.ts` |
| Battlecard generator | DONE | `src/skills/intelligence/battlecard-generator.ts` |
| Lead qualification | DONE | `src/skills/scoring/lead-qualification.ts` |
| Pipeline review | DONE | `src/skills/intelligence/pipeline-review.ts` |

### What's missing

1. **PoC scoping skill** — No `scope-poc` skill exists. Given a deal at the trial stage, generate a PoC plan: success criteria, timeline, required resources, technical requirements, evaluation framework.
2. **Proposal drafting skill** — No `draft-proposal` skill. Given a deal context, generate a commercial proposal: executive summary, solution overview, pricing, timeline, terms.
3. **Objection handling skill** — The `sales-coaching` skill exists but is generic. A dedicated `handle-objection` skill that takes a specific objection text + deal context and generates talking points, evidence, and counter-arguments would match what Lightfield describes.
4. **Re-engagement skill** — No `re-engage-stalled` skill. For frozen deals (>30d), generate a re-engagement strategy: reason to reach out, value reminder, new angle.
5. **Skill versioning/editing by manager** — Skills are code-defined, not user-editable. Lightfield implies managers can codify and iterate on their process through the UI.

### Data required
- Source: Existing deal + contact + activity data
- Missing: User-editable skill templates (requires UI + DB storage)

### Intelligence level
**Generation + Process encoding** — Each skill embeds domain knowledge (what a good PoC plan looks like, what a proposal should contain). The LLM executes against this template with deal-specific context.

### Moat
Medium-high. The moat is in the quality and specificity of the skills. Anyone can build a "draft email" button. Building a "scope PoC" skill that produces a plan a sales engineer would actually use requires deep GTM domain knowledge encoded in the prompt.

---

## C5 — Real-time Deal Coaching

> "Real-time input on every email and every deal from the agent"

### What it does
Before an email is sent, the agent reviews it: tone, completeness, alignment with sales process, missing context. On every deal update, the agent flags risks or opportunities.

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Sales coaching skill | DONE | `src/skills/intelligence/sales-coaching.ts` |
| Agent traces (every AI call) | DONE | `src/lib/observability.ts` — agentTraces table |
| Flywheel (self-improvement) | DONE | `src/lib/evals/flywheel.ts` |
| Online eval sampling | DONE | `src/inngest/eval-functions.ts` — `asyncOnlineEval` |
| Deal health scoring | DONE | `src/lib/opportunity-health.ts` |
| Churn risk detection | DONE | `src/skills/intelligence/churn-risk-detector.ts` |

### What's missing

1. **Pre-send email analysis** — No hook that intercepts outgoing emails before they're sent, analyzes them for tone/completeness/process alignment, and provides suggestions. Today, emails are drafted → sent. There's no coaching step in between.
2. **Deal event coaching triggers** — No Inngest function that fires on deal stage changes, detects potential issues (e.g., skipping qualification, moving too fast), and generates coaching advice.
3. **Coaching insight storage** — No `coaching_insights` table to persist advice, track whether it was followed, and learn from patterns.
4. **Notification integration** — The `notifications` table and system exist, but coaching insights aren't wired as notification triggers.

### Data required
- Source: Outgoing email drafts (pre-send), deal stage change events, activity patterns
- Missing: Pre-send hook in email pipeline, coaching storage

### Intelligence level
**Reasoning** — Must evaluate an email against: deal context, previous conversations, sales process, buyer persona, timing. Not just grammar — strategic alignment.

### Moat
High. The coaching quality depends on accumulated context (all prior interactions) + encoded sales methodology (skills). Generic coaching ("be more specific") is low-value. Contextual coaching ("you didn't address the CFO's budget concern from March 5") requires deep data integration.

---

## C6 — Manager Visibility Dashboard

> "I get instant visibility into how deals are progressing"

### What it does
Manager sees: pipeline by stage, AE activity metrics, deal velocity, win rate, stalled deals, SLA compliance. Real-time, not a weekly report.

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Pipeline query tool | DONE | `src/lib/chat/tools/query.ts` — `queryPipeline` |
| Pipeline review skill | DONE | `src/skills/intelligence/pipeline-review.ts` — `analyzePipeline` |
| Deal stages with probability | DONE | `src/lib/deal-helpers.ts` |
| Deal velocity | DONE | `src/lib/deal-velocity.ts` |
| Opportunity health | DONE | `src/lib/opportunity-health.ts` |
| Activity tracking (all types) | DONE | `activities` table with 20+ event types |
| Sequence performance | DONE | `src/skills/intelligence/sequence-performance.ts` |
| Weekly signal scans | DONE | `src/inngest/skill-crons.ts` — 5 weekly crons |
| Notifications | DONE | `src/db/schema.ts` — notifications table |

### What's missing

1. **Dedicated API endpoints for dashboard** — The data is accessible via chat tools and skills, but there are no REST endpoints optimized for a dashboard view. A manager dashboard needs: `/api/dashboard/pipeline` (stage breakdown, amounts, velocity), `/api/dashboard/activity` (AE activity log, response times), `/api/dashboard/alerts` (stalled deals, SLA breaches).
2. **AE performance metrics** — No aggregation of per-AE metrics: emails sent, meetings booked, deals advanced, win rate, average response time, process adherence score.
3. **Dashboard UI** — No dedicated manager dashboard page. Everything is accessible via the chat interface, which is powerful but not the right UX for a manager who wants a glanceable overview.

### Data required
- Source: All existing tables (deals, activities, outboundEmails, sequences)
- Missing: Aggregation queries, API endpoints, dashboard page

### Intelligence level
**Analytics + Light reasoning** — Mostly aggregation and trend detection. Some LLM reasoning for "why is this deal stalled?" summaries, but the core is SQL aggregations.

### Moat
Low. Dashboard UIs are commodity. The moat is in the underlying data quality (which Elevay has) and in the AI-generated insights layered on top.

---

## C7 — Compressed Feedback Loop

> "The feedback loop that normally takes weeks of call shadowing is compressed to days"

### What it does
Instead of a manager reviewing call recordings over weeks, the agent:
1. Scores every interaction on defined criteria
2. Identifies coaching opportunities
3. Delivers targeted feedback after each interaction
4. Tracks improvement over time

### Elevay state today

| Component | Status | File |
|-----------|--------|------|
| Agent evaluation system | DONE | `src/lib/eval-runner.ts` |
| Flywheel (learn from failures) | DONE | `src/lib/evals/flywheel.ts` |
| Agent traces with scoring | DONE | `agentTraces` table with evalScore |
| Sentiment analysis on activities | DONE | `activities.sentiment` column |
| Meeting structured notes | DONE | `metadata.structuredNotes` on meetings |
| Email reply classification | DONE | `src/inngest/reply-handler.ts` |
| LLM signal extraction from emails | DONE | `src/lib/enrichment/email-extract.ts` (just committed) |

### What's missing

1. **AE-facing feedback** — The flywheel improves the AGENT, not the HUMAN. There's no system that evaluates the AE's emails/calls against best practices and delivers human-readable coaching.
2. **Interaction scoring criteria** — No defined rubric for scoring human interactions (did they address the objection? was the value prop clear? did they set a next step?).
3. **Improvement tracking** — No longitudinal tracking of AE performance: "Your objection handling improved from 3/5 to 4.2/5 over the last 2 weeks."
4. **Post-interaction coaching delivery** — No trigger that fires after an email is sent or a meeting ends and delivers feedback to the AE (via notification, chat, or email).

### Data required
- Source: Outgoing emails, meeting transcripts, reply outcomes (positive/negative/neutral)
- Missing: Scoring rubric definition, AE performance history table, coaching delivery mechanism

### Intelligence level
**Deep reasoning** — Must evaluate communication quality against multiple dimensions, provide specific actionable feedback, and track trends. This is the most LLM-intensive capability.

### Moat
Very high. This is the hardest to replicate because it requires:
1. Deep context (all prior interactions, full transcript text)
2. Methodology encoding (what "good" looks like for this sales process)
3. Pattern recognition across interactions (improvement trends)
4. Tact in delivery (coaching, not criticism)

---

## Capability Coverage Summary

| # | Capability | Elevay Coverage | Missing Piece | Build Effort |
|---|-----------|----------------|---------------|-------------|
| C1 | Deal Briefing | 85% — all data + single-deal tool | Multi-deal orchestrator, promise extraction | S (1-2 days) |
| C2 | Full-Context Retrieval | 75% — all sources ingested | FTS on bodies, transcript persistence, verbatim quoting | M (3-4 days) |
| C3 | Contextual Follow-up | 70% — drafting + context exist | Wire enrichment signals to context, promise-aware drafting | S (2-3 days) |
| C4 | Sales Process Skills | 80% — 24 skills, framework done | 4 missing skills (PoC, proposal, objection, re-engage) | M (3-4 days) |
| C5 | Real-time Coaching | 40% — eval system exists | Pre-send analysis, coaching storage, notifications | L (5-7 days) |
| C6 | Manager Dashboard | 50% — data + skills exist | API endpoints, dashboard UI, AE metrics | M (4-5 days) |
| C7 | Feedback Loop | 30% — flywheel exists but for agent | AE scoring rubric, interaction scoring, tracking | L (5-7 days) |

**Total estimated effort to reach Lightfield parity: ~25-30 days of focused work.**

The critical insight: Elevay's gap is not in data infrastructure (which is excellent) or in the skill framework (which is production-grade). The gap is in **compound agents** (C1), **search quality** (C2), **context wiring** (C3), and **human coaching** (C5/C7).
