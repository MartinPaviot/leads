# Monaco-Parity P0 Execution Progress

## P0-5 — Deal autofill E2E proof + monitoring

**Branch** : `feat/monaco-parity-p0-5-deal-autofill`
**Status** : ✅ Code-complete — 9 of 10 tasks committed (5.9 deferred)

### Committed

| Task | Commit | Description |
|---|---|---|
| 5.1 | `0f336d4` | Conflict resolution lib (5 rules, 17 tests) |
| 5.2 | `c23af60` | Property accessor backwards-compat + migration 0044 (25 tests) |
| 5.5 | `69feed9` | `GET /api/deals/[id]/property-source/[fieldName]` |
| 5.3+5.4 | `0f1b049` | Cascade pure fn + worker migration (27 tests) |
| 5.6 | `969bde4` | DealPropertyCell tooltip wired into opportunity page (9 tests) |
| 5.7 | `3c47051` | Metrics primitive + autofill counters (6 tests) |
| 5.8+5.10 | `6cb69b5` | Datadog dashboard YAML + RUNBOOK |

### Deferred

| Task | Effort | Blocker |
|---|---|---|
| 5.9 | 0.5j | Prod run validation — needs prod tenant access |

### Tests

- `deal-autofill-conflict-resolution.test.ts` : 17/17 passing
- `deal-autofill-property-accessor.test.ts` : 25/25 passing
- `deal-autofill-apply-signals.test.ts` : 27/27 passing
- `deal-property-cell.test.tsx` : 9/9 passing
- `observability-metrics.test.ts` : 6/6 passing
- Cumulative session : 1996/1997 passing (1 skip), +84 from baseline

### Telemetry

Live as of commit `3c47051` — metrics emit via the structured logger
backend. Datadog dispatcher swap pending the agent sidecar deployment.

### Notes

- Migration `0044_deal_property_metadata_backfill.sql` ships a partial
  index + diagnostic view ; the actual backfill runs through
  `migrateLegacyProperties()` from `lib/deal-autofill/property-accessor.ts`.
- Conflict rule `llm_synthesize` enqueues `deal/property-llm-synthesize`
  events ; the consumer worker is a follow-up ticket.

---

## P0-1 — Sequence drafts queue per-email

**Branch** : `feat/monaco-parity-p0-1-sequence-drafts`
**Status** : 🟡 In progress — 2 of 10 tasks committed

### Committed

| Task | Commit | Description |
|---|---|---|
| 1.1 | `f19a5af` | Migration 0045 + state machine (28 tests) |
| 1.2 | `9afed36` | 5 API routes (list, approve, reject, edit, context) |

### Pending

| Task | Effort | Notes |
|---|---|---|
| 1.3 | 1.5j | `/sequences/review` page + 3 components |
| 1.4 | 1j | `inngest/sequence-draft-router.ts` worker |
| 1.5 | 0.5j | `inngest/sequence-draft-expiry.ts` hourly cron |
| 1.6 | 1j | `inngest/draft-rejection-learner.ts` evaluator-optimizer |
| 1.7 | 1j | Integration tests (approve/reject/expire flows) |
| 1.8 | 0.5j | Playwright E2E |
| 1.9 | 0.5j | Refactor existing autopilot to new flow |
| 1.10 | 0.5j | RUNBOOK + tenant default approvalMode='manual' |

## P0-2 — Visitor ID Snitcher integration

**Branch** : not yet created
**Status** : ⏸️ Blocked — `SNITCHER_API_KEY` not in `_credentials/bootstrap.json`. Snitcher contract signup required (~$500-2000/mo) before code can run.

## P0-3 — Onboarding wizard hardening

**Branch** : not yet created
**Status** : ⏸️ Not started — backbone built in prior sessions on `feat/lightfield-quick-wins` (committed `44d79b6` WIP). Remaining work : production-quality polish, telemetry, copy.

## P0-4 — Coaching transcript-grounded production-ready

**Branch** : not yet created
**Status** : ⏸️ Not started — RAG backbone built in prior sessions (chunking + parser + retrieval + chat tool wired). Remaining : LLM-grounded eval cases, video player surface (Recall.ai-dependent).

---

## Cumulative session context

This branch builds on substantial prior-session work preserved in WIP
commit `44d79b6` (Monaco-parity 01..07 specs, vertical playbooks, AI-UI
primitives, LLM observability wrapper, eval harness, /cs/today queue,
voice-of-customer classifier, onboarding wizard `/onboarding-v3`).

5 P0 sub-spec folders (`_specs/MONACO-PARITY-{01..07}/`) and the
master plan `_specs/MONACO-PARITY-PLAN.md` are the runway.

---

_Last updated_ : 2026-05-07
