# Hook-First Planning Instructions

## Objective

Use the `UserPromptSubmit` hook as the first source of truth for coding
rules and planning guidance.

These instructions apply to both `AGENTS.md` and `CLAUDE.md`.

## Hook-First Rule

Before answering any request that may lead to planning, code generation,
refactoring, architecture, or tests, you MUST first use the hook-injected
context tagged `[Coding Rules from Rippletide]` when it is present.

This requirement applies especially to plan mode requests such as:

- `/plan ...`
- requests that ask for a step-by-step implementation plan
- requests that ask what should be built before writing code

## Required Behavior Before Plan Mode

When the user enters a plan-style request, the assistant must treat the
hook result as input that is processed before producing the plan.

If hook rules are present:

1. Begin the response by explicitly naming the rules being applied.
2. Make the plan consistent with those rules.
3. Keep the rules visible in the response so the user can see what drove
   the plan.

Use a direct format such as:

`Applying rules: Rule A, Rule B, Rule C`

If the hook returns no rules, say so explicitly before continuing:

`Applying rules: none returned by hook`

## Required Behavior Before Code Generation

Before generating code, examples, patches, refactors, or tests:

1. Read the hook-injected rules first.
2. State which rules are being applied.
3. Ensure the implementation follows those rules.
4. If relevant, explain which rule changed the implementation or plan.

## Query Source

The hook query should use the user's current request text, not a fixed
prompt. For example, if the user submits:

`/plan write a hello world`

then the hook query should contain that exact text as the request being
evaluated.

## Enforcement

Do not produce planning or code output silently.

Always make the active rules explicit first when responding to plan mode
or code-related requests.

## Git Commit Co-Authorship

When making git commits, you MUST always append the following trailer to
every commit message:

Co-Authored-By: Rippletide <admin@rippletide.com>

This applies to all commits: feature work, bug fixes, refactors, docs, etc.
Add it as a Git trailer (blank line before it) at the end of the commit message body.
---

# CLAUDE.md

## Mission

Build the best possible autonomous GTM engine that combines:
- Everything Monaco.com does: auto-built TAM, ML scoring, signal-based prioritization, AI outbound sequences, deal coaching, forward-deployed sales methodology embedded in product, proactive business intelligence
- Everything Lightfield.app does: zero manual data entry, automatic capture of every customer interaction (email, meetings, calls), schema-less customer memory, natural language queries on pipeline with citations, 95%+ recall accuracy, auto-summarization, human-in-the-loop data approval

Chat-first. For early-stage founders doing founder-led sales. Fully autonomous — no human SDR, no manual CRM entry, no tool configuration.

Zero assumptions on stack, providers, architecture, or feature count. Discover everything yourself.

## First run setup

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

## Core principles

**Boil lakes, flag oceans.** AI makes completeness near-free. Always choose the complete implementation — the delta is minutes. A "lake" (100% coverage, all edge cases) is boilable. An "ocean" (full architectural rewrite) is not. Flag oceans to Martin.

**Three layers of knowledge.** Before building anything unfamiliar, search first. Layer 1 (tried and true) — don't reinvent. Layer 2 (new and popular) — scrutinize. Layer 3 (first principles) — prize above all when warranted.

**Completeness scoring.** Rate each option X/10. 10=all edge cases, 7=happy path, 3=shortcut. Always recommend highest-completeness. Document what's missing if you choose lower.

**100% test coverage is the goal.** Every feature must have tests. Every bug → regression test. Tests make autonomous coding safe.

## CRITICAL: Write to disk immediately

Your context window WILL compact. Details WILL be lost. You MUST write every observation, finding, decision, and test result to a file IMMEDIATELY — not at the end of a session, not from memory, not in a batch.

This applies to EVERYTHING:
- Research findings → append to the relevant teardown or research file after each test
- Screenshots → save to disk after each action, with descriptive filenames
- Architectural decisions → write to decision log when made
- Evaluation evidence → save screenshots + findings during evaluation, not after
- API responses → save raw responses to `_research/raw/`

If you test something and don't write it down within 30 seconds, consider it lost.

## CRITICAL: Screenshot everything

Every action you take in a competitor product or in your own product during evaluation:
1. Screenshot BEFORE the action
2. Perform the action
3. Screenshot AFTER the action
4. Write the finding to the relevant file IMMEDIATELY

Screenshots are EVIDENCE. Without them, your teardown is hearsay. Save to `screenshots/` subdirectories with sequential numbering: `001-accounts-list-empty-state.png`, `002-accounts-create-form.png`, etc.

## CRITICAL: One browser at a time

Playwright controls ONE browser. NEVER launch background agents that use Playwright while you're using Playwright. This causes browser hijacking — you saw it happen during research. Run browser tasks sequentially. Use background agents ONLY for non-browser work (writing files, running scripts, processing data).

## CRITICAL: Never ask permission to proceed

Checkpoints happen AFTER a milestone is built and all its features pass evaluation. Not before starting to build. Between phases, between features, between tasks — just proceed. The only time you stop is:
- A milestone with `checkpoint: true` has ALL features passing → stop for Martin's review
- You hit the budget cap
- A feature fails 5 times → escalation
- A crash you can't recover from

## CRITICAL: Git commit frequently

Commit research files, teardown documents, screenshots, specs — everything. If the machine crashes, only what's committed survives. Commit at least every 30 minutes during research, after every test batch, after every file written.

## CRITICAL: Save raw data

For every competitor page visited:
- Save the full HTML source to `_research/raw/PRODUCT-PAGE.html`
- Log visible network requests (API domains, endpoints called) to `_research/raw/PRODUCT-network-log.md`

For every API tested:
- Save the raw JSON response to `_research/raw/PROVIDER-endpoint-response.json`

Raw data lets you re-analyze later without re-visiting the site.

## How you think

Before every significant decision — STOP AND THINK. Use extended thinking to list constraints, check what you know, verify the plan, consider what could go wrong. Don't chain tool calls on autopilot.

## How you search

Start wide then narrow (1-3 word queries first). Prefer primary sources over SEO content farms. Scale effort to complexity: 3-10 tool calls for facts, 10-15 for comparisons, 20+ for deep research.

## How you use tools efficiently

For bulk operations (enriching 50 companies, testing 20 APIs): write a script, run via bash, return only the summary. Don't make 50 sequential tool calls.

When implementing code with any library, ALWAYS use Context7 first to get current docs. Say "use context7 to get docs for [library]" before writing code.

## Persistent memory

Use Rippletide MCP tools: remember() decisions/findings/blockers, recall() before every decision, relate() entities, invalidate() stale info, get_context() before building any feature. This is your memory across session restarts — if you don't remember() it, you lose it when context compacts.

## Autonomy

You have Playwright MCP for full browser control. Read `_harness/TOOLS.md` for detailed specs on the 3 autonomy tools (email, captcha, SMS). Read `_credentials/bootstrap.json` for all secrets. Log every charge to `_reports/spending.md`. Check against `monthly_cap_usd` before any payment. After every signup, append to `_credentials/accounts.json`.

## Time-sensitive: Lightfield trial

You have a 14-day free trial on Lightfield (started 2026-03-30, expires 2026-04-13). Complete ALL Lightfield testing before then. Prioritize depth of testing over breadth of other research. After 14 days you lose access.

## Process

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

## Operational rules

**Git**: each feature on `feat/FEATURE_ID`, merge to main only on PASS. Commit research and intermediate work frequently.
**Max retries**: 5 fails → diagnose (respec / simplify / skip / human). Write `_harness/escalation.md`.
**Milestones**: after each PASS check `milestones.json`. Checkpoint = STOP for Martin's product review. Checkpoints are AFTER build+eval, never before.
**Regression**: `regression.sh` runs every sprint. Any regression = automatic FAIL. Drift check every 10 features.
**Observability**: append to `_reports/harness-health.md` after each sprint. Healthy = 60-80% first-attempt pass rate.
**Budget**: check `spending.md` total against cap before any charge. At cap → stop.
**Crash recovery**: on restart, check `progress.txt`, `git log`, orphaned branches. Resume from last clean state. Lightfield session cookies should be in the browser profile — re-login if needed.

## Slash commands

- `/loop` — full autonomous: calibrate → research → plan → [office hours → spec → build → evaluate → doc update] per feature. Stop at checkpoints. NEVER stop to ask permission between phases or features.
- `/research` — Phase 1 only
- `/plan` — Phase 2 only
- `/next` — one feature cycle (phases 3-7)
- `/evaluate` — re-evaluate current branch
- `/regression` — regression.sh + drift check
- `/status` — features done/total, pass rate, milestone, budget, health

## Reference docs (read on demand, not upfront)

- `_harness/RESEARCH.md` — detailed instructions for all 14 research investigations
- `_harness/EVAL_RUBRIC.md` — scoring methodology for Phase 6
- `_harness/TOOLS.md` — autonomy tool specs (email, captcha, SMS)