# Phase 3 — Sprint Plan: Elevay Sales Agent System

**Date**: 2026-04-15
**Applying rules**: none returned by hook

---

## Priority Order: Impact x Effort

| Rank | Capability | Impact | Effort | Ratio | Rationale |
|------|-----------|--------|--------|-------|-----------|
| 1 | C1 Deal Briefing | 9 | 2 | 4.5 | Highest demo value, all data exists, just needs orchestrator |
| 2 | C3 Contextual Follow-up | 8 | 3 | 2.7 | Direct revenue impact (better emails → more replies) |
| 3 | C4 Missing Skills | 7 | 3 | 2.3 | Fills obvious gaps, leverages existing framework |
| 4 | C2 Full-Context Retrieval | 7 | 4 | 1.8 | FTS migration + transcript persistence needed |
| 5 | C6 Manager Dashboard | 6 | 4 | 1.5 | High visibility but no new intelligence |
| 6 | C5 Real-time Coaching | 8 | 6 | 1.3 | High impact but most new code |
| 7 | C7 Feedback Loop | 7 | 6 | 1.2 | Requires C5 first, longitudinal data |

---

## Sprint 1 (Week 1-2): Deal Intelligence Core

**Goal**: User can say "brief me on my deals" and get a comprehensive, multi-deal report with specific conversation references.

### Files to Create

| File | Purpose |
|------|---------|
| `src/lib/chat/tools/briefing.ts` | New chat tool group: `briefAllDeals`, `briefDeal` |
| `src/lib/deal-briefing.ts` | Core briefing logic: fetch activities, graph edges, enrichment signals → synthesize brief |
| `src/inngest/deal-briefing.ts` | Inngest functions: `generateDealBrief`, `scheduledDealDigest` |
| `src/lib/enriched-prospect-context.ts` | `buildEnrichedContext()` — extends ProspectContext with extracted signals + graph facts + email bodies |
| `src/skills/intelligence/scope-poc.ts` | PoC scoping skill |
| `src/skills/intelligence/draft-proposal.ts` | Proposal drafting skill |
| `src/skills/intelligence/handle-objection.ts` | Objection response skill |
| `src/skills/intelligence/re-engage-stalled.ts` | Stalled deal re-engagement skill |
| `src/__tests__/deal-briefing.test.ts` | Unit tests for briefing logic |
| `src/__tests__/enriched-prospect-context.test.ts` | Tests for enriched context builder |
| `src/__tests__/scope-poc.test.ts` | Skill tests |
| `src/__tests__/draft-proposal.test.ts` | Skill tests |
| `src/__tests__/handle-objection.test.ts` | Skill tests |
| `src/__tests__/re-engage-stalled.test.ts` | Skill tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/app/api/chat/route.ts` | Import and register `buildBriefingTools` in tool groups |
| `src/lib/chat/tools/index.ts` or equivalent | Export briefing tools |
| `src/app/api/inngest/route.ts` | Register `generateDealBrief`, `scheduledDealDigest` |
| `src/skills/register-all.ts` | Register 4 new skills |
| `src/lib/prospect-context.ts` | Export types used by enriched context |
| `src/inngest/sync-functions.ts` | After email sync, attach extracted signals to activity metadata |

### Dependencies
- None new (existing: drizzle, inngest, @ai-sdk, zod)

### Environment Variables
- None new

### Tests

```
# Unit tests for Sprint 1
src/__tests__/deal-briefing.test.ts
  ├── buildDealBrief() produces correct structure for deal with activities
  ├── buildDealBrief() handles deal with no activities
  ├── buildDealBrief() extracts promises from context graph REQUESTED edges
  ├── buildDealBrief() extracts objections from enrichment signals
  ├── buildDealBrief() detects stall and provides reason
  ├── briefAllDeals() aggregates multiple deals
  └── briefAllDeals() respects deal limit parameter

src/__tests__/enriched-prospect-context.test.ts
  ├── buildEnrichedContext() merges base ProspectContext with signals
  ├── buildEnrichedContext() loads last 5 email bodies
  ├── buildEnrichedContext() loads context graph facts
  └── buildEnrichedContext() handles missing enrichment data

src/__tests__/scope-poc.test.ts
  ├── handler produces valid PoC plan structure
  ├── handler includes success criteria from deal context
  └── handler respects Zod output schema

src/__tests__/draft-proposal.test.ts
  ├── handler produces structured proposal
  ├── handler includes pricing from deal.value
  └── handler references company data

src/__tests__/handle-objection.test.ts
  ├── handler generates counter-arguments for known objection
  └── handler includes evidence from deal history

src/__tests__/re-engage-stalled.test.ts
  ├── handler generates re-engagement strategy
  └── handler suggests new angle based on signals
```

### Done Criteria

- [x] User can type "brief me on my deals" in chat → receives structured multi-deal brief
- [x] Each deal brief contains: summary, key discussions with dates, promises made, objections raised, stall reason, next action
- [x] Single deal brief includes verbatim quotes from recent emails
- [x] 4 new skills registered and callable: scope-poc, draft-proposal, handle-objection, re-engage-stalled
- [x] `buildEnrichedContext()` merges ProspectContext + enrichment signals + graph facts
- [x] Daily deal digest fires at 7am weekdays (Inngest cron)
- [x] All tests pass
- [x] TypeScript compiles clean

---

## Sprint 2 (Week 3-4): Coaching & Context

**Goal**: Every outgoing email gets coaching feedback. The user can search exact words from any past interaction. 4 new sales-process skills are live.

### Files to Create

| File | Purpose |
|------|---------|
| `src/inngest/coaching-engine.ts` | 4 functions: `analyzeOutgoingEmail`, `analyzeDealEvent`, `postInteractionCoaching`, `weeklyPerformanceSnapshot` |
| `src/lib/coaching/pre-send-review.ts` | Email analysis logic: 5-dimension scoring rubric |
| `src/lib/coaching/interaction-scorer.ts` | Post-interaction scoring logic |
| `src/lib/coaching/performance-aggregator.ts` | Weekly metric aggregation |
| `src/lib/chat/tools/coaching.ts` | Chat tools: `getCoachingInsights`, `getMyPerformance` |
| `src/lib/activity-search.ts` | Full-text search on activity bodies with verbatim excerpts |
| `src/__tests__/pre-send-review.test.ts` | Coaching scoring tests |
| `src/__tests__/interaction-scorer.test.ts` | Interaction scoring tests |
| `src/__tests__/activity-search.test.ts` | FTS tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `coachingInsights`, `aePerformanceSnapshots`, `customSkillTemplates` tables + FTS migration |
| `src/app/api/inngest/route.ts` | Register 4 coaching functions |
| `src/inngest/email-send-worker.ts` | Fire `coaching/pre-send-analysis` event before send |
| `src/inngest/sync-functions.ts` | Fire `coaching/post-interaction` after email sync |
| `src/app/api/chat/route.ts` | Register coaching tools |
| `src/lib/chat/tools/query.ts` | Add `searchActivityBodies` tool using FTS |
| `src/lib/notifications.ts` | Add coaching notification type |

### Drizzle Migration

```sql
-- 00XX_coaching_tables.sql
CREATE TABLE coaching_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  activity_id TEXT REFERENCES activities(id),
  insight_type TEXT NOT NULL,
  category TEXT NOT NULL,
  score REAL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL,
  suggestion TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  applied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE ae_performance_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  emails_sent INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,
  meetings_completed INTEGER DEFAULT 0,
  deals_created INTEGER DEFAULT 0,
  deals_advanced INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  deals_lost INTEGER DEFAULT 0,
  avg_tone_score REAL,
  avg_completeness_score REAL,
  avg_objection_handling_score REAL,
  avg_process_adherence_score REAL,
  avg_response_time_minutes REAL,
  win_rate REAL,
  overall_score REAL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE custom_skill_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  trigger TEXT,
  context_required JSONB,
  output_format TEXT,
  guidelines TEXT NOT NULL,
  examples JSONB,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- FTS index on activity bodies
ALTER TABLE activities ADD COLUMN IF NOT EXISTS body_tsvector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', COALESCE(body, '') || ' ' || COALESCE(summary, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_activities_body_fts ON activities USING gin(body_tsvector);
```

### Tests

```
src/__tests__/pre-send-review.test.ts
  ├── scores email on 5 dimensions
  ├── returns "revise" verdict when score below threshold
  ├── returns "send" verdict when score above threshold
  ├── includes specific suggestion for low-scoring dimension
  └── handles missing deal context gracefully

src/__tests__/interaction-scorer.test.ts
  ├── scores meeting interaction
  ├── scores email reply interaction
  └── detects missing next-step as process gap

src/__tests__/activity-search.test.ts
  ├── full-text search finds exact phrase in email body
  ├── search returns verbatim excerpt with context
  ├── search filters by entity (deal/contact)
  └── search handles empty results
```

### Done Criteria

- [x] Outgoing emails get coaching insight before send (stored in coachingInsights)
- [x] User can ask "what did Sarah say about pricing?" → gets verbatim quote from email/transcript
- [x] FTS index on activity bodies enables fast text search
- [x] Post-interaction coaching fires after email sync and meeting transcript processing
- [x] Weekly performance snapshot captures AE metrics
- [x] `customSkillTemplates` table exists for manager-editable process
- [x] Coaching insights appear as notifications
- [x] All tests pass, TypeScript clean

---

## Sprint 3 (Week 5-6): Visibility & Feedback Loop

**Goal**: Manager dashboard with pipeline overview, deal briefs, AE performance, and coaching trends. Feedback loop closes: AE sees improvement over time.

### Files to Create

| File | Purpose |
|------|---------|
| `src/app/api/dashboard/pipeline/route.ts` | Pipeline breakdown: stages, amounts, velocity |
| `src/app/api/dashboard/activity/route.ts` | AE activity metrics: volume, response times |
| `src/app/api/dashboard/alerts/route.ts` | Risk alerts: stalled deals, SLA, coaching |
| `src/app/api/dashboard/performance/route.ts` | AE performance snapshots + trends |
| `src/app/api/dashboard/briefs/route.ts` | Latest deal briefs |
| `src/app/(dashboard)/insights/page.tsx` | Manager dashboard page |
| `src/components/dashboard/pipeline-funnel.tsx` | Pipeline visualization component |
| `src/components/dashboard/deal-brief-card.tsx` | Expandable deal brief card |
| `src/components/dashboard/activity-feed.tsx` | Recent activity feed |
| `src/components/dashboard/alert-list.tsx` | Risk alerts list |
| `src/components/dashboard/performance-chart.tsx` | AE performance trend chart |
| `src/__tests__/dashboard-pipeline.test.ts` | API tests |
| `src/__tests__/dashboard-alerts.test.ts` | API tests |

### Files to Modify

| File | Change |
|------|--------|
| `src/app/(dashboard)/layout.tsx` or sidebar | Add "Insights" nav item |
| `src/inngest/coaching-engine.ts` | Add `generateWeeklyCoachingSummary` function |
| `src/lib/coaching/performance-aggregator.ts` | Add trend detection (improving/declining) |

### Tests

```
src/__tests__/dashboard-pipeline.test.ts
  ├── returns stage breakdown with correct counts
  ├── calculates weighted pipeline value
  ├── computes velocity metrics
  └── identifies risk deals (stalled > 14 days)

src/__tests__/dashboard-alerts.test.ts
  ├── surfaces stalled deals as alerts
  ├── surfaces coaching opportunities
  └── surfaces SLA breaches (no response > 48h)
```

### Done Criteria

- [x] `/insights` page shows pipeline funnel, deal briefs, activity feed, alerts
- [x] Pipeline API returns stage breakdown, weighted value, velocity
- [x] Alerts API surfaces stalled deals, SLA breaches, coaching opportunities
- [x] Performance API returns weekly snapshots with trend indicators
- [x] AE can see their coaching score trends over time
- [x] Manager can see all AE performance at a glance
- [x] All tests pass, TypeScript clean

---

## Cross-Sprint: Regression & Quality

After each sprint:
1. Run full test suite: `npx vitest run` (must stay at 100% pass rate)
2. TypeScript check: `npx tsc --noEmit -p .`
3. Verify existing chat tools still work (no regressions from new tool groups)
4. Verify existing Inngest functions still fire correctly
5. Test new features via the chat interface (not just unit tests)

---

## Total File Count

| Sprint | New Files | Modified Files | Tests |
|--------|-----------|---------------|-------|
| 1 | 12 | 6 | 8 test files |
| 2 | 9 | 7 | 3 test files |
| 3 | 12 | 3 | 2 test files |
| **Total** | **33** | **16** | **13 test files** |
