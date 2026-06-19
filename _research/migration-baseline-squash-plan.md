# Migration baseline squash — plan

_Authored 2026-06-18. Goal: make `app/apps/web/scripts/apply-migrations.ts` able to
rebuild a fresh database exactly, by replacing the 81 tangled migrations with one
clean baseline generated from the real schema._

## Why (confirmed by iterative replay testing on leadsens-localdev)

The 81 `drizzle/*.sql` files cannot replay on a fresh DB. Distinct root causes found:

1. **Premature ALTER** — `0012_wandering_hemingway` altered `custom_skill_templates`
   before `0019` creates it. → fixed in commit `4680bafc`.
2. **Typo** — `auth_users` → `auth_user` FK targets in `0024/0025/0026`. → fixed in `4680bafc`.
3. **Runtime-only tables** — `embeddings`, `custom_records` are created at app startup
   (`src/db/ensure-vector-index.ts`, `ensure-custom-records.ts`), never by a migration,
   yet `0029` ALTERs `embeddings`.
4. **Snapshot duplication** — `0012_wandering_hemingway` (a `drizzle-kit generate`
   snapshot) re-creates `agent_tasks` / `code_executions` / `knowledge_entries`
   (CREATE + FK + index) that the granular migrations `0033/0034/0036` also create
   → "already exists" (and Postgres has no `ADD CONSTRAINT IF NOT EXISTS`).
5. **PL/pgSQL ambiguity** — `0038_rls_full_coverage` DO block declares a `table_name`
   variable colliding with the `information_schema.tables.table_name` column.
6. **Fidelity gap (the decisive one)** — `0038`'s RLS loop creates tenant-isolation
   policies on 49 tables but never checks each has `tenant_id`; in the replayed schema
   at least one (e.g. `users`) lacks it → fail. **Meaning: even fully patched, the
   replay does not reproduce prod's actual schema.** Patching → a subtly-wrong schema.

Patching 1–5 got the runner from "fails at 0012" to "fails at 0038" (43/81). #6 proves
patching can't yield a faithful rebuild. The correct remedy is a baseline squash.

## Goal

Replace the 81 migrations with a single `drizzle/0000_baseline.sql` generated from the
**real** schema, so a fresh DB rebuilds exactly. Clean history from there.

## Prerequisite — needs Martin (one manual step)

A privileged structure-only dump of the prod project `leadsens-dev`
(ref `wdgwytpaxuvgigqgzxrw`) `public` schema. The `elevay_app` pooler role we have is
NOT enough (non-owner → misses objects). So:

- In Supabase dashboard → project `leadsens-dev` → Project Settings → Database → reveal
  or reset the **`postgres` (superuser) password**, then give it to me, OR run it yourself.
- I then dump with the Supabase CLI (already installed):
  `supabase db dump --db-url "postgresql://postgres:<PW>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres" --schema public -f 0000_baseline.sql`
  (captures extensions, enums, tables, indexes, constraints, RLS policies, functions, triggers).

## Steps (I execute, on a dedicated branch/worktree off `main`)

0. **Isolate**: do this in a git worktree off `main` — NOT `feat/cle-m1` (the parallel
   session commits to it constantly).
1. Dump prod `public` schema → raw `0000_baseline.sql`.
2. **Clean** the dump: strip ownership/ACL noise and Supabase-internal grants; keep
   the DDL (extensions/types/tables/indexes/constraints/policies/functions/triggers).
3. **Archive** the 81 existing migrations → `drizzle/_archive/` so the runner sees only
   the baseline (+ future migrations). The custom runner ignores `drizzle/meta/`.
4. **Reconcile existing DBs** so the runner never tries to run the baseline on a
   populated DB: a one-time script `INSERT`s a `__elevay_migrations` row for
   `0000_baseline.sql` (with its hash) WITHOUT executing it, on prod and every existing
   environment. (Already-recorded archived filenames stay recorded → harmless.)
5. **Verify**: reset `leadsens-localdev`, run `apply-migrations` → only the baseline
   applies → full schema. Compare table/column/policy counts to prod; boot app → HTTP 200.
6. **Going forward**: `drizzle-kit generate` produces `0001_*.sql` on top of the baseline.
   The runtime `ensure*` functions become redundant (baseline creates those tables); leave
   as no-op safety nets or remove later.

## Risks

- **History rewrite** — every existing environment must get the baseline marked applied
  (step 4), else its runner errors on next deploy. Inventory all envs first.
- pg_dump captures Supabase internal grants — clean carefully to public-schema DDL.
- Ship as a reviewed PR; sequence the merge so env reconciliation happens at deploy.

## Status of work already done
- `4680bafc` (on `origin/feat/cle-m1`): fixes #1 and #2 — keep regardless.
- All other exploratory patches were reverted (superseded by this baseline approach).
