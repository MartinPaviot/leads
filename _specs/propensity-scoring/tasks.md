# Tasks — Propensity scoring

Phased so we MEASURE before we rebuild. Each task: implement → verify → test → commit.

## Phase A — measure + explain (ship first; proves the problem, pays immediately)

- [x] **A1 — Score snapshots** (BUILT, not runtime-verified — apply migration + smoke)
  - Migration: `score_snapshots` (tenantId, entityType, entityId, grade, score,
    event, eventRef, at). Thin hook at call-attempt / sequence-enroll / email-sent
    creation writes the LIVE grade. Immutable.
  - Verify: a call attempt creates exactly one snapshot with the grade then-current.
  - Test: hook unit (writes snapshot; no back-dating).

- [x] **A2 — Calibration engine + report** (pure core + v1 route done; A1 removes look-ahead)
  - `lib/scoring/calibration.ts` (pure): snapshots × outcomes → `CohortCell[]` by
    grade → `classifyCohorts`. Outcome param: `meeting_booked` (calls), 
    `reply_interested` (outbound_emails), `won` (deals).
  - `GET /api/analytics/score-calibration?outcome=…` → per-band {n, rate, lift,
    pValue, qValue, tier, verdict}; honest floors; alarm when A+ ≤ A.
  - Test: A+-truly-wins fixture → "healthy"; random fixture → "not significant";
    under-floor → "too few".

- [x] **A3 — Rationale (deterministic, evidence-cited)** (pure core done; UI surfacing pending)
  - `lib/scoring/rationale.ts` (pure): rank real factors (matched criteria + fresh
    signals + reachability facts) → one line. Surface on contact/account detail +
    call brief.
  - Test: cites only real matched factors; never an invented reason; stable order.

- [x] **A4 — Confidence** (pure core done; UI surfacing pending)
  - `confidence = coverage × freshnessFactor` (coverage from computeBlendedFit;
    freshness from role/signal/enrichment dates). Surface beside grade; list sort
    by score × confidence.
  - Test: thin/stale inputs → low confidence; full/fresh → high.

- [ ] **A5 — Phase-A checks**
  - `vitest` (new pure modules) + `tsc` green. Live: pull the real Pilae
    calibration cut and read the verdict (does A+ beat A on meeting_booked?).

## Phase B — differentiate within the ICP

- [x] **B1 — Graded depth evaluator** (scoreCriterionDegree + computeDepth, 7 tests)
  - `scoreCriterion(criterion, ctx): number` in [0,1] (binary `evaluateCriterion`
    untouched for the gate). Range → triangular/plateau membership; bounds → soft
    ramp; categorical → {0,1}. `depth01` over soft identity criteria.
  - Test: center > edge > outside; categorical unchanged; absent field excluded.

- [x] **B2 — Propensity blend** (pure computePropensity + valueBand + normalizeIntent, 7 tests; "→ grade" = shadow wiring, below)
  - `lib/scoring/propensity.ts` (pure): `clamp01(Σ wᵢcᵢ − penalties)` over
    depth/intent/reach/value (+pain in C). Wire into `fit-recompute-core` so the
    grade is fed by propensity (fit stays the gate; out-of-ICP = "hors ICP").
  - Test: monotonic in each component; penalty subtracts; gate preserved.

- [x] **B3 — Learned weights** (learnPropensityWeights + assembleContactPropensity bridge, pure, 6 tests; needs accumulated component×outcome data to bite)
  - Regress component → outcome (A2 data), Bayesian-smoothed, min-sample floored,
    clamped; versioned `propensityWeights` in tenant settings; priors until enough.
  - Test: priors with no data; weights shift toward the predictive component;
    bounded.

- [ ] **B4 — Calibrated bands**
  - Set A+/A/B cut-points from A2 outcome tiers (not fixed 90/80); recompute
    refreshes; band inversion → alarm.
  - Test: bands track the booked-rate ordering; inversion flagged.

## Phase C — research/pain (bounded LLM, upside)

- [ ] **C1 — Pain dimension**
  - `c.pain` from bounded reader over properties (technologies→replaceable-SaaS,
    jobs→target-role) + knowledge intake (sovereignty/hosting). Evidence-cited;
    absent evidence → unscored (confidence down), never invented.
  - Test: cited fact present → scored; no evidence → unscored + confidence drop.

## Status
**Phase A FULLY BUILT** (commits 7e4f34e4 cores + 881e0af7 explain + 7d6e3ef8
A1+UI): calibration (A2) + rationale (A3) + confidence (A4) +
`GET /api/analytics/score-calibration` (now snapshot-backed for meeting_booked) +
`score-factors` + `GET /api/contacts/[id]/score-explain` + **A1 score_snapshots**
(table + drizzle/0077 + recordScoreSnapshot hooked into /api/calls/start) +
**UI** (`ScoreExplainLine` on the contact detail). 20 unit tests, tsc-clean.
**NOT runtime-verified** (no DB/app here). Remaining (Martin's env): apply the
migration (`pnpm db:migrate:apply`), live smoke (call → snapshot → calibration
verdict), call-brief surface (A5).

**Phase B1+B2 BUILT** (commit d74181d3): graded depth (scoreCriterionDegree /
computeDepth) + propensity blend (computePropensity / valueBand / normalizeIntent)
— 14 tests, tsc-clean. Pure cores = the actual intra-ICP differentiator; fit
stays the GATE, propensity is the RANK. **B3 DONE** (a13d5235: learnPropensityWeights
+ assembleContactPropensity bridge — pure, 6 tests). Remaining: **B4** calibrated
bands, and the **SHADOW WIRING** (compute propensity ALONGSIDE the fit grade in the
recompute via assembleContactPropensity, store in properties.propensity, surface it
next to fit, prove it beats fit on outcomes via the calibration report, THEN flip
the grade — never blind) — the invasive/unverifiable-here piece (edits the core
recompute), best done where it can run. Phase C = bounded LLM pain. NB: existing FR
UI in already-merged code (reachability labels, call-mode toasts) violates the
all-English rule — separate cleanup, out of scope.
