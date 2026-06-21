# C1 — inbox-quality-evals — Requirements (EARS)

The cross-cutting QUALITY GATE for the 16-spec inbox overhaul. Upstream's moat is
the QUALITY of its AI judgment (`_research/upstream/CORE-VALUE.md`,
`QUALITY-BENCH.md`), so every Track-B intelligence must be MEASURED, not just
shipped. This spec defines the 5 measured intelligences, their labeled golden
sets, the thresholds, how each is computed + gated in `pnpm eval:run`, and the
**G-eval acceptance gate** every intelligence spec references.

## Ground-truth tags

- `[DONE]` already shipped · `[NEW]` real gap · `[CFG]` tenant config ·
  `[LOCKED]` stack decision · `[HORS SCOPE]` track elsewhere.

### Verified against live code (2026-06-19)

- `[DONE]` Eval harness exists: `runEvalSuite` + `EvalSuite`/`EvalCase` +
  `aggregateMetrics`, persists to `eval_runs`/`eval_case_runs`
  (`app/apps/web/src/lib/evals/harness.ts:112`).
- `[DONE]` Grader library exists: `runGrader` (`pattern_match`, `classification`,
  `faithfulness`, `contains_all`, `word_count`, `llm_judge`, `dimension_judge`,
  `tool_sequence`, `forbidden_pattern`, ...) + `computeCompositeScore` +
  `computeClassificationMetrics` (precision/recall/F1)
  (`app/apps/web/src/lib/evals/agent-evals.ts:68,337,1015`).
- `[DONE]` Gate wiring exists: `pnpm eval:run` =
  `vitest run --reporter=verbose src/__tests__/chat-eval-suite.test.ts
  src/__tests__/golden-eval-gate.test.ts` (`app/apps/web/package.json:12`);
  `golden-eval-gate.test.ts` already enforces an aggregate >=80% gate
  (`src/__tests__/golden-eval-gate.test.ts:294`).
- `[DONE]` The 5 inbox intelligences under test all exist with injectable
  generators (deterministic-test seam, no LLM key needed):
  - triage/intent -> `classifyGeneralIntent` (`src/lib/inbox/classify-intent.ts:60`)
    + explainable score `scoreImportance` (`src/lib/inbox/importance.ts:52`).
  - draft -> `composeReply` (`src/lib/inbox/compose-reply.ts:71`).
  - refine -> `rewrite` (`src/lib/inbox/rewrite.ts:55`).
  - summarize -> `summarizeThread` (`src/lib/inbox/summarize-thread.ts:82`).
  - ask-agent -> `selectRelevantThreads` + `askInbox`
    (`src/lib/inbox/ask-inbox.ts:62,163`).
- `[NEW]` There is no `src/lib/evals/suites/inbox-*.eval.ts`, no labeled inbox
  golden set, and `eval:run` does not exercise any inbox intelligence (grep:
  zero inbox suites under `src/lib/evals/suites/`).
- `[NEW]` There is no reply-worthiness classifier for draft SELECTIVITY:
  `scoreImportance` only pins `isAutomated` to tier 4
  (`src/lib/inbox/importance.ts:53`); nothing decides "offer a draft only when a
  reply is warranted". This spec defines its metric + golden set; the classifier
  itself ships in B1/B4 (gated by this metric).
- `[LOCKED]` Stack: Vitest runner, the existing `harness.ts` + `agent-evals.ts`
  graders, Anthropic Haiku/Sonnet as judge (already the default in
  `runGrader`/`runDimensionJudges`). Do NOT add a new eval framework.

## Non-goals

- THE SYSTEM SHALL NOT introduce a new eval framework, runner, or grading
  library — it reuses `harness.ts` + `agent-evals.ts`.
- THE SYSTEM SHALL NOT build the intelligences themselves (B1-B7) — it defines
  and enforces their bars only.
- THE SYSTEM SHALL NOT require a live LLM key in CI to PASS the gate: every suite
  MUST have a deterministic floor (offline mode) and an opt-in LLM-judge tier
  (WHERE ANTHROPIC_API_KEY is set), mirroring `golden-eval-gate.test.ts:44`.
- THE SYSTEM SHALL NOT gate on absolute LLM-judge scores that drift run-to-run
  without a multi-trial floor (`computeMultiTrialMetrics`, `agent-evals.ts:1163`).

---

## R1 — Triage / attention quality (intelligence 1)

Bar (QUALITY-BENCH section 2, CORE-VALUE Loop 1): ~0 false-demotes of
reply-worthy mail; high precision on Noise/Promotions; high recall on Primary.

- R1.1 — THE SYSTEM SHALL provide a labeled triage golden set
  `inbox-triage.golden.jsonl` of >=40 real-shaped emails, each labeled
  `lane in {primary, promotions, noise}` and `replyWorthy in {true,false}`, with a
  `reason` string, covering: 1:1 founder mail, time-sensitive codes/OTP,
  promotions, cold/auto/newsletter noise, OOO, and >=6 hard adversarial cases (a
  buyer reply that LOOKS like a newsletter; a personal reply from a no-reply
  domain).
- R1.2 — WHEN the triage eval runs, THE SYSTEM SHALL compute per-lane
  precision/recall/F1 via `computeClassificationMetrics` (`agent-evals.ts:1015`)
  over the golden set.
- R1.3 — THE SYSTEM SHALL compute the false-demote rate = (count of
  `replyWorthy=true` items placed in `noise` or `promotions`) / (count of
  `replyWorthy=true` items), reported as the metric `false_demote_rate`.
- R1.4 — THE triage suite SHALL gate GREEN only WHERE `false_demote_rate <= 0.02`
  AND `noise.precision >= 0.90` AND `primary.recall >= 0.95`.
- R1.5 — IF any single golden item with `replyWorthy=true` is demoted to `noise`,
  THEN THE SYSTEM SHALL surface that item id in the failure detail (the cardinal
  sin must be nameable, not just a number).
- R1.6 — WHERE ANTHROPIC_API_KEY is absent, THE triage suite SHALL run against
  the injected deterministic generator over a fixed-label oracle so the
  metric-computation + thresholds are validated offline (mirrors
  `golden-eval-gate.test.ts:44`), and SHALL skip only the live-model trials.

## R2 — Draft generation quality + selectivity (intelligence 2)

Bar (QUALITY-BENCH section 1, CORE-VALUE Loop 2): a real human reply is sendable
after <=1 small edit; draft only when reply-worthy.

- R2.1 — THE SYSTEM SHALL provide a labeled draft golden set
  `inbox-draft.golden.jsonl` of >=20 thread fixtures, each with the inbound
  thread, the counterparty language, and a human reference reply.
- R2.2 — WHEN the draft eval runs over a thread, THE SYSTEM SHALL compute
  send-without-edit proxy as the share of cases whose draft passes ALL
  deterministic graders: language-match (reply in the inbound's language),
  grounded (no fabricated facts/commitments — `forbidden_pattern` on invented
  numbers + `faithfulness` vs thread), concise (`word_count` within bound), and
  never-already-sent (`forbidden_pattern` on "I have sent / I already replied").
- R2.3 — THE SYSTEM SHALL compute edit-distance = normalized Levenshtein between
  the draft and the human reference reply, reported as `edit_distance` (mean) per
  language bucket.
- R2.4 — THE draft suite SHALL gate GREEN only WHERE the deterministic
  `send_without_edit_rate >= 0.70` AND `edit_distance <= 0.45` AND (WHERE
  ANTHROPIC_API_KEY is set) the `dimension_judge` voice+context composite
  >= 0.75 over k>=3 trials (`computeMultiTrialMetrics`, pass-power-k floor).
- R2.5 — THE SYSTEM SHALL provide a labeled SELECTIVITY golden set
  `inbox-reply-worthy.golden.jsonl` of >=30 inbound emails labeled
  `replyWorthy in {true,false}` (reply-worthy human mail vs welcomes / OTP / bulk
  / no-reply), and SHALL compute reply-worthiness precision/recall.
- R2.6 — THE selectivity bar SHALL gate GREEN only WHERE
  `replyWorthy.precision >= 0.90` (do not offer a draft on bulk) AND
  `replyWorthy.recall >= 0.90` (do not miss a real reply opportunity).
- R2.7 — IF the draft text is empty (fail-closed path, `compose-reply.ts:80`),
  THEN THE SYSTEM SHALL count that case as a fail of send-without-edit (an empty
  draft is not sendable), never as a pass-by-default.

## R3 — Edit-with-AI / refine instruction adherence (intelligence 3)

Bar (QUALITY-BENCH section 1b): a multi-part NL instruction (shorter + warmer +
semantic transform) is fully applied; an instructed refactor, not a tweak;
language + signature preserved.

- R3.1 — THE SYSTEM SHALL provide a labeled refine golden set
  `inbox-refine.golden.jsonl` of >=15 (before-body, instruction, assertions)
  triples, where instructions include multi-part and semantic-transform cases
  (e.g. "shorter + warmer + replace 'stop contacting us' with 'I can forward to
  the right person'"), each with: `mustContain` strings (the transform landed),
  `mustNotContain` strings (the removed phrase is gone), a `language` to preserve,
  and a `length` direction (shorter/longer).
- R3.2 — WHEN the refine eval runs, THE SYSTEM SHALL compute instruction
  adherence as the share of per-case assertions satisfied: `contains_all`
  (mustContain), `forbidden_pattern` (mustNotContain), language preserved
  (`pattern_match` on language markers), and length direction respected
  (`word_count` relative to the before-body).
- R3.3 — THE refine suite SHALL gate GREEN only WHERE
  `instruction_adherence >= 0.85` AND the fact-preservation check (no
  name/date/number/link from the before-body dropped, per `rewrite.ts:27`
  contract) passes for `>= 0.95` of cases.
- R3.4 — IF a refine output drops a concrete fact present in the before-body
  (name/date/number/link), THEN THE SYSTEM SHALL fail that case and name the
  dropped fact in the detail.

## R4 — Summarization factuality vs source (intelligence 4)

Bar (QUALITY-BENCH section 4): summaries are retrieval-grounded, fact-accurate,
NO hallucination; cite the source.

- R4.1 — THE SYSTEM SHALL provide a labeled summary golden set
  `inbox-summary.golden.jsonl` of >=15 thread fixtures, each with the source
  messages, a set of `requiredFacts` (must appear), and a set of `trapFacts`
  (plausible-but-absent claims that MUST NOT appear).
- R4.2 — WHEN the summary eval runs, THE SYSTEM SHALL compute factuality =
  `faithfulness` (`agent-evals.ts:210`, grounded vs the source messages) AND
  `contains_all`(requiredFacts) AND `forbidden_pattern`(trapFacts).
- R4.3 — THE SYSTEM SHALL validate citation correctness: every index in
  `ThreadSummary.citations` (`summarize-thread.ts:26`) MUST be a real source
  index AND the cited message MUST contain support for at least one key point;
  reported as `citation_accuracy`.
- R4.4 — THE summary suite SHALL gate GREEN only WHERE `trapFacts` appear in
  0 cases (zero hallucination) AND `required_fact_coverage >= 0.85` AND
  `citation_accuracy >= 0.90` AND (WHERE ANTHROPIC_API_KEY is set)
  `faithfulness >= 0.80`.
- R4.5 — IF a summary states a `trapFact`, THEN THE SYSTEM SHALL hard-fail the
  whole summary suite (hallucination is a cardinal sin, not a partial-credit
  miss).

## R5 — Ask-inbox agentic correctness (intelligence 5)

Bar (QUALITY-BENCH section 3): the ask-inbox must be an AGENT — retrieve ->
verify -> act/answer — grounded, specific, actionable; never guess.

- R5.1 — THE SYSTEM SHALL provide a labeled ask-inbox golden set
  `inbox-ask.golden.jsonl` of >=15 (inbox-of-threads, question, expectations)
  cases, including >=4 "answer is genuinely not in the inbox" negatives.
- R5.2 — WHEN the ask eval runs, THE SYSTEM SHALL assert retrieval correctness:
  `selectRelevantThreads` (`ask-inbox.ts:62`) returns the expected thread key(s)
  in its top-`limit` for each answerable case (reported as `retrieval_recall`).
- R5.3 — THE SYSTEM SHALL assert grounded answering: for answerable cases the
  answer `contains_all`(requiredFacts) and every returned citation indexes a
  selected thread that supports it; for negative cases `answered === false` (the
  system says "couldn't find it", per `ask-inbox.ts:175`).
- R5.4 — THE SYSTEM SHALL compute abstention correctness = share of negative
  cases that correctly return `answered=false` with empty citations (no
  hallucinated answer when the inbox lacks the fact).
- R5.5 — THE ask suite SHALL gate GREEN only WHERE `retrieval_recall >= 0.90` AND
  `abstention_correctness === 1.0` AND `grounded_answer_rate >= 0.85` AND every
  cited index is a valid selected-thread index for 100% of answered cases.
- R5.6 — IF an answered case returns a citation index outside the selected-thread
  range, THEN THE SYSTEM SHALL fail the case (citation integrity is enforced in
  `ask-inbox.ts:176`; the eval guards against a regression of that clamp).

## R6 — The G-eval acceptance gate (the cross-cutting deliverable)

- R6.1 — THE SYSTEM SHALL add all 5 inbox suites to the `pnpm eval:run` command
  in `app/apps/web/package.json` so the gate runs them on every eval invocation.
- R6.2 — THE SYSTEM SHALL define a single named gate, G-eval, as: "an inbox
  intelligence spec (B1-B7) is DONE only when its corresponding suite in
  `pnpm eval:run` is GREEN at the thresholds in R1-R5." Each Track-B spec
  references this gate by metric name (see `design.md` G-eval table).
- R6.3 — WHEN any inbox suite's gate metric falls below its threshold, THE SYSTEM
  SHALL fail `pnpm eval:run` with a non-zero exit and a per-metric report card
  (mirrors `golden-eval-gate.test.ts:305`), so CI blocks the merge.
- R6.4 — THE SYSTEM SHALL classify each suite as `capability` or `regression`
  (`classifyEvalCase`, `agent-evals.ts:1351`): the labeled golden sets are
  `capability` (hill to climb) until a feature ships, then its passing cases
  convert to `regression` (must stay >=0.9, alert on >5% drop —
  `EVAL_SUITE_DEFAULTS`, `agent-evals.ts:1333`).
- R6.5 — THE SYSTEM SHALL persist each suite run to `eval_runs`/`eval_case_runs`
  via `runEvalSuite` (`harness.ts:112`) using a stable `surfaceId`
  (`inbox-triage`, `inbox-draft`, `inbox-refine`, `inbox-summary`, `inbox-ask`)
  so the existing dashboard timeline + per-case drill-down work unchanged.
- R6.6 — THE SYSTEM SHALL keep every gate metric green offline (deterministic
  floor) so a contributor without an LLM key still gets a meaningful PASS/FAIL,
  and SHALL run the LLM-judge tier only WHERE ANTHROPIC_API_KEY is set.
