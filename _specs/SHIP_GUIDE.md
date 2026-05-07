# Ship guide — Monaco-Parity P0 + cross-cutting follow-ups

This guide walks through merging the 9 feature branches produced
during the Monaco-parity build session. Read it once before
starting the merge train ; the order matters because of migration
sequencing + a small number of files touched on multiple branches.

## TL;DR

```
1. Verify migration numbering
2. Provision env vars (OPTIONAL = ship-safe without them)
3. Merge in dependency order :
     P0-3 (no migration, polish)
   → P0-4 (no migration, eval suite + cron + tile)
   → speaker-aware retrieval (no migration)
   → eval-per-case persistence (migration 0047)
   → eval-prompt-variants (no migration, harness extension)
   → P0-5 deal autofill (migration 0044)
   → P0-1 sequence drafts (migrations 0045 + 0046)
   → P0-2 visitor-id (migrations 0048 + 0049)
4. Run drizzle-migrate against staging
5. Smoke tests (per-merge checklist below)
6. Watch Datadog dashboards for 24h
```

## Branch inventory

| Branch | Commits | Migrations | Notes |
|---|---|---|---|
| `feat/monaco-parity-p0-1-sequence-drafts` | 11 | 0045, 0046 | Sequence drafts queue, manual approval mode |
| `feat/monaco-parity-p0-2-snitcher` | 12 | 0048, 0049 | Visitor-ID, charge ledger, providers |
| `feat/monaco-parity-p0-3-onboarding` | 11 | — | 7-phase wizard polish + autosave + velocity tile |
| `feat/monaco-parity-p0-4-coaching` | 9 | — | Grounded eval, video player, freshness cron, tenant fixtures |
| `feat/monaco-parity-p0-5-deal-autofill` | 9 | 0044 | Deal property cascade + LLM synthesis worker |
| `feat/eval-per-case-persistence` | 4 | 0047 | Per-case eval rows + drilldown UI |
| `feat/coaching-speaker-aware-retrieval` | 1 | — | Speaker-bias rerank for transcript chunks |
| `feat/eval-prompt-variants` | 1 | — | EvalSuiteFamily + variant comparison |

Total : ~57 commits, ~683 new tests, 5 migrations (0044-0049),
9 Inngest workers added/modified, 27+ pure libs, 11+ API routes.

## Pre-merge sanity check

```bash
# From repo root, with each branch checked out :
git log feat/monaco-parity-p0-{1,2,3,4,5}-* --oneline | wc -l
# Expect ≥ 50 across all 5

# Verify migration files don't collide :
ls app/apps/web/drizzle/00{43,44,45,46,47,48,49}_*.sql
# 0043 is pre-existing, 0044-0049 belong to these branches
```

## Migration order + ownership

| File | Branch | Adds |
|---|---|---|
| `0044_deal_property_metadata_backfill.sql` | P0-5 | Partial index + diagnostic view |
| `0045_sequence_drafts.sql` | P0-1 | sequence_drafts table + status enum |
| `0046_tenant_approval_mode_default.sql` | P0-1 | Backfills `settings.approvalMode='manual'` + view |
| `0047_eval_case_runs.sql` | eval-per-case | eval_case_runs table + view |
| `0048_visits_subnet_hash.sql` | P0-2 | Adds `visits.subnet_hash` column + partial index |
| `0049_visitor_id_charges.sql` | P0-2 | visitor_id_charges table + view |

All migrations are idempotent (`IF NOT EXISTS`) — safe to re-run.

## Environment variables

The codebase is **stub-safe** : missing env vars cause graceful
degradation (provider returns null, eval suite errors per-case
instead of crashing, etc.). Provision incrementally :

| Variable | Owner branch | Effect when missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | P0-4 (eval), P0-5 (synthesis) | Eval suites + synthesis worker error per-case ; existing surfaces fall back to OpenAI |
| `OPENAI_API_KEY` | P0-4 fallback | When both keys missing, LLM-driven workers report "LLM_KEY_MISSING" cleanly |
| `SNITCHER_API_KEY` | P0-2 default provider | identifyVisit returns `provider_unavailable` ; pixel still records visits |
| `RB2B_API_KEY` | P0-2 alternate | Tenants who set `visitorIdProvider=rb2b` fall back to Snitcher |
| `CLEARBIT_API_KEY` | P0-2 alternate | Same — falls back to Snitcher |
| `DATABASE_URL` | All | Required for all workers ; no graceful path |
| `DD_API_KEY` | Observability | Metrics route through structured logger instead of Datadog Statsd (`lib/observability/metrics.ts` swap point exists) |

## Recommended merge order

The order minimises conflicts (each branch touches a distinct
surface area mostly) and lets you smoke-test in isolation.

### Phase A — UI / polish (no schema change)

1. **P0-3 onboarding** (`feat/monaco-parity-p0-3-onboarding`)
   - Touches : wizard component, onboarding API state, autosave
     helper, velocity tile (settings/llm-evals).
   - Smoke : visit `/onboarding-v3`, type in any phase, refresh —
     draft restored. Visit `/settings/llm-evals` as admin — see
     velocity tile (or "0 started" hide). PostHog : `onboarding_v3_phase_submitted`
     events fire on phase change.

2. **P0-4 coaching** (`feat/monaco-parity-p0-4-coaching`)
   - Touches : meeting page (recording player), grounded eval
     suite, freshness cron, tenant-fixture overlay.
   - Smoke : visit a meeting with a Recall.ai recording URL in
     metadata — player renders. Trigger `daily-transcript-freshness-alert`
     manually via Inngest UI — receive notifications when degraded /
     silent. `runGroundedCoachingEvalProd` runs in next Monday cron
     (or trigger manually).

3. **Speaker-aware retrieval** (`feat/coaching-speaker-aware-retrieval`)
   - Touches : `retrieveTranscriptChunks` + chat tool.
   - Smoke : ask the chat panel "what did Sarah push back on?"
     against a meeting that has Sarah-attributed chunks — expect
     Sarah's chunks ranked first.

### Phase B — Eval infrastructure

4. **eval-per-case persistence** (`feat/eval-per-case-persistence`)
   - Migration 0047 (eval_case_runs table).
   - Touches : harness, admin drilldown API, dashboard panel.
   - Smoke : after the next eval cron run, `/settings/llm-evals`
     bars are clickable → drilldown panel shows per-case detail.

5. **eval-prompt-variants** (`feat/eval-prompt-variants`)
   - Touches : harness only — adds `EvalSuiteFamily` + runner.
   - Smoke : no user-visible change ; the framework is opt-in.
     Build a 2-variant family in any suite to validate.

### Phase C — Schema + workers

6. **P0-5 deal autofill** (`feat/monaco-parity-p0-5-deal-autofill`)
   - Migration 0044 (partial index + view).
   - Touches : deal-signal-sync worker, llm-synthesize worker,
     opportunities page (DealPropertyCell tooltip).
   - Smoke : run a signals/extracted event manually — deal
     properties get the new `{ value, source, date, manual,
     confidence }` shape. Hover the deal page property cell —
     tooltip shows attribution + history.

7. **P0-1 sequence drafts** (`feat/monaco-parity-p0-1-sequence-drafts`)
   - Migrations 0045 + 0046 (sequence_drafts + tenant approvalMode).
   - Touches : sequence-draft-router worker, expiry cron, rejection
     learner, /sequences/review page, legacy [id]/review redirect.
   - Smoke : flip a tenant to approvalMode='manual' (or rely on the
     0046 backfill), wait for cron — draft lands in
     `/sequences/review`. Approve → email queued. Reject → learner
     fires.

8. **P0-2 visitor-id** (`feat/monaco-parity-p0-2-snitcher`)
   - Migrations 0048 + 0049 (subnet_hash + charges).
   - Touches : pixel endpoint, identifyVisit worker, hot-visitors
     widget, dashboard cap-warning banner, sequence-trigger panel.
   - Smoke : hit the pixel from two different IPs in the same /24
     subnet — only one paid lookup. Cap reached → banner appears
     on `/home`.

## Conflict resolution

The branches mostly touch distinct files. The known overlap :

- **`app/api/inngest/route.ts`** : 4 branches register new workers
  here (P0-1 routes 3 workers, P0-2 modifies the existing
  identifyVisit, P0-4 adds freshness cron, P0-5 adds llm-synth
  worker). Each merge appends to the `functions: [...]` array ;
  Git auto-merges line-additions cleanly. Resolve by keeping all
  registrations.

- **`app/apps/web/src/lib/evals/harness.ts`** : the
  eval-per-case branch + eval-prompt-variants both extend it.
  Per-case adds the `evalCaseRuns` insert to `runEvalSuite` ;
  variants adds `EvalSuiteFamily` + `runEvalSuiteFamily` types.
  No line-level conflict ; the variants branch builds on top of
  per-case so merge per-case first.

## Smoke tests after the merge train

```bash
# Vitest end-to-end (after every merge, expect monotonic increase)
cd app/apps/web && npx vitest run

# Drizzle migrations against staging
npx drizzle-kit migrate

# Inngest dashboard
# Verify the new functions are registered :
#  - route-sequence-step-to-draft
#  - cron-expire-sequence-drafts
#  - sequence-draft-rejection-learner
#  - deal-property-llm-synthesize
#  - daily-transcript-freshness-alert

# PostHog event funnel
# Confirm new events show up :
#  - onboarding_v3_phase_submitted
#  - onboarding_v3_completed
#  - onboarding_started / onboarding_resumed

# Datadog dashboards
# - deal-autofill (P0-5 RUNBOOK ships YAML)
# - visitor_id.* metrics (cap_reached, dedup_hit, monthly_spend_usd)
# - transcript_freshness.* (evaluated, alerted, notification_sent)
# - sequence_drafts.* (rejected, expired, insight_emitted)
```

## Rollback strategy per branch

Every change is reversible :

| Concern | Rollback |
|---|---|
| Migration | Each migration is idempotent ADD ; drop columns / tables to revert. View definitions are CREATE OR REPLACE so safe to re-run. |
| Inngest worker | Remove from `app/api/inngest/route.ts`'s `functions: [...]` array → Inngest stops scheduling it. Already-queued events drain into the void. |
| API route | Delete the file ; route 404s. UIs that depend on it surface the error fallback (already wired for the new endpoints). |
| UI component | Remove the import + render ; component tests stay green. |
| Schema enum extension | None added — every new column / table is purely additive. |

## Open follow-ups (NOT in this train)

- **Playwright E2E** : P0-1 task 1.8 deferred. Needs an E2E
  harness ; recommended to land alongside a CI matrix change.
- **P0-5 prod tenant validation** : task 5.9 deferred. Needs a
  prod tenant + access to verify the cascade lands real data.
- **Datadog Statsd dispatcher swap** : the metrics primitive
  routes through the structured logger today. The dispatcher
  swap is one line in `lib/observability/metrics.ts` ; gated on
  the Datadog agent sidecar deploy (separate infra ticket).

## Documents

- Per-P0 RUNBOOK : `_specs/MONACO-PARITY-P0-{1,2,3,4,5}-RUNBOOK.md`
  Each carries the data-flow diagram, alarm playbook, manual ops,
  test coverage map, and open issues.
- Datadog dashboard : `app/apps/web/datadog/dashboards/deal-autofill.yaml`
  (Terraform-provisioned via the `datadog_dashboard_json`
  resource).

_Last updated_ : 2026-05-08.
