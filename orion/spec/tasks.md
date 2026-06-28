# Orion — tasks.md (Kiro · plan d'exécution)

> Plan de build **ordonné, numéroté (T-1..T-42)**, dérivé 1:1 de `requirements.md` (REQ-1..31)
> et `design.md` (§0-10). Chaque tâche : **description impérative · fichiers (REUSE `file:line`
> Elevay vs NET-NEW Orion) · VERIFY (preuve runtime) · TEST (Vitest/e2e à écrire) · j-h ·
> dépendances**. Conçu pour **coder sans relire le code Elevay**.
>
> **Conventions de chemins.** Tout `file:line` non préfixé = relatif à
> **`C:/Users/ombel/leads/app/apps/web/src/`** (le monorepo RÉEL ; root du repo = bac à sable
> IGNORÉ). Le code Orion vit dans `orion/app/apps/web/src/` (mêmes chemins relatifs → copier-coller
> 1:1). **REUSE** = copie/adaptation d'un module Elevay (cité `file:line`). **NET-NEW** = code neuf
> (souvent un assemblage pur au-dessus de REUSE). **MODIF** = extension d'un fichier copié.
>
> **Invariants transverses (tripwires, jamais violés) :**
> 1. `tenantId` ← Bearer `mcp_*` / JWT / `event.data` — **jamais** un argument client.
> 2. Aucun chemin d'export ne contourne `evaluateSend` (gate DANS le wrapper).
> 3. Orion **n'envoie jamais** de cold via une infra cliente (Instantly = outil DU client).
> 4. Clés partenaires **per-tenant en DB chiffrées**, jamais en env.
> 5. baseURL Anthropic **inclut `/v1`**. 6. `createFunction` **2-arg** (triggers dans config,
> `concurrency` = array). 7. **Jamais** `set_config(..., false)` (Supavisor). 8. Tailwind 4
> **config-less**. 9. `db:migrate` → `exit 1` (runner custom seul). 10. `db as any` à l'adapter +
> `pnpm.overrides.drizzle-orm`.

---

# LOT 0 — SETUP / INSTALL  (REQ-1..4, 30) — *fondation bootable*

## T-1 — Scaffolder la layout `app/` du dépôt séparé
**Impératif.** Créer le dépôt `orion/` avec le niveau `app/` (workspace root, `name:"orion"`) +
`app/apps/web` (`@orion/web`). **Pas** de `package.json` à la racine du repo (≠ Elevay, dont le root
est un sandbox — `orion-backend-verification:13-21`). Garder `apps/*` + `packages/*` dans le
workspace dès J0 (un `worker` futur = `mkdir`, pas une migration) ; `packages/` reste **non créé**
(glob aspirationnel, comme Elevay).
**Fichiers (NET-NEW).** `orion/app/package.json` (`name:"orion"`, `private`,
`packageManager:"pnpm@10.15.1"`, scripts `turbo dev|build|lint|test|tsc`, `dependencies:{
"@anthropic-ai/sdk":"^0.104.1" }`, `devDependencies:{ "turbo":"^2.9.17","typescript":"^5.8.0" }`,
**`pnpm.overrides:{ "drizzle-orm":"^0.45.2" }`** — REQ-3) ; `orion/app/pnpm-workspace.yaml`
(`packages: ["apps/*","packages/*"]`) ; `orion/app/turbo.json` (`dev`:`cache:false`,
`persistent:true` ; `build`:`dependsOn:["^build"]`,`outputs:[".next/**","dist/**"]` ;
`lint`/`test`/`tsc` vides) ; `orion/.nvmrc` = `22` ; `orion/app/.gitignore`.
**VERIFY.** `pnpm -w install --frozen-lockfile` réussit depuis `orion/app/` ; `pnpm why drizzle-orm`
montre **une** version résolue.
**TEST.** `repo-structure.test.ts` (vitest node) : `pnpm-workspace.yaml` contient `apps/*` ;
`app/apps/web` existe ; `<repoRoot>/package.json` **absent** ; `pnpm.overrides["drizzle-orm"]` posé.
**j-h : 0,5.** **Dép : —.**

## T-2 — Épingler `apps/web/package.json` aux versions exactes vérifiées
**Impératif.** Recréer `apps/web/package.json` avec les pins **exacts** (REQ-2 table). Filtrer les
deps par périmètre Orion : **DROP** `@neondatabase/serverless` (inutilisé — postgres-js est le vrai
driver, `orion-backend-verification:118-119,444`), et tous les canaux d'envoi
(`twilio/deepgram/googleapis/resend/nodemailer/imapflow/stripe/recall/zoom` — hors périmètre D4).
**Fichiers (NET-NEW).** `apps/web/package.json` :
- deps : `next ^15.5.15`, `react ^19.2.7`, `react-dom ^19.2.7`, `drizzle-orm ^0.45.2`,
  `drizzle-zod ^0.8.3`, `postgres ^3.4.9`, `next-auth 5.0.0-beta.30`, `@auth/drizzle-adapter ^1.11.2`,
  `inngest ^4.5.1`, `ai ^6.0.199`, `@ai-sdk/anthropic ^3.0.82`, `@ai-sdk/openai ^3.0.69`,
  `@ai-sdk/provider ^3.0.10`, `@ai-sdk/react ^3.0.201`, `@anthropic-ai/sdk ^0.104.1`, `openai ^6.42.0`,
  `zod ^4.4.3`, `bcryptjs ^3.0.3`, `papaparse ^5.5.3`, `cheerio ^1.2.0`, `libphonenumber-js ^1.13.7`.
- devDeps : `typescript ^5.9.3`, `tailwindcss ^4.3.0`, `@tailwindcss/postcss ^4.3.0`,
  `drizzle-kit ^0.31.10`, `vitest ^4.1.8`, `@vitest/coverage-v8 ^4.1.8`, `@vitejs/plugin-react ^6.0.2`,
  `happy-dom ^20.10.2`, `@testing-library/react ^16.3.2`, `@playwright/test ^1.60.0`,
  `@types/node ^22.0.0`, `tsx ^4.22.4`.
- scripts : `dev:"next dev --turbopack"`, `build:"next build"`, `start`, `lint`, `tsc:"tsc --noEmit"`,
  `test:"vitest run"`, `eval:run`, `e2e`/`e2e:install`, `db:generate`/`db:push`/`db:studio`
  (drizzle-kit), `db:migrate:"echo '[ERROR] use db:migrate:apply' && exit 1"` (REQ-8),
  `db:migrate:apply:"tsx scripts/apply-migrations.ts"`.
**VERIFY.** `pnpm ls drizzle-orm --depth=Infinity` → 1 version ; `pnpm tsc` vert (squelette) ;
`grep -r "@neondatabase" src` → 0.
**TEST.** `versions-lock.test.ts` : lit `package.json`, asserte chaque pin (égalité de chaîne) +
absence de `@neondatabase/serverless`.
**j-h : 0,5.** **Dép : T-1.**

## T-3 — Config front : Tailwind 4 config-less + tsconfig strict + PostCSS + Next + vitest
**Impératif.** Poser la config build/test exacte (REQ-30). **Aucun** `tailwind.config.*` (trap #9).
**Fichiers (REUSE shape Elevay).** `apps/web/tsconfig.json` (`strict:true`,
`moduleResolution:"bundler"`, `paths:{"@/*":["./src/*"]}`, `exclude:["node_modules","scripts"]`,
`plugins:[{name:"next"}]`) ; `apps/web/postcss.config.mjs` (`@tailwindcss/postcss`) ;
`apps/web/src/app/globals.css` (`@import "tailwindcss"; @theme {…}` — theme dans le CSS) ;
`apps/web/next.config.ts` (CSP headers ; wrap Sentry **optionnel**) ; `apps/web/vitest.config.ts`
(env node, alias `@`→`src`, dotenv loader `ANTHROPIC_*`/`OPENAI_*`) ; `apps/web/vercel.json`
(`framework:nextjs`, `installCommand:"pnpm install --frozen-lockfile"`, **PAS** de crons — D8).
**`.npmrc` uniquement si Sentry** (2 lignes `public-hoist-pattern`).
**VERIFY.** `pnpm build` (next build) vert sur une page `/` minimale ; `ls` → aucun
`tailwind.config.*`.
**TEST.** `front-config.test.ts` : pas de `tailwind.config.*` ; `tsconfig.compilerOptions.strict===true` ;
garde « export nommé interdit sur page.tsx/layout.tsx » (mémoire `nextjs-page-export-build-gap`).
**j-h : 0,5.** **Dép : T-2.**

## T-4 — CI gate (pnpm 10.15.1 + Node 22, filtre `@orion/web`)
**Impératif.** Recréer `.github/workflows/ci.yml` identique à Elevay (REQ-4) :
`pnpm/action-setup@v6 version:10.15.1`, `setup-node@v5 node-version:22`, `working-directory: app`,
`NODE_OPTIONS=--max-old-space-size=6144`, exécuter `pnpm --filter @orion/web tsc` +
`pnpm --filter @orion/web test`, + **gitleaks**. `.gitleaks.toml` au root pour allowlister les faux
positifs de noms de types (`orion-backend-verification:64-65,499-501,516-518`).
**Fichiers (REUSE).** `orion/.github/workflows/ci.yml`, `orion/.gitleaks.toml`.
**VERIFY.** Un PR de démo passe la CI verte (tsc+vitest+gitleaks) sur un install `--frozen-lockfile`
**propre** (pas un node_modules junctionné — trap #4).
**TEST.** Exécution locale `pnpm --filter @orion/web tsc && pnpm --filter @orion/web test`.
**j-h : 0,25.** **Dép : T-2.**

## T-5 — Câbler le client AI (provider lazy `/v1` + traced-ai budget/trace)
**Impératif.** Copier le provider AI exact (REQ-27/28). `createAnthropic` singleton **lazy derrière
un `Proxy`** (env au call-time) ; `resolveAnthropicBaseUrl()` allowlist SSRF EU `https://eu.anthropic.com/v1`
/ US `https://api.anthropic.com/v1` → `/v1` **obligatoire** (trap #7). `MODEL_MAP` :
`chat→claude-sonnet-4-6`, `lightweight→claude-haiku-4-5-20251001`, `embedding→text-embedding-3-small`.
`getModelForTask` honore `AI_DISABLED=1` (null), circuit-breaker → OpenAI. Tout LLM via
`tracedGenerateText`/`tracedGenerateObject` → `enforceLlmBudget(tenantId)` **avant** dispatch
(`BudgetExceededError`) + `recordTrace` au finish (coût via `agent_traces.estimated_cost`, **pas**
`llm_calls`). **Pas de Vercel AI Gateway.**
**Fichiers (REUSE).** `lib/ai/ai-provider.ts` (`:66-86` baseURL, `:105-145` proxy, `:186-193`
MODEL_MAP, `:227-270` getModelForTask) ; `lib/ai/traced-ai.ts` (`:15`, `:84-100`, `:158`, `:216`) ;
`lib/billing/llm-budget` ; `lib/observability/*` ; `lib/region-config.ts`.
**VERIFY.** `node -e` qui appelle `resolveAnthropicBaseUrl()` → URL **finissant par `/v1`** ;
`AI_DISABLED=1` → `getModelForTask` null.
**TEST.** `ai-provider.test.ts` : baseURL `/v1` ; `AI_DISABLED=1`→null ; circuit ouvert→fallback
OpenAI. `traced-ai.test.ts` : tenant au cap → `BudgetExceededError` **avant** appel réseau (spy) ;
appel OK → 1 ligne `agent_traces` `estimated_cost>0`.
**j-h : 1,0.** **Dép : T-2, T-8 (db pour budget/trace).**

---

# LOT 1 — AUTH  (REQ-5, 6)

## T-6 — NextAuth v5 + DrizzleAdapter + `resolveUserTenant` (canal humain)
**Impératif.** Copier `auth.ts` (605 l). `DrizzleAdapter(db as any, {usersTable, accountsTable,
sessionsTable, verificationTokensTable})` (cast `as any` **obligatoire**, dual-resolve drizzle —
REQ-3). `linkAccount` **wrappé** pour chiffrer les tokens OAuth au repos
(`lib/crypto/oauth-token-crypto`). Session `jwt`, `maxAge:8h`, `updateAge:1h`. Callback `jwt` au 1er
sign-in → `resolveUserTenant(authUserId, email)` stamp `token.tenantId/appUserId/role`. Tokens OAuth
**jamais** sur le JWT (server-side dans `auth_account`). Providers : `Google` (si `GOOGLE_CLIENT_ID`),
`MicrosoftEntraId` (si `MICROSOFT_CLIENT_ID`), `Credentials` (bcrypt + dummy-hash timing-safe +
lockout email/IP + TOTP). Renommer `elevay`→`orion` partout.
**Fichiers (REUSE).** `src/auth.ts` (`:80-196` `resolveUserTenant`, `:198` cast, `:227`),
`lib/crypto/oauth-token-crypto`, `src/db/schema/auth.ts`, `src/middleware.ts` (rate-limit IP + RBAC).
**VERIFY.** e2e Playwright : login Credentials → session porte `tenantId/role`.
**TEST.** `resolve-user-tenant.test.ts` : user connu → tenant existant ; invite pending → join dans
`withTenantTx(invite.tenantId)` ; `!SELF_SERVE_SIGNUP_ENABLED && !hasBetaAccess()` → **throw** ;
sinon crée tenant+admin. e2e login.
**j-h : 1,5.** **Dép : T-8 (schema auth), T-12 (`withTenantTx`).**

## T-7 — Auth MCP Bearer `mcp_*` scopé tenant
**Impératif.** Copier `authenticateMcpRequest` : lit `Authorization: Bearer mcp_…` → match `keyPrefix`
puis **`bcryptjs.compare(token, keyHash)`** sur `tenants.settings.mcpApiKeys[]` (shape `McpApiKeyEntry
{id,name,keyHash,keyPrefix,createdAt}`) → renvoie `{tenantId, keyId, scopes}` + bump `lastUsedAt` ;
**PAS sha256** (le vrai code fait `bcryptjs.compare` ; une clé sha256 ne matche jamais → 401 ; cf. `SETUP-RUNBOOK §4.2`) ;
absent/révoqué → `401`, **aucun** dispatch. `tenantId` ainsi obtenu passé à **tous** les handlers ;
aucun outil ne l'accepte en argument (invariant #1). Scope insuffisant → `403`.
**Fichiers (REUSE).** `app/api/mcp/route.ts:230` (`authenticateMcpRequest`), `:249` (lecture
`settings.mcpApiKeys`), `:264` (bump `lastUsedAt`) ; `lib/config/tenant-settings.ts:431`
(`McpApiKeyEntry`).
**VERIFY.** `curl` sans Bearer → `401` ; Bearer valide → handler reçoit le `tenantId` de la clé.
**TEST.** `mcp-auth.test.ts` : sans Bearer→401 ; révoqué→401 ; scope read tentant export→403 ; un
`tenantId` injecté en argument **n'altère pas** le scope. **Tripwire** `no-tenant-arg.test.ts` :
grep du tree interdit `tenantId` comme champ d'`inputSchema`.
**j-h : 0,5.** **Dép : T-9 (table `tenants`), T-29 (route MCP).**

---

# LOT 2 — DATA / SCHEMA / MIGRATIONS  (REQ-7..14)

## T-8 — Client DB postgres-js + guard EU/GDPR
**Impératif.** Copier `db/index.ts` : `drizzle-orm/postgres-js` + `postgres(DATABASE_URL)` (TCP,
**pas** neon-http malgré sa présence) ; `assertEuHost(DATABASE_URL)` **log** CRITICAL(prod)/WARNING(dev)
si `GDPR_REGION=eu` et host non-EU, **sans throw**. Role applicatif = `orion_app` (restreint) ;
`DATABASE_URL_OWNER` (role `postgres`) **jamais** dans `src` (REQ-9).
**Fichiers (REUSE).** `src/db/index.ts` (`:1-2`, `:31-32`), `lib/region-config.ts`.
**VERIFY.** `tsx -e "import {db} from './src/db'"` boote ; host non-EU sous `GDPR_REGION=eu` → log
CRITICAL en prod simulée, **pas** d'exception.
**TEST.** `db-client.test.ts` : import `db` OK ; spy console → CRITICAL sur host non-EU/prod.
**j-h : 0,5.** **Dép : T-2.**

## T-9 — `tenants` + `mcpApiKeys` + `integration_credentials` (clés per-tenant chiffrées)
**Impératif.** Schéma barrel `db/schema.ts` ré-exporte `db/schema/*`. `tenants` (REQ-10) :
`{ id uuid pk defaultRandom, name, settings jsonb $type<TenantSettings>, createdAt, updatedAt }`,
`settings.mcpApiKeys: McpApiKeyEntry[]` (REUSE forme `tenant-settings.ts:431`). Table NET-NEW
`integration_credentials` (clés sinks **per-tenant chiffrées**, jamais env — REQ-29) :
```ts
// db/schema/integrations.ts (NET-NEW)
export const integrationCredentials = pgTable("integration_credentials", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),            // 'instantly'|'fiber'|'orange_slice'|'lopus'|'webhook'
  encryptedApiKey: text("encrypted_api_key"),       // chiffré (lib/crypto/*) — JAMAIS clair
  config: jsonb("config").$type<Record<string, unknown>>().default({}), // baseUrl|webhookUrl|webhookSecret|defaultCampaignId
  status: text("status").notNull().default("active"),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantProviderUx: uniqueIndex("ic_tenant_provider_ux").on(t.tenantId, t.provider) }));
```
**Fichiers.** `db/schema/tenants.ts` (REUSE forme), `db/schema/integrations.ts` (NET-NEW),
`db/schema.ts` (barrel) ; helper chiffrement REUSE `lib/crypto/oauth-token-crypto` (analogue).
**VERIFY.** `db:push` crée les tables ; upsert credential Instantly → relecture déchiffrée correcte.
**TEST.** `integration-credentials.test.ts` : upsert+read clé déchiffrée ; 2 insert même
`(tenant,provider)`→upsert (uniqueIndex) ; **la valeur stockée ≠ la clé fournie** (jamais en clair).
**j-h : 1,0.** **Dép : T-8.**

## T-10 — Tables `ingest_jobs` + `ingest_items` (dédup 3 niveaux)
**Impératif.** Schéma additif (REQ-13). Niveau 1 `(tenantId,fingerprint)` `onConflictDoUpdate` ;
niveau 2 `(jobId,sourceRef)` `onConflictDoNothing` (resume Inngest exact) ; niveau 3 = merge
identité (T-21/T-22, REUSE).
```ts
// db/schema/ingest.ts (NET-NEW)
export const ingestJobs = pgTable("ingest_jobs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text("tenant_id").notNull(),
  sourceName: text("source_name").notNull(),     // 'csv'|'apollo_people'|'waterfall'|'fiber'...
  sourceKind: text("source_kind").notNull(),     // 'file'|'provider'
  fingerprint: text("fingerprint").notNull(),     // sha256(entrée) → dédup niveau 1
  status: text("status").notNull().default("queued"), // queued|running|done|error
  totalEstimate: integer("total_estimate"),
  pulled: integer("pulled").default(0), resolved: integer("resolved").default(0),
  created: integer("created").default(0), merged: integer("merged").default(0),
  skipped: integer("skipped").default(0), signals: integer("signals").default(0),
  scored: integer("scored").default(0),
  options: jsonb("options").$type<Record<string, unknown>>().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ jobUx: uniqueIndex("ingest_jobs_tenant_fp_ux").on(t.tenantId, t.fingerprint) }));

export const ingestItems = pgTable("ingest_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  jobId: text("job_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  sourceRef: text("source_ref").notNull(),       // 'row:42' | apollo id → dédup niveau 2
  subjectKind: text("subject_kind").notNull(),    // 'company'|'person'
  resolvedId: text("resolved_id"),                // companies.id|contacts.id après merge
  outcome: text("outcome"),                       // 'created'|'merged'|'skipped'|'error'
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ itemUx: uniqueIndex("ingest_items_job_ref_ux").on(t.jobId, t.sourceRef) }));
```
Helpers NET-NEW `openIngestJob(tenantId, source, fingerprint, options)`, `getJob(id)`,
`bumpJobCounters(id, delta)`.
**Fichiers.** `db/schema/ingest.ts`, `lib/ingest/jobs.ts` (helpers).
**VERIFY.** `db:push` ; re-soumettre le même fingerprint → 1 seul job.
**TEST.** `ingest-dedup.test.ts` : même fingerprint→1 job ; rejouer une page→0 item dupliqué.
**j-h : 1,0.** **Dép : T-8.**

## T-11 — Tables `outbound_destinations` + `export_jobs` (+ `export_items`) — traçabilité handoff
**Impératif.** Schéma additif (REQ-14). Chaque skip porte le `{code,reason}` du gate (auditabilité
GDPR). `dryRun` planifie sans POST tiers.
```ts
// db/schema/outbound.ts (NET-NEW)
export const outboundDestinations = pgTable("outbound_destinations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text("tenant_id").notNull(),
  kind: text("kind").notNull(),                  // 'instantly'|'fiber'|'orange_slice'|'lopus'|'webhook'|'generic'
  label: text("label"),
  config: jsonb("config").$type<Record<string, unknown>>().default({}), // campaignId|listId|webhookUrl
  credentialId: text("credential_id"),            // → integration_credentials.id
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const exportJobs = pgTable("export_jobs", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text("tenant_id").notNull(),
  destinationId: text("destination_id"),
  destinationKind: text("destination_kind").notNull(),
  requested: integer("requested").default(0), exported: integer("exported").default(0),
  skipped: integer("skipped").default(0), duplicates: integer("duplicates").default(0),
  dryRun: boolean("dry_run").default(false),
  result: jsonb("result").$type<{ exported:{prospectId:string;externalId?:string}[];
    skipped:{prospectId:string;code:string;reason:string}[] }>(),
  status: text("status").notNull().default("running"), // running|done|error
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const exportItems = pgTable("export_items", {       // grain prospect (audit ligne-à-ligne)
  id: text("id").primaryKey().$defaultFn(() => createId()),
  exportJobId: text("export_job_id").notNull(), tenantId: text("tenant_id").notNull(),
  prospectId: text("prospect_id").notNull(),
  outcome: text("outcome").notNull(),            // exported|skipped|duplicate|error
  gateCode: text("gate_code"), externalId: text("external_id"), reason: text("reason"),
}, (t) => ({ jobProspectUx: uniqueIndex("export_items_job_prospect_ux").on(t.exportJobId, t.prospectId) }));
```
**Fichiers.** `db/schema/outbound.ts`.
**VERIFY.** `db:push` ; un export de 3 dont 1 `unreviewed` → `export_jobs{requested:3,exported:2,
skipped:1}` + `export_items.gate_code:"not_targeted"`.
**TEST.** `export-jobs.test.ts` : comptage + gate_code par item.
**j-h : 0,75.** **Dép : T-8.**

## T-12 — `withTenantTx` (RLS Supavisor-safe) + tripwire `set_config(...,false)`
**Impératif.** Copier `db/rls.ts:44-54`. `withTenantTx(tenantId, fn)` ouvre une **vraie** transaction
et exécute `SELECT set_config('app.tenant_id', <id>, true)` (le **`true`** = transaction-scoped) avant
`fn(tx)`. **Aucun** `set_config(..., false)` (session-scoped) nulle part — Supavisor mode TRANSACTION
(6543) empoisonne les backends poolés (trap #6).
**Fichiers (REUSE).** `src/db/rls.ts:44-54`.
**VERIFY.** Deux `withTenantTx` concurrents ne fuient pas `app.tenant_id`.
**TEST.** `rls.test.ts` (tripwire) : grep `set_config\(.*,\s*false\)` → **0 hit** ; isolation
concurrente.
**j-h : 0,5.** **Dép : T-8.**

## T-13 — Runner de migrations custom `__orion_migrations` + `db:migrate` désactivé
**Impératif.** Copier `scripts/apply-migrations.ts` (REQ-8), renommer la table de tracking en
**`__orion_migrations`**. `postgres(DATABASE_URL_OWNER, {max:1})` (role owner, hors-bande) →
`CREATE TABLE IF NOT EXISTS __orion_migrations (filename PK, hash, applied_at default now())` → lit
`drizzle/*.sql` triés lexicalement → pour chaque non-appliqué : `sql.begin(tx => { tx.unsafe(content);
INSERT … (filename, sha256(content)) })` (**1 tx/fichier**) ; hash-mismatch déjà-appliqué → warn+skip.
Toute migration **additive + `IF NOT EXISTS`** (re-run sûr). `db:migrate` → `exit 1`.
**Fichiers (REUSE).** `apps/web/scripts/apply-migrations.ts`.
**VERIFY.** `pnpm db:migrate` → exit 1 ; `pnpm db:migrate:apply` deux fois → 1 seule ligne
`__orion_migrations`, 0 erreur.
**TEST.** `apply-migrations.test.ts` (DB test) : idempotence (double-apply = 1 ligne) ;
hash-mismatch → warn+skip.
**j-h : 0,5.** **Dép : T-8.**

## T-14 — `signals` taxonomie canonique + alias-map (`taxonomy.ts`) + sink `recordCompanySignal`
**Impératif. PRÉREQUIS DUR.** `recordCompanySignal` écrit `companies.properties.signals[]` (JSONB
merge `||`, REUSE `record-signal.ts:86,94`), `SignalEntry {type,detectedAt,strength?,detail?,source?,
evidence?}` (`:38-45`). **NET-NEW `lib/signals/taxonomy.ts`** = alias-map canonique
(`funding_recent`→`funding`, etc.) au-dessus des **9 types canoniques** (`triggers.ts:27`). **Sans
lui**, `bestMultiplierForCompany` retourne `undefined` → plancher 1.0× (bug vérifié
`signals-world-class`, `signal-score-daily.ts:87`). ≥6 taxonomies disjointes existent en amont → la
canonicalisation est un prérequis **avant** d'annoncer `get_signals.polarity`/les multipliers.
**Fichiers (REUSE+NET-NEW).** REUSE `record-signal.ts:86,94,38-45`, `triggers.ts:27`,
`freshness.ts:98,88,31` (TTL) ; NET-NEW `lib/signals/taxonomy.ts`.
**VERIFY.** `node -e` : un `{type:'funding_recent'}` ressort canonique `'funding'` ; un multiplier
appris s'applique (≠ 1.0) pour un type connu.
**TEST.** `taxonomy.test.ts` : alias→canonique pour tous les types observés ;
`record-signal.test.ts` : merge `||` sans écrasement ; multiplier ≠ 1.0 pour type connu.
**j-h : 1,0.** **Dép : T-9.**

## T-15 — Cache `intelligence_briefs` (TTL 14 j) + `buildIntelligenceBrief`
**Impératif.** Copier `IntelligenceBrief` (`types.ts:50-75`) + `buildIntelligenceBrief`
(`build-intelligence-brief.ts:26`) + cache `intelligenceBriefs` 14 j (`BRIEF_TTL_DAYS:24`), lecture
read-only 0-LLM via `readCachedBrief:190` ; `forceRefresh:30` reconstruit. `briefIsEmpty:245` →
`briefCompleteness:0`, `confidence:"low"`. Table
`intelligence_briefs {id,tenantId,subjectType,subjectId,brief jsonb,researchedAt,expiresAt}`,
`uniqueIndex(tenantId,subjectType,subjectId)`.
**Fichiers (REUSE).** `lib/campaign-engine/types.ts:50-75`,
`lib/campaign-engine/build-intelligence-brief.ts:24,26,30,190,227-245`, schéma `intelligence`.
**VERIFY.** 2e appel <14 j ne déclenche **pas** de LLM ; `forceRefresh:true` reconstruit.
**TEST.** `intelligence-brief.test.ts` : spy `tracedGenerateText` non appelé au 2e hit ; brief vide
→ `briefCompleteness:0`.
**j-h : 0,5.** **Dép : T-5, T-14.**

---

# LOT 3 — INNGEST  (REQ-15..18)

## T-16 — Client Inngest `id:"orion"` + serve route `maxDuration=300` (forme 2-arg)
**Impératif.** `client.ts` : `export const inngest = new Inngest({ id:"orion" })`. Route :
`export const maxDuration = 300; export const { GET, POST, PUT } = serve({ client: inngest,
functions:[…] })`. **Toute** `createFunction` = **2-arg** : triggers DANS la config
(`triggers:[{cron}|{event}]`), `concurrency` = **array** (trap #2, gabarit `signal-score-daily.ts:95-108`).
**Pas** de crons Vercel (D8).
**Fichiers (REUSE).** `src/inngest/client.ts`, `src/app/api/inngest/route.ts`.
**VERIFY.** `GET /api/inngest` liste les fonctions ; `inngest.id === "orion"`.
**TEST.** `inngest-shape.test.ts` : `inngest.id==="orion"` ; route exporte `GET/POST/PUT` +
`maxDuration===300` ; chaque `createFunction` a `triggers` dans l'arg 0 et `concurrency` array.
**j-h : 0,5.** **Dép : T-2.**

## T-17 — `inngest/ingest-run` — orchestrateur durable (résolution + composition par précédence)
**Impératif.** NET-NEW (clone structurel `custom-signal-backfill.ts:29`). 5 stages durables
`open-job → loop {pull/ledger/resolve/signals} par page → score → close-job`,
`concurrency:[{key:"event.data.jobId", limit:1}]`. **[1] RÉSOUDRE** : `upsertAccount`/`upsertContact`
(`upsert.ts:108/:223`), `accountMatchPlan` registry→domain→name (`identity.ts:67/:125`),
`findAccountMatch` insert-ou-merge (`upsert.ts:60`). **[2] COMPOSER** : précédence `PROVIDER_RANK`
(`precedence.ts:9` : manual 100 > sirene/zefix 80 > linkedin 55 > apollo 50 > csv 40 > inferred/llm 20),
tie→`observedAt` récent, `pickWinner:53` → `account_field_source`. `vendorIds` = side-map, **jamais**
dans l'identité.
**Fichiers (NET-NEW sur REUSE).** `inngest/ingest-run.ts` ; REUSE `custom-signal-backfill.ts:29`,
`upsert.ts:60/:108/:223`, `identity.ts:67/:125`, `precedence.ts:9/:53`.
**VERIFY.** Inngest dev server : merge CSV+Apollo+Sirene → un `companies.id`, `name`←CSV,
`domain`←Apollo, `industry`←Sirene (rank 80 gagne).
**TEST.** `ingest-run.test.ts` : merge multi-source → 1 id + précédence correcte ; re-run idempotent.
**j-h : 2,0.** **Dép : T-10, T-12, T-16, T-21 (sources).**

## T-18 — `inngest` acquisition signaux + score ciblé (+ hookpoints provenance/signal post-import)
**Impératif.** Stage signaux : `recordCompanySignal` (`record-signal.ts:94`) ← `IngestItem.rawSignals`
→ `properties.signals[]` (via alias-map T-14). Stage score (NET-NEW `lib/ingest/score-touched.ts`) :
`scoreCompanyBatch(tenantId, touchedIds, icps, customFields)` (`fit-recompute-core.ts:140`) +
`bestMultiplierForCompany` → `computePriorityScore` (`priority-score.ts:70`, floors `:54-55`) — **pas**
de recompute tenant entier. **NET-NEW (gap #455)** : hookpoint provenance `writeFieldSource`
(`functions.ts:~220`) + hookpoint signal post-import (`agentic-executor.ts:~240`) — **dans le MVP**,
sinon tenant 100%-CSV → why-now vide.
**Fichiers (NET-NEW sur REUSE).** `lib/ingest/score-touched.ts`, hookpoints `functions.ts:~220` +
`agentic-executor.ts:~240` ; REUSE `record-signal.ts:94`, `fit-recompute-core.ts:140`,
`priority-score.ts:70`, `freshness.ts:98`.
**VERIFY.** `rawSignals:[{type:'hiring'}]` sur un CSV → `properties.signals[]` non vide →
`priorityScore > floor`.
**TEST.** `score-touched.test.ts` : score ciblé ne touche que `touchedIds` (spy batch) ; sans
alias-map → plancher 1.0 (régression du bug).
**j-h : 1,0 (score) + 1,0 (hookpoints) = 2,0.** **Dép : T-14, T-17.**

## T-19 — `inngest/signal-score-daily` — cron recompute (corriger le bug taxonomie)
**Impératif.** Copier le gabarit (`signal-score-daily.ts:95-108`) : `{id:"signal-score-daily",
retries:1, concurrency:[{limit:1}], triggers:[{cron:"0 6 * * *"}]}`. **BUG À NE PAS PORTER** : le daily
n'appliquait jamais les multipliers car les signaux étaient écrits `{funding_recent,…}` mais les
multipliers keyés canonique → `undefined` → plancher 1.0× (`:87`). **Fix = passer par `taxonomy.ts`
(T-14) avant lookup multiplier.**
**Fichiers (REUSE+fix).** `inngest/signal-score-daily.ts` (REUSE pattern, MODIF lookup via T-14).
**VERIFY.** Run manuel : un sujet avec signal `funding_recent` reçoit le multiplier appris (≠ 1.0).
**TEST.** `signal-score-daily.test.ts` : signal non-canonique → multiplier appliqué après alias-map.
**j-h : 0,5.** **Dép : T-14, T-16.**

## T-20 — `inngest/velocity-snapshot` + table `signal_snapshots` (l'EDGE — différable P1)
**Impératif.** NET-NEW. Table `signal_snapshots` (historise les sources où la **dérivée** est la
valeur : ATS/npm/PyPI/tech/sous-domaines). Cron `{id:"velocity-snapshot", retries:1,
concurrency:[{limit:2}], triggers:[{cron:"0 4 * * *"}]}` : pull sources Tier 2 historisables → écrit
`signal_snapshots` → diff vs snapshot précédent → `recordCompanySignal` avec un signal **dérivé**
(`hiring_velocity`, `adoption_accel`, `tech_churn`). **Le moat est ici** : le retard d'un entrant =
tout l'historique non snapshotté (irrattrapable) → démarrer **dès le lancement**.
```sql
CREATE TABLE IF NOT EXISTS signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,                  -- NULL = snapshot global partagé (npm/PyPI/SEC)
  subject_key text NOT NULL,       -- domaine|repo|package|CIK
  source text NOT NULL,            -- greenhouse|lever|ashby|npm|pypi|builtwith|crtsh|edgar
  metric text NOT NULL,            -- open_roles|weekly_downloads|tech_set_hash|subdomain_set
  value jsonb NOT NULL, observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snap_subject_source_metric_time
  ON signal_snapshots (subject_key, source, metric, observed_at DESC);
```
**Fichiers (NET-NEW).** `db/schema/snapshots.ts`, `inngest/velocity-snapshot.ts`.
**VERIFY.** Deux runs (fixtures J et J+21) → un signal dérivé `+N roles/3sem`.
**TEST.** `velocity-snapshot.test.ts` : 2 snapshots ATS → dérivée correcte ; diff = 0 → pas de signal.
**j-h : 1,0.** **Dép : T-14, T-16, T-25 (sources Tier 2). DIFFÉRABLE P1.**

---

# LOT 4 — ADAPTATEURS ENTRÉE  (REQ-19..21)

## T-21 — Contrat unifié `IngestItem`/`IngestSource` (`lib/ingest/types.ts`)
**Impératif.** NET-NEW. CSV-row et provider-record convergent vers le même `IngestItem` = la forme
consommée par `upsertAccount`/`upsertContact`. `pull()` paginé, **ne throw JAMAIS** (erreur source →
items partiels + log ; pipeline durable).
```ts
export interface IngestItem {
  kind: "company" | "person";
  identity: { domain?: string; name?: string; country?: string; siren?: string; siret?: string;
    uid?: string; email?: string; linkedinUrl?: string; firstName?: string; lastName?: string;
    companyRef?: string; };
  fields: Partial<Record<"industry"|"size"|"revenue"|"description"|"title"|"phone", string|null>>;
  vendorIds?: Record<string, string>;          // side-map, JAMAIS dans l'identité
  rawSignals?: Array<{ type: string; detectedAt: string; strength?: string; detail?: string;
    evidence?: { url: string; quote?: string } }>;
  sourceRef: string;                            // 'row:42' | apollo id → dédup niveau 2
  provider: string;                             // 'csv'|'apollo'|'sirene'|'edgar'|... → précédence
}
export interface IngestSource {
  name: string; kind: "file" | "provider"; subjectKind: "company" | "person" | "mixed";
  inputFingerprint(): string;                   // sha256(entrée) → dédup job-level (niveau 1)
  pull(ctx: PullCtx, cursor?: string): Promise<{ items: IngestItem[]; nextCursor?: string; total?: number }>;
}
```
**Fichiers (NET-NEW).** `lib/ingest/types.ts`.
**VERIFY.** `tsc` vert ; une source factice produit des `IngestItem[]` paginés.
**TEST.** `ingest-types.test.ts` : une source factice qui throw en interne → `pull()` renvoie items
partiels, ne propage pas.
**j-h : 0,5.** **Dép : T-2.**

## T-22 — `csvSource` (extraction CSV depuis `import/smart` + route → producteur d'event)
**Impératif.** NET-NEW. Extraire `parseCSVLine`/`mapColumnsWithAI`/`applyMapping`
(`import/smart/route.ts:115/:141/:256`) vers `lib/ingest/csv-parse.ts` (papaparse) ; mémoïser le
mapping Haiku dans le cursor ; paginer par 200. MODIF `import/smart/route.ts:57-101` : l'insert brut
devient `openIngestJob` + `inngest.send("ingest/run")`, rétro-compat `sync=true` pour <50 lignes.
**Fichiers (NET-NEW sur REUSE).** `lib/ingest/csv-parse.ts`, `lib/ingest/sources/csv-source.ts` ;
MODIF `app/api/import/smart/route.ts:57-101/:115/:141/:256`.
**VERIFY.** Importer un CSV 500 lignes → 1 `ingest_job`, items paginés 200, `companies` créées.
**TEST.** `csv-source.test.ts` : produit `IngestItem` paginés (200) ; mapping mémoïsé (1 appel Haiku).
**j-h : 1,0.** **Dép : T-5, T-10, T-21.**

## T-23 — `apolloPeopleSource` / `apolloOrgsSource`
**Impératif.** NET-NEW. `pull()` appelle le MCP Apollo (`apollo_mixed_people_api_search` /
`apollo_mixed_companies_search`) ou REST per-tenant. **`num_current_job_openings` →
`rawSignals:[{type:'hiring'}]`, jamais un champ firmo** (`signal-agent-mcp:106`).
**Fichiers (NET-NEW).** `lib/ingest/sources/apollo-source.ts`.
**VERIFY.** Une requête Apollo → `IngestItem` avec `rawSignals` hiring (pas `fields`).
**TEST.** `apollo-source.test.ts` : `num_current_job_openings` route vers `rawSignals`, pas `fields`.
**j-h : 0,75.** **Dép : T-21.**

## T-24 — `waterfallSource` + registres souverains `sireneSource` (FR) [+ Pappers/Zefix CH]
**Impératif.** NET-NEW. `waterfallSource` wrappe `enrichCompany` (`waterfall.ts:148`, merge
first-non-null `:77`, geo-routing TLD, `isSaturated:181`) ; provider par champ = `provenance[i].provider`.
`sireneSource` : `recherche-entreprises.api.gouv.fr` (keyless, ~7 req/s, **rank 80**) → firmo
officielle FR + état entreprise (souverain, aveugle aux wrappers US). **Enrichment par défaut OFF,
FullEnrich banni** (mémoire) — les sources Tier 0/1 servent le brief, pas un enrichissement auto.
**Fichiers (NET-NEW sur REUSE).** `lib/ingest/sources/waterfall-source.ts`,
`lib/ingest/sources/sirene-source.ts` ; REUSE `waterfall.ts:77/:148/:181`, `registry.ts`,
`precedence.ts`.
**VERIFY.** `waterfallSource` remplit firmo first-non-null avec provenance par champ ; `sireneSource`
résout un SIREN→domaine+firmo.
**TEST.** `waterfall-source.test.ts` : first-non-null + provenance ; `sirene-source.test.ts` :
fixture FR → firmo rank 80.
**j-h : 1,0 (waterfall 0,5 + sirene 0,5).** **Dép : T-21.**

## T-25 — Sources Tier 2 — l'EDGE (SEC/BODACC/ATS/GitHub-npm/tech-churn/crt.sh) — différable P1
**Impératif.** NET-NEW, même interface `IngestSource`, chacune produit des `rawSignals` interprétés.
Prioriser **ATS + SEC + BODACC** d'abord, puis OSS/churn/crt.sh.
- **SEC EDGAR Form D/8-K** (`efts.sec.gov` + Atom, **User-Agent obligatoire**, parse XML, CIK→domaine)
  → `funding` pré-annonce (J+0 vs Crunchbase J+30). `[snap]`
- **BODACC FR** (Opendatasoft + recherche-entreprises, keyless) → `job_change` dirigeant + financement FR.
- **ATS publics** (`boards-api.greenhouse.io`/`api.lever.co`/`api.ashbyhq.com`, no auth) → stack +
  intent + **vélocité d'embauche** (slug ATS→domaine + NLP description). `[snap]`
- **npm/PyPI/GitHub/deps.dev** → **dérivée d'adoption** (snapshot+diff). `[snap]`
- **tech-churn** (cheerio sur HTML+headers, diff snapshot) → fenêtre de migration. `[snap]`
- **crt.sh + DNS** (JSON, diff quotidien) → lancement produit/infra (sous-domaine neuf). `[snap]`
Exiger **convergence 2+ sources** avant haute priorité ; plafonner à 3-5 signaux actionnables.
**Fichiers (NET-NEW).** `lib/ingest/sources/{sec,bodacc,ats,oss,techchurn,crtsh}-source.ts`.
**VERIFY.** Fixture Form D → `rawSignals:[{type:'funding'}]` daté + CIK→domaine ; 2 snapshots ATS J/J+21
→ dérivée `+N roles/3sem`.
**TEST.** `tier2-sources.test.ts` (fixtures réseau enregistrées) : chaque source produit le signal
canonique attendu ; `pull()` ne throw jamais sur erreur réseau.
**j-h : 3,0.** **Dép : T-21, T-14. DIFFÉRABLE P1.**

## T-26 — `fiberSource` + `fiberSignalIngestor` (Fiber-as-input) — différable P1
**Impératif.** NET-NEW. **Fiber = INPUT** (data-API). `fiberSource(query)` = tap d'enrichissement
(100+ providers, contact reveal) ; `fiberSignalIngestor(payload)` **normalise n'importe quel payload**
Tracker/webhook → `IngestItem.rawSignals` + `recordCompanySignal` via alias-map (T-14) — aucune casse
si la taxonomie Fiber diffère. Header `x-api-key` **per-tenant** (`integration_credentials`).
**Fiber-Sales EXCLU** (pas d'API d'injection). **Lopus EXCLU en dur** (API non vérifiée).
**Fichiers (NET-NEW).** `lib/ingest/sources/fiber-source.ts`.
**VERIFY.** Payload Fiber arbitraire → signal canonique via alias-map.
**TEST.** `fiber-source.test.ts` : payload Tracker arbitraire → `rawSignals` normalisés.
**j-h : 0,5 (+ porté par export Fiber T-34).** **Dép : T-9, T-14, T-21. DIFFÉRABLE P1.**

## T-27 — Outils MCP d'ingestion (`ingest_csv` / `ingest_from_provider` / `get_ingest_job`)
**Impératif.** NET-NEW. JSON-RPC synchrone sans SSE → async = **job-id + poll**. `ingest_csv`
(`{csv_text(≤5MB), entity_type?, acquire_signals?, score?}`, annotation `{readOnly:false,
destructive:false, idempotent:false, openWorld:true}`, retour `{job_id, status:"queued",
estimated_records, poll:"get_ingest_job"}`) ; `ingest_from_provider` (`{provider:
enum[apollo_people|apollo_orgs|waterfall_enrich|fiber], query, max_records(≤2000)}`) ;
`get_ingest_job` (`{job_id}`→progress). `tenantId` du Bearer. CSV <50 lignes : `sync=true`.
`csv_text >5MB` → rejet zod.
**Fichiers (NET-NEW + MODIF).** `lib/ingest/mcp-handlers.ts` ; MODIF `app/api/mcp/route.ts:19`
(`MCP_TOOLS` + 3 outils) / `:293` (`handleTool` + 3 cases).
**VERIFY.** `ingest_csv` retourne un `job_id` ; `get_ingest_job` reflète la progression ; même
`csv_text` re-soumis → même job (fingerprint).
**TEST.** `mcp-ingest.test.ts` : 3 outils end-to-end ; `csv_text >5MB`→rejet ; dédup fingerprint.
**j-h : 1,0.** **Dép : T-10, T-22, T-29.**

---

# LOT 5 — PIPELINE BRIEF  (REQ-22)

## T-28 — `get_outreach_brief` + contrat `OutreachBrief` A-G (zéro prose)
**Impératif.** NET-NEW `lib/mcp/outreach-brief.ts`. **Remplace `draft_outreach`** (prose supprimée).
Wrapper de mise en forme au-dessus de `buildIntelligenceBrief` (T-15) — **pas** une nouvelle
intelligence. Input zod `GetOutreachBriefInput = { subjectType: enum[contact,company].default("contact"),
subjectId, channel: enum[email,linkedin].default("linkedin"), refresh:bool.default(false),
gateCheck:bool.default(true) }`, annotation `{readOnlyHint:true, idempotentHint:true,
openWorldHint:false}`. Sortie validée par `OutreachBrief` zod (autorité serveur), 7 sections :
- **A `identity`** — firmo + `firmographicProvenance[]{field,provider,atIso}` (`types.ts:26-30,72`).
- **B `whyNow`** — `topSignal{type,strength,detectedAt,source,fresh,ttlDays,evidence{url,quote,verified}}`
  (REUSE `SignalEntry record-signal.ts:40-45` ; fraîcheur `freshness.ts:98/:88` — un signal périmé est
  **pire** qu'aucun) ; `priorityScore`+`priorityFactors` (`priority-score.ts:70`, floors `:54-55`) ;
  `whyNowSummary` (NET-NEW, 1 phrase).
- **C `messaging`** — `bestAngle` (`types.ts:64`), `angleKey` (`signal-opener.ts:135`), `angleGuidance`
  (`SIGNAL_ANGLES outbound-methodologies.ts:159-208`), `painPoints[]`, `methodology` (`getMethodology
  outbound-methodologies.ts:144`), `suggestedCta`, `timing{sendWindow,recipientTz,signalFreshUntilIso}`.
  **Zéro prose.**
- **D `warmPath`** — `warmthSignals[]{type,detail}` (`types.ts:122-125`), `recommendedPerson`
  (`personFromSignals record-signal.ts:61`).
- **E `citableFacts[]` + `doNotClaim[]`** — **LA valeur du pivot**. `citableFacts` =
  `publicContent.filter(type==="metric")` (cappés 6, `build-intelligence-brief.ts:227-234`) ∪
  firmo+provenance (`:238-240`), chacun `{fact,value,source,url?,quote?,verified:true}`. `doNotClaim` =
  `GeneratedOpener.guardrails` (`signal-opener.ts:139` = `Methodology.whatNotToDo`) + tout champ firmo
  `null`/sans provenance → `"ne pas affirmer {field}"` + constantes (`"aucune métrique fabriquée"`).
  Analogue agent-natif de `judgeFabrication` (`fabrication-gate.ts:173`) transposé en **donnée**.
- **F `persona`** — `contactId/fullName/title/seniority/departments[]/linkedinUrl`
  (`prospect-context.ts:267-279`) + `reachable{hasEmail,hasPhone,hasLinkedin}` (`priority-score.ts:85-89`).
- **G `meta`** — `confidence` (NET-NEW), `briefCompleteness` (NET-NEW = ¬`briefIsEmpty:245`),
  `gate{exportable,verdict}` (`evaluateSend` — on ne livre QUE l'autorisé, via T-36).
**Fichiers (NET-NEW sur REUSE).** `lib/mcp/outreach-brief.ts` ; REUSE `build-intelligence-brief.ts:26,190,
227-245`, `types.ts:50-75,109,26-30,64,72,122-125`, `signal-opener.ts:135,139`,
`outbound-methodologies.ts:144,159-208`, `prospect-context.ts:267-279`, `priority-score.ts:70,85-89`.
**VERIFY.** Un sujet avec metric → `citableFacts` non vide `verified:true` ; un champ firmo `null` →
entrée `doNotClaim` ; **0** `subject`/`body` dans la sortie.
**TEST.** `outreach-brief.test.ts` : sortie validée par le zod `OutreachBrief` ; citableFacts/doNotClaim
dérivés corrects ; aucune clé `subject`/`body`.
**j-h : 1,5.** **Dép : T-15, T-36 (gate pour `meta.gate`).**

---

# LOT 6 — MCP (surface protocole)  (REQ-24)

## T-29 — Route MCP : `structuredContent` (P0) + `outputSchema` + annotations + proto bump
**Impératif. PRÉREQUIS DUR (P0).** MODIF `app/api/mcp/route.ts`. Le retour `tools/call` actuel
(`:953-957`) renvoie `{content:[{text:JSON}]}` → **ajouter `structuredContent: result`** en plus
(rétro-compat) — sinon blob opaque, gap P0 bloquant pour le brief. Chaque outil de `MCP_TOOLS:19`
porte `annotations` (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`) +
`outputSchema` (défaut absent = `destructiveHint:true` → les lectures pures **doivent** être annotées
`readOnly`). `initialize:921` → **bump `protocolVersion "2024-11-05"`→`"2025-06-18"`** (vérifié actuel)
+ `capabilities:{tools, resources}`.
**Fichiers (MODIF REUSE).** `app/api/mcp/route.ts:19/:293/:921/:926/:953-957`.
**VERIFY.** `tools/call` retourne `structuredContent` validé par `outputSchema` ; `initialize`
annonce `2025-06-18` + capability `resources`.
**TEST.** `mcp-protocol.test.ts` : `structuredContent` présent+typé ; `get_outreach_brief` annoté
`readOnlyHint:true`, `export_to_outbound` `destructiveHint:true` ; proto `2025-06-18`.
**j-h : 1,0.** **Dép : T-7.**

## T-30 — Resources MCP (`crm://company/{id}/dossier`, `crm://policy/sending-rules`) — différable P1
**Impératif.** NET-NEW. Routeur méthodes + `resources/list|read|templates` (`route.ts:917`). Dossier
prospect (firmo + signaux+evidence + angle + contacts + deals + warm-path, REUSE `handleGetCompany:475`)
+ `crm://policy/sending-rules` (lawful basis, fenêtre 08-18, cold policy, caps). Lus une fois,
cacheables.
**Fichiers (NET-NEW + MODIF).** MODIF `app/api/mcp/route.ts:917` ; REUSE `route.ts:475`.
**VERIFY.** `resources/read crm://company/{id}/dossier` → dossier complet.
**TEST.** `mcp-resources.test.ts` : list+read dossier + policy.
**j-h : 0,5 (+ outils `find_prospects`/`explain_priority`/`enroll` portés ici, +3,0 P1).**
**Dép : T-29. DIFFÉRABLE P1.**

## T-31 — `evaluate_send` (dry-run MCP, lecture de règle)
**Impératif.** NET-NEW `lib/mcp/evaluate-send.ts`. Outil dry-run miroir de `SendingGateOutcome`.
Input `{toAddress, isCold?, sentTodayFromPrimary, companyId?, contactId?, interactive?}` (**PAS** de
tenantId) ; sortie `{send,reason}` ou `{send:false,code,reason}`. Omettre `companyId` n'échappe **pas**
au targeting (force unreviewed=deny). Un Bearer `viewer` ne peut **aucune** action outbound
(`decide-action.ts:80`).
**Fichiers (NET-NEW sur REUSE).** `lib/mcp/evaluate-send.ts` ; REUSE `sending-gate.ts:212`.
**VERIFY.** `evaluate_send` sur un opt-out → `{send:false, code:"opt_out"}`.
**TEST.** `evaluate-send.test.ts` : opt-out→code ; unreviewed+SAFE_MODE→`not_targeted` ; pas de
tenantId en input.
**j-h : 0,5.** **Dép : T-29, T-36.**

---

# LOT 7 — ADAPTATEURS SORTIE  (REQ-23)

## T-32 — Interface `OutboundDestination` + orchestrateur `export_to_outbound` (MCP)
**Impératif.** NET-NEW. Interface `OutboundDestination` ; `push()` n'est appelé **qu'après** le gate.
Outil MCP `export_to_outbound` input zod `{prospectIds: string[].min(1).max(1000), destination:
enum[instantly,fiber,orange_slice,lopus,webhook,generic], campaignId?, listId?,
skipIfInWorkspace:bool.default(true), webhookUrl?, dryRun:bool.default(false)}` avec
`.refine(destination!=="instantly" || (!!campaignId !== !!listId))` (XOR), annotation
`{readOnlyHint:false, destructiveHint:true, openWorldHint:true}`. Sortie `{destination, exported[],
skipped[]{code,reason}, counts{requested,exported,skipped,duplicates}}`. Délègue le gros volume à
l'event Inngest `export/run` (T-35).
```ts
export interface OutboundDestination {
  name: "instantly"|"fiber"|"orange_slice"|"webhook"|"generic";
  push(args: { tenantId: string; briefs: OutreachBrief[];   // déjà gatés exportable:true
    config: { campaignId?: string; listId?: string; webhookUrl?: string; dryRun?: boolean };
    apiKey?: EncryptedSecret; }): Promise<ExportResult>;
}
export type ExportResult = { destination: string;
  exported: { prospectId: string; externalId?: string }[];
  skipped: { prospectId: string; code: string; reason: string }[];
  counts: { requested: number; exported: number; skipped: number; duplicates: number }; };
```
**Fichiers (NET-NEW + MODIF).** `lib/outbound/types.ts`, `lib/mcp/export-to-outbound.ts` ; MODIF
`app/api/mcp/route.ts:19/:293`.
**VERIFY.** Instantly sans exactement un de campaignId/listId → refine échoue (validation).
**TEST.** `export-to-outbound.test.ts` : refine XOR ; `dryRun:true`→aucun POST tiers.
**j-h : 1,0.** **Dép : T-9, T-11, T-28, T-29, T-36.**

## T-33 — Destination Instantly + flatten scalaire (`instantly-map.ts`)
**Impératif.** NET-NEW client + REUSE `toInstantlyCustomVariables` (`send-adapter.ts:19`, **scalaires
uniquement** — objets/arrays droppés). Mapping plat (`lib/outbound/instantly-map.ts`, flatten pur) :
`email/first_name/company_name/job_title` (natifs, `email` gaté), `personalization`←`bestAngle`,
`why_now`←`whyNow.whyNowSummary`, `signal_type/signal_strength`, `signal_evidence_url/_quote` (quote
≤200c), `pain_point_1..3` (blank-fill), `citable_metric_1..3`←`citableFacts` (`"{quote} [{url}]"`),
`best_angle/cta_type/max_words/tone`, `warm_path`, `firmo_source`, `do_not_claim` (joint `" | "`),
`priority_score`, `grounded`/`brief_expires_at`. POST `https://api.instantly.ai/api/v2/leads` (single)
/ `/leads/list` (bulk ≤1000), header `Authorization: Bearer <V2>`, `campaign_id` XOR `list_id`, `429`
→ backoff exp, dedup `skip_if_in_workspace:true`. Clé per-tenant (`integration_credentials`).
**Fichiers (NET-NEW sur REUSE).** `lib/outbound/instantly-map.ts`,
`lib/outbound/destinations/instantly.ts` ; REUSE `providers/instantly/send-adapter.ts:19`.
**VERIFY.** Un brief imbriqué → projection **100% scalaire** (objets droppés) ; mock 429 → backoff.
**TEST.** `instantly-map.test.ts` : projection scalaire (jamais le brief imbriqué) ; XOR campaign/list ;
backoff 429 ; clé absente → erreur explicite (pas de POST).
**j-h : 1,5.** **Dép : T-32.**

## T-34 — Destinations Fiber / Orange Slice / webhook (HMAC) / generic — différable P1
**Impératif.** NET-NEW. **Fiber** : `createAudience`/`addTrackerCompanies` (push d'une audience
résolue+scorée à surveiller — **le brief ne va PAS à Fiber**, seulement l'audience). **Orange Slice** :
webhook entrant → custom fields (endpoints exacts À CONFIRMER avec clé ; flatten partagé webhook).
**webhook générique** : POST **HMAC-signé** d'une enveloppe portant **à la fois** le map plat (moteurs
de template) ET le `brief` complet (agents IA) — vendor-neutre. **generic** : renvoie le **brief
imbriqué complet** + `citableFacts[]`/`doNotClaim[]` en `structuredContent` (pas de flatten).
**Lopus EXCLU en dur** (API non vérifiée ; best-effort `fiberSignalIngestor`-like si jamais).
**Fichiers (NET-NEW).** `lib/outbound/destinations/{fiber,orange-slice,webhook,generic}.ts`.
**VERIFY.** webhook → enveloppe signée HMAC vérifiable ; generic → brief imbriqué complet en
structuredContent.
**TEST.** `outbound-destinations.test.ts` : HMAC vérifiable ; generic = brief imbriqué ; Fiber = audience
seule.
**j-h : 1,5.** **Dép : T-32. DIFFÉRABLE P1.**

## T-35 — `inngest/export-to-outbound` — handoff durable gaté (bulk + 429)
**Impératif.** NET-NEW. `{id:"export-to-outbound", retries:2, concurrency:[{key:"event.data.exportJobId",
limit:1}], triggers:[{event:"export/run"}]}`. Boucle prospects (tenant du Bearer) :
`brief = get_outreach_brief` → **`evaluateSend({…, isCold:true, interactive:false})` (T-36)** → si
`send:false` SKIP + `export_items{gate_code}` (pas d'export) → si `send:true` flatten (T-33/34) → POST
sink ; bulk ≤1000/appel, backoff exp `429`. Credential per-tenant (`integration_credentials`), jamais
env. `dryRun:true` → plan sans POST.
**Fichiers (NET-NEW sur REUSE).** `inngest/export-to-outbound.ts` ; REUSE `evaluateSend
sending-gate.ts:212`, `toInstantlyCustomVariables send-adapter.ts:19`.
**VERIFY.** 3 prospects (1 `unreviewed`) → 2 exportés, 1 skip `not_targeted`, `export_jobs` reflète.
**TEST.** `export-job.test.ts` : comptage + gate par prospect ; mock 429→backoff ; clé absente→erreur
(pas de POST).
**j-h : 1,5.** **Dép : T-11, T-16, T-32, T-33, T-36.**

---

# LOT 8 — GATES  (REQ-25, 26)

## T-36 — `evaluateSend` oracle d'éligibilité (8 gates fail-closed) câblé dans tout export
**Impératif. PRÉREQUIS pour T-28/31/32/35.** Copier `evaluateSend` (`sending-gate.ts:212-346`) — **non
réécrit, additif seulement**. Appelé **dans** le wrapper export (inatteignable depuis le JSON-RPC).
Ordre fixe fail-closed : opt-out `:216` → account ctx `:227` (null→unreviewed) → suppression DB `:240`
→ email-status `:258` → lawful-basis `:270` (block-by-default) → deliverability `:283` → SAFE_MODE
targeting `:301` (unreviewed→deny) → identity/cold/cap `:324` ; `catch` final → `{send:false}`
(`:339-345`, zéro fail-open) ; `settings:null` → `DEFAULTS` protecteurs. `interactive:false` garde
SAFE_MODE actif (compte fraîchement importé non exporté). `interactive:true` n'esquive **que** le gate 7.
**Fichiers (REUSE).** `lib/guardrails/sending-gate.ts:212-346` ; REUSE annexe `fabrication-gate.ts:173`.
**VERIFY.** opt-out → `{send:false, code:"opt_out"}` ; unreviewed+SAFE_MODE → `{send:false,
code:"not_targeted"}` ; `catch` simulé → `{send:false}`.
**TEST.** `sending-gate.test.ts` (porté d'Elevay) : chaque gate fail-closed ; `catch`→fail-closed.
**Tripwire** `export-passes-gate.test.ts` : aucun chemin d'export n'appelle un POST sink avant
`evaluateSend`.
**j-h : 1,0.** **Dép : T-9, T-12.**

## T-37 — Séparation handoff : jamais de cold via infra cliente (tripwire)
**Impératif.** Directive non-négociable (REQ-26, mémoire `elevay-own-infra-sending`) : le chemin
`export_to_outbound` ne touche **ni** `sendViaMailbox` **ni** un transport SMTP — l'envoi est celui du
client sur **ses** comptes. Si Orion ajoute un envoi propre (hors slice brief) : owner-SMTP DNS-vérifié
+ fenêtre 08-18 + caps + cold-on-primary, **jamais** Instantly.
**Fichiers (NET-NEW tripwire).** `__tests__/no-internal-mailer-in-export.test.ts`.
**VERIFY.** grep : le chemin export n'importe ni `sendViaMailbox` ni SMTP.
**TEST.** Le tripwire ci-dessus + `destination:"instantly"` n'appelle que le client Instantly (mock),
jamais un mailer interne.
**j-h : 0,25.** **Dép : T-35.**

---

# LOT 9 — INTÉGRATION ELEVAY  (REQ-31) — *copie des modules, preuve de plug-sans-rewrite*

## T-38 — Copier les modules métier REUSE + porter leurs tests voisins
**Impératif.** Copier (jamais réécrire) les seams stables d'Elevay, renommer `elevay`→`orion`, porter
les `*.test.ts` voisins qui figent le comportement (mitigation du drift). **Aucun** fichier sous
`db/canonical/`, `lib/guardrails/`, `lib/scoring/`, `lib/ai/`, `api/mcp/route.ts` n'est réécrit (diff =
additif/wrappers seulement). Carte de branchement (file:line réels) :

| Couture (REUSE) | file:line Elevay | Tâche consommatrice |
|---|---|---|
| MCP auth Bearer | `api/mcp/route.ts:230,249,264` | T-7 |
| MCP dispatch/tools/retour | `api/mcp/route.ts:19,293,953-957` | T-27/29/32 |
| MCP initialize/resources | `route.ts:921,926,917`, `handleGetCompany:475` | T-29/30 |
| Clé MCP per-tenant | `lib/config/tenant-settings.ts:431` | T-7/9 |
| Gate d'envoi | `lib/guardrails/sending-gate.ts:212-346` (catch `:339`) | T-31/36 |
| Anti-fabrication | `lib/guardrails/fabrication-gate.ts:173` | T-28 (dérive `doNotClaim`) |
| Brief | `build-intelligence-brief.ts:24,26,30,190,227-245`, `types.ts:50-75` | T-15/28 |
| Signaux | `lib/signals/record-signal.ts:38-45,61,86,94` | T-14/18 |
| Taxonomie/triggers | `lib/sequences/triggers.ts:27,143` | T-14 |
| Freshness | `lib/signals/freshness.ts:31,88,98` | T-15/28 |
| Identité/précédence | `db/canonical/upsert.ts:60,108,223`, `identity.ts:67,125`, `precedence.ts:9,53` | T-17 |
| Waterfall enrichissement | `providers/company-enrichment/waterfall.ts:77,148,181`, `registry.ts` | T-24 |
| Scoring | `icp/fit-recompute-core.ts:140`, `scoring/priority-score.ts:54-55,70,85-89` | T-18/28 |
| Opener/méthodo | `scoring/signal-opener.ts:135,139`, `outbound-methodologies.ts:144,159-208` | T-28 |
| Import CSV | `app/api/import/smart/route.ts:57-101,115,141,256` | T-22 |
| Instantly adapter | `providers/instantly/send-adapter.ts:19` | T-33 |
| Inngest gabarit | `inngest/signal-score-daily.ts:95-108`, `custom-signal-backfill.ts:29` | T-16/17/19 |
| Provider/Traced AI | `lib/ai/ai-provider.ts`, `lib/ai/traced-ai.ts` | T-5 |
| DB client/RLS/runner | `db/index.ts`, `db/rls.ts:44-54`, `scripts/apply-migrations.ts` | T-8/12/13 |
| Auth | `auth.ts:80-196,198,227`, `lib/crypto/oauth-token-crypto`, `db/schema/auth.ts` | T-6 |

**NET-NEW (exhaustif) :** `lib/ingest/{types,csv-parse,mcp-handlers,score-touched,jobs}.ts`,
`lib/ingest/sources/{csv,apollo,waterfall,sirene,sec,bodacc,ats,oss,techchurn,crtsh,fiber}-source.ts`,
`lib/signals/taxonomy.ts`, `inngest/{ingest-run,export-to-outbound,velocity-snapshot}.ts`,
`lib/mcp/{outreach-brief,export-to-outbound,evaluate-send}.ts`, `lib/outbound/{types,instantly-map}.ts`
+ `destinations/*`, tables `db/schema/{ingest,integrations,outbound,snapshots}.ts`, hookpoints
provenance (`functions.ts:~220`) + signal post-import (`agentic-executor.ts:~240`).
**VERIFY.** Tripwire diff : modules REUSE inchangés (additif/wrappers seulement).
**TEST.** `reuse-untouched.test.ts` : checksum/diff des fichiers REUSE = additif uniquement.
**j-h : 0 (référence ; la copie est comptée dans les tâches consommatrices).** **Dép : transverse.**

---

# LOT 10 — TESTS  (transverse — accompagne chaque lot)

## T-39 — Suite Vitest cœur : dédup, idempotence, précédence, gates fail-closed
**Impératif.** Porter+écrire les suites qui figent les invariants : dédup 3 niveaux (T-10),
idempotence runner (T-13), précédence multi-source (T-17), gates fail-closed (T-36), flatten scalaire
Instantly (T-33), citableFacts/doNotClaim (T-28). Cible **100% des chemins de gate**.
**Fichiers.** Les `*.test.ts` listés par tâche, regroupés dans `eval:run`.
**VERIFY.** `pnpm --filter @orion/web test` vert ; `pnpm eval:run` vert.
**TEST.** (méta) coverage des modules NET-NEW + gates.
**j-h : 2,0.** **Dép : tâches couvertes.**

## T-40 — e2e Playwright : CSV → brief → export gaté (parcours MVP)
**Impératif.** Un parcours bout-en-bout : `ingest_csv` (job-id+poll) → `get_outreach_brief` (sortie
structurée, 0 prose) → `export_to_outbound` Instantly **dryRun** (gate skip un `unreviewed`).
**Fichiers.** `e2e/mvp-flow.spec.ts`.
**VERIFY.** Le parcours passe ; un prospect `unreviewed` est skip `not_targeted`.
**TEST.** (c'est le test).
**j-h : 1,0.** **Dép : T-27, T-28, T-32, T-33, T-36.**

---

# LOT 11 — DEMO-PREP  (REQ-12 hero + REQ-29 env)

## T-41 — Inventaire env (`.env.example`) + creds partenaires per-tenant en DB
**Impératif.** `.env.example` = sous-ensemble pertinent des 140 (REQ-29) : Core
(`APP_BASE_URL`,`CRON_SECRET`,`ORION_APP_SECRET`), DB (`DATABASE_URL` ; `DATABASE_URL_OWNER`
**opérateur-only, hors code**), Auth (`AUTH_SECRET`,`AUTH_URL`,`GOOGLE_*`,`MICROSOFT_*`,
`BETA_SIGNUP_CODE`,`SELF_SERVE_SIGNUP_ENABLED`), LLM (`ANTHROPIC_API_KEY/_API_BASE/_REGION`,
`OPENAI_API_KEY`,`MISTRAL_API_KEY`,`LLM_PROVIDER`,`AI_DISABLED`), Inngest
(`INNGEST_EVENT_KEY/_SIGNING_KEY`), Sources Tier 0/1 (`APOLLO_API_KEY`,`PAPPERS_API_KEY`,
`ZEFIX_API_USER/PASSWORD` ; Sirene/Tier 2 keyless), GDPR (`GDPR_REGION`,`LAWFUL_BASIS_GATE`,
`DSAR_ERASE_ENABLED`), Flags (`TARGETING_GATE_ENABLED`,`RESEARCH_AGENT_ENABLED`,
`ORION_INGEST_ENABLED`,`ORION_EXPORT_ENABLED`), Observability (`SENTRY_DSN`,`POSTHOG_*`). **Clés
sinks (Instantly/Fiber/Orange Slice) per-tenant en DB** (`integration_credentials`), **PAS** en env.
DROP voice/Twilio/Stripe/Recall/BullMQ.
**Fichiers (NET-NEW).** `.env.example`.
**VERIFY.** Boot avec `DATABASE_URL`+`AUTH_SECRET`+`ANTHROPIC_API_KEY` ; `grep DATABASE_URL_OWNER src`
→ 0 ; aucun `*_API_KEY` partenaire sink lu depuis `process.env`.
**TEST.** `env-shape.test.ts` : grep `DATABASE_URL_OWNER` dans `src`→0 ; pas de lecture env de clé sink.
**j-h : 0,5.** **Dép : T-8, T-9.**

## T-42 — Hero de démo : brief pré-construit (metric + provenance + signal frais)
**Impératif.** Le WOW meurt sans donnée : le sujet hero doit avoir ≥1 `publicContent.type:"metric"` +
firmo/provenance non vides (`firmographicsHaveSignal:198`) + ≥1 signal **frais**. Pré-construire le
brief la veille (`buildIntelligenceBrief`, cache 14 j) + un `ingest_csv` de seed (qui passe par
résolution→signal→score, donc why-now réel, pas vide). Exiger **convergence 2+ sources** sur le hero.
**Fichiers (NET-NEW).** `scripts/seed-demo.ts` (seed CSV + pré-build brief).
**VERIFY.** `get_outreach_brief` sur le hero → `citableFacts` non vide, `whyNow.topSignal.fresh:true`,
`meta.gate.exportable:true` ; `export_to_outbound` dryRun → exporté (pas skip).
**TEST.** `seed-demo.test.ts` : le hero satisfait les 3 conditions (metric, provenance, signal frais).
**j-h : 0,5.** **Dép : T-15, T-22, T-28, T-36.**

---

# CHEMIN CRITIQUE — démo hackathon (MVP buildable)

**Objectif démo :** `ingest_csv` → résolution/précédence → signal+score → `get_outreach_brief`
(structuré, faits citables) → `export_to_outbound` Instantly **gaté** (dryRun), proto MCP propre
(`structuredContent`). **Pas** de Tier 2, SSE, resources, multi-provider, warm-path.

**Tâches minimales (ordre topologique) :**
1. **T-1 → T-4** Setup/install/CI/front (1,75)
2. **T-8, T-12, T-13** DB client + RLS + runner (1,5)
3. **T-9, T-10, T-11, T-15** schéma tenants/creds + ingest + export + briefs (3,25)
4. **T-14** taxonomy.ts **(prérequis dur, sinon multipliers plancher 1.0)** (1,0)
5. **T-5** AI provider/traced (1,0)
6. **T-7 + T-29** auth MCP Bearer + `structuredContent`/proto **(P0 bloquant)** (1,5)
7. **T-16, T-17, T-18** Inngest client + ingest-run + signaux/score **+ hookpoints (gap #455)** (4,5)
8. **T-21, T-22, T-23** contrat + csvSource + apolloSource (2,25)
9. **T-36** gate evaluateSend (1,0)
10. **T-28** get_outreach_brief A-G (1,5)
11. **T-32, T-33, T-35** export orchestrateur + Instantly flatten + job durable (4,0)
12. **T-37, T-40, T-42** tripwire handoff + e2e + seed hero (1,75)

**Total chemin critique ≈ 25,25 j-h** (la fondation complète + le slice cœur). Le **slice minimal
strictement démontrable** (sans T-6 auth humaine, sans hookpoints full, en réutilisant un sujet
pré-seedé) se comprime à **≈ 8,0 j-h** (cf. `signal-outreach-brief:199`), **à 3 conditions dures :**
(a) T-14 taxonomy.ts ; (b) T-18 hookpoints provenance/signal post-import (sinon CSV→brief sans
why-now) ; (c) T-29 `structuredContent`/`outputSchema` (P0).

**Différable (post-démo) :**
- **P1 (l'EDGE & l'interop large)** : T-20 velocity-snapshot, T-25 Tier 2 (SEC/BODACC/ATS/OSS/churn/crt.sh),
  T-26 Fiber-as-input, T-30 resources + `find_prospects`/`explain_priority`/`enroll`, T-34
  Fiber/OrangeSlice/webhook/generic, T-6 auth humaine complète. **≈ +11,5 j-h.**
- **P2** : SSE/élicitation MCP (`get_signals` deep, `notifications/progress`), backfill JSONB→table
  signaux normalisée. **≈ +4,0 j-h.**
- **P3** : warm-path (champion/investor k-hop). **≈ +4-6 j-h.**

**Dépendances bloquantes à cadencer AVANT d'annoncer le contrat de sortie :**
1. `lib/signals/taxonomy.ts` (T-14) — canonicalisation avant `get_signals.polarity`/multipliers.
2. Hookpoints provenance (`functions.ts:~220`) + signal (`agentic-executor.ts:~240`) (T-18).
3. Retour `tools/call` → `structuredContent` (T-29, `route.ts:953-957`).
4. Hero démo avec metric + provenance + signal frais, brief pré-construit la veille (T-42/T-15).

---

# RÉCAP EFFORT

| Lot | Tâches | j-h | MVP |
|---|---|---|---|
| 0 Setup/Install | T-1..T-5 | 2,75 | OUI |
| 1 Auth | T-6, T-7 | 2,0 | T-7 MVP / T-6 P1 |
| 2 Data/Schema/Migrations | T-8..T-15 | 5,25 | OUI |
| 3 Inngest | T-16..T-20 | 5,0 | T-16..19 MVP / T-20 P1 |
| 4 Adaptateurs entrée | T-21..T-27 | 7,75 | T-21/22/23/27 MVP / T-24..26 P1 |
| 5 Pipeline brief | T-28 | 1,5 | OUI |
| 6 MCP | T-29..T-31 | 2,0 | T-29/31 MVP / T-30 P1 |
| 7 Adaptateurs sortie | T-32..T-35 | 5,5 | T-32/33/35 MVP / T-34 P1 |
| 8 Gates | T-36, T-37 | 1,25 | OUI |
| 9 Intégration Elevay | T-38 | 0 | référence |
| 10 Tests | T-39, T-40 | 3,0 | OUI |
| 11 Demo-prep | T-41, T-42 | 1,0 | OUI |
| **Total** | **T-1..T-42** | **≈ 37,0 j-h** | |

> Le total brut (≈37 j-h) inclut **toute** la fondation + P1 + tests + demo. Le **MVP démontrable**
> (chemin critique sans P1/P2/P3) ≈ **25 j-h** fondation complète, compressible à **≈ 8 j-h** sur un
> sujet pré-seedé. **Le métier (scoring, grounding, gates, identité, précédence, waterfall, brief) est
> 100% REUSE — aucun rewrite.** Le NET-NEW se limite à : adaptateurs entrée/sortie, orchestrateur
> durable, exposition MCP (annotations/outputSchema/resources/structuredContent), `taxonomy.ts`,
> snapshots de vélocité, et 2 hookpoints déjà identifiés (#455).
