# Design — Propensity scoring

## Core idea: separate the GATE from the RANK
```
ICP membership  ──(GATE)──►  in / out      (required criteria + primary fit ≥ threshold)
                                 │ in
                                 ▼
Propensity      ──(RANK)──►  grade A+…F     (depth × intent × reach × value − penalty)
                                 │
                                 ├─► rationale  ("why A+", evidence-cited)
                                 ├─► confidence (coverage × freshness)
                                 └─► snapshot at funnel-entry  ──► calibration
```
Fit answers "is this my kind of company?" (membership — saturates). Propensity
answers "of my kind, who converts?" (rank). **The grade must reflect propensity.**

## Reuse map (verified against the code)
| Concern | Existing seam | Location |
|---|---|---|
| ICP gate | `computeBlendedFit` (required = hard gate), `resolvePrimaryIcp(≥0.5)` | `lib/icp/criteria-engine.ts:365,449` |
| Per-criterion eval (binary today) | `evaluateCriterion` | `criteria-engine.ts:87` |
| Company context | `buildCompanyContext` (Apollo keys, size, geo, tech, funding, jobs) | `lib/icp/company-context.ts:80` |
| Signal lift (intent) | `getSignalMultipliers` (Bayesian, [0.5,2.5], min 10) | `lib/scoring/signal-outcomes.ts:150` |
| Signal freshness | `filterFreshSignals` / TTL | `lib/signals/freshness.ts` |
| Reachability + value seed | `computeAccessibility`, `priorityScore` | `lib/scoring/priority-score.ts` |
| Grade ladder | `getGrade` / `GRADE_THRESHOLDS` | `lib/scoring/scoring.ts:9` |
| Stats engine | `classifyCohorts` (Fisher + BH, floors) | `lib/insights/cohort-engine.ts:159` |
| Research/pain inputs | knowledge intake "Company — …", `companies.properties` | `lib/knowledge/company-intake.ts:42`, company-context |
| Outcomes | `calls.outcome`, `outbound_emails.replyClassification`, `deals.stage` | `db/schema/voice.ts`, `outbound.ts`, `core.ts` |

## Phase A — measure + explain (no model change)

### A1. Score snapshots (honest calibration, no look-ahead)
New table `score_snapshots`:
```
{ id, tenantId, entityType('contact'|'company'), entityId, grade, score, propensity?,
  confidence?, event('call_attempt'|'sequence_enroll'|'email_sent'), eventRef, at }
```
Written by a thin hook at the funnel-entry events (where calls/enrollments/emails
are created). Immutable. Calibration joins **the snapshot grade** (live at the
touch) to the outcome — never the current re-scored grade (that would be
look-ahead bias and would make any model look good).

### A2. Calibration engine + report
`lib/scoring/calibration.ts` (pure core): given snapshots joined to outcomes,
build `CohortCell[]` keyed by grade and feed `classifyCohorts`:
```ts
cells = grades.map(g => ({ dimension: "grade", value: g,
  n: snapshotsAtGrade(g), won: outcomeAtGrade(g) }))   // "won" = the chosen outcome
classifyCohorts(cells, { minTotalDeals: 20, minInsightN: 10 })
```
Outcome is **parameterized**: primary `meeting_booked` (from `calls.outcome`),
also `reply_interested` (`outbound_emails.replyClassification='interested'`),
`opportunity`/`won` (`deals.stage`). Route `GET /api/analytics/score-calibration?outcome=meeting_booked`
returns per-band {n, rate, lift, pValue, qValue, tier, verdict}. The verdict is
honest: floors enforced, "too few to call" when under-powered, an **alarm** when
A+ ≤ A.

### A3. Rationale (deterministic, evidence-cited)
`lib/scoring/rationale.ts` (pure): from the existing `BlendedFit.matched` + the
fresh signals + the reachability facts, emit ranked, human factors:
- depth/identity matches → "secteur cœur", "taille dans la cible"
- fresh signal → "recrute {rôle} (il y a {n}j)", "levée récente"
- reachability → "décideur joignable" / "mobile vérifié" / "dans ton réseau"
Top 2-3 → one line. **Only real factors** (each maps to a matched criterion id /
fresh signal / reachability fact). No LLM in Phase A → no hallucinated reasons.

### A4. Confidence
`confidence = clamp(coverage × freshnessFactor)` where `coverage` already comes
from `computeBlendedFit` and `freshnessFactor` decays with stale role/signal/
enrichment dates. Surface next to the grade; sort lists by `score × confidence`.

## Phase B — differentiate within the ICP

### B1. Graded depth evaluator
Extend the engine with a **degree** variant `scoreCriterion(criterion, ctx): number`
in [0,1] (the binary `evaluateCriterion` stays for the gate):
- `between {min,max}` → triangular/plateau membership: 1.0 across an inner
  sweet-spot, linear decay to 0 at a margin beyond [min,max]. (Center 120 FTE
  in a 50–250 target ⇒ ~1.0; 240 ⇒ ~0.4; 600 ⇒ 0.)
- `gte/lte/gt/lt` → soft ramp around the bound.
- categorical (`eq/in/contains/exists`) → stays {0,1}.
`depth01 = Σ(w · degree) / Σ(w evaluable)` over soft identity criteria. This is
the dimension that actually separates two same-ICP companies.

### B2. Propensity blend → grade
`lib/scoring/propensity.ts` (pure):
```
propensity01 = clamp01( Σ wᵢ·cᵢ  −  Σ penalties )
  c.depth   = B1
  c.intent  = freshSignalStrength × normalizedLift   (signal-outcomes, freshness)
  c.reach   = accessibility (+ network/warm-path)
  c.value   = expected-value band from size/revenue → projectAmount/platformArr potential
  penalties = negative signals (bought-competitor, hiring-freeze, sub-threshold budget)
weights wᵢ : per-tenant, LEARNED from A2 outcomes (same spirit as signal-outcomes:
  regress component → outcome, Bayesian-smoothed, min-sample floored, clamped),
  sensible PRIORS until enough data.
```
The grade is `getGrade(round(100 × propensity01))`, but the **bands are
calibrated** (B3). Fit gate unchanged: out-of-ICP ⇒ no propensity ⇒ "hors ICP".

### B3. Calibrated bands
Set A+/A/B cut-points so each maps to an **outcome tier** from A2 (e.g. A+ = the
top propensity quantile whose booked-rate is significantly above the next), not
fixed 90/80. Recompute refreshes them; a band inversion raises an alarm.

## Phase C — research/pain (bounded LLM)
`c.pain` from a bounded, evidence-cited reader over `companies.properties`
(technologies → replaceable-SaaS, `num_current_job_openings` + role match) +
knowledge intake (sovereignty/hosting posture). Returns a score **with a cited
fact**; absent evidence ⇒ pain unscored (confidence down), never invented.

## Data model
- `companies.properties.propensity` / `contacts.properties.propensity` =
  `{ score, components:{depth,intent,reach,value,pain,penalty}, confidence,
     rationale, weightsVersion, computedAt }` (additive jsonb; `score`/grade
     columns keep their meaning, now fed by propensity in Phase B).
- New `score_snapshots` table (A1) + a learned-weights row in tenant settings
  (`propensityWeights`, versioned).

## API
- `GET /api/analytics/score-calibration?outcome=…&since=…` → per-band stats + verdict.
- Scoring writes `propensity` alongside fit in the recompute (`fit-recompute-core`).
- Snapshot hook at call/enroll/send creation.

## Failure handling & house rules
- Pure cores (depth, propensity, rationale, calibration) — unit-tested, no I/O.
- Under-powered calibration **asserts nothing** (cohort-engine floors).
- Thin/stale data lowers **confidence**, never inflates the grade.
- LLM (Phase C only) is bounded + evidence-cited; absent evidence ⇒ unscored.
- Out-of-ICP is "hors ICP", never F. No provider names in rationale. No emoji.
- Tenant-scoped everywhere; snapshots immutable (no back-dating → no look-ahead).
