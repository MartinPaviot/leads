# Requirements — Propensity scoring

## User story
As a founder calling a narrow ICP, I want a grade that **ranks prospects WITHIN
my ICP by their real propensity to convert** — and tells me **why** each one is
A+ and **proves** that A+ actually beats A on my own funnel — so I spend my
calling hours on the prospects most likely to book, not on a wall of look-alike "A"s.

## Definitions (the contract)
- **Fit** = ICP membership. A GATE (in/out), not the grade.
- **Propensity** = predicted probability, *within the ICP*, of reaching an early
  outcome (booked meeting → opportunity). The GRADE reflects propensity.
- **A+** = the calibrated top band: prospects we predict convert in the top tier
  AND that the calibration report shows do convert measurably above A.
- **Confidence** = how evidenced the propensity is (coverage × freshness). A grade
  is always shown with its confidence.

## Acceptance criteria (EARS / GIVEN-WHEN-THEN)

### Phase A — measure + explain

#### R1 — Snapshot the grade at funnel entry (no look-ahead)
- GIVEN a prospect enters a measurable funnel event (call attempted, sequence
  enrolled, email sent), WHEN it happens, THEN the grade/score **live at that
  moment** is snapshotted with the entity + timestamp, so calibration joins the
  outcome to the grade that *actually drove the action*, never a re-scored grade.

#### R2 — Calibration report (the certainty)
- GIVEN ≥ a minimum of closed/early outcomes, WHEN I open the score-calibration
  report, THEN I see, per grade band: n, booked-meeting rate, reply-interested
  rate, won rate, **lift vs the rest**, and a **significance verdict** (Fisher
  exact via cohort-engine) — e.g. "A+ books at 28% vs 11% for A (p<0.05): healthy"
  or "A+ does NOT beat A (n too small / not significant)".
- GIVEN fewer than the floor of outcomes, WHEN I open it, THEN it says so plainly
  ("only 12 outcomes — too few to call calibration") and asserts nothing — never
  a fake green.
- The primary outcome is **`meeting_booked`** (accumulates fastest for Pilae);
  won/lost is a secondary, slower cut.

#### R3 — Per-account rationale ("why this grade")
- GIVEN any scored prospect, WHEN I view it, THEN I see a one-line, evidence-cited
  rationale built from the **actual** contributing factors — e.g. "A+ : taille
  pile-sweet-spot, recrute un RevOps (il y a 12j), décideur joignable" — never a
  vague "good fit". Each cited factor traces to a real criterion match / signal /
  reachability fact (no hallucinated reasons).

#### R4 — Confidence surfaced
- GIVEN a grade computed on thin or stale data, WHEN shown, THEN its **confidence
  is low and visible**, and lists are sortable by score × confidence — so a
  high-grade-on-thin-data prospect never silently outranks a well-evidenced one.

### Phase B — differentiate within the ICP

#### R5 — Graded fit depth (break the binary saturation)
- GIVEN two companies both inside the ICP, one at the center of the target size
  range and one at the edge, WHEN scored, THEN the center one scores **higher on
  depth** — numeric/range criteria contribute a **degree** (1.0 at the sweet-spot
  center, decaying toward and past the edges), not a flat 1/0. Categorical
  criteria stay binary.

#### R6 — Propensity blend becomes the grade
- GIVEN a prospect inside the ICP, WHEN scored, THEN the grade reflects a
  bounded blend of **depth × intent (fresh signal lift) × reachability ×
  economic-value − negative-signals**, each component in [0,1], **weights learned
  per tenant** from R2's outcomes (sensible priors until enough data). Fit stays
  the gate (out-of-ICP → not graded, "hors ICP").

#### R7 — Bands recalibrated to outcomes
- GIVEN the calibration report, WHEN bands are set, THEN A+/A/B map to **outcome
  tiers** (the band that historically books top), not fixed 90/80/60 on a
  saturating fit; recompute updates them. A regression (A+ stops beating A) is a
  visible alarm.

### Phase C — research/pain
#### R8 — Specific-pain dimension (bounded LLM)
- GIVEN a company with a website/known tech/jobs, WHEN scored, THEN an optional,
  **bounded, evidence-cited** pain score is added (replaceable-SaaS in stack,
  hiring the target role, sovereignty exposure), read from knowledge/properties —
  never a free LLM 0-100, always with the citation that justifies it.

## Edge cases
- No active ICP / no scorable criteria → no propensity, clear empty state (parity
  with today's recompute guard).
- Out-of-ICP company → "hors ICP", not an F (F ≠ "not in ICP").
- New tenant, zero outcomes → priors only; calibration says "not yet measurable".
- Stale inputs (obsolete title, expired signal) → must lower confidence, not
  silently inflate the grade (reuse role-status + signal freshness).
- Score snapshot must be immutable per event (no back-dating).

## Evaluation steps (Phase 6)
1. Unit: graded depth evaluator (sweet-spot center > edge > outside); propensity
   blend monotonic in each component; penalty subtracts; weights-from-outcomes
   bounded + min-sample floored.
2. Unit: rationale builder cites only real matched factors (no invented reason);
   calibration cohort-builder maps grades → cells correctly.
3. Calibration: on seeded outcomes where A+ truly books more, report flags
   "healthy"; on random outcomes, report refuses to call it significant.
4. Live: a real Pilae cut — does A+ book above A, and is the rationale true per
   account on 5 spot-checks.
