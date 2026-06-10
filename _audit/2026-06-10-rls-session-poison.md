# Post-mortem — new-user sign-in broken by RLS pool poisoning (2026-06-10)

## Symptom

Paul Madelenat (`paul.madelenat@pilae.ch`), invited to workspace 47dca783 at 17:44 UTC,
could not create/access his account. Every attempt ended on:

> "Sign-in failed mid-flow. Please try again — if it keeps happening, contact support."

That copy maps to NextAuth's `CallbackRouteError` (`SIGN_IN_ERROR_COPY` in
`src/lib/auth/auth-callback.ts`) — an exception thrown inside the auth callback.

Prod runtime logs (deployment `dpl_qK9joS2sRz95PBpE9YXqCiUGysPv`):

- 18:00:08 + 18:01:30 — `POST /sign-in` → `[auth][error] CallbackRouteError`
- 18:01:17 — `POST /sign-up` → 500, same error

Full `[auth][cause]`: `Failed query: insert into "users" (...) returning ...` with params
`(<new users.id>, 07b07b0d-… [Paul's auth_user id], 6812dc25-… [a brand-new tenant id],
paul.madelenat@pilae.ch, admin)` — thrown from `Object.jwt` → `resolveUserTenant` in
`src/auth.ts` (first-sign-in tenant+user bootstrap).

## DB state found (probe, read-only)

- `auth_user` row for Paul EXISTS with `password_hash` (the sign-up form's inserts worked)
- `auth_account` credentials row EXISTS
- `users` row: NONE (the jwt callback's insert is what dies)
- invite `32cff545-…`: still `pending`, expires 2026-06-17
- 0 rows in `failed_signin_attempts` for his email hash (not a lockout)
- orphan `tenants` rows leaked: the tenant insert succeeded, the user insert failed —
  one junk tenant per attempt (e.g. `6812dc25-95ff-40ed-acd7-bd6d704bbfd4`)

## Root cause

Three ingredients, the last two shipped the same day (SOC2 R-08b, 2026-06-10):

1. **Latent**: session-scoped tenant context. `setTenantId()` in `src/db/rls.ts` ran
   `set_config('app.tenant_id', <tenant>, false)` — `false` = SESSION scope (the comment
   claimed SET LOCAL; the code never was). Called by `withAuthRLS` (dozens of API routes,
   on every request) and the chat route.
2. **Migration 0074**: real RLS policies (`USING`/`WITH CHECK` on `tenant_id = current_setting('app.tenant_id')`,
   permissive fallback when the setting is absent/empty) on every tenant_id table.
3. **Role switch**: prod `DATABASE_URL` now connects as `elevay_app` — non-owner,
   NOBYPASSRLS → policies actually apply (confirmed by `must be owner of table` log lines
   from `ensureCoachingTables`/`ensureVoiceTables`).

Production connects through **Supavisor in transaction mode** (port 6543). Outside an
explicit transaction, consecutive statements land on DIFFERENT pooled backends. So every
`withAuthRLS` request: the `set_config(..., false)` PERMANENTLY poisons one random backend
with `app.tenant_id='47dca783-…'`, and the `finally` clear lands on a different one. With
the whole pool poisoned by the only active tenant:

- Paul's first sign-in → `resolveUserTenant` → `INSERT INTO tenants` (no tenant_id column,
  no RLS) **succeeds** → `INSERT INTO users (tenant_id=<new tenant>)` hits a poisoned
  backend → `WITH CHECK (tenant_id = '47dca783-…')` fails → **42501
  `new row violates row-level security policy for table "users"`** → jwt callback throws →
  `CallbackRouteError`.

Why nobody noticed before Paul: with a single active tenant, the poison value equals the
tenant of every existing request, so reads/writes for 47dca783 pass their own poisoned
filter. Only a NEW tenant id (= any new sign-up) collides with it.

## Proof (scripts/tmp-prove-rls-poison.mjs, transactions rolled back)

As `elevay_app`:

- clean backend (no `app.tenant_id`): tenants insert OK, users insert OK
- poisoned backend (`app.tenant_id='47dca783-…'`): tenants insert OK, users insert →
  `42501 new row violates row-level security policy for table "users"` — byte-for-byte the
  prod failure, at the same step.

## Fix (this branch)

1. `src/db/rls.ts`: deleted `setTenantId` / `clearTenantId` / `withTenantRLS`.
   `withTenantTx` (SET LOCAL inside a real transaction — pooler-sound) is the only
   tenant-context primitive.
2. `withAuthRLS` (`src/lib/auth/auth-utils.ts`): auth + handler only. Isolation =
   app-layer `WHERE tenant_id` + 0074 fallback policies (the pre-incident behaviour);
   pinned DB enforcement = `withTenantTx`.
3. Chat route: removed its session-scoped set/clear.
4. Deleted `src/inngest/with-tenant-context.ts` (zero callers; same footgun).
5. `resolveUserTenant`: tenant+user creation now atomic inside `withTenantTx(newTenantId)` —
   immune to any future pool state AND no more orphan-tenant leaks on failure.
6. Regression tripwire (`rls.test.ts`): scans `src/` and fails on any
   `set_config('app.tenant_id', …, false)`.

## Ops done with the fix

- Flush the poisoned pool AFTER the fix deploys (the code no longer re-poisons):
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='elevay_app';`
- Delete the orphan `tenants` rows from Paul's attempts (zero users / zero FK references).
- `REVOKE elevay_app FROM postgres` (membership granted only for the SET ROLE proof).
- Paul's unblock: account + invite intact — sign in again, then open the invite link
  (valid until 2026-06-17) to join 47dca783.

## Follow-ups (not this branch)

- `ensureCoachingTables` / `ensureVoiceTables` run one-shot DDL that now fails as
  `elevay_app` ("must be owner") on every invocation — dead weight to remove, the tables
  exist.
- R-08b strict mode (drop the 0074 fallback) once every read path runs under
  `withTenantTx`.
