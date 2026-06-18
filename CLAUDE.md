# Coding rules hook & git trailer

**Rippletide rules hook — currently INERT on this machine (verified 2026-06-18).**
The `UserPromptSubmit` hook (`.claude/hooks/fetch-rules.sh`) is meant to inject a
`[Coding Rules from Rippletide]` block before planning/coding, and a PreToolUse hook
(`check-code.sh`) to check edits against it. Both no-op here: no Rippletide config/
`user_id` exists on this Windows box and `jq` is absent (see memory
`jq-missing-in-git-bash`). Therefore **do NOT preface responses with
"Applying rules: …"** — none are injected. IF a `<user-prompt-submit-hook>` block
tagged `[Coding Rules from Rippletide]` ever DOES appear (e.g. after logging into
Rippletide), honor it: process the rules first, state which you apply, comply.

**Git co-authorship (mandatory, every commit):** append this trailer as a Git
trailer (blank line before it) at the end of every commit message — feature, fix,
refactor, docs, all of them:

```
Co-Authored-By: Rippletide <admin@rippletide.com>
```

---

# CLAUDE.md

## What this is

**leadsens** (product brand **Elevay**) — a chat-first, fully autonomous GTM
engine for early-stage founders doing founder-led sales. Zero manual CRM entry,
no human SDR, no tool config. North stars: everything Monaco.com does
(auto-TAM, ML scoring, signal prioritization, AI outbound, deal coaching) +
everything Lightfield.app does (zero-entry capture of every interaction,
schema-less memory, NL pipeline queries with citations, human-in-the-loop
approval). Full mission, bootstrap procedure, and phase methodology live in
`_harness/CHARTER.md` — read it on demand, not every session.

## Stack

- **Monorepo** at `app/` — pnpm 10 + Turbo. Apps: `web`, `admin`, `worker`.
- **Web** (`app/apps/web`, `@leadsens/web`): Next 15 App Router (Turbopack),
  React 19, Tailwind 4, TypeScript.
- **Data**: Drizzle ORM + Postgres (Neon serverless / `postgres`), Supabase.
- **Auth**: next-auth v5 (beta). **AI**: AI SDK v6 + `@anthropic-ai/sdk` (default
  to the latest Claude models). **Bg jobs**: Inngest.
- **Integrations**: Twilio + Deepgram (voice), Resend/nodemailer (email),
  googleapis, Stripe, Sentry, PostHog.
- **Tests**: Vitest (unit, happy-dom + Testing Library), Playwright (e2e).

## Commands (the project owns its config — read here, don't re-discover)

Run from the monorepo root `app/` unless noted. If a command you need isn't
listed, find it, use it, then add it here so we never re-discover it.

| Task | Command | Where |
|------|---------|-------|
| Dev (all apps) | `pnpm dev` | `app/` |
| Build / lint / types | `pnpm build` · `pnpm lint` · `pnpm tsc` | `app/` |
| Unit tests | `pnpm test` (Vitest) | `app/` or `app/apps/web` |
| Eval gate | `pnpm eval:run` | `app/apps/web` |
| E2E | `pnpm e2e` (`e2e:install` first time) | `app/apps/web` |
| DB migrate | `pnpm db:migrate:apply` (custom runner) | `app/apps/web` |
| DB push (dev) | `pnpm db:push` | `app/apps/web` |
| DB studio | `pnpm db:studio` | `app/apps/web` |

**Migrations are special.** The drizzle journal stops at idx 12 — `db:migrate`
is intentionally disabled and errors out. On `feat/cle-m1` use `db:push` for dev;
use `db:migrate:apply` (custom runner) to apply. Local dev DB = `leadsens-localdev`;
prod runs on `leadsens-dev`.

## Principles

- **Boil lakes, flag oceans.** AI makes completeness near-free — always choose the
  complete implementation (all edge cases); the delta is minutes. A lake (100%
  coverage) is boilable; an ocean (full architectural rewrite) is not — flag it.
- **Three layers of knowledge.** Layer 1 (tried & true) — don't reinvent. Layer 2
  (new & popular) — scrutinize. Layer 3 (first principles) — prize above all.
  Search before building; use Context7 for any library before writing code.
- **Completeness scoring.** Rate options X/10 (10=all edge cases, 7=happy path,
  3=shortcut). Recommend the highest; document what's missing if you pick lower.
- **100% test coverage is the goal.** Every feature has tests; every bug → a
  regression test. Tests make autonomous coding safe.

## Workflow (per feature — roles, each knows when to stop)

`OFFICE HOURS → SPEC → BUILD → EVALUATE → DOC UPDATE`

- **Office hours** (founder/CEO lens): problem in one sentence, challenge the
  premise, 2+ alternatives, layer check, completeness target. Skip for small ones.
- **Spec** (Kiro-style, eng lens): `_specs/FEATURE_ID/` → `requirements.md`
  (GIVEN/WHEN/THEN + edge cases), `design.md`, `tasks.md` (each task has a verify
  step + a test to write).
- **Build**: branch `feat/FEATURE_ID`; per task: code → test → verify → commit.
  Bulk work goes through scripts, not N sequential tool calls.
- **Evaluate** (hostile QA — *guilty until proven innocent*): Playwright the live
  app against acceptance criteria literally, edge cases, real data, regression.
  Score 0.0–1.0 on 5 dimensions. PASS → merge to main. FAIL → delete branch, retry.
- **Doc update**: after each PASS, fix any drift in product-spec / design-language.

Full phase methodology (Calibrate, Research, Plan) is in `_harness/CHARTER.md`.

## Hard rules (earned — violating these has burned us before)

- **Write to disk immediately.** Context WILL compact. Every observation, finding,
  decision, test result, raw API response → a file within 30s, not from memory.
- **One browser at a time.** Playwright drives ONE browser. NEVER launch background
  agents that use Playwright while you're using it — that hijacks the browser.
  Background agents are for non-browser work only.
- **Screenshot the evidence.** In any competitor product or live eval: screenshot
  before, act, screenshot after, write the finding. Sequential names
  (`001-accounts-empty.png`). Save raw HTML/network for every competitor page.
- **Do it yourself — don't delegate to Martin.** If a tool can do it (reload,
  navigate, restart a server, run tests, inspect computed styles), you do it.
  End on "voilà la vérification" with your own screenshot/log — never on "teste
  chez toi". Only ask Martin for true human-only actions (real OAuth logins,
  physical-world steps, judgment calls).
- **Never ask permission to proceed.** Between phases/features/tasks, just go. Stop
  ONLY for: a `checkpoint: true` milestone with all features passing, the budget
  cap, a feature failing 5× (→ `_harness/escalation.md`), or an unrecoverable crash.
  No "or we stop here" off-ramps.
- **Commit frequently, one logical change each.** Split renames, refactors, tests,
  and behavior into separate, independently revertable commits. If the machine
  crashes, only committed work survives. A `secret-scan` PreToolUse hook blocks any
  `git commit`/`push` carrying a high-confidence secret — if it fires, investigate
  and remove the secret (move it to env/.env); never bypass it silently.
- **"Pre-existing" requires proof.** Before blaming a failure on existing code, run
  it on `main` and show it fails there too — or call it unverified.
- **Re-verify branch + HEAD right before every commit/push** (parallel sessions can
  move them mid-turn).

## Skill routing

| Task | Use |
|------|-----|
| One full feature cycle | `/next` |
| Re-evaluate current branch | `/evaluate` · `/code-review ultra` (cloud) |
| Regression + drift check | `/regression` |
| Repo-aware plan (Rippletide rules) | `/plan` |
| Code review before commit/PR | `/code-review` |
| Debug a bug / failing test | `/investigate` (no fix without investigation) |
| Confirm a change works in the app | `/verify` · `/run` |
| Reuse/simplify pass (no bug hunt) | `/simplify` |
| Deep multi-source research | `/deep-research` |
| Project status | `/status` |
| Full autonomous run | `/loop` |

## Operational rules

- **Git**: feature on `feat/FEATURE_ID`, merge to main only on PASS.
- **Retries**: 5 fails → diagnose (respec / simplify / skip / escalate to human).
- **Milestones**: after each PASS check `milestones.json`. A checkpoint = STOP for
  Martin's review, AFTER build+eval — never before.
- **Regression**: `regression.sh` every sprint; any regression = automatic FAIL.
  Drift check every 10 features.
- **Budget**: check `_reports/spending.md` total vs cap before any charge; log every
  charge. At cap → stop.
- **Health**: append to `_reports/harness-health.md` each sprint (healthy = 60–80%
  first-attempt pass rate).
- **Crash recovery**: on restart check `progress.txt`, `git log`, orphaned branches;
  resume from the last clean state.

## Memory

Persistent memory across sessions, in priority order:
1. **File memory** — `.claude/.../memory/MEMORY.md` index + one-fact files. Recall
   before deciding; write non-obvious facts immediately.
2. **Rippletide MCP** — `recall()` before decisions, `remember()` decisions/findings/
   blockers, `relate()` entities, `invalidate()` stale info, `get_context()` before
   building a feature.

If you don't persist it, you lose it when context compacts.
