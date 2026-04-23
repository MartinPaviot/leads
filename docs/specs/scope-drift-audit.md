# Scope Drift Audit — WS-0 through WS-8

**Audit date:** 2026-04-22
**Auditor:** Claude Code (Opus 4.6)
**Trigger:** Martin's post-checkpoint review of d457f0a and the 3 items validated without a spec.
**Method:** `git show --stat` on each squash-merge commit (#5–#24), cross-referenced against the WS spec that claimed the PR.

---

## 1. PR-level findings

### 1.1 CATASTROPHIC DRIFT — PR #5 (`9a1d937`) "WS-0 PR 1"

| Metric | Expected | Actual |
|---|---|---|
| LOC | ~300 | +12,168 / -226 |
| Files | ~8 | 97 |
| Migrations | 0 | 4 (0020, 0021, 0022, 0023) |

**In-scope WS-0 content (~450 LOC):**
- `lib/analytics.ts` extensions (+62)
- `lib/observability.ts` registry entries (+20)
- `lib/tenant-settings.ts` TTFAA fields (+44)
- `lib/ttfaa.ts` + test (+396)
- `analytics-events.test.ts` extension (+10)
- `docs/specs/WS-0-spec.md`, `WS-0-plan.md` (+649, prose)

**Out-of-scope features shipped under this label:**

| # | Feature | Key files | Est. LOC | Has spec? |
|---|---|---|---|---|
| 1 | Monaco coaching (diagnosisHeading + evidence quotes) | `skills/intelligence/sales-coaching/handler.ts`, `schema.ts` | ~100 | No |
| 2 | Signal-anchored email outreach | `skills/outreach/email-drafting/handler.ts` | ~15 | No |
| 3 | Emoji → lucide cleanup | `accounts/[id]/page.tsx`, `opportunities/page.tsx` | ~20 | No (memory-driven) |
| 4 | Monaco competitive docs | `MONACO-STRONG-POINTS-MATRIX.md`, `onboarding-audit-2026-04-21.md`, `monaco-parity-diff.md` | ~1,236 | No |
| 5 | Inbox inline "Draft AI reply" | `inbox/page.tsx` | ~93 | No |
| 6 | Investor-overlap signal skill | `skills/signals/investor-overlap/*` (3 files) | ~214 | No |
| 7 | Company-enrichment waterfall | `lib/providers/company-enrichment/*` (8 files), `_specs/PROVIDER-ABSTRACTION/*` (3 files) | ~825 | Own spec exists but no Martin approval |
| 8 | LLM budget enforcement | `lib/llm-budget.ts`, test | ~284 | No (described as "primitive #5") |
| 9 | Relationship graph + KNOWS edges + warm-paths API | `lib/relationship-graph.ts`, `api/warm-paths/route.ts`, `inngest/relationship-graph-builder.ts`, test | ~568 | No (described as "primitive #2") |
| 10 | Sequence dispatch abstraction | `lib/sequence-dispatch/*` (7 files), migration 0020 | ~233 | No (described as "primitive #3") |
| 11 | Signal outcomes + Bayesian multipliers | `lib/signal-outcomes.ts`, `lib/signal-detectors.ts`, test, migration 0021 | ~372 | No (described as "primitive #4") |
| 12 | Inbound visitor-ID pixel | `lib/inbound/*`, `public/leadsens-pixel.js`, `api/public/pixel/track/route.ts`, test, migration 0022 | ~379 | No (described as "primitive #6") |
| 13 | Score-with-signals bonus scoring | `lib/score-with-signals.ts`, `api/score/route.ts`, test | ~96 | No |
| 14 | TAM streaming infrastructure | `api/tam/build/route.ts`, `lib/tam-stream/*` (8 files), `hooks/use-tam-stream.ts`, `components/tam-build-progress.tsx`, `components/signal-chip.tsx` | ~2,758 | No |
| 15 | Custom signals | `api/custom-signals/route.ts`, `lib/custom-signals/*` (3 files), `inngest/custom-signal-backfill.ts`, `settings/signals/page.tsx`, `scripts/run-migration-0023.ts`, migration 0023 | ~1,074 | No |
| 16 | Onboarding narrative streaming | `api/onboarding/narrate-website/route.ts` | ~190 | No |
| 17 | TAM estimate endpoint | `api/tam/estimate/route.ts` | ~87 | No |
| 18 | Accounts page rewrite | `accounts/page.tsx` | ~491 | No |
| 19 | Onboarding wizard wow effects | `components/onboarding-wizard.tsx` | ~270 | No |
| 20 | Apollo client signal-grade filters | `lib/apollo-client.ts` | ~48 | No |
| 21 | CSS additions | `globals.css` | ~17 | No |

**Root cause:** The previous session(s) built multiple features in parallel on main, then squash-merged the entire working tree into a single PR labeled as WS-0 PR 1. The PR review on GitHub (#5) would have shown 97 files — there is no way this passed a scope-aware review.

### 1.2 MODERATE DRIFT — PR #10 (`550e342`) "WS-1 PR A"

| Metric | Expected (schema + migration + settings) | Actual |
|---|---|---|
| LOC | ~400 | +2,639 / -71 |
| Files | ~5 | 17 |

**In-scope WS-1 content (~1,400 LOC):**
- Migrations 0024 + 0025, `db/schema.ts`, `tenant-settings.ts`, `ws-1-guardrail-defaults.ts`, `ws-1-migration.test.ts`, `run-ws1-migration/route.ts`, `WS-1-spec.md`, `WS-1-plan.md`

**Out-of-scope content (~1,200 LOC):**
- `tam-stream-reducer.test.ts` (387 LOC) — TAM stream, not WS-1
- `tam-stream-signals.test.ts` (396 LOC) — TAM stream, not WS-1
- `tam-stream-verify-source.test.ts` (110 LOC) — TAM stream, not WS-1
- `probe-apollo-filters.ts` (104 LOC) — Apollo probe script, not WS-1
- `verify-migration-0023.ts` (97 LOC) — custom signals migration verification, not WS-1
- `tam/build/route.ts` (~80 LOC changed) — TAM build fixes, not WS-1
- `use-tam-stream.ts` (~39 LOC changed) — TAM stream hook, not WS-1
- `accounts/page.tsx` (2 LOC) — accounts display fix, not WS-1

### 1.3 MINOR DRIFT — PR #12 (`1cf93ac`) "WS-1 PR C"

| Metric | Expected (trust-score library + nudges) | Actual |
|---|---|---|
| LOC | ~400 | +780 / -8 |

**In-scope WS-1 content (~750 LOC):**
- `guardrails/trust-score.ts` (315), `guardrails-trust-score.test.ts` (364), `nudges/autonomy/route.ts` (80)

**Out-of-scope content (~30 LOC, 4 bug fixes):**
- `apollo-client.ts` — searchPeople endpoint URL fix
- `relationship-graph.ts` — warm-paths SQL rewrite
- `waterfall.ts` — TypeScript strict-mode cast fix
- `probe-apollo-filters.ts` — tsc header fix

These are legitimate runtime bug fixes but were not tracked separately.

### 1.4 CLEAN — Content matches spec

| PR | Commit | WS | LOC | Verdict |
|---|---|---|---|---|
| #8 | `6a3560e` | WS-0 PR 2 | +529 | In-scope, slightly over 400 threshold |
| #9 | `7f52179` | WS-0 PR 3 | +875 | In-scope (300 code + 500 prose), docs inflate LOC |
| #13 | `ea1fe70` | WS-1 PR D | +365 | In-scope, under 400 |
| #15 | `f2e9e9b` | WS-2 PR A | +257 | In-scope, under 400 |
| #16 | `1b15112` | WS-2 PR B | +575 | In-scope, over 400 |
| #17 | `b63fc16` | WS-2 PR C | +326 | In-scope, under 400 |
| #18 | `6838738` | WS-3 PR A | +563 | In-scope, over 400 |
| #19 | `4073b26` | WS-3 PR B | +246 | In-scope, under 400 |
| #20 | `360eac9` | WS-4 | +172 | In-scope, under 400 |
| #21 | `d2cec61` | WS-6 | +287 | In-scope, under 400 |
| #22 | `64e06a8` | WS-7 | +531 | In-scope, over 400 |
| #23 | `834400a` | WS-8 | +548 | In-scope, over 400 |
| #24 | `63fa04a` | WS-5 | +110 | In-scope, under 400 |

### 1.5 LOC THRESHOLD — Over 400 but in-scope

| PR | Commit | WS | LOC | Should have been |
|---|---|---|---|---|
| #9 | `7f52179` | WS-0 PR 3 | +875 | 2 PRs (code vs docs) |
| #11 | `1cb6d87` | WS-1 PR B | +742 | 2 PRs (approval-mode vs sending-identity) |
| #14 | `4e4fab6` | WS-1 PR E | +1,449 | 3 PRs (encryption, Instantly, settings UI) |
| #16 | `1b15112` | WS-2 PR B | +575 | Borderline — single component, hard to split |
| #18 | `6838738` | WS-3 PR A | +563 | Borderline — ranker + 2 routes + tests |
| #22 | `64e06a8` | WS-7 | +531 | Borderline — schema + library + tests |
| #23 | `834400a` | WS-8 | +548 | Borderline — page + route + library |

---

## 2. Surprise features in production

The following features exist in production without a spec that Martin approved. They were silently introduced in PR #5 under the WS-0 PR 1 label.

### 2.1 Architectural primitives (6)

These were described in commit messages as "primitives ①-⑥" from a "Monaco-parity plan" that was never committed to the repo as a spec.

1. **Company-enrichment waterfall** — provider registry + Apollo adapter + LLM fallback. Files: `lib/providers/company-enrichment/*`. Has its own `_specs/PROVIDER-ABSTRACTION/` but no Martin approval on record.
2. **Relationship graph KNOWS edges** — warm-intro discovery from activity aggregation. Files: `lib/relationship-graph.ts`, `api/warm-paths/route.ts`.
3. **Sequence dispatch abstraction** — channel-agnostic step dispatcher with email + LinkedIn stub. Files: `lib/sequence-dispatch/*`, migration 0020.
4. **Signal outcomes + Bayesian multipliers** — outcome-driven scoring from won/lost deals. Files: `lib/signal-outcomes.ts`, `lib/signal-detectors.ts`, migration 0021.
5. **LLM budget enforcement** — per-tenant monthly cap with pre-dispatch gate. Files: `lib/llm-budget.ts`. Note: this is now load-bearing — WS-1 enforcement and the custom-signals route depend on it.
6. **Inbound visitor-ID pixel** — write-key gated tracking pixel. Files: `lib/inbound/*`, `public/leadsens-pixel.js`, `api/public/pixel/track/route.ts`, migration 0022.

### 2.2 User-facing features (8)

7. **TAM streaming infrastructure** — NDJSON build endpoint, 4 signal detectors (investor overlap, funding recent, hiring intent, YC company), reducer-based React hook, progress UI. Files: `api/tam/build/route.ts`, `lib/tam-stream/*`, `hooks/use-tam-stream.ts`, `components/tam-build-progress.tsx`, `components/signal-chip.tsx`.
8. **Custom signals** — create/list API, LLM plan generator, 3-tier detector, Inngest backfill, settings UI page. Files: `api/custom-signals/route.ts`, `lib/custom-signals/*`, `inngest/custom-signal-backfill.ts`, `settings/signals/page.tsx`, migration 0023.
9. **Onboarding narrative streaming** — "we get you" card during wizard. Files: `api/onboarding/narrate-website/route.ts`.
10. **TAM estimate endpoint** — live addressable-market chip during ICP step. Files: `api/tam/estimate/route.ts`.
11. **Inbox inline "Draft AI reply"** — surfaces existing suggest-reply endpoint in the inbox view. Files: `inbox/page.tsx`.
12. **Investor-overlap signal skill** — common-investor detection for warm intros. Files: `skills/signals/investor-overlap/*`.
13. **Score-with-signals integration** — wires outcome multipliers into live scoring. Files: `lib/score-with-signals.ts`.
14. **Accounts page rewrite** — signal chips, TAM build trigger, warm-intro paths. Files: `accounts/page.tsx` (+491 LOC).

### 2.3 Improvements without spec (3)

15. **Monaco coaching improvements** — diagnosisHeading + evidence quotes. Files: `skills/intelligence/sales-coaching/*`.
16. **Signal-anchored email outreach** — opener references specific signals. Files: `skills/outreach/email-drafting/handler.ts`.
17. **Emoji → lucide cleanup** — 2 surfaces. Files: `accounts/[id]/page.tsx`, `opportunities/page.tsx`.

### 2.4 Documentation without spec (3)

18. **Monaco strong-points matrix** — 58-point parity scoring. File: `_research/teardown-monaco/MONACO-STRONG-POINTS-MATRIX.md`.
19. **Onboarding audit** — v1 bug inventory. File: `_reports/onboarding-audit-2026-04-21.md`.
20. **Monaco parity diff** — feature gap analysis. File: `_reports/monaco-parity-diff.md`.

---

## 3. Risk assessment

### 3.1 What's load-bearing now

Several surprise features are now dependencies of spec'd workstreams:

- **LLM budget** (#5 in §2.1) is consumed by `tracedGenerateObject/Text/StreamText` in every LLM call, and by the custom-signals route. Removing it would break all LLM calls.
- **Relationship graph** (#2 in §2.1) is consumed by WS-3 warm-leads (`lib/warm-leads.ts` calls `findWarmPathsToCompanies`).
- **TAM streaming** (#7 in §2.2) is the backing implementation for WS-4 (async TAM reveal) and the accounts page.
- **Migrations 0020-0023** have presumably been applied to the production database. Rolling them back requires reverse migrations.

### 3.2 What could be removed

- **Inbound pixel** (#6) — no UI surfaces it, no cron processes visitors. Dormant.
- **Sequence dispatch** (#3) — LinkedIn adapter is a stub. Email adapter delegates to legacy. Could be removed without functional impact.
- **Signal outcomes** (#4) — wired to deals PUT but results may not be surfaced anywhere.
- **Investor-overlap skill** (#12) — registered but unclear if any cron runs it.
- **Inbox Draft AI reply** (#11) — additive UI, low risk but unapproved UX.

### 3.3 Latent risks

- **4 database migrations** (0020-0023) shipped without schema review.
- **Inbound pixel** accepts POST from any origin (CORS open). Write-key validation exists but the endpoint surface is public.
- **Custom signal LLM judge prompt** is user-authored free text passed to an LLM — prompt injection vector if a malicious user crafts a signal description.

---

## 4. Recommendations

1. **Retroactive specs for load-bearing features.** Items that are now dependencies (LLM budget, relationship graph, TAM streaming, custom signals) need one-page retroactive specs documenting scope, success criteria, and known limitations. These don't need to be full Kiro-style specs — a "what exists and why" document is sufficient.
2. **Security review for public endpoints.** The inbound pixel (`/api/public/pixel/track`) and custom signal judge prompt path need a focused security review before any production traffic.
3. **Do not remove load-bearing features.** Attempting to undo the drift by removing code would break WS-1 through WS-8. The cost of retroactive documentation is lower than the cost of regression.
4. **Enforce squash-merge scope going forward.** The root cause is that multiple features were developed on main (or a single branch) and squash-merged under a misleading label. The 150 LOC direct-to-main amendment plus strict branch-per-feature discipline prevents recurrence.

---

## 5. Direct commit on main

| Commit | LOC | On main? | Content |
|---|---|---|---|
| `d457f0a` | +135 / -7 | Yes (direct push) | Bug fixes for custom-signals FK, admin gate removal, TAM estimate double-conversion + 2 dev scripts |
| `1cf93ac` | +780 / -8 | Yes (PR #12 merge) | WS-1 PR C trust-score + 4 bug fixes |
| `0ea5751` | +320 / -64 | No (orphaned, was on main per reflog) | TAM stream runtime fixes — absorbed into PR #10 squash |
| `115510b` | +21 / -8 | No (orphaned) | 4 pre-existing bugs — absorbed into PR #12 squash |
| `de4eeca` | +1 / -1 | No (orphaned) | use-tam-stream rename — orphaned after squash |

Note: `0ea5751` reflog entry `refs/heads/main@{18}: commit` proves it was committed directly to main before being overwritten by subsequent squash merges. This implies main's history was rewritten at some point (force push or interactive rebase), which is itself a process violation.

---

End of audit.
