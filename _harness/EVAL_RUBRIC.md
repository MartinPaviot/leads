# Evaluation rubric

Read this file at the start of Phase 6. It contains the scoring methodology.

## Role switch

You are now a hostile QA engineer. The code you just wrote is guilty until proven innocent.

Anthropic's research: agents reliably approve their own mediocre work. When asked to evaluate their own output, they respond with confident praise even when quality is obviously mediocre. You have EXPLICIT PERMISSION to fail your own work. Approving bad work is YOUR failure.

## Process

1. Read `_specs/FEATURE_ID/requirements.md` — what was promised.

2. Use Playwright MCP to test the LIVE APPLICATION:

   **A. Acceptance criteria** — follow each GIVEN/WHEN/THEN literally. Document PASS/FAIL + evidence.

   **B. Edge cases** — every edge case from the spec, plus: empty strings, special characters (`<script>alert(1)</script>`), unicode (中文, العربية, émojis), extremely long input (10,000 chars), rapid double-clicks, navigate away and back, open 3 tabs simultaneously.

   **C. Real data** — actual companies, actual emails, actual enrichment. Not "test company." Grade 5 real outputs.

   **D. Regression** — `bash regression.sh`. Any regression = automatic FAIL regardless of feature quality.

3. **Structured scoring** — produce numeric scores 0.0-1.0:

   | Dimension | Weight | Threshold | Method |
   |-----------|--------|-----------|--------|
   | Product depth | 0.30 | 0.70 | Generate 5 real outputs. Grade each 0.0-1.0. Average. Any single output < 0.4 = dimension fails. |
   | Functionality | 0.25 | 0.80 | Count acceptance criteria passed / total. Each criterion is binary. |
   | Data quality | 0.25 | 0.70 | Process 10 real items. Score accuracy 0.0-1.0 each. Average. |
   | Design | 0.10 | 0.60 | Score against design-language.md. Penalize generic AI patterns. |
   | Code quality | 0.10 | 0.70 | Read actual diff. Score: types (0-1), error handling (0-1), logging (0-1), security (0-1), test coverage (0-1). Average. |

   **Overall score** = weighted sum. Below 0.70 overall OR below any individual threshold = FAIL.

4. For every bug found: **write a regression test** and add it to `regression.sh`. Non-negotiable.

5. Save representative API responses to `_fixtures/FEATURE_ID/`.

6. Write `_harness/sprint-report.md`:
   ```markdown
   ## Feature: FEATURE_ID
   ## Scores
   | Dimension | Score | Threshold | Result |
   |-----------|-------|-----------|--------|
   | Product depth | 0.82 | 0.70 | PASS |
   | Functionality | 0.90 | 0.80 | PASS |
   | Data quality | 0.75 | 0.70 | PASS |
   | Design | 0.68 | 0.60 | PASS |
   | Code quality | 0.72 | 0.70 | PASS |
   | **Overall** | **0.80** | **0.70** | **PASS** |

   ## Acceptance criteria
   - GIVEN x WHEN y THEN z: PASS
   - GIVEN a WHEN b THEN c: FAIL — [specific error, steps to reproduce]

   ## Edge cases tested
   - Empty input: [result]
   - Unicode: [result]
   ...

   ## Regressions
   - None / [list with details]

   ## Bugs found → tests added
   - [bug description] → [test added to regression.sh]

   ## Verdict: PASS / FAIL
   ```

7. **PASS**: merge `feat/FEATURE_ID` → main, delete branch, set `passes: true` in feature_list.json, update `regression.sh`. Check milestones — if checkpoint → STOP for Martin.

8. **FAIL**: delete branch, don't touch feature_list.json. Feedback must be specific enough to fix without questions.
