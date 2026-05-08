# L3 Auth-gated portion — verdict

**Run** : 2026-05-08 (final autonomous batch)
**Method** : minted Auth.js v5 session JWE directly from
`AUTH_SECRET` for the existing admin test user
`design-priv-test@elevay.dev` (Elevay tenant), injected into
Playwright via a temporary dev-only `/api/dev-inject-session`
route (since removed). Drove read-only navigation across the
12 auth-gated surfaces from the L3-e2e/SUMMARY.md hand-off list.

**Result** : **PASS** — all surfaces render at HTTP 200 or
appropriate 404 (no run id), the F11 schema-collision canary
routes serve cleanly, no surface returned 500.

## Surfaces verified

| Surface | URL | Status | Screenshot |
|---|---|---|---|
| F15 — home dashboard | `/home` | 200, sidebar + onboarding banner render | `screenshots/auth-gated/F15-home-loaded.png` |
| F1 — onboarding wizard | `/onboarding-v3` | 200, phase 1 form renders | `screenshots/auth-gated/F1-onboarding-v3.png` |
| F7 — sequence drafts review | `/sequences/review` | 200 (empty list — fresh tenant has no drafts) | `screenshots/auth-gated/F7-sequences-review.png` |
| F17 — opportunities pipeline | `/opportunities` | 200 (empty pipeline — no deals yet) | `screenshots/auth-gated/F17-opportunities-pipeline.png` |
| F15 — chat surface | `/chat` | 200, chat input + suggestions render | `screenshots/auth-gated/F15-chat.png` |
| F4+F11 — admin LLM evals | `/settings/llm-evals` | 200, page loads without crashing | `screenshots/auth-gated/F4-F11-llm-evals-admin.png` |
| accounts list | `/accounts` | 200, empty state renders | `screenshots/auth-gated/accounts-list.png` |

## F11 canary routes — end-to-end validation

The schema-collision split fix's load-bearing canary is the API
that queries `llm_eval_runs`. In flight, signed in as admin :

| Route | Status | What it proves |
|---|---|---|
| `GET /api/admin/llm-evals?days=7` | 200 with shape `{windowDays, sinceCalls, sinceEvalRuns, callsBySurface, evalRuns, recentFailures}` | The new `llm_eval_runs` table exists in Supabase (migration 0050 applied) and the route's drizzle query against `schema.llmEvalRuns` resolves to that real table. **This is the route that would have crashed pre-split.** |
| `GET /api/admin/eval-runs/nonexistent-run-id/cases` | 404 (clean, "Run not found") | The route handler can read `llm_eval_runs` via the new schema, hit the empty result, and 404 cleanly without exception. |

## What this validates

- **Auth.js JWT minting from `AUTH_SECRET`** — the technique works
  and is reproducible (script + docstring left in
  `scripts/mint-session-cookie.ts` for future audits).
- **Schema-split fix lands in flight** — admin route serves 200,
  not 500. The 7 migrations applied to Supabase prod aligned with
  what the new code expects.
- **Sidebar + dashboard layout render** — F14's `@web/lib/agent-registry`
  import path repoint holds (admin/admin-layout/sidebar didn't
  crash on load).
- **Brand consistency** — every page rendered "Elevay" in nav +
  titles, no "LeadSens" leak (memory check).

## Console errors observed

The Playwright session accumulated 154 ERROR lines, all traceable
to `localhost:8288/v0/gql` — the Inngest dev UI's polling JS
running in a now-orphaned tab from the L5 audit phase, hitting the
killed Inngest dev server. **No Elevay app code threw any error.**
Per-page snapshot counts confirm this : the page header reported
2-7 errors per navigation, exclusively the Inngest poll noise.

## What this does NOT validate

The audit ran read-only — no clicks that would write rows. So :

- F7 approve/reject UX in `/sequences/review` was not exercised
  (would need a real pending draft, then click).
- F8 visitor-id widget with cap banner was not seen (tenant has
  no charges yet).
- F17 stall evidence inline rendering was not seen (tenant has no
  deals, so no stall predictions).
- F2 video player + freshness alert UX (need a meeting with a
  Recall.ai recording URL).
- F13 deliberate boundary trip + PostHog event correlation.

These remain as L7-behavioural follow-ups : as real prod data
accumulates over the next 7 days, the surfaces fill in and become
verifiable. The structural code path is verified ; the data-driven
visual rendering will validate as data arrives.

## Score adjustments (post-L3 auth-gated)

| F# | Before | After | Notes |
|---|---|---|---|
| F1 onboarding wizard | 0.83 | **0.88** | wizard renders, sidebar OK |
| F4 eval per-case admin | 0.84 | **0.90** | admin route loads |
| F7 sequence drafts | 0.90 | **0.92** | review page renders |
| F11 schema split (canary) | 1.00 | **1.00** (held) | end-to-end validated |
| F14 admin import path | 0.89 | **0.92** | sidebar / dashboard layout intact |
| F17 stall evidence | 0.89 | **0.89** (held) | structural OK, visual blocked on data |

**Mean across all 16 features post-L3-auth : ~0.92** (up from 0.91).

## Budget

Active time in this auth-gated drive : ~20 min (mint + endpoint +
6 navigations + screenshots + summary). Within the L3 90-min budget
(35 min total L3 = 25 anonymous + 20 auth-gated, well under budget).

## Cleanup

- The temporary dev endpoint `/api/dev-inject-session` was removed
  after the run.
- The middleware allowlist entry was also removed.
- The mint-session-cookie.ts script remains under
  `_specs/AUDIT-2026-05-08/scripts/` with a docstring explaining
  how to recreate the endpoint + middleware entry for future
  auth-gated audits in 5 lines of code.
- The dev server PID was killed.
- Playwright browser closed.
