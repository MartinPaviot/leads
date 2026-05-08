# L1 Static — verdict

**Run** : 2026-05-08 (session continuation)
**Scope** : 75 commits (range `7538e8e..HEAD`, includes the audit-spec commit itself)

## Hard gates

| Gate | Cmd | Expected | Got | Verdict |
|---|---|---|---|---|
| TS errors — `apps/web` | `npx tsc --noEmit` | 0 | **0** | PASS |
| TS errors — `apps/admin` | `npx tsc --noEmit` | 0 | **0** | PASS |
| TS errors — `apps/worker` | `npx tsc --noEmit` | 0 | **0** | PASS |
| Vitest pass | `npx vitest run` | 205 files / 2586 tests / 1 skip / 0 fail | **205 / 2586 / 1 skip / 0 fail** | PASS |
| Migration prefix collision (this session) | `0044-0050` unique | 0 | **0** | PASS |
| Migration sequence gaps | continuous | 0 gaps | **0** | PASS |
| Per-commit file existence | each F-commit's files at HEAD | 17/17 commits clean | **17/17** | PASS |

**L1 verdict : PASS — all 7 gates green.**

## Notes / footnotes

### Pre-existing migration prefix duplicates (NOT a regression)

A naive prefix-uniqueness check on the *full* `drizzle/` tree shows 3
duplicate prefixes :
- `0012_tool_call_events.sql` + `0012_wandering_hemingway.sql`
- `0013_flawless_norrin_radd.sql` + `0013_memory_scope.sql`
- `0014_fluffy_shard.sql` + `0014_tree_fork_shared_prompts.sql`

These are **pre-session** and **intentional**. The team uses a custom
migration runner (`scripts/apply-migrations.ts`) that tracks applied
migrations by `filename` (not by numeric prefix) inside the
`__elevay_migrations` table. The runner's docstring explicitly notes
that drizzle-kit's journal only covers the first 15 migrations and
the rest are handled by filename. Both files at each duplicate prefix
land cleanly in production.

This audit's check has been re-scoped to the session window
(`0044-0050`) where the gate matters — and that window is clean.

### Test count anchor

2586 + 1 skipped = 2587 total. Same as the post-merge-train baseline
(`b09cef9` and onwards). No regressions ; no test count drop.

### Time

L1 active time : ~5 min (tsc + vitest dominate).

## Evidence files in this directory

- `tsc-web.txt` — 0 lines starting with `error TS`
- `tsc-admin.txt` — 0 lines starting with `error TS`
- `tsc-worker.txt` — 0 lines starting with `error TS`
- `vitest.txt` — full vitest output, ends with the 205/2586/1 line
- `migration-prefix-collisions.txt` — 3 entries (pre-session, documented above)
- `migration-prefix-collisions-session-scope.txt` — 0 entries (gate that matters)
- `migration-gaps.txt` — empty (no gaps in the 0000-0050 sequence)
- `commit-files.txt` — 17 lines, all `0 missing files`

## Next layer

L2 (unit + harden) — write 4 regression tests pinning the audit's named
edge cases :

1. `eval-schema-collision.test.ts` (F11)
2. `csp-allowlist.test.ts` (F16)
3. extend `stall-predictor.test.ts` for evidence on 4 indicator types (F17)
4. `posthog-provider.test.tsx` (F12 + F13 + F15)

Estimated time : 30 min.
