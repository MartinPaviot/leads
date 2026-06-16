# Office hours — Propensity scoring (differentiate WITHIN an ICP)

## Problem statement (one sentence)
Our grade (`companies.score`/`contacts.score`) measures ICP **membership**, which
**saturates inside an ICP** — so every prospect in a narrow ICP (Pilae's Cœur
romand) grades ~A, the grade can't rank them, and "A+" prospects take taules
because the score is measuring the wrong thing.

## Why this is the root cause (grounded in the code)
- `evaluateCriterion` (criteria-engine.ts:87) is **binary** per criterion. A
  company at the edge of the size range scores identically to one in the
  sweet-spot. There is **no fit DEPTH**.
- `computeBlendedFit` = matched-soft-weight / evaluable-soft-weight × coverage.
  Inside an ICP almost everyone matches the identity criteria → ~1.0 → all A.
  Fit grades membership; membership doesn't separate members.
- We already have the orthogonal raw materials but they don't drive the GRADE:
  `priority-score.ts` computes `signal × fit × accessibility`, `signal-outcomes.ts`
  learns per-tenant signal lift, but the user-facing grade is fit-only.

## Premise challenges
- *"Isn't `priorityScore` already propensity?"* — Partly. It blends signal × fit ×
  accessibility, but (a) it is **not the grade** the user sees, (b) it omits
  depth, economic value, specific pain, and negative signals, (c) its signal
  multiplier is dead (1.0×) until ≥10 outcomes. The redesign **promotes and
  enriches** it into the grade, and **calibrates** it.
- *"Just let an LLM score 0-100 like Clay's Claygent?"* — No as the sole scorer:
  opaque, drifts, uncalibrated — exactly YALC's weakness. We keep a
  **deterministic, explainable core** and use the LLM **bounded** for the one
  thing it's good at (reading a specific company's pain), evidence-cited.
- *"Do we even have outcomes to calibrate against?"* — YES, verified:
  `calls.outcome='meeting_booked'` (the early outcome that fits Pilae's volume),
  `outbound_emails.replyClassification='interested'`, `deals` won/lost. And
  `cohort-engine.ts` (Fisher exact + Benjamini-Hochberg) already tests a band → rate.
- *"A taule on one A+ proves nothing."* — Correct. One miss is noise. The unit of
  truth is the **band**: does the A+ cohort convert measurably above A? That's a
  statistical test, not an anecdote — which is exactly what we'll build first.

## Alternatives explored
1. **Tune the fit formula / add criteria** — still measures membership, still
   saturates. Rejected.
2. **Full-LLM per-account score (Clay Claygent style, AI as the scorer)** —
   opaque + drift + uncalibrated. Rejected as the scorer; kept bounded for pain.
3. **Propensity blend: fit GATES (in/out of ICP), orthogonal dimensions RANK
   within, calibrated against real outcomes (chosen).** Reuses the criteria
   engine, signal-outcomes, accessibility, cohort-engine.

## Layer check
- Layer 1 (tried & true): Fisher exact + Benjamini-Hochberg for calibration —
  reuse `cohort-engine.ts`, do NOT reinvent stats.
- Layer 3 (first principles): the **separation of fit-gate from propensity-rank**,
  and **calibration as the certainty mechanism** — prized; it's what turns "I
  think A+ is good" into "A+ converts 3× A, proven (p<0.05)".
- Layer 2 (scrutinized): a **bounded** LLM for the pain dimension only.

## Completeness target & phasing
- **Phase A — MEASURE + EXPLAIN (ship first, ~80% of the value, lake).** No model
  rewrite. (1) Snapshot grade at funnel-entry; (2) calibration report (does A+
  beat A on `meeting_booked`?) via cohort-engine; (3) per-account **rationale**
  from the existing matched criteria + signals; (4) **confidence** (coverage ×
  freshness). This *tests Martin's "taules" hypothesis* and makes the current
  grade honest BEFORE we rebuild it.
- **Phase B — DIFFERENTIATE (lake+).** Graded **depth** evaluator + promote a
  **propensity** blend (depth × intent × reach × value − penalties) to BE the
  grade, with **weights learned** from Phase A's outcomes.
- **Phase C — RESEARCH/PAIN (ocean-ish).** Bounded LLM pain/trigger dimension
  (replaceable-SaaS, target-role hiring, sovereignty exposure) + rationale polish.

Target 9/10 across A+B; C is the upside. Rationale: never rebuild a model you
haven't first proven is broken — Phase A proves it and already pays (rationale +
certainty), Phase B fixes it, Phase C sharpens per-prospect.
