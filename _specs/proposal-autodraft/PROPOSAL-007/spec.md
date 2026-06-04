# PROPOSAL-007: Eval harness + real-document fixtures (measure the intelligence)

Closes SELF-AUDIT B1 + B2 (HIGH): the LLM core (detection segmentation, section
prose, confidence calibration, citation accuracy) is entirely mock-verified, with
zero golden evals, and nothing has been tested against a real Office document.

## Requirements
**AC1 (real fixtures)** A small corpus of **real Office-produced** templates lives
under `app/apps/web/src/lib/proposals/__fixtures__/` (a redacted real `.docx` and
`.pptx`, plus 1-2 messy edge cases: fragmented runs, localized heading styles,
title-less slides). Extraction + outline are asserted against them (catches the
messy-XML reality fixtures can't).
**AC2 (detection eval)** A golden-eval case (repo eval harness) feeds a known
template + expected component set; detection is graded for segment coverage
(no dropped section) and dataKey sanity, with a passing threshold.
**AC3 (fill eval)** Given a fixed deal context, section generation is graded for
grounding (claims traceable to provided sources) and absence of placeholders/
"undefined"; fields graded exact.
**AC4 (trust eval)** Confidence calibration is checked: abstention fires when the
context is empty; high confidence requires ≥1 resolved citation.
**AC5** Evals run in the existing harness and gate (opt-in when keys present;
skipped/mocked deterministically otherwise so CI stays green without spend).

## Design
- `__fixtures__/` real binaries + a loader; extend `ooxml`/`pptx` tests to run on them.
- Reuse `src/__tests__/golden-eval-gate` infra (or add `proposal-eval-suite.test.ts`)
  with cases under a `proposals` namespace; grader functions for coverage/grounding/
  calibration (deterministic where possible; LLM-graded behind a key flag).
- A tiny CLI (`scripts/eval-proposals.ts`) to run the suite against live keys and
  print a scorecard.

## Tasks
1. Commit redacted real .docx/.pptx fixtures + extraction assertions.
2. `proposal-eval-suite` with detect/fill/trust graders + thresholds.
3. `scripts/eval-proposals.ts` scorecard.
4. Wire into the eval gate (key-flagged). tsc + regression.
