# Monaco-Parity P0 Execution Progress

## P0-5 — Deal autofill E2E proof + monitoring

**Branch** : `feat/monaco-parity-p0-5-deal-autofill`
**Status** : 🟡 In progress — 3 of 10 tasks committed

### Committed

| Task | Commit | Description |
|---|---|---|
| 5.1 | `0f336d4` | Conflict resolution lib (5 rules, 17 tests) |
| 5.2 | `c23af60` | Property accessor backwards-compat + migration 0044 (25 tests) |
| 5.5 | `69feed9` | `GET /api/deals/[id]/property-source/[fieldName]` |

### Pending (in-branch backlog)

| Task | Effort | Blocker |
|---|---|---|
| 5.3 | 1j | E2E test budget extraction — needs Postgres test setup + Inngest test harness |
| 5.4 | 1j | E2E extended to 5 more fields |
| 5.6 | 1j | UI tooltip on `/opportunities/[id]/page.tsx` (`<DealPropertyCell>`) |
| 5.7 | 0.5j | Datadog metrics in `inngest/deal-signal-sync.ts` |
| 5.8 | 0.5j | Datadog dashboard YAML |
| 5.9 | 0.5j | Prod run validation — needs prod tenant access |
| 5.10 | 0.5j | RUNBOOK.md doc |

### Tests

- `deal-autofill-conflict-resolution.test.ts` : 17/17 passing
- `deal-autofill-property-accessor.test.ts` : 25/25 passing
- Cumulative session : 1912/1913 passing (1 skip)

### Telemetry

Pending — task 5.7 instruments `metrics.increment("deal_autofill.field_updated")` and `metrics.histogram("deal_autofill.confidence")` in the cascade worker.

### Notes

- Migration `0044_deal_property_metadata_backfill.sql` ships a partial index + diagnostic view ; the actual backfill runs through `migrateLegacyProperties()` from `lib/deal-autofill/property-accessor.ts` (single source of truth — DB function would diverge).
- Conflict rule `llm_synthesize` is sync-placeholder for now ; the worker enqueues an async LLM round-trip when `requiresLlmSynthesis(field)` is true (task wiring still pending in 5.7).

---

## P0-1 — Sequence drafts queue per-email

**Branch** : not yet created
**Status** : ⏸️ Not started — queued after P0-5

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
