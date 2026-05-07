# Monaco-Parity P0 Execution Progress

_Last updated_ : 2026-05-07

## Summary

| P0 | Branch | Tasks committed | Status |
|---|---|---|---|
| P0-5 | `feat/monaco-parity-p0-5-deal-autofill` | 3 / 10 | 🟡 In progress |
| P0-1 | `feat/monaco-parity-p0-1-sequence-drafts` | 2 / 10 | 🟡 In progress |
| P0-3 | — | 0 / 12 | ⏸️ Not started |
| P0-4 | — | 0 / ~9 | ⏸️ Not started |
| P0-2 | — | 0 / ~10 | 🔴 Blocked on `SNITCHER_API_KEY` |

Total : **5 task commits + 1 WIP + 1 doc = 7 commits across 2 branches**.
Tests added : **70+ new (state-machine 28, conflict-resolution 17, property-accessor 25)**.

---

## P0-5 — Deal autofill E2E proof + monitoring

**Branch** : `feat/monaco-parity-p0-5-deal-autofill`

### Committed

| Task | Commit | Description |
|---|---|---|
| 5.1 | `0f336d4` | Conflict resolution lib (5 rules, 17 tests) |
| 5.2 | `c23af60` | Property accessor backwards-compat + migration `0044_deal_property_metadata_backfill.sql` (25 tests) |
| 5.5 | `69feed9` | `GET /api/deals/[id]/property-source/[fieldName]` |
| — | `2ae223b` | Initial progress report |

### Pending

| Task | Effort | Blocker |
|---|---|---|
| 5.3 | 1j | E2E test budget extraction — needs Postgres test setup + Inngest test harness |
| 5.4 | 1j | E2E extended to 5 more fields |
| 5.6 | 1j | UI tooltip on `/opportunities/[id]/page.tsx` (`<DealPropertyCell>`) |
| 5.7 | 0.5j | Datadog metrics in `inngest/deal-signal-sync.ts` |
| 5.8 | 0.5j | Datadog dashboard YAML |
| 5.9 | 0.5j | Prod run validation — needs prod tenant access |
| 5.10 | 0.5j | RUNBOOK.md doc |

---

## P0-1 — Sequence drafts queue per-email

**Branch** : `feat/monaco-parity-p0-1-sequence-drafts`

### Committed

| Task | Commit | Description |
|---|---|---|
| 1.1 | `f19a5af` | Migration `0045_sequence_drafts.sql` + Drizzle schema + state-machine helpers (28 tests) |
| 1.2 | `9afed36` | 5 API routes (`/api/sequences/drafts/...`) — list, approve, reject, edit, context |

### Pending

| Task | Effort | Blocker |
|---|---|---|
| 1.3 | 1.5j | Page `/sequences/review` + 3 components (DraftList, DraftPreview, RejectModal) |
| 1.4 | 1j | Worker `inngest/sequence-draft-router.ts` (replaces direct send) |
| 1.5 | 0.5j | Worker `inngest/sequence-draft-expiry.ts` (hourly cron) |
| 1.6 | 1j | Evaluator-optimizer learner (`inngest/draft-rejection-learner.ts`) |
| 1.7 | 1j | Tests integration (approve flow / reject flow / expire flow) |
| 1.8 | 0.5j | Tests E2E Playwright |
| 1.9 | 0.5j | Refactor existing autopilot to use new flow |
| 1.10 | 0.5j | RUNBOOK + tenant default `approvalMode='manual'` |

---

## P0-3 — Onboarding wizard hardening

**Branch** : not yet created
**Status** : ⏸️ Not started — backbone built in prior sessions on `feat/lightfield-quick-wins` (preserved in WIP commit `44d79b6`). Remaining work : production-quality polish, telemetry, copy.

## P0-4 — Coaching transcript-grounded production-ready

**Branch** : not yet created
**Status** : ⏸️ Not started — RAG backbone built in prior sessions (chunking + parser + retrieval + chat tool wired). Remaining : LLM-grounded eval cases, video player surface (Recall.ai-dependent).

## P0-2 — Visitor ID Snitcher integration

**Branch** : not yet created
**Status** : 🔴 Blocked — `SNITCHER_API_KEY` not in `_credentials/bootstrap.json`. Snitcher contract signup required (~$500-2000/mo) before code can run.

---

## Cumulative session context

This work builds on substantial prior-session scaffolding preserved
in WIP commit `44d79b6` :
- 5 Monaco-Parity sub-spec folders (`_specs/MONACO-PARITY-{01..07}/`)
- 5 vertical playbooks (`_research/playbooks/`)
- 6 AI-UI primitives (`components/ai-ui/`)
- LLM observability wrapper + cost dashboard
- Eval harness with 6 suites
- `/cs/today` priority queue + health-score lib
- Voice-of-customer classifier
- Onboarding wizard `/onboarding-v3` + 9 hard gates + founder-led upsell
- Visitor-ID Snitcher provider (stub-safe without API key)
- Migrations `0039` → `0043`

The two new branches branch FROM `feat/lightfield-quick-wins` (which
holds the WIP scaffolding), so they inherit all prior infrastructure.
