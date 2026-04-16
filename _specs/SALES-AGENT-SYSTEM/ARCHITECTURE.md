# Phase 2 — Architecture: Elevay Sales Agent System

**Date**: 2026-04-15
**Applying rules**: none returned by hook

---

## Design Principle: Build on What Exists

Elevay already has a production-grade CRM with 24 skills, 30+ Inngest jobs, a bi-temporal context graph, and a chat system with 9 tool groups. This architecture **does not rebuild** any of that. It adds the missing compound agents and wiring.

---

## 1. Schema Additions (Drizzle)

The existing schema covers deals, contacts, companies, activities, context graph, skills, chat, and eval. We add 3 tables for the coaching and feedback system. Everything else uses existing tables.

### New Tables

```typescript
// ── File: src/db/schema.ts (append to existing) ──

// C5/C7: Coaching insights generated per interaction
export const coachingInsights = pgTable("coaching_insights", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").references(() => users.id),          // AE being coached
  entityType: text("entity_type").notNull(),                    // "deal" | "email" | "meeting" | "call"
  entityId: text("entity_id").notNull(),                        // deal/activity ID
  activityId: text("activity_id").references(() => activities.id),
  insightType: text("insight_type").notNull(),                  // "pre_send" | "post_interaction" | "deal_risk" | "process_gap"
  category: text("category").notNull(),                         // "tone" | "completeness" | "objection_handling" | "next_step" | "process_adherence" | "timing"
  score: real("score"),                                         // 0.0 - 1.0
  summary: text("summary").notNull(),                           // One-liner for notification
  detail: text("detail").notNull(),                             // Full coaching advice (markdown)
  suggestion: text("suggestion"),                               // Concrete rewrite/action suggestion
  acknowledged: boolean("acknowledged").default(false),          // Did the AE see it?
  applied: boolean("applied").default(false),                   // Did the AE act on it?
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// C7: Longitudinal AE performance tracking
export const aePerformanceSnapshots = pgTable("ae_performance_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  // Activity metrics
  emailsSent: integer("emails_sent").default(0),
  emailsReplied: integer("emails_replied").default(0),
  meetingsBooked: integer("meetings_booked").default(0),
  meetingsCompleted: integer("meetings_completed").default(0),
  dealsCreated: integer("deals_created").default(0),
  dealsAdvanced: integer("deals_advanced").default(0),
  dealsWon: integer("deals_won").default(0),
  dealsLost: integer("deals_lost").default(0),
  // Quality metrics (averaged coaching scores)
  avgToneScore: real("avg_tone_score"),
  avgCompletenessScore: real("avg_completeness_score"),
  avgObjectionHandlingScore: real("avg_objection_handling_score"),
  avgProcessAdherenceScore: real("avg_process_adherence_score"),
  avgResponseTimeMinutes: real("avg_response_time_minutes"),
  winRate: real("win_rate"),
  // Computed
  overallScore: real("overall_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// C4: User-editable skill templates (manager-defined sales process)
export const customSkillTemplates = pgTable("custom_skill_templates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),                         // "qualification" | "discovery" | "proposal" | "objection" | "closing" | "re_engage"
  description: text("description").notNull(),
  trigger: text("trigger"),                                     // When to suggest this skill
  contextRequired: jsonb("context_required"),                   // What data the skill needs
  outputFormat: text("output_format"),                          // Template structure
  guidelines: text("guidelines").notNull(),                     // Process instructions (markdown)
  examples: jsonb("examples"),                                  // Few-shot examples
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Existing Tables Used (No Changes)

| Table | Used For |
|-------|----------|
| `deals` | C1: Pipeline state, stage, value, stall detection |
| `activities` | C1/C2/C3: All interactions (email, meeting, call, note) |
| `contacts` | C1/C3: Contact context for briefing and drafting |
| `companies` | C1/C6: Company intelligence and scoring |
| `contextGraphEdges` | C1: Extracted facts (OBJECTED_TO, REQUESTED, DISCUSSED) |
| `outboundEmails` | C3/C5: Email drafts and send history |
| `chatThreads/chatMessages` | C1-C7: Chat-first interface |
| `notifications` | C5/C7: Coaching delivery |
| `agentTraces` | C5/C7: Observability for coaching agents |

### Schema Modification: Activity Body FTS

```sql
-- Migration: add full-text search index on activity bodies for C2
ALTER TABLE activities ADD COLUMN IF NOT EXISTS body_tsvector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', COALESCE(body, '') || ' ' || COALESCE(summary, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_activities_body_fts ON activities USING gin(body_tsvector);
```

---

## 2. Pipeline Additions (Inngest Functions)

### Existing Pipeline (No Changes Needed)

| Function | Covers |
|----------|--------|
| `syncEmails` (15min cron) | C2: Email ingestion |
| `syncCalendar` (15min cron) | C2: Calendar/meeting ingestion |
| `scheduleRecallBots` (5min cron) | C2: Meeting transcript capture |
| `enrichmentEmailExtractFunction` | C3: Signal extraction from emails |
| `weeklySignalScan` | C6: Signal detection |
| `weeklyChurnRiskScan` | C6: Churn alerting |
| `processReply` | C3: Reply classification |

### New Functions

```
src/inngest/deal-briefing.ts
├── generateDealBrief           (event: "deal/brief-requested")
│   Takes: { tenantId, dealIds?: string[], scope: "all_open" | "specific" }
│   Does: For each deal → fetch activities, context graph edges, enrichment signals
│         → LLM synthesizes brief (summary, promises, objections, stall reason, next action)
│         → Returns structured JSON per deal
│   Returns: DealBrief[] (see schema below)
│
└── scheduledDealDigest         (cron: "0 7 * * 1-5" — weekdays 7am)
    Does: Auto-generates daily deal digest for all active AEs
    → Fires "deal/brief-requested" with scope: "all_open" per user
    → Delivers via notification

src/inngest/coaching-engine.ts
├── analyzeOutgoingEmail        (event: "coaching/pre-send-analysis")
│   Takes: { tenantId, emailDraftId, dealId?, contactId }
│   Does: Loads email draft + deal context + prior interactions
│         → LLM evaluates on 5 dimensions (tone, completeness, objection handling, next step, process)
│         → Generates coaching insight with score + suggestion
│   Stores: coachingInsights row
│   Returns: CoachingInsight
│
├── analyzeDealEvent            (event: "coaching/deal-event")
│   Takes: { tenantId, dealId, eventType, userId }
│   Does: On stage change → checks process adherence (did they skip a stage? move too fast?)
│         On stall detection → generates re-engagement coaching
│   Stores: coachingInsights row
│   Fires: notification/push-coaching
│
├── postInteractionCoaching     (event: "coaching/post-interaction")
│   Takes: { tenantId, activityId, userId }
│   Does: After meeting/email → evaluates interaction quality
│         → Generates specific feedback
│   Stores: coachingInsights row
│
└── weeklyPerformanceSnapshot   (cron: "0 8 * * 1" — Mondays 8am)
    Does: For each AE → aggregate week's metrics + coaching scores
    → Store aePerformanceSnapshots row
    → Detect trends (improving/declining)
    → Generate weekly coaching summary
```

### Modified Functions

```
src/inngest/email-send-worker.ts (modify existing)
├── processOutboundEmails — ADD: after generating email HTML, before sending,
│   fire "coaching/pre-send-analysis" event. If the tenant has coaching enabled,
│   the email is held for coaching review (async, non-blocking by default,
│   blocking if tenant settings require approval).
│
src/inngest/sync-functions.ts (modify existing)
├── syncEmails — ADD: after creating activity, fire "coaching/post-interaction"
│   for inbound emails that are replies to outbound (reply classification already exists).
│
src/inngest/recall-functions.ts (modify existing)
├── After transcript is processed, fire "coaching/post-interaction"
│   for the meeting activity.
```

---

## 3. Agent: Deal Briefing (C1 + C2)

### Architecture

```
User: "Brief me on my deals"
  ↓
Chat route (src/app/api/chat/route.ts)
  ↓ tool call: briefAllDeals
New tool: src/lib/chat/tools/briefing.ts
  ├── briefAllDeals
  │   ├── Query: SELECT * FROM deals WHERE tenantId = ? AND stage NOT IN ('won', 'lost')
  │   ├── For each deal (parallel, batched):
  │   │   ├── Fetch last 20 activities (body included) via deal + contact linkage
  │   │   ├── Fetch context graph edges (OBJECTED_TO, REQUESTED, DISCUSSED)
  │   │   ├── Fetch enrichment signals (from email-extract results in properties)
  │   │   ├── Compute ageInStage() for stall detection
  │   │   └── Compute opportunity health score
  │   ├── LLM call (Claude): synthesize per-deal brief
  │   │   System prompt includes:
  │   │   - Deal metadata (stage, value, age, health)
  │   │   - Full interaction timeline with bodies (truncated to 500 chars each)
  │   │   - Extracted objections + next steps from enrichment
  │   │   - Context graph facts
  │   │   Task: produce { summary, discussed, promised, objections, stallReason, nextAction, risk }
  │   └── Return: DealBrief[]
  │
  └── briefDeal (single deal — enhanced getDealCoaching)
      Same as above but for one deal, with full bodies (no truncation)
```

### Output Schema (Zod)

```typescript
const DealBriefSchema = z.object({
  dealId: z.string(),
  dealName: z.string(),
  stage: z.string(),
  value: z.number().nullable(),
  daysInStage: z.number(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  summary: z.string(),                    // 2-3 sentence overview
  keyDiscussions: z.array(z.object({
    date: z.string(),
    topic: z.string(),
    source: z.enum(["email", "meeting", "call", "note"]),
    verbatimQuote: z.string().optional(), // Exact words if available
  })),
  promisesMade: z.array(z.object({
    by: z.enum(["us", "them"]),
    what: z.string(),
    when: z.string().optional(),          // Deadline if mentioned
    fulfilled: z.boolean().nullable(),    // null = unknown
  })),
  objectionsRaised: z.array(z.object({
    objection: z.string(),
    status: z.enum(["open", "addressed", "resolved"]),
    ourResponse: z.string().optional(),
  })),
  stallReason: z.string().nullable(),     // null if not stalled
  nextAction: z.object({
    action: z.string(),
    owner: z.enum(["us", "them"]),
    suggestedDate: z.string().optional(),
  }),
  healthScore: z.number(),               // 0-100
});
```

---

## 4. Agent: Contextual Follow-up (C3)

### Architecture

```
User: "Draft a follow-up for the Acme deal"
  ↓
Chat route → tool call: draftContextualFollowup (NEW)
  ↓
src/lib/chat/tools/action.ts (extend existing sendEmail/draftEmail)
  ├── Load deal + contact + company via existing queries
  ├── Load ProspectContext via buildProspectContext() (existing)
  ├── NEW: Load enrichment signals from activities.metadata.extractedSignals
  │   - objections[], next_steps[], champion_signals[], budget_mentions[]
  ├── NEW: Load context graph edges for this deal/contact
  │   - OBJECTED_TO, REQUESTED, PROMISED facts
  ├── NEW: Load last 5 email bodies (full text, not just summaries)
  │   - From activities WHERE channel='email' AND entityId=contactId
  ├── Build enhanced prompt with:
  │   - Interaction timeline with specific references
  │   - Known objections and their status
  │   - Commitments made (by us and them)
  │   - Suggested angle based on deal stage + signals
  ├── Load custom skill template if exists (C4: customSkillTemplates)
  ├── LLM generates draft with specific conversation references
  └── Return: { subject, body, references: [{source, date, quote}] }
```

### Key Enhancement: EnrichedProspectContext

```typescript
// Extends existing ProspectContext (src/lib/prospect-context.ts)
interface EnrichedProspectContext extends ProspectContext {
  // From enrichment-email-extract pipeline
  extractedSignals: {
    objections: Array<{ text: string; date: string; status: "open" | "addressed" }>;
    nextSteps: Array<{ text: string; owner: "us" | "them"; deadline?: string }>;
    championSignals: Array<{ text: string; contactName: string }>;
    budgetMentions: Array<{ text: string; amount?: string }>;
    competitorMentions: Array<{ competitor: string; context: string }>;
  };
  // From context graph
  graphFacts: Array<{
    relation: string;  // OBJECTED_TO, REQUESTED, etc.
    fact: string;
    date: string;
    confidence: number;
  }>;
  // Full email bodies (last 5)
  recentEmailBodies: Array<{
    direction: "inbound" | "outbound";
    from: string;
    date: string;
    subject: string;
    bodySnippet: string; // First 800 chars
  }>;
}
```

---

## 5. Skills System Extensions (C4)

### New Skills to Build

```
src/skills/intelligence/
├── scope-poc.ts              — PoC scoping (success criteria, timeline, resources)
├── draft-proposal.ts         — Commercial proposal generation
├── handle-objection.ts       — Objection-specific response generation
└── re-engage-stalled.ts      — Stalled deal re-engagement strategy

src/skills/coaching/
├── pre-send-review.ts        — Email quality review before send
└── interaction-scoring.ts    — Score an interaction on defined criteria
```

### Custom Skill Template Execution

```typescript
// When a custom skill template exists for the action:
// 1. Load template from customSkillTemplates
// 2. Inject template.guidelines as system prompt section
// 3. Use template.examples as few-shot
// 4. Validate output against template.outputFormat
// This allows managers to codify their process without code changes.
```

### Skill Registration

New skills register via the existing `registerAllSkills()` pattern in `src/skills/register-all.ts`. Custom skill templates are loaded from DB at runtime and wrapped in the SkillDefinition interface.

---

## 6. Coaching Engine (C5 + C7)

### Pre-send Analysis Flow

```
Email composed (chat draftEmail or sequence step)
  ↓ fire event: "coaching/pre-send-analysis"
  ↓
analyzeOutgoingEmail (Inngest function)
  ├── Load: email draft, deal context, last 10 interactions, extracted signals
  ├── Load: custom skill template for this deal stage (if exists)
  ├── LLM evaluates on 5 dimensions:
  │   1. Tone — appropriate for deal stage + buyer persona?
  │   2. Completeness — addresses all open items?
  │   3. Objection handling — tackles known objections?
  │   4. Next step — clear call to action?
  │   5. Process adherence — follows the defined methodology?
  ├── Each dimension: score 0.0-1.0 + specific feedback
  ├── Overall: pass/fail threshold (configurable, default 0.6)
  ├── If suggestion available: concrete rewrite of weak sections
  ├── Store: coachingInsights row
  └── Notify: push coaching insight to AE (notification + optional chat message)
```

### Scoring Rubric Schema

```typescript
const CoachingScoreSchema = z.object({
  dimensions: z.object({
    tone: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      suggestion: z.string().optional(),
    }),
    completeness: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      missingItems: z.array(z.string()),
    }),
    objectionHandling: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      unaddressedObjections: z.array(z.string()),
    }),
    nextStep: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
    }),
    processAdherence: z.object({
      score: z.number().min(0).max(1),
      feedback: z.string(),
      skippedSteps: z.array(z.string()),
    }),
  }),
  overallScore: z.number().min(0).max(1),
  verdict: z.enum(["send", "review", "revise"]),
  topSuggestion: z.string().optional(),
});
```

---

## 7. Dashboard API (C6)

### New Endpoints

```
src/app/api/dashboard/
├── pipeline/route.ts         — GET: stage breakdown, amounts, velocity, weighted forecast
├── activity/route.ts         — GET: AE activity log, volume by type, response times
├── alerts/route.ts           — GET: stalled deals, SLA breaches, coaching opportunities
├── performance/route.ts      — GET: AE performance snapshots, trends
└── briefs/route.ts           — GET: latest deal briefs (cached from Inngest runs)
```

### Pipeline Endpoint Response

```typescript
// GET /api/dashboard/pipeline?period=30
{
  stages: [
    { name: "lead", count: 12, totalValue: 180000, avgAge: 5 },
    { name: "qualification", count: 8, totalValue: 320000, avgAge: 11 },
    // ...
  ],
  totals: {
    openDeals: 35,
    totalValue: 1250000,
    weightedValue: 487500,    // Σ(value × probability)
    avgDealSize: 35714,
    avgCycleLength: 28,       // days from lead to close
  },
  velocity: {
    newDealsThisPeriod: 8,
    closedWonThisPeriod: 3,
    closedLostThisPeriod: 2,
    conversionRate: 0.6,      // won / (won + lost)
    avgTimeToClose: 32,
  },
  risks: [
    { dealId: "...", name: "Acme Corp", stage: "proposal", daysStalled: 18, reason: "No response after pricing sent" },
  ],
}
```

### Dashboard Page

```
src/app/(dashboard)/insights/page.tsx    — Main manager dashboard
  ├── Pipeline funnel visualization (stages → amounts)
  ├── Deal briefs (latest, expandable)
  ├── Activity feed (last 7 days, by type)
  ├── Alerts (stalled, at-risk, coaching)
  └── AE scorecard (if multi-user)
```

The dashboard page consumes the 5 API endpoints above. For the SMB/founder use case (C6's primary audience), this is a single-page overview, not a multi-page analytics suite.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    DATA SOURCES                         │
│  Gmail │ Outlook │ Calendar │ Recall.ai │ Apollo │ Chat │
└───┬────┴────┬────┴────┬─────┴─────┬─────┴───┬────┴──┬──┘
    │         │         │           │         │       │
    ▼         ▼         ▼           ▼         ▼       ▼
┌─────────────────────────────────────────────────────────┐
│              INGESTION (Inngest - existing)              │
│  syncEmails │ syncCalendar │ scheduleRecallBots │ enrich │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│              STORAGE (Neon PostgreSQL)                   │
│  activities │ deals │ contacts │ companies │ contextGraph│
│  + NEW: body_tsvector FTS index                         │
└───────────────────────┬─────────────────────────────────┘
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
┌──────────┐ ┌──────────┐ ┌──────────────────┐
│ EXTRACT  │ │ BRIEFING │ │ COACHING ENGINE  │
│ (exist.) │ │ (new)    │ │ (new)            │
│ email-   │ │ deal-    │ │ pre-send review  │
│ extract  │ │ briefing │ │ post-interaction │
│ context  │ │ digest   │ │ deal-event coach │
│ graph    │ │          │ │ perf. snapshot   │
└────┬─────┘ └────┬─────┘ └────┬─────────────┘
     │            │             │
     ▼            ▼             ▼
┌─────────────────────────────────────────────────────────┐
│              DELIVERY                                   │
│  Chat (existing) │ Notifications │ Dashboard API (new)  │
│  Email drafts    │ Coaching tips │ Pipeline/Alerts view  │
└─────────────────────────────────────────────────────────┘
```

---

## Environment Variables

### New (only if features require external services not yet configured)

None. All features use existing infrastructure:
- LLM: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (existing)
- DB: `DATABASE_URL` (existing Neon)
- Auth: `AUTH_SECRET` (existing)
- Redis: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (existing)
- Inngest: `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` (existing)

### New Tenant Settings

```typescript
// Added to tenant_settings (JSONB in tenants table)
{
  coaching: {
    enabled: boolean;           // default: true
    preSendReview: "off" | "suggest" | "require";  // default: "suggest"
    scoringThreshold: number;   // 0.0-1.0, below this = "revise" verdict
    weeklyDigest: boolean;      // default: true
    dailyDealBrief: boolean;    // default: true
  }
}
```

---

## Dependencies

### No New npm Packages Required

All features build on existing dependencies:
- `drizzle-orm` — schema + queries
- `inngest` — async job orchestration
- `@ai-sdk/anthropic` / `@ai-sdk/openai` — LLM calls via existing `tracedGenerateObject`
- `zod` — schema validation
- `next` — API routes + pages
- `lucide-react` — icons for dashboard

The architecture intentionally avoids new dependencies. Vector search (for C2 verbatim retrieval) uses PostgreSQL FTS rather than adding a vector DB — the activity corpus is small enough (~10K rows per tenant) that FTS is sufficient and eliminates operational complexity.
