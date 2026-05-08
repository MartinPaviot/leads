# Audit checklist — execute top to bottom

> One row = one verifiable assertion. Every row carries the command
> to run, the pass criterion, and the evidence file path. No row is
> "looks ok" — every row is `cmd | tee evidence.txt && grep <expected>`.

## Phase 0 — bootstrap

- [ ] `mkdir -p _reports/audit-2026-05-08/{L1-static,L2-tests,L3-e2e/screenshots,L4-db,L5-workers/trigger-traces,L6-prod-smoke,L7-behavioural}`
- [ ] `git log --oneline 7538e8e..HEAD > _reports/audit-2026-05-08/scope.txt`
  Pass: file lists 74 commits.
- [ ] Calibration A — revert F16 on a throwaway branch :
  `git checkout -b audit-calibration-broken && git revert --no-edit f484f98`
  Run L6 against this branch, expect FAIL on F16. Restore main:
  `git checkout main && git branch -D audit-calibration-broken`.
- [ ] Calibration B — F9 (SHIP_GUIDE) at L1 expects PASS.
  Sanity that the audit isn't false-failing.

---

## Phase 1 — Layer 1 STATIC (cheap, runs in 5 min)

- [ ] `cd app/apps/web && npx tsc --noEmit 2>&1 | tee ../../_reports/audit-2026-05-08/L1-static/tsc-web.txt | grep -cE "error TS"`
  Pass: output is `0`.
- [ ] `cd app/apps/admin && npx tsc --noEmit 2>&1 | tee ../../_reports/audit-2026-05-08/L1-static/tsc-admin.txt | grep -cE "error TS"`
  Pass: output is `0`.
- [ ] `cd app/apps/worker && npx tsc --noEmit 2>&1 | tee ../../_reports/audit-2026-05-08/L1-static/tsc-worker.txt | grep -cE "error TS"`
  Pass: output is `0`.
- [ ] `cd app/apps/web && npx vitest run 2>&1 | tee ../../_reports/audit-2026-05-08/L1-static/vitest.txt | grep -E "Test Files|Tests"`
  Pass: 205 files / 2586 tests / 1 skip / 0 fail.
- [ ] Migration prefix uniqueness :
  `ls app/apps/web/drizzle/00*.sql | sed -E 's|.*/(00[0-9]+)_.*|\1|' | sort | uniq -d > _reports/audit-2026-05-08/L1-static/migration-order.txt`
  Pass: file is empty (0 duplicates).
- [ ] Migration sequence has no gaps :
  `ls app/apps/web/drizzle/00*.sql | wc -l` should equal max prefix + 1 (50 + 1 if 0000 counts).
  Pass: numeric continuity verified (or documented gaps explained).
- [ ] Per-commit file existence :
  for each F1..F17, `git show --stat <commit>` shows files that exist at HEAD.
  Pass: zero "file not in tree" hits.

---

## Phase 2 — Layer 2 UNIT + harden

For each row : write the test, run it (red), implement the fix if
needed, re-run (green), commit. CLAUDE.md §"Every bug → regression
test."

- [ ] Add `app/apps/web/src/__tests__/eval-schema-collision.test.ts` :
  ```ts
  import * as schema from "@/db/schema";
  it("eval_runs and llm_eval_runs are distinct tables", () => {
    expect(schema.evalRuns).toBeDefined();
    expect(schema.llmEvalRuns).toBeDefined();
    expect(schema.evalRuns).not.toBe(schema.llmEvalRuns);
  });
  ```
  Pass: test green.
- [ ] Add `app/apps/web/src/__tests__/csp-allowlist.test.ts` :
  ```ts
  import nextConfig from "../../../next.config";
  // call headers(), assert PostHog hosts in connect-src + script-src
  ```
  Pass: test green ; if next.config exports `default`, adapt import.
- [ ] Extend `app/apps/web/src/__tests__/stall-predictor.test.ts` :
  add per-indicator `evidence.length > 0` assertion for `activity_drop`,
  `one_sided_email`, `intent_cooling`, `no_recent_activity`.
  Pass: 4 new assertions green.
- [ ] Add `app/apps/web/src/components/__tests__/posthog-provider.test.tsx` :
  - With key absent → `trackEvent` is no-op (no posthog.capture spy hit)
  - With key present → `trackEvent` calls `posthog.capture(event, props)` once
  - With userId flipping null → identified → null, `posthog.reset` is called
  Pass: 3 cases green.
- [ ] Diff vitest counts before/after :
  `npx vitest run | grep "Tests" > _reports/audit-2026-05-08/L2-tests/before-after-counts.txt`
  Pass: total ≥ 2590 (was 2586, +4 minimum from above).

---

## Phase 3 — Layer 3 LOCAL E2E (Playwright)

Setup once :
- [ ] `cd app/apps/web && pnpm dev` — wait for `Ready`. Hold this terminal.
- [ ] In a Playwright session, navigate to `http://localhost:3000`. Sign in
  as a test user, capture session cookie. (Per CLAUDE.md, use Playwright
  ourselves, never hand off to Martin.)

### F1 — onboarding wizard polish + autosave + velocity tile

- [ ] Navigate `/onboarding-v3`. `001-onboarding-fresh.png`.
- [ ] Fill phase 1 inputs. `002-onboarding-phase1-filled.png`.
- [ ] `browser_evaluate`: assert localStorage / autosave fired (look at
  `/api/onboarding/save` network traffic via `browser_network_requests`).
  Pass: at least one POST to `/api/onboarding/save` occurred.
- [ ] Hard refresh page. `003-onboarding-after-refresh.png`.
  Pass: phase 1 inputs are restored from autosave.
- [ ] As admin, navigate `/settings/llm-evals`. `004-velocity-tile.png`.
  Pass: velocity tile renders with TTC + per-phase dropoff numbers
  (or a calibrated empty state when no completions yet).

### F2 — coaching grounded + video player + freshness alerts

- [ ] Open a meeting page that has a `recordingUrl` in metadata.
  `010-meeting-with-video.png`.
  Pass: video player renders ; clicking play streams.
- [ ] Click a transcript citation chip `[mm:ss]`.
  `011-citation-clicked.png`.
  Pass: video seeks to that timestamp.
- [ ] Run grounded eval suite manually :
  `npx tsx scripts/run-grounded-eval.ts` (if no script, trigger via
  `/api/admin/eval-runs?suite=transcript-coaching-grounded`).
  Pass: HTTP 200 + run row in `llm_eval_runs` with metrics.

### F3 — speaker-aware transcript retrieval

- [ ] Navigate to chat. Send :
  *"What did Sarah push back on?"* (test meeting must have Sarah-attributed chunks).
  `020-speaker-bias-question.png`.
  Pass: response surfaces Sarah's chunks ranked first ; verify by
  comparing `tool-call-panel` chunk order.

### F4 — eval per-case persistence + admin drilldown

- [ ] Navigate `/settings/llm-evals`. `030-eval-runs-list.png`.
- [ ] Click a run bar. `031-drilldown-open.png`.
  Pass: per-case list renders with passed/failed/errored buckets ;
  output snippets visible.
- [ ] Toggle "Failing only". `032-failing-only.png`.
  Pass: list filters to failed cases only ; URL carries `?onlyFailing=1`.

### F5 — eval prompt-variant A/B framework

- [ ] No user-visible surface — verify framework via test :
  `cd app/apps/web && npx vitest run src/__tests__/eval-prompt-variants.test.ts`
  Pass: framework tests green ; framework is opt-in by suite.

### F6 — deal autofill cascade + LLM synthesise worker

- [ ] Open a deal page with extracted signals. Hover a property cell.
  `040-deal-property-tooltip.png`.
  Pass: tooltip shows `{value, source, date, manual, confidence}` shape.
- [ ] Trigger `signals/extracted` event manually via Inngest dev.
  `041-deal-property-after.png`.
  Pass: property cell now reflects new value with attribution.

### F7 — sequence drafts queue + manual approval mode

- [ ] Set tenant `settings.approvalMode='manual'`. (Or rely on 0046 backfill.)
- [ ] Trigger a sequence step. `050-draft-pending.png`.
  Pass: draft lands in `/sequences/review`.
- [ ] Click Approve. `051-draft-approved.png`.
  Pass: draft transitions to `approved`, send queued.
- [ ] Click Reject on a different draft. `052-reject-modal.png`.
  Fill reason. `053-rejected.png`.
  Pass: enrollment paused, learner event fired.

### F8 — visitor-id complete

- [ ] Hit pixel: `curl -X POST localhost:3000/api/v1/visit/track -d '{...}'`.
  Pass: 200 + visit row inserted with hashed IP + subnet_hash.
- [ ] Trigger `visit/created`. `060-hot-visitors-widget.png`.
  Pass: HotVisitorsWidget renders.
- [ ] Force monthly cap exceeded by inserting `visitor_id_charges` rows
  totalling > tenant cap. Refresh `/home`. `061-cap-banner.png`.
  Pass: cap banner appears.
- [ ] Test dedup: hit pixel twice from same /24, second call doesn't
  increment ledger.
  Pass: 1 charge row, not 2.

### F9 — SHIP_GUIDE doc

- [ ] Read `_specs/SHIP_GUIDE.md`. Confirm internal links resolve
  (RUNBOOKs exist).
  Pass: 5 RUNBOOK links + 9 branch references all valid.

### F10 — TS hygiene (4 spots)

- [ ] Already covered by L1 tsc 0-errors. No additional check.

### F11 — schema split (CRITICAL — covered by L4 too)

- [ ] Navigate `/settings/llm-evals` as admin. `070-llm-evals-loads.png`.
  Pass: page 200, no 500 ; this is the route that *would have crashed*
  before the split.

### F12 — PostHog autocapture + replay

- [ ] Open browser DevTools → Network → filter `posthog`.
  Navigate `/`. `080-posthog-init.png`.
  Pass: GET `/decide/` 200 + POST `/capture/` with `$pageview`.
- [ ] Click a button. `081-posthog-autocapture.png`.
  Pass: `$autocapture` event posted.
- [ ] Sign in. `082-posthog-identify.png`.
  Pass: `$identify` event with userId + traits posted.
- [ ] Sign out. `083-posthog-reset.png`.
  Pass: `posthog.reset()` was called (next event has new distinct_id).

### F13 — boundary-tripped events

- [ ] Force an error in a dashboard route (e.g. break a fetch URL).
  `090-error-boundary.png`.
  Pass: `error_boundary_tripped` event posted with `boundary: "dashboard"`.
- [ ] Force an error in the root tree to hit `global-error.tsx`.
  Pass: same event with `boundary: "global"`.

### F14 — admin app import path

- [ ] `cd app/apps/admin && pnpm dev`. Open `http://localhost:3001/`.
  Visit `/agents/<id>`, `/costs`, `/evals`, `/flywheel`, `/sla`, `/`.
  6 screenshots, one per page.
  Pass: 6 routes return 200, no `Cannot find module` errors.

### F15 — chat_message_sent + home_action_clicked

- [ ] On `/chat`, send a message. Watch network for `posthog/capture`.
  `100-chat-message-event.png`.
  Pass: `chat_message_sent` posted with `queryLength`, `threadId`,
  `hasAttachment`.
- [ ] On `/home`, click an action card. `101-home-action-event.png`.
  Pass: `home_action_clicked` posted with `action`, `priority`,
  `category`.

### F16 — CSP whitelist (CRITICAL — also L6)

- [ ] In dev, response header includes `eu.i.posthog.com` :
  `curl -sI localhost:3000 | grep -i content-security-policy`.
  Pass: `connect-src` line contains `https://eu.i.posthog.com` AND
  `https://eu-assets.i.posthog.com` ; `script-src` contains the
  asset host.

### F17 — stall indicators evidence (mètis)

- [ ] Open a stalled deal page. `110-stall-with-evidence.png`.
  Pass: each indicator chip is followed by an inline bulleted
  evidence list ; no info hidden behind hover only.
- [ ] Compare to commit `e9b95f4`'s screenshot expectation : evidence
  bullets show concrete dates, counts, and intent signals — not
  generic phrasing.

### Browser console hygiene

After each F-row, run `browser_console_messages` and store output to
`_reports/audit-2026-05-08/L3-e2e/console-F<n>.txt`.
Pass per F : 0 entries with `level: "error"`.

---

## Phase 4 — Layer 4 DB introspection

Setup :
- [ ] `docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=audit --name audit-fresh postgres:16`
- [ ] `docker run --rm -d -p 5434:5432 -e POSTGRES_PASSWORD=audit --name audit-legacy postgres:16`
- [ ] In each : `CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS vector;`

Fresh replay :
- [ ] `for f in app/apps/web/drizzle/00*.sql; do PGPASSWORD=audit psql -h localhost -p 5433 -U postgres -f "$f" 2>&1; done | tee _reports/audit-2026-05-08/L4-db/fresh-replay.txt`
  Pass: zero `ERROR:` lines.

Legacy replay :
- [ ] Apply 0001-0043 only first.
- [ ] Insert one row into legacy `eval_runs` (0004 shape : `tenant_id`, `dataset_id`, `model`, `grader_model`, `summary`).
- [ ] Apply 0044-0050.
  `tee _reports/audit-2026-05-08/L4-db/legacy-replay.txt`
  Pass: zero `ERROR:` ; legacy row preserved (`SELECT count(*) FROM eval_runs` returns 1) ; new `llm_eval_runs` exists empty.

Verify queries :
- [ ] Run `verify.sql` (defined in `design.md` §L4) against both DBs.
  Pass: every query returns the expected shape (see design.md).

Cleanup :
- [ ] `docker rm -f audit-fresh audit-legacy`

---

## Phase 5 — Layer 5 worker dispatch

Setup :
- [ ] `npx inngest dev` running. Open `http://localhost:8288`.
- [ ] Inngest registry screenshot :
  `browser_navigate http://localhost:8288/functions` →
  `001-inngest-registry.png`.
  Pass: 60+ functions listed including the 7 new workers from this session.

Per-worker trigger (use Inngest dev "Send Event") :

- [ ] `routeSequenceStepToDraft` ← `sequence/step-due` (manual mode payload).
  Verify: `sequence_drafts` row inserted.
- [ ] `cronExpireSequenceDrafts` ← run "Invoke" button.
  Verify: drafts > 72h pending → `expired`.
- [ ] `draftRejectionLearner` ← `sequence_drafts.rejected` payload.
  Verify: `sequences.campaignConfig.rejectionInsights` updated.
- [ ] `dealPropertyLlmSynthesize` ← `deal/property-llm-synthesize`.
  Verify: deal property metadata enriched.
- [ ] `identifyVisit` ← `visit/created`.
  Verify: charge ledger row + identification row.
- [ ] `dailyTranscriptFreshnessAlert` ← invoke.
  Verify: notification when bot status degraded ; if no degraded
  bot, verify the worker runs to completion without error.
- [ ] `weeklyEvalHarness` ← invoke.
  Verify: `llm_eval_runs` rows for each registered surface.

Each : save the Inngest run trace JSON to
`_reports/audit-2026-05-08/L5-workers/trigger-traces/F<n>-<worker>.json`.

Pass criteria : 7 of 7 workers fire to completion with the expected
DB side effect.

---

## Phase 6 — Layer 6 production smoke

Pre-req (Martin's task) :
- [ ] Push `main` to `origin` as a non-prod branch (e.g. `audit/2026-05-08`).
- [ ] Vercel produces a deploy preview URL. Capture it.

Smoke (run from Playwright against the preview URL) :

- [ ] `/` returns 200, browser console clean. `001-prod-landing.png`.
  Network: PostHog `$pageview` to `eu.i.posthog.com` 200.
- [ ] `curl -sI <preview>/sign-in | grep -i content-security-policy > _reports/audit-2026-05-08/L6-prod-smoke/csp.txt`
  Pass: response header contains both `eu.i.posthog.com` allowlist entries.
- [ ] `/sign-in` 200, password input is auto-masked (replay-safe).
- [ ] `/onboarding-v3` 200, autosave fires.
- [ ] `/home` 200, click an action → PostHog `home_action_clicked`.
- [ ] `/sequences/review` 200, list renders.
- [ ] `/opportunities` 200, risk badges render.
- [ ] `/opportunities/[id]` 200, stall evidence inline.
- [ ] `/chat` 200, send → PostHog `chat_message_sent`.

PostHog dashboard (Martin) :
- [ ] Open eu.i.posthog.com dashboard for the project.
- [ ] Filter events by audit window (last 30 min).
  Screenshot list. `010-posthog-events.png`.
  Pass: `$pageview`, `chat_message_sent`, `home_action_clicked`,
  `error_boundary_tripped`, `$autocapture` all present.
- [ ] Open Session Replay tab. `011-posthog-replay.png`.
  Pass: at least one recording from the audit window ; all `<input>`
  values masked (visible as `***`).
- [ ] Open Person profile for the test user. `012-posthog-person.png`.
  Pass: `email`, `name`, `tenantName` traits set.

---

## Phase 7 — Layer 7 behavioural (over time)

Schedule (Martin runs weekly) :

- [ ] Mon 02:30 UTC after deploy : `SELECT count(*) FROM llm_eval_runs WHERE created_at >= '<monday>'`
  Pass: at least one row per registered surface.
- [ ] Daily for first week : check `notifications` for transcript freshness alerts.
- [ ] On day 4 : insert a draft 73h old, verify cron expires it.
- [ ] After 5 rejections in a week : query `sequences.campaignConfig`
  → `rejectionInsights` field updated.
- [ ] On the 1st of next month : verify `visitor_id_charges` window
  starts fresh (cap counter resets).

Append to `_reports/audit-2026-05-08/L7-behavioural/log.md` after
each check.

---

## Phase 8 — synthesise verdict

- [ ] Aggregate every PASS/FAIL into `_reports/audit-2026-05-08/SUMMARY.md`.
  Format per feature :
  ```
  ## F<n> — <feature> — <commit>
  | Dimension | Score | Evidence |
  |---|---|---|
  | Functional | 0.X | _reports/audit-2026-05-08/L3-e2e/screenshots/F<n>/... |
  | Integration | 0.X | ... |
  | Failure modes | 0.X | ... |
  | Observability | 0.X | ... |
  | UX | 0.X | ... |
  | **Mean** | 0.X | |

  Verdict: **PASS** / **FAIL** / **PASS-with-followup**
  ```
- [ ] Compute global verdict :
  - All features at mean ≥ 0.85 AND no dimension < 0.7 → **GO**
  - Any feature at mean 0.7–0.85 → **GO with patches** (list patches)
  - Any feature at mean < 0.7 → **NO-GO** (block push)
- [ ] If GO : tag head commit `audit-2026-05-08-pass`.
- [ ] If GO with patches : write the patch list at top of SUMMARY.md.
- [ ] If NO-GO : list blockers, do NOT push.

---

## Out-of-band : push decision

After **GO** verdict only :

- [ ] `git push origin main` (the 16 commits land on remote).
- [ ] Vercel triggers prod deploy.
- [ ] Re-run L6 against prod URL (10 min). Re-store evidence under
  `_reports/audit-2026-05-08/L6-prod-smoke/post-deploy/`.
- [ ] Confirm L6 still PASS in prod ; if not, immediately roll back
  via Vercel + tag `audit-2026-05-08-rolled-back`.
