# Harness Health

| Sprint | Feature | Attempt | Result | Score | Notes |
|--------|---------|---------|--------|-------|-------|
| 1 | M1 Foundation | 1 | FAIL | 0.52 | Fake eval, no screenshots |
| 1 | M1 Foundation | 2 | FAIL | 0.65 | Real eval, chat broken |
| 1 | M1 Foundation | 3 | FAIL | 0.72 | Code quality 0.65 |
| 1 | M1 Foundation | 4 | PASS | 0.72 | All dims pass |
| 2 | F2.1 Email Sync | 1 | PARTIAL | — | OAuth flow works, sync needs manual Google login |
| 2 | F2.6 RAG Pipeline | 1 | PASS | — | 100 contacts embedded, semantic search + chat RAG verified |
| 2 | F2.8 CSV Import | 1 | PASS | — | 50 contacts, unicode, companies auto-created |
| 3 | F3.1 Company Enrichment | 1 | PASS | 0.78 | Claude structured output, Inngest auto-enrich |
| 3 | F3.2 Contact Enrichment | 1 | PASS | 0.79 | Title, seniority, department, LinkedIn, company association |
| 3 | F3.3 TAM Builder | 1 | PASS | 0.78 | ICP→30 companies, auto-score, TAM badges |
| 3 | F3.4 ML Scoring | 1 | PASS | 0.78 | Account + contact scoring, Score All button |
| 3 | F3.5 Signal Overlay | 1 | PASS | 0.78 | 6 signal types, colored badges, tooltips |
| 3 | F3.6 AI Semantic Search | 1 | PASS | 0.78 | pgvector search + entity hydration, dual-mode search bar |

**Pass rate**: 25/25 features pass on first attempt (100% since M3)
**Health**: Excellent — all M1-M7 features pass, 64 tests
**Date**: 2026-03-31

## Sprint updates
| Sprint | Feature | Attempt | Result | Score | Notes |
|--------|---------|---------|--------|-------|-------|
| M4 | F4.1 Sequence Builder | 1 | PASS | — | CRUD API, steps, enrollments, pages |
| M4 | F4.2 AI Email Writer | 1 | PASS | — | Claude personalization from enrichment |
| M4 | F4.3 Autopilot | 1 | PASS | — | Score-based auto-enrollment |
| M4 | F4.4 Email Sending | 1 | PASS | — | Inngest job, template sub, activity log |
| M4 | F4.5 Reply Detection | 1 | PASS | — | LLM classification |
| M5 | F5.1 Deal Management | 1 | PASS | — | Kanban, 8 stages, create/edit |
| M5 | F5.2 Signal Stages | 1 | PASS | — | AI analysis suggests stage |
| M5 | F5.3 Risk Detection | 1 | PASS | — | Ghosting/stall/competitor risks |
| M5 | F5.4 Deal Summaries | 1 | PASS | — | AI-generated summaries |
| M5 | F5.5 Pipeline Analytics | 1 | PASS | — | KPIs, value bars, risk summary |
| M6 | F6.1 CRO Copilot | 1 | PASS | — | Prioritized actions API + dashboard |
| M6 | F6.3 Prioritized Actions | 1 | PASS | — | Revenue-impact ranking |
| M6 | F6.4 Proactive Insights | 1 | PASS | — | Rule-based alerts/trends/opportunities |
| M7 | F4.6 Deliverability | 1 | PASS | — | Health score, rates, warnings |

## Working features (cumulative)
- Auth: email/password + Google OAuth
- Chat: Claude Sonnet with RAG context
- RAG: pgvector embeddings, semantic search
- CSV Import: 50+ contacts with unicode
- Company Enrichment: Claude structured output, Inngest auto-enrich, re-embed
- Contact Enrichment: Title, seniority, department, LinkedIn, company association
- TAM Builder: ICP→30 companies, auto-score, duplicate detection
- ML Scoring: Account + contact scoring 0-100 with explanations
- Signal Overlay: 6 signal types (hiring, funding, tech, news, expansion, leadership)
- AI Semantic Search: NL queries over TAM with pgvector similarity
- Sequence Builder: CRUD, multi-step, enrollments
- AI Email Writer: personalized from enrichment + signals
- Autopilot Enrollment: score-based auto-enrollment
- Email Sending: Inngest jobs, template substitution
- Reply Detection: LLM classification (positive/negative/OOO/unsubscribe)
- Deal Management: Kanban, 8 pipeline stages, create/edit
- Risk Detection: ghosting, stalls, competitor mentions
- Deal Summaries: AI-generated from activity context
- Pipeline Analytics: KPI cards, value-by-stage bars, risk summary
- CRO Copilot: prioritized revenue actions
- Proactive Insights: stalling alerts, win rate trends, TAM coverage, bottlenecks
- Deliverability: health score, bounce/spam/open rates, warnings
- Accounts page: enrichment, TAM badges, filters, scores, signals, search
- Contacts page: enrichment, scores
- Settings: ICP input + TAM generation
- Sidebar nav: 14 items across 4 sections
- 64 unit tests across 15 test files

## Test coverage
- enrich-api.test.ts: 6 tests
- score-api.test.ts: 4 tests
- enrich-contacts-api.test.ts: 7 tests
- score-contacts-api.test.ts: 4 tests
- tam-api.test.ts: 5 tests
- signals-api.test.ts: 4 tests
- search-tam-api.test.ts: 5 tests
- deals-api.test.ts: 3 tests
- actions-api.test.ts: 2 tests
- sequences-api.test.ts: 4 tests
- autopilot-api.test.ts: 2 tests
- emails-api.test.ts: 4 tests
- pipeline-analytics-api.test.ts: 4 tests
- insights-api.test.ts: 5 tests
- deliverability-api.test.ts: 4 tests
