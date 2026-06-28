# Orion backend foundation — exhaustive verification of the Elevay (leadsens) backend

Date: 2026-06-27 · Repo verified: `C:/Users/ombel/leads` · Branch: `main` (HEAD `bb7ee968`)

Purpose: document the real backend so a fresh **Orion** repo (same stack) can replicate it
without guesswork. Every claim cites `file:line` and exact versions. Where a file does not
exist, it is stated explicitly.

---

## 0. Top-level shape (read this first)

- The **real monorepo lives in `app/`**, NOT at the repo root.
- The repo **root** (`C:/Users/ombel/leads`) also has a *separate, unrelated* `package.json`
  (`name: "leads"`, root `package.json:2`), a `package-lock.json` (npm) and a small
  `pnpm-lock.yaml` — these are a scratch/sandbox set, not the product. The root `tsconfig.json`
  + `next-env.d.ts` are leftovers. **For Orion, ignore the root and copy `app/`.**
- `app/` is a **pnpm + Turbo monorepo**. There is **NO `packages/` directory** — the workspace
  glob declares `packages/*` but only `apps/*` exists (verified: `ls app/packages/` → "No such
  file or directory"). All shared code lives inside `apps/web/src` and is imported by the other
  apps via a `@web/*` tsconfig path alias (no published internal package).

```
app/
  package.json            # workspace root (name: "leadsens")
  pnpm-workspace.yaml      # globs: apps/*, packages/*
  turbo.json
  pnpm-lock.yaml           # 413 KB — the authoritative lockfile
  .npmrc
  apps/
    web/    (@leadsens/web)    # Next 15 — the product + ALL shared lib/db/schema
    admin/  (@leadsens/admin)  # Next 15 — internal ops console, imports @web/*
    worker/ (@leadsens/worker) # tsx + BullMQ — email send/reply/warmup/health daemon
```

---

## 1. MONOREPO & INSTALL

### 1.1 Workspace + Turbo

- `app/pnpm-workspace.yaml:1-3` — `packages: ["apps/*", "packages/*"]`. (`packages/*` is
  aspirational; the dir does not exist.)
- `app/turbo.json` (full file):
  - `tasks.dev` → `cache:false`, `persistent:true` (`turbo.json:4-7`)
  - `tasks.build` → `dependsOn:["^build"]`, `outputs:[".next/**","dist/**"]` (`turbo.json:8-11`)
  - `tasks.lint`, `tasks.test`, `tasks.tsc` → declared, empty config (`turbo.json:12-14`)
- No root-level `turbo.json` or `pnpm-workspace.yaml` at `C:/Users/ombel/leads` (verified absent).

### 1.2 `app/.npmrc` (pnpm hoist config) — `app/.npmrc:13-14`

```
public-hoist-pattern[]=*require-in-the-middle*
public-hoist-pattern[]=*import-in-the-middle*
```
Reason (documented in the file header): `@sentry/nextjs` → `@opentelemetry/instrumentation`
pulls CJS/ESM patch shims that pnpm buries in the nested store; hoisting them to
`app/node_modules` lets Next resolve them as `serverExternalPackages`. Applying it requires a
full `pnpm install` from `app/`.

### 1.3 Package manager / Node

- **pnpm `10.15.1`** — pinned in `app/package.json:15` (`"packageManager": "pnpm@10.15.1"`) and
  in CI `pnpm/action-setup@v6 version: 10.15.1` (`.github/workflows/ci.yml:32`).
- **Node 22** — `.nvmrc` (root) = `22`; CI `actions/setup-node@v5 node-version: 22`
  (`.github/workflows/ci.yml:35`). `@types/node` is `^22.0.0` in web/worker.
- No `engines` field in any package.json.

### 1.4 Scripts per app

**`app/package.json` (root workspace, `app/package.json:4-10`)** — all delegate to turbo:
`dev`=`turbo dev`, `build`=`turbo build`, `lint`=`turbo lint`, `test`=`turbo test`,
`tsc`=`turbo tsc`. Dependencies: `@anthropic-ai/sdk ^0.104.1` (root-level, `app/package.json:17`).
Dev: `turbo ^2.9.17`, `typescript ^5.8.0` (`app/package.json:12-13`).
**pnpm override**: `drizzle-orm ^0.45.2` (`app/package.json:19-23`) — forces a single
drizzle-orm version across the tree (it is dual-resolved via the `@neondatabase` peer; see the
`as any` adapter cast note at `auth.ts:198`).

**`@leadsens/web` (`apps/web/package.json:5-21`)**:
- `dev`=`next dev --turbopack`, `build`=`next build`, `start`=`next start`, `lint`=`next lint`
- `tsc`=`tsc --noEmit`, `test`=`vitest run`
- `eval:run`=`vitest run --reporter=verbose <12 named gate suites>` (`package.json:12`)
- `e2e`=`playwright test`, `e2e:ui`, `e2e:install`=`playwright install chromium`
- `db:generate`=`drizzle-kit generate`
- `db:migrate`=**deliberately errors out** (`package.json:17`): `echo '[ERROR] drizzle-kit
  journal stops at idx 12. Use db:migrate:apply (custom runner) instead.' && exit 1`
- `db:migrate:apply`=`tsx scripts/apply-migrations.ts`
- `db:push`=`drizzle-kit push`, `db:studio`=`drizzle-kit studio`
- `voice:stream`=`tsx --env-file=.env.local ./scripts/voice-stream-server.ts`

**`@leadsens/admin` (`apps/admin/package.json:5-9`)**: `dev`=`next dev --turbopack -p 3001`,
`build`=`next build`, `start`=`next start -p 3001`, `tsc`=`tsc --noEmit`. (No tests.)

**`@leadsens/worker` (`apps/worker/package.json:5-11`)**: `dev`=`tsx watch src/index.ts`,
`start`=`tsx src/index.ts`, `build`=`tsc --noEmit`, `tsc`=`tsc --noEmit`, `test`=`vitest run`.

### 1.5 EXACT versions of key deps (verbatim from the package.json files)

| Package | web (`apps/web/package.json`) | admin | worker | root `app/` |
|---|---|---|---|---|
| next | `^15.5.15` (L49) | `^15.3.0` | — | — |
| react / react-dom | `^19.2.7` (L56-57) | `^19.2.7` | — | — |
| typescript (dev) | `^5.9.3` (L88) | `^5.8.3` | `^5.8.0` | `^5.8.0` |
| tailwindcss (dev) | `^4.3.0` (L87) | `^4.3.0` | — | — |
| @tailwindcss/postcss (dev) | `^4.3.0` (L69) | `^4.3.0` | — | — |
| drizzle-orm | `^0.45.2` (L39) | `^0.45.2` | `^0.45.2` | override→`^0.45.2` |
| drizzle-kit (dev) | `^0.31.10` (L82) | — | — | — |
| drizzle-zod | `^0.8.3` (L40) | — | — | — |
| next-auth | `5.0.0-beta.30` (L50) | — | — | — |
| @auth/drizzle-adapter | `^1.11.2` (L29) | — | — | — |
| inngest | `^4.5.1` (L45) | — | — | — |
| ai (AI SDK) | `^6.0.199` (L36) | — | — | `^6.0.141` (root scratch) |
| @ai-sdk/anthropic | `^3.0.82` (L24) | — | — | `^3.0.64` |
| @ai-sdk/openai | `^3.0.69` (L25) | — | — | `^3.0.49` |
| @ai-sdk/provider | `^3.0.10` (L26) | — | — | — |
| @ai-sdk/react | `^3.0.201` (L27) | — | — | — |
| @anthropic-ai/sdk | `^0.104.1` (L28) | — | `^0.104.1` | `^0.104.1` |
| openai | `^6.42.0` (L52) | — | — | — |
| @neondatabase/serverless | `^1.1.0` (L31) | `^1.1.0` | — | — |
| postgres (postgres-js) | `^3.4.9` (L54) | `^3.4.9` | `^3.4.9` | — |
| zod | `^4.4.3` (L65) | — | — | — |
| vitest (dev) | `^4.1.8` (L89) | — | `^4.1.8` | — |
| @vitest/coverage-v8 (dev) | `^4.1.8` (L81) | — | — | — |
| @playwright/test (dev) | `^1.60.0` (L68) | — | — | — |
| @sentry/nextjs | `^10.57.0` (L32) | — | — | — |
| @vitejs/plugin-react (dev) | `^6.0.2` (L80) | — | — | — |
| happy-dom (dev) | `^20.10.2` (L85) | — | — | — |
| @testing-library/react (dev) | `^16.3.2` (L70) | — | — | — |
| bullmq | — | — | `^5.78.0` | — |
| ioredis | — | — | `^5.11.1` | — |
| tsx (dev) | (via root/turbo) | — | `^4.22.4` | — |

Other notable web deps (`apps/web/package.json:23-65`): `bcryptjs ^3.0.3`, `googleapis ^171.4.0`,
`twilio ^5.4.0`, `@twilio/voice-sdk ^2.12.4`, `@deepgram/sdk ^5.4.0`, `nodemailer ^6.10.0`,
`imapflow ^1.4.0`, `mailparser ^3.7.2`, `resend ^6.12.4`, `stripe ^21.0.1`, `posthog-js ^1.384.1`,
`framer-motion ^12.40.0`, `lucide-react ^1.17.0`, `cheerio ^1.2.0`, `papaparse ^5.5.3`,
`libphonenumber-js ^1.13.7`, `ical.js ^2.0.0`, `tsdav ^2.0.0`, `ws ^8.21.0`,
`@tanstack/react-virtual ^3.14.2`, `react-markdown ^10.1.0`, `remark-gfm ^4.0.1`.

> Note the **AI SDK is v6** (`ai ^6.0.199`) with `@ai-sdk/anthropic` **v3** and
> `@ai-sdk/openai` **v3**. There is NO Vercel AI Gateway dependency — providers are wired
> directly. `@anthropic-ai/sdk` (the raw Anthropic SDK) is `^0.104.1` and coexists with the
> AI SDK.

---

## 2. BASE DE DONNÉES

### 2.1 `apps/web/drizzle.config.ts` (full, 11 lines)

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/billing-schema.ts"],  // TWO schema entrypoints
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```
- dialect `postgresql`; output dir `./drizzle`; reads **`DATABASE_URL`** only.
- `schema.ts` is a **barrel** (`apps/web/src/db/schema.ts:5-28`) re-exporting 24 domain files
  from `src/db/schema/*` (`enums, auth, core, ledger, gates, agent-run, canonical, outbound,
  copy-assets, intelligence, agent, campaign, coaching, onboarding-and-visitors,
  ai-observability, cs, voice-of-customer, voice, icp, icp-versions, proposals, tam, segments,
  linkedin`). `billing-schema.ts` is a separate top-level schema file (not under `schema/`).

### 2.2 DB client — `apps/web/src/db/index.ts` (driver = **postgres-js**, NOT neon-http)

```ts
import { drizzle } from "drizzle-orm/postgres-js";   // index.ts:1
import postgres from "postgres";                      // index.ts:2
...
const client = postgres(process.env.DATABASE_URL!);   // index.ts:31
export const db = drizzle({ client, schema });        // index.ts:32
```
- Driver is **`drizzle-orm/postgres-js` over the `postgres` package** — a plain TCP connection,
  not the Neon HTTP serverless driver, **despite `@neondatabase/serverless` being a dependency**
  (it is present but the web `db` does not use it; admin/worker also use postgres-js).
- No explicit pool sizing in the web client (the `postgres()` default pool). The migration
  runner uses `postgres(url, { max: 1 })` (`scripts/apply-migrations.ts:49`).
- **EU-host guard** at `index.ts:15-29`: `assertEuHost(process.env.DATABASE_URL)`; if
  `GDPR_REGION=eu` and the host isn't EU/CH-allowlisted, logs CRITICAL (prod) / WARNING (dev) —
  does NOT throw. See `lib/region-config.ts`.
- **`DATABASE_URL_OWNER`** is NOT referenced in app source (grep over `src` returns 0 hits). It
  is an **operator-only** connection string used out-of-band to run privileged migrations as the
  `postgres` role (the app runs as the non-owner `elevay_app` role — see RLS note below). It
  lives only in the operator's shell env, not in code.

### 2.3 RLS context primitive — `apps/web/src/db/rls.ts`

- `withTenantTx(tenantId, fn)` (`rls.ts:44-54`) is the **only** sanctioned way to bind
  `app.tenant_id` for the 0074 RLS policies. It opens a real transaction and runs
  `SELECT set_config('app.tenant_id', <id>, true)` (transaction-scoped) before `fn(tx)`.
- Hard rule documented in the header (`rls.ts:1-27`): **no session-scoped `set_config(...,
  false)` anywhere** — prod connects through Supavisor in TRANSACTION mode (port 6543) and a
  session-level set poisons pooled backends (2026-06-10 incident). A tripwire test
  (`rls.test.ts`) greps the tree to enforce this.

### 2.4 Custom migration runner — `apps/web/scripts/apply-migrations.ts` + why `db:migrate` is disabled

- **Why disabled**: the drizzle-kit journal `drizzle/meta/_journal.json` tracks only **15
  entries (idx 0–14)** — verified: `grep -c '"idx"'` = 15, last tag `0014_fluffy_shard`. But the
  `drizzle/` dir actually holds **32 `.sql` files** ranging `0000_baseline.sql` →
  `0106_linkedin_inbound_enums.sql`. (The header comment at `apply-migrations.ts:6-12` says "15
  of 41" — the count drifted; the *principle* holds: the journal lags the real SQL files, so
  `drizzle-kit migrate` would silently skip the un-journaled ones.) Hence `db:migrate` is wired
  to `exit 1` (`apps/web/package.json:17`).
- **How the runner works** (`apply-migrations.ts:42-103`):
  1. `postgres(url, { max: 1 })` (`L49`).
  2. `CREATE TABLE IF NOT EXISTS __elevay_migrations (filename PK, hash, applied_at)` — its own
     tracking table, NOT drizzle's `__drizzle_migrations` (`L51-57`).
  3. Reads all `*.sql` in `drizzle/`, sorts lexically (`L59-61`).
  4. For each unapplied file: `sql.begin(tx => { tx.unsafe(content); INSERT INTO
     __elevay_migrations (filename, hash) })` — **one transaction per migration**, records a
     sha256 hash (`L71-99`). Re-applying is safe because every migration is additive with
     `IF NOT EXISTS` guards (header `L26-30`). Hash mismatch on an already-applied file → warns,
     skips (`L77-82`).
- **Runtime "ensure" fallbacks**: `src/instrumentation.ts:8-45` calls a set of idempotent
  `ensure*` table creators on Node startup (`ensureVectorIndex`, `ensureCustomRecordsTable`,
  `ensureCoachingTables`, `ensureVoiceTables`) — a belt-and-braces layer so some tables self-heal
  even if a migration wasn't run.

### 2.5 Admin & worker DB clients

- Admin `apps/admin/src/lib/db.ts:1-8` — same `drizzle-orm/postgres-js` + `postgres`, imports
  schema from **`@web/db/schema`** (the alias) and `postgres(process.env.DATABASE_URL!)`.
- Worker `apps/worker/src/db.ts:1-23` — same driver, imports a *subset* of tables from
  `@web/db/schema` and passes a narrowed `schema` object to drizzle.

---

## 3. AUTH (next-auth v5)

Config file: **`apps/web/src/auth.ts`** (605 lines). `next-auth 5.0.0-beta.30`,
`@auth/drizzle-adapter ^1.11.2`.

- **Adapter**: `DrizzleAdapter(db, { usersTable: authUsers, accountsTable: authAccounts,
  sessionsTable: authSessions, verificationTokensTable: authVerificationTokens })`
  (`auth.ts:199-204`). The drizzle auth tables live in `src/db/schema/auth.ts`. Cast `db as any`
  with an eslint-disable note (`auth.ts:198`) because pnpm dual-resolves drizzle-orm via the
  `@neondatabase` peer — structurally identical types.
  - The adapter's `linkAccount` is **wrapped** (`auth.ts:212-225`) to encrypt OAuth
    access/refresh/id tokens at rest via `lib/crypto/oauth-token-crypto`.
- **Providers** (`auth.ts:229-417`):
  - `Google` — only if `GOOGLE_CLIENT_ID` set; scopes incl. `gmail.readonly`,
    `calendar.readonly`, `calendar.events`, `access_type:offline`, `prompt:consent`,
    `allowDangerousEmailAccountLinking:false` (`auth.ts:230-254`).
  - `MicrosoftEntraId` — only if `MICROSOFT_CLIENT_ID` set; scopes `Mail.Read`,
    `Calendars.ReadWrite`, `offline_access` (`auth.ts:256-276`).
  - `Credentials` — email + password + optional `totp`; bcrypt compare with a timing-safe dummy
    hash for unknown emails (`auth.ts:38-39`, `277-417`); per-email + per-IP lockout; MFA/TOTP;
    deactivated-user block.
- **Session strategy**: **`jwt`** (`auth.ts:429`), `maxAge: 8h` (`auth.ts:436`),
  `updateAge: 1h` (`auth.ts:437`). Pages: `signIn:"/sign-in"`, `error:"/sign-in"`
  (`auth.ts:419-427`).
- **Tenant resolution**: `resolveUserTenant(authUserId, email)` (`auth.ts:80-196`), called from
  the **`jwt` callback** on first sign-in (`auth.ts:463-474`), stamps `token.tenantId`,
  `token.appUserId`, `token.role`. Logic:
  - Existing app user (`users.clerkId == authUserId`) → reuse its tenant/role (`auth.ts:82-88`).
  - Else if a pending unexpired invite matches the email → join that tenant with the invited
    role, atomically inside `withTenantTx(invite.tenantId, …)` (`auth.ts:101-135`).
  - Else, if `!SELF_SERVE_SIGNUP_ENABLED && !hasBetaAccess()` → **throw** (invitation-only)
    (`auth.ts:147-151`).
  - Else create a fresh tenant + admin user inside one `withTenantTx(newTenantId, …)`
    (`auth.ts:164-181`). (`users.clerkId` is the legacy column name holding the NextAuth user id.)
- **Callbacks**: `signIn` gates OAuth to existing-account-or-invite (`auth.ts:448-462`); `jwt`
  also fires Inngest `google/oauth-connected` & `microsoft/oauth-connected` events and TTFAA
  timers (`auth.ts:506-557`); `session` copies `tenantId/appUserId/role/issuedAt` onto the
  session object (`auth.ts:561-572`). OAuth access/refresh tokens are deliberately **NOT** put on
  the JWT — they live only in `auth_account` server-side (`auth.ts:494-505`).
- **events.signIn** audit-logs successful logins (`auth.ts:578-602`).
- Exports: `export const { handlers, signIn, signOut, auth } = NextAuth({...})` (`auth.ts:227`).
- `src/middleware.ts` imports `auth` from `./auth` and layers IP rate-limiting + RBAC capability
  checks (`middleware.ts:1-30+`). Env: reads `AUTH_SECRET`/`NEXTAUTH_SECRET`, `AUTH_URL`/
  `NEXTAUTH_URL`.

---

## 4. INNGEST

- **Client** — `apps/web/src/inngest/client.ts` (full file, 3 lines):
  ```ts
  import { Inngest } from "inngest";
  export const inngest = new Inngest({ id: "elevay" });
  ```
  App id = `"elevay"`. (Event/signing keys read from `INNGEST_EVENT_KEY` /
  `INNGEST_SIGNING_KEY` by the SDK at runtime.) `inngest ^4.5.1`.
- **Serve route** — `apps/web/src/app/api/inngest/route.ts`:
  - `import { serve } from "inngest/next";` (`route.ts:1`).
  - `export const maxDuration = 300;` (`route.ts:101`) — pins the Vercel function to 300 s.
  - `export const { GET, POST, PUT } = serve({ client: inngest, functions: [ … ] });`
    (`route.ts:103-319`) — registers **~150 functions** imported from `src/inngest/*` (lines
    3-92). Also eagerly registers an import executor side-effect (`route.ts:95`).
- **createFunction is 2-arg** (config object first, handler second). Triggers and concurrency
  live INSIDE the config object. Concrete example — `apps/web/src/inngest/signal-score-daily.ts:95-108`:
  ```ts
  export const signalScoreDaily = inngest.createFunction(
    {
      id: "signal-score-daily",
      name: "Cron: priority_score recompute (daily)",
      retries: 1,
      concurrency: [{ limit: 1 }],        // concurrency is an ARRAY
      onFailure: async ({ error }) => { logger.error(...) },
      triggers: [{ cron: "0 6 * * *" }],  // triggers INSIDE config (cron or event)
    },
    async ({ step }) => { /* handler */ },
  );
  ```
  This confirms the documented gotcha: **`createFunction(config, handler)` — triggers are in the
  config, `concurrency` is an array** (not the older 3-arg `createFunction(opts, trigger, fn)`
  shape). Event triggers use `triggers: [{ event: "name" }]`.
- **In addition to Inngest**, Vercel platform crons are declared in `apps/web/vercel.json:23-44`
  (5 cron paths under `/api/cron/*`: email-sync `*/15`, stale-deals, world-model, mailbox-reset,
  deal-progression). So the backend has TWO scheduling mechanisms: Inngest crons (in-function)
  AND Vercel cron HTTP pings.

---

## 5. AI / LLM

Files: `apps/web/src/lib/ai/ai-provider.ts` (317 lines) + `apps/web/src/lib/ai/traced-ai.ts`
(314 lines). AI SDK v6 (`ai`), `@ai-sdk/anthropic` v3, `@ai-sdk/openai` v3. **No AI Gateway.**

- **Provider instantiation** (`ai-provider.ts`):
  - `createAnthropic({ baseURL, apiKey: process.env.ANTHROPIC_API_KEY })` as a lazy singleton
    behind a `Proxy` so env is read at call-time, not import-time (`ai-provider.ts:105-145`).
  - `baseURL` resolved by `resolveAnthropicBaseUrl()` (`ai-provider.ts:66-86`): priority
    `ANTHROPIC_API_BASE` (allowlisted to EU `https://eu.anthropic.com/v1` or US
    `https://api.anthropic.com/v1` — SSRF guard, `L53-56`) → `ANTHROPIC_REGION=eu` → default US.
    **The baseURL MUST include `/v1`** (`L36-46` comment — omitting it caused 404s/empty chat).
  - OpenAI via `openai` default + `createOpenAI` (`ai-provider.ts:29`).
  - **Mistral (EU-sovereign opt-in)** reuses `createOpenAI({ baseURL: "https://api.mistral.ai/v1",
    apiKey: MISTRAL_API_KEY })` — no new dep (`ai-provider.ts:160-179`).
- **Model routing** — `MODEL_MAP` (`ai-provider.ts:186-193`):
  - `chat` → **`claude-sonnet-4-6`**
  - `lightweight` → **`claude-haiku-4-5-20251001`**
  - `embedding` → **`text-embedding-3-small`** (OpenAI; Anthropic has none)
  - Mistral equivalents in `MISTRAL_MODEL_MAP` (`L196-200`): `mistral-large-latest`,
    `mistral-small-latest`, `mistral-embed`.
  - `getModelForTask(task)` (`ai-provider.ts:227-270`): honors the **`AI_DISABLED=1` kill-switch**
    (returns null, `L228`), prefers Mistral when `LLM_PROVIDER=mistral|auto`, else Anthropic when
    `ANTHROPIC_API_KEY` set AND the **circuit breaker** is closed (`isCircuitClosed`,
    `lib/infra/circuit-breaker`), else OpenAI fallback (`gpt-4o` / `gpt-4o-mini`), last resort
    Anthropic-even-if-circuit-open.
  - `getActiveProvider()` reports `mistral|anthropic-eu|anthropic-us|openai-fallback|none`
    (`ai-provider.ts:280-287`).
- **Cost-tracking / tracing** — `traced-ai.ts` exports `tracedGenerateText` /
  `tracedGenerateObject` / `tracedStreamText`, drop-in wrappers around the AI SDK's
  `generateText/generateObject/streamText` (`traced-ai.ts:15`). Each wrapper:
  - Honors `AI_DISABLED` (`traced-ai.ts:84,158,216`).
  - Calls `enforceLlmBudget(_trace.tenantId)` **before** dispatch — throws `BudgetExceededError`
    when over the tenant's monthly cap (`traced-ai.ts:91,160,218`; `lib/billing/llm-budget`).
  - Injects the active versioned prompt + few-shot examples from the flywheel
    (`getActivePrompt`, `traced-ai.ts:94-100`).
  - On finish, calls `recordTrace(...)` (`lib/observability/observability`) with model id,
    input/output preview, `inputTokens`/`outputTokens`, latency, tool calls, status — the trace
    row is where cost is later derived (memory note: cost lives in
    `agent_traces.estimated_cost`, not `llm_calls`). Recording is non-blocking
    (`.catch(...)`).
  - `_trace: { agentId, tenantId, traceId, ... }` is stripped before passing params to the SDK.

---

## 6. ENV — inventory (140 unique `process.env.*` in `apps/web/src`)

Grouped by domain. (Captured via `grep -rhoE "process.env.[A-Z0-9_]+" src` → 140 unique.)
`DATABASE_URL_OWNER` is **operator-only** and does NOT appear in code.

- **Core / platform**: `NODE_ENV`, `NEXT_RUNTIME`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`,
  `VERCEL_GIT_COMMIT_SHA`, `CRON_SECRET`, `E2E_SECRET`, `ENABLE_E2E_SEED`, `ELEVAY_APP_SECRET`,
  `PILAE_DOGFOOD_TENANT_ID`.
- **Database**: `DATABASE_URL` (only one in code; `DATABASE_URL_OWNER` operator-only, out-of-band).
- **Auth**: `AUTH_SECRET`, `NEXTAUTH_SECRET`, `AUTH_URL`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `BETA_SIGNUP_CODE`.
- **LLM / AI**: `ANTHROPIC_API_KEY`, `ANTHROPIC_API_BASE`, `ANTHROPIC_REGION`, `OPENAI_API_KEY`,
  `MISTRAL_API_KEY`, `LLM_PROVIDER`, `AI_DISABLED`, `COPY_ENGINE_PRIMARY`, `COPY_ENGINE_SHADOW`,
  `EVAL_ONLINE_SAMPLING`.
- **Inngest**: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
- **Email infra**: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAILENGINE_URL`,
  `EMAILENGINE_WEBHOOK_SECRET`, `INBOUND_WEBHOOK_SECRET`, `OUTBOUND_TEST_MODE`,
  `OUTBOUND_TEST_ALLOWLIST`, `INVITE_FROM_ADDRESS`, `WELCOME_FROM_ADDRESS`, `OPS_FROM_ADDRESS`,
  `OPS_EMAIL_ADDRESS`, `MANAGED_DOMAIN_DNS_VERIFY`.
- **Cold-outreach / LinkedIn**: `UNIPILE_API_KEY`, `UNIPILE_DSN`, `UNIPILE_WEBHOOK_SECRET`,
  `LINKEDIN_OUTREACH_PROVIDER`, `LINKEDIN_INBOUND_ENABLED`, `LINKEDIN_TEST_MODE`,
  `LINKEDIN_TEST_ALLOWLIST`, `APIFY_TOKEN`, `APIFY_LINKEDIN_ACTOR`. (Instantly creds are
  **per-tenant in the DB**, not env — see note below.)
- **Enrichment / data vendors**: `APOLLO_API_KEY`, `CRUNCHBASE_API_KEY`, `CLEARBIT_API_KEY`,
  `HUNTER_API_KEY`, `LUSHA_API_KEY`, `KASPR_API_KEY`, `DATAGMA_API_KEY`, `FIRMABLE_API_KEY`,
  `FULLENRICH_API_KEY`, `FULLENRICH_API_BASE`, `FULLENRICH_CALLBACK_BASE_URL`,
  `FULLENRICH_WEBHOOK_SECRET`, `ZELIQ_API_KEY`, `ZELIQ_CALLBACK_BASE_URL`,
  `ZELIQ_WEBHOOK_SECRET`, `PAPPERS_API_KEY`, `ZEFIX_API_USER`, `ZEFIX_API_PASSWORD`,
  `RB2B_API_KEY`, `SNITCHER_API_KEY`. (FullEnrich is banned by founder directive per memory, but
  the env keys still exist in code.)
- **Voice / Twilio / Deepgram / Recall**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, `TWILIO_APP_SID`, `TWILIO_REGION`,
  `VOICE_RECORDING_ENABLED`, `VOICE_COACHING_LIVE`, `VOICE_PUBLIC_BASE_URL`,
  `VOICE_DISCLOSURE_TEXT`, `VOICE_DISCLOSURE_AUDIO_URL`, `VOICE_VOICEMAIL_DEFAULT_URL`,
  `VOICE_STREAM_DEBUG`, `RECALL_API_KEY`, `RECALL_WEBHOOK_SECRET`, `JIBRI_WEBHOOK_SECRET`,
  `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`.
- **Billing (Stripe)**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`,
  `STRIPE_STARTER_PRICE_ID`, `STRIPE_FOUNDER_LED_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`,
  `NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID`, `FOUNDER_LED_AMOUNT_CENTS`, `FOUNDER_LED_CURRENCY`.
- **Redis / queue (also worker)**: `REDIS_URL`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`.
- **Observability / analytics**: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL`.
- **GDPR / region**: `GDPR_REGION`, `NEXT_PUBLIC_GDPR_REGION`, `DSAR_ERASE_ENABLED`,
  `LAWFUL_BASIS_GATE`.
- **Feature flags / gates**: `DAILY_AUTOPILOT_ENABLED`, `AUTOPILOT_AUTOPAUSE_MODE`,
  `AGENT_REACTOR_ENABLED`, `RESEARCH_AGENT_ENABLED`, `MEMORY_EXTRACT_ENABLED`,
  `COACHING_ENABLED`, `PLAYBOOK_EXTRACT_ENABLED`, `DEAL_PROPERTY_ENABLED`,
  `TARGETING_GATE_ENABLED`, `ANTI_COLLISION_ENFORCE`, `CADENCE_BRANCHING_ENABLED`,
  `SEQUENCE_ENGINE_V2`, `STALE_DEALS_ENABLED`, `WORLD_MODEL_ENABLED`, `WS1_CHANNEL_ENABLED`,
  `WS1_LANDING_URL`, `INBOX_RLS_TX`, `TAM_SKIP_NARRATION`, `NEXT_PUBLIC_QUALIFICATION_EXTRAS`,
  `GENERATE_BRIEF_TIMEOUT_MS`.
- **Test-only DB toggles** (guard test suites): `AGENT_DB_TEST`, `CANONICAL_DB_TEST`,
  `LINKEDIN_CAPTURE_DB_TEST`, `METERING_DB_TEST`, `ORCH_DB_TEST`, `CLASSIFY_DEBUG`.

> **Instantly**: there is NO `INSTANTLY_API_KEY` env var. Instantly integration
> (`src/lib/integrations/instantly-unibox.ts`, `instantly-import.ts`) takes an `apiKey` passed in
> per call (`instantly-unibox.ts:135,157`) — the key is a **per-tenant stored credential**, not a
> process env var. Orion should follow the same pattern for tenant-scoped third-party creds.

> Worker app reads: `DATABASE_URL` (`worker/src/db.ts:12`), `REDIS_URL`
> (`worker/src/queues/index.ts:4`), plus `EMAILENGINE_*` / `REDIS_PASSWORD` /
> `EMAILENGINE_SECRET` via `docker-compose.yml:8-9,20`.

---

## 7. CONSÉQUENCES POUR ORION

### 7.1 Package → version → role → copy-or-adapt

| Package | Version (web) | Role | Orion |
|---|---|---|---|
| next | `^15.5.15` | App Router + Turbopack | **Copy** (same major) |
| react / react-dom | `^19.2.7` | UI runtime | **Copy** |
| typescript | `^5.9.3` | types; `strict:true` in web tsconfig | **Copy** |
| tailwindcss + @tailwindcss/postcss | `^4.3.0` | CSS-first (no tailwind.config) | **Copy** |
| drizzle-orm | `^0.45.2` (pnpm override) | ORM | **Copy** + keep the override |
| drizzle-kit | `^0.31.10` | generate/push/studio | **Copy** |
| drizzle-zod | `^0.8.3` | zod schemas from tables | **Copy** |
| postgres (postgres-js) | `^3.4.9` | DB driver (the real one used) | **Copy** |
| @neondatabase/serverless | `^1.1.0` | present but unused by db client | **Adapt** — drop unless you actually use neon-http |
| next-auth | `5.0.0-beta.30` | auth | **Copy** (pin exact beta) |
| @auth/drizzle-adapter | `^1.11.2` | auth ↔ drizzle | **Copy** |
| inngest | `^4.5.1` | bg jobs / crons | **Copy** (2-arg createFunction) |
| ai (AI SDK) | `^6.0.199` | LLM calls | **Copy** |
| @ai-sdk/anthropic | `^3.0.82` | Claude provider | **Copy** |
| @ai-sdk/openai | `^3.0.69` | OpenAI + reused for Mistral baseURL | **Copy** |
| @ai-sdk/provider / @ai-sdk/react | `^3.0.10` / `^3.0.201` | provider types / chat hooks | **Copy** |
| @anthropic-ai/sdk | `^0.104.1` | raw Anthropic SDK | **Copy if** you call Anthropic outside the AI SDK; else adapt |
| openai | `^6.42.0` | embeddings + fallback | **Copy** |
| zod | `^4.4.3` | validation (v4!) | **Copy** (note: zod 4) |
| @sentry/nextjs | `^10.57.0` | errors (drives the `.npmrc` hoist) | **Adapt** — copy only if using Sentry |
| vitest + @vitest/coverage-v8 + @vitejs/plugin-react + happy-dom + @testing-library/* | `^4.1.8` / … | unit tests | **Copy** |
| @playwright/test | `^1.60.0` | e2e | **Copy** |
| bullmq + ioredis | `^5.78.0` / `^5.11.1` | worker queue | **Adapt** — only if Orion has a worker daemon |
| turbo | `^2.9.17` | monorepo tasks | **Copy** |
| Domain libs (twilio, deepgram, googleapis, resend, nodemailer, imapflow, stripe, posthog-js, etc.) | see §1.5 | channel/integration specific | **Adapt** — copy per feature Orion needs |

### 7.2 Minimal config files to recreate in a fresh Orion repo

Replicate the **`app/`** layout (do NOT replicate the repo-root scratch package):

1. `app/package.json` — `private:true`, `packageManager:"pnpm@10.15.1"`, turbo scripts,
   devDeps `turbo ^2.9.17` + `typescript ^5.8.0`, and the
   `pnpm.overrides.drizzle-orm:"^0.45.2"` block.
2. `app/pnpm-workspace.yaml` — `packages: ["apps/*", "packages/*"]`.
3. `app/turbo.json` — the 5 tasks (dev persistent/no-cache; build dependsOn ^build + outputs).
4. `app/.npmrc` — only if using Sentry/OTel (the two `public-hoist-pattern` lines).
5. `.nvmrc` = `22`.
6. `apps/web/package.json` — copy deps/devDeps from §1.5 and the db scripts (incl. the
   **disabled `db:migrate`** + `db:migrate:apply` runner + `db:push`/`db:generate`/`db:studio`).
7. `apps/web/tsconfig.json` — `strict:true`, `moduleResolution:"bundler"`,
   `paths:{ "@/*":["./src/*"] }`, `exclude:["node_modules","scripts"]`, `plugins:[{name:"next"}]`.
8. `apps/web/drizzle.config.ts` — dialect `postgresql`, `schema:["./src/db/schema.ts", …]`,
   `out:"./drizzle"`, `dbCredentials.url: process.env.DATABASE_URL`.
9. `apps/web/src/db/index.ts` — `drizzle-orm/postgres-js` + `postgres(DATABASE_URL)` (+ optional
   region guard).
10. `apps/web/src/db/rls.ts` — `withTenantTx` primitive (if multi-tenant + RLS).
11. `apps/web/scripts/apply-migrations.ts` — the custom idempotent runner + `__elevay_migrations`
    table (rename the tracking table for Orion).
12. `apps/web/src/auth.ts` — NextAuth v5 config: DrizzleAdapter, providers (gated on env),
    `session.strategy:"jwt"` (8h/1h), `jwt`/`session` callbacks that stamp `tenantId/appUserId/
    role`, and `resolveUserTenant`.
13. `apps/web/src/inngest/client.ts` (`new Inngest({ id: "orion" })`) +
    `apps/web/src/app/api/inngest/route.ts` (`serve({ client, functions:[…] })`,
    `export const maxDuration = 300`).
14. `apps/web/src/lib/ai/ai-provider.ts` + `traced-ai.ts` — provider singleton + model map +
    budget/trace wrappers.
15. `apps/web/next.config.ts` (CSP headers + optional Sentry wrap),
    `apps/web/postcss.config.mjs` (`@tailwindcss/postcss`), `apps/web/src/app/globals.css`
    (`@import "tailwindcss"; @plugin "@tailwindcss/typography"; @theme {…}` — Tailwind 4 is
    CSS-first, **no `tailwind.config.*` file exists**).
16. `apps/web/vitest.config.ts` (node env, `@`→`src` alias, dotenv loader for ANTHROPIC_*/OPENAI_*).
17. `apps/web/vercel.json` (framework nextjs, `installCommand: pnpm install --frozen-lockfile`,
    crons) — only if deploying on Vercel.
18. `.github/workflows/ci.yml` — pnpm 10.15.1 + node 22, `working-directory: app`,
    `NODE_OPTIONS=--max-old-space-size=6144`, run `pnpm --filter @leadsens/web tsc` + `test`,
    plus gitleaks. **Adapt the filter to Orion's web package name.**
19. (Optional) `apps/admin/tsconfig.json` + `apps/worker/tsconfig.json` carry
    `paths:{ "@web/*":["../web/src/*"] }` — the mechanism for sharing web code without a
    `packages/` package.

### 7.3 Known traps (carry these into Orion)

1. **Migration journal is broken on purpose.** `drizzle/meta/_journal.json` tracks only 15
   entries (idx 0–14, last `0014_fluffy_shard`) while `drizzle/` holds 32 `.sql` files
   (`0000`→`0106`). `drizzle-kit migrate` would skip the un-journaled SQL → use the custom
   `apply-migrations.ts` runner (`db:migrate` is wired to `exit 1`). For Orion: either keep the
   journal in sync from day one, OR adopt the custom-runner pattern deliberately.
2. **`inngest.createFunction` is 2-arg here** (`createFunction(config, handler)`): triggers go
   *inside* the config as `triggers:[{cron|event}]`, and `concurrency` is an **array**
   (`signal-score-daily.ts:95-108`). Do not use the older 3-arg `(opts, trigger, fn)` form.
3. **CI gate is `@leadsens/web` only** (`.github/workflows/ci.yml:40-42`): tsc + vitest run only
   for web. admin/worker are NOT typechecked/tested in CI — drift slips through there. Add
   filters for Orion's other apps if you want them gated.
4. **Junctioned `node_modules` divergence**: a PR worktree with junctioned node_modules can pass
   `tsc` locally but fail CI (divergent install). CI uses `pnpm install --frozen-lockfile` from
   `app/`. Always verify against a clean frozen install.
5. **drizzle-orm dual-resolution**: pnpm resolves drizzle-orm twice (direct + via the
   `@neondatabase` peer); the `pnpm.overrides.drizzle-orm` pin + the `db as any` adapter cast
   (`auth.ts:198`) are the workarounds. Keep both.
6. **postgres-js + Supavisor transaction pooler**: never use session-scoped `set_config(...,
   false)`; bind tenant context only inside `withTenantTx` (`rls.ts`). A tripwire test enforces
   this. (Relevant if Orion is multi-tenant with Postgres RLS.)
7. **Anthropic baseURL must include `/v1`** (`ai-provider.ts:36-46`) — omitting it yields 404s
   that surface as empty LLM responses.
8. **`@neondatabase/serverless` is a dep but the DB client uses postgres-js** — don't assume the
   neon HTTP driver. Drop the neon dep in Orion unless you actually adopt it.
9. **Tailwind 4 is config-less** — there is no `tailwind.config.ts`; theme lives in
   `globals.css` under `@theme`. Don't scaffold a v3-style config.
10. **Two schedulers coexist** — Inngest crons (in-function) + Vercel `vercel.json` crons hitting
    `/api/cron/*`. Decide deliberately which Orion uses; don't double-fire.
11. **`DATABASE_URL_OWNER` is operator-only** (not in code): privileged migrations run as the
    `postgres` role out-of-band; the app runs as a restricted role. Replicate that split for
    Orion's prod safety.

---

## Files of record (absolute paths)

- `C:/Users/ombel/leads/app/package.json` · `app/pnpm-workspace.yaml` · `app/turbo.json` · `app/.npmrc`
- `C:/Users/ombel/leads/.nvmrc` · `C:/Users/ombel/leads/.github/workflows/ci.yml`
- `C:/Users/ombel/leads/app/apps/web/package.json` · `…/admin/package.json` · `…/worker/package.json`
- `C:/Users/ombel/leads/app/apps/web/drizzle.config.ts` · `…/web/src/db/index.ts` · `…/web/src/db/schema.ts` · `…/web/src/db/rls.ts`
- `C:/Users/ombel/leads/app/apps/web/scripts/apply-migrations.ts` · `…/web/drizzle/meta/_journal.json`
- `C:/Users/ombel/leads/app/apps/web/src/auth.ts` · `…/web/src/middleware.ts`
- `C:/Users/ombel/leads/app/apps/web/src/inngest/client.ts` · `…/web/src/app/api/inngest/route.ts` · `…/web/src/inngest/signal-score-daily.ts`
- `C:/Users/ombel/leads/app/apps/web/src/lib/ai/ai-provider.ts` · `…/web/src/lib/ai/traced-ai.ts`
- `C:/Users/ombel/leads/app/apps/web/next.config.ts` · `…/web/vitest.config.ts` · `…/web/vercel.json` · `…/web/postcss.config.mjs` · `…/web/src/app/globals.css` · `…/web/tsconfig.json`
- `C:/Users/ombel/leads/app/apps/admin/src/lib/db.ts` · `…/admin/tsconfig.json`
- `C:/Users/ombel/leads/app/apps/worker/src/index.ts` · `…/worker/src/db.ts` · `…/worker/src/queues/index.ts` · `…/worker/tsconfig.json`
- `C:/Users/ombel/leads/docker-compose.yml`
