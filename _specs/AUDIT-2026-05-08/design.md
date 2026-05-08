# Audit architecture — 7-layer stack, cheap → expensive

The audit is layered so we exhaust cheap checks before paying for
expensive ones. A failure at L1 means we don't bother running L2.
A failure at L4 (DB introspection) means L5 (worker dispatch) is
running on a broken foundation, so we fix L4 first.

## Layer overview

| Layer | What it answers | Cost | Tooling |
|---|---|---|---|
| **L1 Static**     | Does it compile + tests pass ? | minutes | tsc, vitest, ls |
| **L2 Unit + integration** | Per-feature logic + new regressions | minutes | vitest |
| **L3 Local E2E**  | Does the user journey work in a browser ? | hours | Playwright + dev server |
| **L4 DB introspection** | Does the schema actually match expectations after every migration ? | 30 min | drizzle-kit, raw SQL |
| **L5 Worker dispatch** | Are Inngest functions registered + invokable ? | 1 hour | Inngest dev server |
| **L6 Production smoke** | Does the prod build serve everything cleanly ? | 30 min | Vercel deploy preview, browser console, PostHog dashboard |
| **L7 Behavioural**| Do crons + learners actually evolve state over time ? | days | observation + scheduled re-checks |

A feature is fully audited when it has evidence at every applicable
layer. Some features skip layers — F9 (SHIP_GUIDE) is doc-only and
only needs L1 (markdown lint, links resolve) ; F12 (PostHog
provider) skips L4 (no migration) but is critical at L6 (does the
SDK actually load + identify in prod).

## Layer detail

### L1 Static — already mostly green, formalise the baseline

**What runs**

- `cd app/apps/web && npx tsc --noEmit` → 0 errors expected
- `cd app/apps/admin && npx tsc --noEmit` → 0 errors expected
- `cd app/apps/worker && npx tsc --noEmit` → 0 errors expected
- `cd app/apps/web && npx vitest run` → 205 files / 2586 tests pass / 1 skip
- Migration ordering check : no two SQL files share the same `00NN_`
  prefix
- File-existence check : every commit's claimed-new file exists at HEAD

**Evidence files** :
`_reports/audit-2026-05-08/L1-static/{tsc-web,tsc-admin,tsc-worker,vitest,migration-order,commit-files}.txt`

**Pass criteria** : all six artifacts present + assertions hold.

### L2 Unit + integration — verify + harden

For every feature where we noticed a regression-class issue during
the audit, **add a vitest case** that pins the new contract :

| Concern | New regression test |
|---|---|
| F11 schema split | `eval-schema-collision.test.ts` — assert `schema.evalRuns` and `schema.llmEvalRuns` resolve to *different* table names |
| F16 CSP allowlist | `csp-allowlist.test.ts` — given the `next.config.ts` headers function, assert `eu.i.posthog.com` appears in `connect-src` AND `script-src` |
| F17 stall evidence | already covered (extended `stall-predictor.test.ts:189-193`) — assert `evidence.length > 0` for `time_in_stage` ; extend to other indicator types |
| F12 PostHog provider | `posthog-provider.test.tsx` — given missing key, `trackEvent` is a no-op ; given key present, `posthog.capture` called once per call |

**Evidence** : the new test files committed to `app/apps/web/src/__tests__/`,
plus `_reports/audit-2026-05-08/L2-tests/before-after-counts.txt`
(test count delta).

**Pass criteria** : new tests added cover at least 4 of the listed
concerns ; total vitest count goes from 2586 → 2586+N where N ≥ 4.

### L3 Local E2E — Playwright on the dev server

CLAUDE.md mandates **screenshot before, action, screenshot after**
on every interaction with our own product during evaluation. The
audit follows this strictly.

**Setup** : `cd app/apps/web && pnpm dev` (Turbopack). Wait for
`Ready in Nms` line. Hit `http://localhost:3000`.

**Per-feature journey** : each F-row in `tasks.md` carries 1-3
Playwright sequences. The contract per sequence :

```
1. browser_navigate → target URL
2. browser_take_screenshot → 001-before-action.png
3. browser_click / browser_fill_form / browser_press_key → action
4. browser_wait_for → expected text or selector
5. browser_take_screenshot → 002-after-action.png
6. browser_evaluate → assertion against window state if needed
```

**Evidence** : screenshots in
`_reports/audit-2026-05-08/L3-e2e/screenshots/F<n>-<feature>/NNN-<step>.png`,
findings in `_reports/audit-2026-05-08/L3-e2e/findings.md`.

**Browser console** must be clean of red errors at the end of every
journey — `browser_console_messages` after each.

**Pass criteria** : every feature with a UI surface has at least
one before/after screenshot pair AND no red console error.

### L4 DB introspection — replay every migration

The schema-collision bug (F11) was invisible to vitest because
tests mock `@/db`. The only way to be certain that migrations 0044-0050
land in production cleanly is to replay them against a fresh
database AND against a database that has the legacy 0004 `eval_runs`
table populated (the production state).

**Setup** : two ephemeral Postgres instances via `docker run`
(or Vercel Postgres branch). Name them `audit-fresh` and
`audit-legacy`.

`audit-fresh` :
- `psql -f drizzle/0001_*.sql` … in order through 0050.
- Expected : every migration applies, no errors.

`audit-legacy` :
- Apply 0001-0043 (legacy state).
- Pre-populate `eval_runs` (legacy 0004 shape) with one row to
  prove the FK split in 0050 doesn't lose data.
- Apply 0044-0050.
- Expected : `eval_case_runs` is renamed to `llm_eval_case_runs`,
  the legacy `eval_runs` row is preserved, the new `llm_eval_runs`
  table exists empty, the view `llm_eval_runs_latest_with_failures`
  resolves, the FK on `llm_eval_case_runs.run_id` points at
  `llm_eval_runs(id)` not `eval_runs(id)`.

**Verification queries** (saved as `verify.sql`) :

```sql
-- F11: schema split
SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('eval_runs','llm_eval_runs','eval_case_runs','llm_eval_case_runs');
-- Expect: eval_runs, llm_eval_runs, llm_eval_case_runs (no eval_case_runs)

-- F11: FK target
SELECT conname, confrelid::regclass FROM pg_constraint WHERE conname='llm_eval_case_runs_run_id_fkey';
-- Expect: confrelid = llm_eval_runs

-- F11: view definition
SELECT pg_get_viewdef('llm_eval_runs_latest_with_failures', true);
-- Expect: references ler.surface_id, joins llm_eval_case_runs

-- F7: tenant approvalMode default
SELECT settings->>'approvalMode' FROM tenants WHERE settings->>'approvalMode' IS NOT NULL LIMIT 5;
-- Expect: 'manual' for the rows that 0046 backfilled

-- F8: visits.subnet_hash column + partial index
SELECT column_name FROM information_schema.columns WHERE table_name='visits' AND column_name='subnet_hash';
SELECT indexname FROM pg_indexes WHERE tablename='visits' AND indexdef LIKE '%subnet_hash%';
-- Expect: subnet_hash present + index present

-- F8: visitor_id_charges table
SELECT count(*) FROM information_schema.columns WHERE table_name='visitor_id_charges';
-- Expect: > 0
```

**Evidence** : `_reports/audit-2026-05-08/L4-db/{fresh-replay,legacy-replay,verify-fresh,verify-legacy}.txt`.

**Pass criteria** : both replays succeed end-to-end ; all verify
queries return the expected rows.

### L5 Worker dispatch — Inngest dev server

Every new worker added in this session must be (a) registered in
the `functions: [...]` array of `app/api/inngest/route.ts` and (b)
actually fire when its trigger event is sent.

**Setup** : `npx inngest dev` against the running web server.
Open `http://localhost:8288`.

**Per-worker check** :

| Worker | Trigger event | Expected effect |
|---|---|---|
| `routeSequenceStepToDraft` | `sequence/step-due` (manual mode) | `sequence_drafts` row inserted with `pending_approval` |
| `cronExpireSequenceDrafts` | (cron) | drafts > 72h flip to `expired` |
| `draftRejectionLearner` | `sequence_drafts.rejected` | `sequences.campaignConfig.rejectionInsights` updated |
| `dealPropertyLlmSynthesize` | `deal/property-llm-synthesize` | property metadata `{value, source, date, manual, confidence}` written |
| `identifyVisit` | `visit/created` | charge ledger row + `visit_identifications` row |
| `dailyTranscriptFreshnessAlert` | (cron) | notification when bot_status in {degraded, silent} |
| `weeklyEvalHarness` | (cron) | `llm_eval_runs` rows inserted per surface/suite |

For each, fire the trigger from the Inngest dev UI ("Send Event"),
wait for completion, query the expected DB side-effect.

**Evidence** : `_reports/audit-2026-05-08/L5-workers/{trigger-traces,inngest-registry-screenshot.png}/...`

**Pass criteria** : 7 of 7 workers fire AND produce the expected
side effect.

### L6 Production smoke — Vercel deploy preview

This is the layer that catches **CSP regressions, env-var typos,
and Google-Fonts-style env breakage**. It runs against a deploy
preview URL — not main, not local — to mimic the real prod
config.

**Pre-req** : Martin pushes `main` to a non-prod branch on
`origin` ; Vercel produces a preview URL. (This is the only
manual hand-off in the audit.)

**Per-surface smoke** :

| Surface | Verify |
|---|---|
| `/` (landing) | 200, no console error, PostHog `$pageview` posts to `eu.i.posthog.com` |
| `/sign-in` | 200, password field is `type=password` (auto-masked by replay), no CSP violation |
| `/onboarding-v3` | 200, autosave fires `/api/onboarding/save` on input |
| `/home` | 200, `home_action_clicked` PostHog event fires when an action card is clicked |
| `/sequences/review` | 200, drafts list renders (or empty state if no drafts) |
| `/opportunities` | 200, risk badges + tooltips render |
| `/opportunities/[id]` | 200, stall evidence list renders inline (not tooltip-only) |
| `/chat` | 200, `chat_message_sent` PostHog event fires with queryLength + threadId on send |

**Browser console** must be clean (no CSP violation, no JS error).

**PostHog dashboard** check (Martin's task — needs eu.i.posthog.com
access) :
- Events from the last 10 minutes include `$pageview`,
  `chat_message_sent`, `home_action_clicked`, `error_boundary_tripped`
  (the last requires triggering an error in Playwright).
- Session replay tab shows at least one recording with
  inputs visibly masked.
- Person profile shows the test user's `email`, `name`,
  `tenantName` traits.

**Evidence** : `_reports/audit-2026-05-08/L6-prod-smoke/{network-har.json,console-clean.png,posthog-events.png,posthog-replay.png}`.

**Pass criteria** : 8 of 8 surfaces 200 + clean console + PostHog
dashboard shows the expected events from the audit window.

### L7 Behavioural — over time

Some features can only be verified in prod over days/weeks :

| Concern | Verification |
|---|---|
| Weekly eval cron actually runs Monday 02:00 UTC | Check `llm_eval_runs` table for new rows ≥ Monday |
| Daily transcript freshness alert | Check `notifications` table for new rows when a Recall.ai bot is degraded |
| Sequence draft expiry cron at 72h | Insert a draft, wait 72h, verify `expired` state |
| Rejection learner accumulates insights | Reject 5 drafts over a week, query `sequences.campaignConfig.rejectionInsights` |
| Visitor-ID monthly cap rolls over on 1st of month | Verify spend resets at month boundary |
| Session replay retention works | Check that replays from 30+ days ago are evictable per PostHog config |

**Evidence** : `_reports/audit-2026-05-08/L7-behavioural/log.md` —
appended over time.

**Pass criteria** : verifications happen on schedule ; no silent
worker drops detected over 7-day window.

## Tooling required

| Tool | Used in | Source |
|---|---|---|
| `tsc`, `vitest` | L1, L2 | already in `package.json` |
| `drizzle-kit` | L4 | already in deps |
| `psql` (or any pg client) | L4 | local install / docker |
| Playwright + chromium | L3, L6 | per CLAUDE.md ; Martin already has via MCP |
| `npx inngest dev` | L5 | already available |
| Real `SNITCHER_API_KEY` | L5 (F8 worker live test) | Martin's vault |
| `ANTHROPIC_API_KEY` | L5 (F2 + F6 LLM workers) | already in `.env.local` |
| Vercel deploy preview | L6 | Martin pushes branch |
| PostHog EU dashboard | L6 | Martin's account |

The only items not under the audit-runner's direct control are the
Vercel preview URL (deploy-time) and the PostHog dashboard (visual
check). Everything else is scripted.

## Evidence storage convention

```
_reports/audit-2026-05-08/
├── scope.txt                           # git log range that defines the audit
├── SUMMARY.md                          # final verdict per feature, signed
├── L1-static/
│   ├── tsc-web.txt
│   ├── tsc-admin.txt
│   ├── tsc-worker.txt
│   ├── vitest.txt
│   ├── migration-order.txt
│   └── commit-files.txt
├── L2-tests/
│   └── before-after-counts.txt        # test count delta
├── L3-e2e/
│   ├── findings.md                    # one entry per discrepancy
│   └── screenshots/
│       └── F<n>-<feature>/NNN-*.png
├── L4-db/
│   ├── fresh-replay.txt               # output of fresh migration sequence
│   ├── legacy-replay.txt              # output against pre-populated db
│   ├── verify-fresh.txt               # rows returned by verify.sql
│   └── verify-legacy.txt
├── L5-workers/
│   ├── inngest-registry-screenshot.png
│   └── trigger-traces/
│       └── F<n>-<worker>.json
├── L6-prod-smoke/
│   ├── network-har.json
│   ├── console-clean.png
│   ├── posthog-events.png
│   └── posthog-replay.png
└── L7-behavioural/
    └── log.md                         # appended weekly
```

Every screenshot saved with sequential numbering per CLAUDE.md
mandate (`001-`, `002-`, …) so the order of operations is preserved
in the directory listing.

## Failure escalation

A feature scoring below the 0.7 dimension floor :

| Score | Action |
|---|---|
| < 0.5 | Block push to origin. Open issue, fix, re-run that feature's audit slice before push. |
| 0.5 – 0.7 | File a regression test that proves the gap, decide patch vs ship-and-fix in SHIP_GUIDE follow-ups. |
| 0.7 – 0.85 | Document the gap in `SHIP_GUIDE.md` "open follow-ups", ship anyway. |
| ≥ 0.85 | PASS. Move on. |

The patch-vs-ship decision uses Martin's no-human-replacement +
detail-over-vision principles : if the gap is *visible to the user
at first paint*, patch ; if it's *operational telemetry only*,
ship-and-fix.

## Budget

| Layer | Active time | Wall time |
|---|---|---|
| L1 | 5 min | 5 min |
| L2 | 30 min (write 4+ regression tests) | 30 min |
| L3 | 90 min (16 features × ~5 min) | 90 min |
| L4 | 30 min (replay + verify) | 30 min |
| L5 | 60 min (7 worker triggers) | 60 min |
| L6 | 30 min (after deploy preview ready) | 30 min + deploy lag |
| L7 | 5 min/check × 8 weekly checks | 7 days |

**Total active : ~3.5 hours pre-deploy, ~7 days for the L7
behavioural window.**

## Calibration check

Per CLAUDE.md §Phase 0 (Calibrate), the audit's discriminating
power must itself be tested *before* the audit runs in anger :

1. Plant a known-broken feature (e.g. revert the CSP fix at `f484f98`
   on a throwaway branch) and run L6 smoke.
   Expected : F16 fails L6, surfacing in the SUMMARY as NO-GO.
2. Plant a known-clean feature (e.g. F9 doc) and run L1.
   Expected : F9 PASS at L1, no escalation.

If the audit can't tell broken from clean, the audit itself is
broken. Recalibrate before trusting any verdict.
