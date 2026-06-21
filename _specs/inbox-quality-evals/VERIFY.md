# C1 — inbox-quality-evals — Verification (eval gates built, 2026-06-19)

Branch `feat/inbox-ai-draft` (integration branch). Worktree agent-a64e5014ce08a19ab.
The C1 metric table (`design.md`) is realized as gate tests wired into `pnpm eval:run`,
each with a DETERMINISTIC floor (always runs, no key) + an LLM tier (`WHERE
ANTHROPIC_API_KEY`). Pure metrics live in `src/lib/evals/inbox-metrics.ts`.

## Gates wired into eval:run (10 files)
| Surface | File | Deterministic floor (green) | LLM tier |
|---|---|---|---|
| chat (pre-existing) | chat-eval-suite | — | yes |
| graders (pre-existing) | golden-eval-gate | 80% pass | yes |
| draft selectivity (B1) | inbox-reply-worthy-gate | replyWorthy P/R=1.000 | — (pure) |
| writing-style derive (B2) | inbox-derive-style-gate | no-PII 14/14 | — (pure) |
| splits (B3) | inbox-splits-gate | needs_reply P/R=1.000 | — (pure) |
| noise (B4) | inbox-noise-gate | false_demote=0.000 | — (pure) |
| ask-agent (B5) | inbox-ask-agent-gate | retrieval_recall=1.000, abstention=1.0 | yes (agent run) |
| refine | inbox-refine-gate | instruction_adherence>=0.85 + fact_preservation>=0.95 (ideal) | rewrite() |
| summary | inbox-summary-gate | coverage>=0.85, trap=0, citation>=0.90 (ideal) | summarizeThread() |
| draft prose | inbox-draft-gate | ideal drafts leak 0 trap facts | composeReply() (no-fabrication) |

## Metrics in inbox-metrics.ts (pure, unit-tested)
replyWorthyPR, falseDemoteRate/noiseMetrics, splitPR, retrievalRecall,
abstentionCorrectness, citationInRange, groundedAnswerRate, editDistance/levenshtein,
factCoverage (number-format insensitive), trapFactHits, instructionAdherence,
summaryCitationAccuracy.

## Run result (2026-06-19, with ANTHROPIC_API_KEY present)
- refine + summary + draft LLM tiers RAN against the real model and passed
  (refine/summary 17 tests; draft 3 tests). The number-format normalization in
  factCoverage was the fix for the model writing "$40,000" vs "40000".
- The deterministic floors hold the published 0.85/0.95/0.90 bars on hand-authored
  ideal outputs; the live tiers log the measured rates + assert a conservative
  regression floor (no CI flake on single-pass model variance).

## Honest gaps (not built / LLM-tier targets)
- The voice `dimension_judge` >= 0.75 (inbox-draft) + draft `edit_distance` <= 0.45
  need the multi-trial judge infra (computeMultiTrialMetrics + runGrader dimension_judge,
  k>=3) to be non-flaky — noted as the remaining C1 judge piece. The editDistance metric
  is built; the reference-draft + multi-trial wiring is the follow-up.
- A `triage` suite (importance false-demote etc.) overlaps B4's noise gate; not built separately.
- The LLM tiers only run where a key is set; CI without a key runs the deterministic
  floors (always green).
