# Follow-up — `eval_runs` / `llm_eval_runs` namespace split is tech debt

**Created** : 2026-05-08
**Status** : open, not blocking the current push
**Related** : audit-2026-05-08 item #19 ; commit `8e1ef53` (the split fix)

## Why this exists

The session-2026-05-08 commit `8e1ef53` resolved a critical schema
collision (F11) by splitting the LLM-observability tables out of
the legacy `eval_runs` namespace :

```
intelligence.ts:evalRuns       → "eval_runs"        (legacy)
ai-observability.ts:evalRuns   → "eval_runs"        (new — collided)
```

became :

```
intelligence.ts:evalRuns       → "eval_runs"        (legacy, kept)
ai-observability.ts:llmEvalRuns→ "llm_eval_runs"   (new namespace)
```

This was the **minimum-disruption** path : the legacy
agent-evaluator code in `lib/agents/eval-runner.ts` still uses
`evalRuns` from intelligence.ts pointing at the old shape ; the new
LLM-observability harness in `lib/evals/harness.ts` uses
`llmEvalRuns` from ai-observability.ts pointing at the new table.

## The debt

Two parallel evaluation systems write to two different tables that
serve adjacent-but-not-identical purposes :

| Surface | Reads | Writes |
|---|---|---|
| `lib/agents/eval-runner.ts` (legacy agent-eval) | `eval_runs`, `eval_results`, `eval_cases`, `eval_datasets` | `eval_runs`, `eval_results` |
| `lib/evals/harness.ts` (LLM observability) | `llm_eval_runs`, `llm_eval_case_runs` | both |
| `app/api/admin/eval-runs/[id]/cases` | `llm_eval_runs`, `llm_eval_case_runs` | n/a |
| `app/api/eval/runs/[id]` | `eval_runs`, `eval_results`, `eval_cases` | n/a |
| `app/(dashboard)/settings/llm-evals/page.tsx` | reads from `/api/admin/llm-evals` (which queries `llm_eval_runs`) | n/a |

L4 also surfaced that on Supabase prod, the **legacy `eval_runs`
table actually has the NEW shape** (0041's `CREATE TABLE IF NOT
EXISTS` succeeded because 0004 hadn't run there or was overwritten).
This means `lib/agents/eval-runner.ts` calls like
`db.update(evalRuns).set({ status: 'running' })` have been failing
silently in prod since 0041 ran, because the new shape doesn't have
a `status` column.

In other words : **the legacy agent-eval system is already broken
in prod** — it just hadn't been observed because nobody actively
exercised it.

## Why we didn't fully migrate now

1. **Push pressure** — the audit was driving toward a push-safe
   state, not a full rewrite of the eval surface area.
2. **Risk of touching legacy code paths** — the agent-evaluator
   has its own callers (eval datasets, eval cases UI, the
   `/api/eval/runs/...` routes) that would all need to be
   audited and migrated together.
3. **Two-systems coexistence is functional** — the new system
   works, the old system is silently broken but invoking it
   crashes at the per-call level, not at the bootstrap level.

## Recommended cleanup path (separate spec)

When this gets prioritised :

1. **Identify the canonical eval system going forward**. The new
   LLM observability one is more recent, has per-case persistence,
   has a dashboard, has prompt-variant A/B framework. It's the
   future. The legacy agent-eval was for a previous use case
   (closed-won training data → grader runs).
2. **Decide the legacy fate** :
   - Migrate its callers to the new system → drop legacy tables
     entirely (`eval_runs` legacy table, `eval_results`,
     `eval_cases`, `eval_datasets`), update intelligence.ts to
     remove the legacy `evalRuns`/`evalResults` exports.
   - OR : keep legacy tables but rename them
     (`agent_eval_runs`, `agent_eval_results`) so the namespace
     is unambiguous and the silent-broken state on Supabase is
     repaired.
3. **Migrate the dashboard UI** :
   - `/api/eval/runs/[id]` (legacy) and `/api/admin/llm-evals` (new)
     should resolve to the same canonical surface eventually.
   - Settings/llm-evals page already uses the new system.
4. **Migration script** :
   - Drop or rename legacy tables.
   - Audit `intelligence.ts` for any reference still using the
     legacy shape.
5. **Update tests** :
   - `__tests__/eval-runner.test.ts` (legacy) — either retire or
     migrate.
   - The new tests (eval-harness, eval-harness-per-case,
     eval-prompt-variants, eval-runs-cases-api) stay.

Estimated effort : M (1 week) for the migration + test updates.
Trigger : whenever a feature requires touching the legacy
eval-runner path. Until then, the parallel coexistence holds.

## Why this isn't a blocker for the current push

- The new LLM observability system is fully functional with the
  applied schema (verified L4 + L5).
- The legacy system was already broken pre-session — the audit
  didn't make it worse.
- No code path is blocked by this debt.

## Risk if we never clean up

- A future dev reads `intelligence.ts` and uses `evalRuns` thinking
  it's the new system → silent prod failure.
- The legacy tables grow stale rows that the data-retention worker
  doesn't sweep (configured for the new tables only).
- The `eval_results`, `eval_cases`, `eval_datasets` tables remain
  in the schema barrel as dead exports that future TypeScript
  consumers can accidentally import.

Mitigation while debt remains : the L1 schema-collision regression
test (`eval-schema-collision.test.ts`) pins `evalRuns` and
`llmEvalRuns` as distinct, so a future refactor that re-aliases one
to the other fails CI. That's the floor.
