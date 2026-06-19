# Project Charter — long-form (read on demand)

> Moved out of `CLAUDE.md` on 2026-06-18 to keep the always-loaded context lean
> (gstack-style). This file holds the full bootstrap procedure, the detailed
> phase definitions, and reference-doc pointers. CLAUDE.md keeps only the
> steady-state operating rules. Read this when bootstrapping a fresh clone or
> when you need the full phase methodology.

## Mission (full)

Build the best possible autonomous GTM engine that combines:
- Everything Monaco.com does: auto-built TAM, ML scoring, signal-based prioritization, AI outbound sequences, deal coaching, forward-deployed sales methodology embedded in product, proactive business intelligence
- Everything Lightfield.app does: zero manual data entry, automatic capture of every customer interaction (email, meetings, calls), schema-less customer memory, natural language queries on pipeline with citations, 95%+ recall accuracy, auto-summarization, human-in-the-loop data approval

Chat-first. For early-stage founders doing founder-led sales. Fully autonomous — no human SDR, no manual CRM entry, no tool configuration.

## First run setup (bootstrap a fresh clone)

If no `_harness/` directory exists, bootstrap the project:

1. Create directory structure:
   ```
   _harness/ _reports/ _research/teardown-monaco/screenshots/
   _research/teardown-lightfield/screenshots/ _research/raw/
   _credentials/ _tools/ _specs/ _fixtures/ _calibration/
   ```
2. Set up `.gitignore` (include `_credentials/`, `node_modules/`, `.env*`, `.next/`, `dist/`)
3. Check for `_credentials/bootstrap.json`. If missing, tell Martin to fill it before continuing.
4. Install dependencies: `npm install imap-simple mailparser`
5. Verify Playwright MCP is available. If not, tell Martin: `claude mcp add --scope user playwright npx @playwright/mcp@latest && npx playwright install chromium`
6. Create the 3 autonomy tools in `_tools/` — read `_harness/TOOLS.md` for specs.
7. Init `_credentials/accounts.json` as `[]`, `_reports/spending.md` with table header, `git init`, initial commit.

## Process (full)

```
CALIBRATE → RESEARCH → PLAN → [per feature: OFFICE HOURS → SPEC → BUILD → EVALUATE → DOC UPDATE] → repeat
```

### Phase 0: Calibrate
Skip if `_calibration/passed` exists. Create a broken page + a good page. Evaluate both using the Phase 6 rubric (0.0-1.0 scoring). Must reject the broken one and approve the good one. If not discriminating → recalibrate. Start with 3-5 test cases.

### Phase 1: Research
Skip if `_research/complete.md` exists. **Read `_harness/RESEARCH.md` for detailed instructions on all 14 investigations.** This includes surgical teardown protocols for Monaco (video extraction, frame analysis, community screenshots) and Lightfield (exhaustive product testing of every page, every button, every feature, every edge case).

### Phase 2: Plan
Skip if `_harness/product-spec.md` exists. Read ALL `_research/` files. Output: `product-spec.md`, `feature_list.json` (with dependencies + milestones), `milestones.json` (with checkpoints for Martin's review), `design-language.md`, `init.sh`, `regression.sh`.

### Phase 3: Office hours (per feature)
Before specing a major feature: problem statement (one sentence), premise challenge, 2+ alternatives explored, layer check, completeness target. Write to `_specs/FEATURE_ID/office-hours.md`. Skip for small obvious features.

### Phase 4: Spec (per feature, Kiro-style)
Read only relevant context (feature entry, relevant product-spec section, relevant teardown, stack-decision, previous sprint-report if failed). Create `_specs/FEATURE_ID/`:
- `requirements.md` — user story, GIVEN/WHEN/THEN criteria, edge cases, evaluation steps
- `design.md` — system fit, data model, API contracts, data flow, failure handling, security
- `tasks.md` — ordered steps, each with verify step + test to write

### Phase 5: Build (per feature)
Branch `feat/FEATURE_ID`. Implement tasks in order: code → write test → verify → commit → mark done. Bulk API calls via scripts not tool calls. Run acceptance criteria + `regression.sh` after all tasks. If spec is wrong → `spec-issues.md`, back to Phase 4.

**Comparison testing**: after building each feature, pull up the competitor teardown screenshots of the equivalent feature. Compare side-by-side. If our version is obviously worse in any dimension (depth, polish, intelligence), fix it before moving to evaluation.

### Phase 6: Evaluate (per feature)
**SWITCH ROLES. Hostile QA. Guilty until proven innocent.** Read `_harness/EVAL_RUBRIC.md` for detailed scoring methodology. Playwright test live app: acceptance criteria literally, edge cases, real data, regression. Structured scoring 0.0-1.0 on 5 dimensions with hard thresholds. Every bug → regression test. PASS → merge to main. FAIL → delete branch, retry.

### Phase 7: Doc update (after each PASS)
Verify product-spec, design-language, init.sh, previous specs still match reality. Update anything that drifted.

## Operational rules (full)

**Git**: each feature on `feat/FEATURE_ID`, merge to main only on PASS. Commit research and intermediate work frequently.
**Max retries**: 5 fails → diagnose (respec / simplify / skip / human). Write `_harness/escalation.md`.
**Milestones**: after each PASS check `milestones.json`. Checkpoint = STOP for Martin's product review. Checkpoints are AFTER build+eval, never before.
**Regression**: `regression.sh` runs every sprint. Any regression = automatic FAIL. Drift check every 10 features.
**Observability**: append to `_reports/harness-health.md` after each sprint. Healthy = 60-80% first-attempt pass rate.
**Budget**: check `spending.md` total against cap before any charge. At cap → stop.
**Crash recovery**: on restart, check `progress.txt`, `git log`, orphaned branches. Resume from last clean state. Lightfield session cookies should be in the browser profile — re-login if needed.

## Reference docs (read on demand, not upfront)

- `_harness/RESEARCH.md` — detailed instructions for all 14 research investigations
- `_harness/EVAL_RUBRIC.md` — scoring methodology for Phase 6
- `_harness/TOOLS.md` — autonomy tool specs (email, captcha, SMS)
