# CLAUDE.md

## What this is

**leadsens** (brand: **Elevay**) — a chat-first, fully autonomous GTM engine for early-stage founders running founder-led sales. Zero CRM data entry. No human SDR. No tool config to babysit. The founder talks; the engine works. We're building the thing founders actually want — the revenue motion they wish existed — and we're building it so it's *default alive*: it runs, it learns, it ships pipeline while you sleep.

## The bar

Taste and completeness aren't in tension here — AI makes the complete version nearly free, so the complete version is the only one with taste.

- **Boil lakes, flag oceans.** Completeness is almost free now, so *always* choose the complete implementation — every edge case, not the happy path. A lake is 100% coverage you can boil in minutes: boil it. An ocean is a full architectural rewrite: don't pretend it's a lake — flag it and let a human make the call. The delta between "works in the demo" and "works for everyone" is minutes. Pay it every time.
- **Three layers of knowledge.** Layer 1 — tried & true: don't reinvent it, stand on it. Layer 2 — new & popular: scrutinize before you trust. Layer 3 — first principles: prize this above all; it's where the real leverage lives. Search before you build. Use Context7 for any library *before* writing a line against it.
- **Completeness scoring.** Rate every option X/10: 10 = all edge cases handled, 7 = happy path only, 3 = shortcut you'll regret. Recommend the highest score. If you ship lower, say out loud what's missing and why.
- **100% test coverage is the goal, not the aspiration.** Every feature ships with tests. Every bug becomes a regression test — the bug never comes back, because the test won't let it. Tests are what make autonomous shipping safe. The work is the strategy: green tests *are* the moat.

## How we work

Per feature, the cycle is `OFFICE HOURS → SPEC → BUILD → EVALUATE → DOC UPDATE`. Each role knows exactly when it's done. Ship to learn — every loop produces evidence, not opinion.

- **Office hours** (founder/CEO lens). Problem in one sentence. Challenge the premise — is this even the thing to build? At least 2 alternatives. Run the layer check (1/2/3). Set the completeness target. Skip for trivially small work.
- **Spec** (Kiro-style, engineering lens). `_specs/FEATURE_ID/` → `requirements.md` (GIVEN/WHEN/THEN + edge cases), `design.md`, `tasks.md` — every task carries a verify step and a test to write.
- **Build.** Branch `feat/FEATURE_ID`. Per task: code → test → verify → commit. Bulk work goes through scripts, never N sequential tool calls.
- **Evaluate** (hostile QA — *guilty until proven innocent*). Playwright the live app against the acceptance criteria *literally*. Hit the edge cases. Use real data. Check for regressions. Score 0.0–1.0 across 5 dimensions. PASS → merge to main. FAIL → delete the branch and retry. Evidence over ego: the eval doesn't care how good the code felt to write.
- **Doc update.** After each PASS, fix any drift in the product spec and the design language.

Full phase methodology (Calibrate, Research, Plan) lives in `_harness/CHARTER.md` — read it on demand.

## Hard rules — earned in blood

These cost us before. Don't relearn them.

- **Write to disk now.** Context *will* compact. Every observation, finding, decision, test result, raw API response → a file within 30 seconds. Not from memory. Memory is a liability; the file is the truth.
- **Do it yourself.** If a tool can do it — reload, navigate, restart a server, run the tests, inspect computed styles — *you* do it. End on "voilà la vérification" with your own screenshot or log. Never end on "test it on your end." Only ask the human for genuinely human-only steps: real OAuth logins, physical-world actions, judgment calls.
- **Never ask permission to proceed.** Between phases, features, tasks — just go. Stop ONLY for: a `checkpoint: true` milestone with all features passing, the budget cap, a feature that has failed 5× (→ `_harness/escalation.md`), or an unrecoverable crash. No "or we stop here" off-ramps. Ever.
- **Commit frequently — one logical change each.** Split renames, refactors, tests, and behavior into separate, independently revertable commits. If the machine dies, only committed work survives. A `secret-scan` PreToolUse hook blocks any commit/push carrying a high-confidence secret — when it fires, find the secret, move it to env/.env, and remove it. Never bypass it silently.
- **"Pre-existing" requires proof.** Before you blame a failure on existing code, run it on `main` and show it fails there too. Otherwise it's unverified — which means it's yours.
- **Re-verify branch + HEAD right before every commit/push.** Parallel sessions move the tree mid-turn. Check, then commit.
- **One browser at a time.** Playwright drives ONE browser. Never launch background agents that touch Playwright while you're using it — that hijacks the session. Background agents are for non-browser work only. Screenshot the evidence: before, act, after, write the finding, sequential names (`001-accounts-empty.png`). Save raw HTML/network for every competitor page.

## Stack & commands

The project owns its config. Read it here; don't re-discover it. If you need a command that isn't listed, find it, use it, then add it here so it's never re-discovered.

- **Repo model: Orion is a SEPARATE repo** (its own Next/pnpm app, package **`@orion/web`**) — **not** a sub-project of the Elevay monorepo. The Elevay paths (`app/apps/web/src/...`) are the **SOURCE to COPY from**; in this repo the code lives under **`src/...`**.
- **Modules are COPIED (vendored), not imported.** The ~6 Elevay modules (`evaluateSend`, `IntelligenceBrief`+`buildIntelligenceBrief`, `recordCompanySignal`, the enrichment waterfall, canonical identity, the MCP server) **plus their schema dependencies** are copied into `src/` from the Elevay source. The Elevay `file:line` is the **provenance to copy**, never a workspace import. Re-port Elevay fixes manually (drift is the accepted cost). Copy the neighboring tests with each module.
- **DB is SHARED, unchanged.** `DATABASE_URL` points at the shared `leads` Supabase Postgres; runtime is scoped to tenant **`elevay`** via RLS (restricted role `elevay_app` + `withTenantTx` with `set_config(..., true)` TRANSACTION-LOCAL). The copied Drizzle schema **must match** the shared tables the copied modules use; Orion's net-new tables (`ingest_jobs/items`, `export_jobs`, `outbound_destinations`, `integration_credentials`, `signal_snapshots`) are added **additively** to the shared DB. Ledger stays `__elevay_migrations` (numbering continues from 0106).
- **Stack**: Next 15 App Router (Turbopack), React 19, Tailwind 4 (config-less), TypeScript; Drizzle ORM + `postgres-js` (DROP `@neondatabase/serverless`); next-auth v5 (beta); AI SDK v6 + `@anthropic-ai/sdk` (default to the latest Claude models); **Bg jobs**: Inngest — `inngest.createFunction` is 2-arg here (triggers in the config object, concurrency is an array), `id:"orion"`.
- **Tests**: Vitest (happy-dom + Testing Library), Playwright (e2e).

Run from the root of the Orion repo unless noted; CI filters **`@orion/web`**.

| Task | Command | Where |
|------|---------|-------|
| Dev | `pnpm dev` | repo root |
| Build / lint / types | `pnpm build` · `pnpm lint` · `pnpm tsc` | repo root |
| Unit tests | `pnpm test` (Vitest) · `pnpm --filter @orion/web tsc/test/build` | repo root |
| Eval gate | `pnpm eval:run` | `@orion/web` |
| E2E | `pnpm e2e` (`e2e:install` first time) | `@orion/web` |
| DB migrate | `pnpm db:migrate:apply` (custom runner) | `@orion/web` |
| DB push (dev) | `pnpm db:push` | `@orion/web` |
| DB studio | `pnpm db:studio` | `@orion/web` |

**Migrations are special.** `db:migrate` (drizzle-kit) is intentionally disabled and errors out (`exit 1`) — the journal isn't the source of truth. Use `db:push` for dev; use `db:migrate:apply` (custom runner, `scripts/apply-migrations.ts`, copied from Elevay) to apply; apply to the shared DB via `DATABASE_URL_OWNER` (owner role = migrations only, never at runtime). Ledger table stays **`__elevay_migrations`** (shared DB → numbering continues from 0106). Dev DB = `leadsens-localdev`; demo runs on the instance that carries tenant `elevay`.

**Seams to COPY from Elevay (vendored — copy the source, don't rewrite, don't import via workspace).** The `file:line` below is the **provenance in the Elevay source** to copy from into `src/`:
- MCP server: copy from Elevay `app/api/mcp/route.ts` → `src/app/api/mcp/route.ts` (JSON-RPC; `MCP_TOOLS` at :19, `handleTool` at :293; Bearer `mcp_*` auth via `tenants.settings.mcpApiKeys`).
- Send guardrails: copy `evaluateSend` from Elevay `lib/guardrails/sending-gate.ts:212` — 8 gates, fail-closed. Everything outbound passes through it.
- Intelligence brief: copy `IntelligenceBrief` from Elevay `lib/campaign-engine/types.ts:50` + `buildIntelligenceBrief` from `build-intelligence-brief.ts:26` (cache `intelligenceBriefs`, 14 days).
- Signals: copy `recordCompanySignal` from Elevay `lib/signals/record-signal.ts:86` (writes `properties.signals[]`).
- Enrichment waterfall: copy from Elevay `lib/providers/company-enrichment/registry.ts` + `precedence.ts`.
- Identity: copy from Elevay `db/canonical/identity.ts:67` + `upsert.ts:108`.
- CSV import: copy from Elevay `app/api/import/smart/route.ts`.
- Instantly adapter: copy from Elevay `providers/instantly/send-adapter.ts:19` (`toInstantlyCustomVariables`, scalars only).

**Non-negotiable directives:**
- Cold sends go out from **Elevay-owned infra** (owner-SMTP, DNS-verified). **Never Instantly for our cold sends** — it conflicts with warmup and kills the channel. Instantly / Fiber / OrangeSlice are *the client's* outbound tools that **consume our brief** — they are not our sending path.
- **No enrichment by default.** FullEnrich is banned by name. LinkedIn (Sales-Nav, native `linkedin_url`) is the primary channel.
- **`tenantId` always comes from the Bearer token, never from an argument.** No exceptions.

## Memory

Persistent memory across sessions is **file memory** — `.claude/.../memory/MEMORY.md` index plus one-fact files. Recall before you decide. Write any non-obvious fact the moment you learn it. If you don't persist it, you lose it the instant context compacts — and a fact you have to rediscover is a fact you didn't really own.