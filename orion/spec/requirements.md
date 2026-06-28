# Orion — requirements (backend foundation) · Kiro/EARS

> **Orion** = la couche **signal → interprétation → grounding AMONT** d'Elevay, packagée dans un
> **dépôt séparé** sur la stack Elevay vérifiée. Orion **ne rédige pas le mail** : il émet un
> **brief d'intelligence** (`citableFacts[]`/`doNotClaim[]`, why-now daté et sourcé) qu'un agent
> outbound tiers (Instantly / Fiber / Orange Slice / Lopus / webhook / 2e agent générique)
> consomme. Tout export passe d'abord par `evaluateSend` (oracle d'éligibilité).
>
> **Sources de vérité** (ne pas ré-inférer, valeurs exactes) :
> `_reports/orion-backend-verification-2026-06-27.md` (stack, versions, pièges),
> `_reports/orion-differentiation-2026-06-27.md` (entrées/sorties, partenaires),
> `_reports/signal-agent-mcp-2026-06-27.md` (surface MCP, ingestion),
> `_reports/signal-outreach-brief-2026-06-27.md` (contrat du brief, export).
>
> **Conventions de cette spec**
> - Toute couture Elevay réutilisée est citée `app/apps/web/src/...:line` (chemins réels du repo
>   `C:/Users/ombel/leads`). Le **repo root est un bac à sable — IGNORÉ** ; seul `app/` compte.
> - `REUSE` = copie/adaptation d'un module Elevay existant (file:line). `NET-NEW` = code neuf.
> - Effort en **j-h** (jour-homme) ; un total figure en §Récap.
> - `tenantId` vient **TOUJOURS** du Bearer, **jamais** d'un argument (règle dure, sans exception).

---

## 0. Glossaire & invariants structurels

| Terme | Définition |
|---|---|
| **Brief** | `IntelligenceBrief` Elevay (`lib/campaign-engine/types.ts:50-75`) mis en forme par `get_outreach_brief` ; zéro prose. |
| **Sink** | Destination outbound tierce (Instantly / Fiber / Orange Slice / Lopus / webhook / generic). |
| **Oracle d'éligibilité** | `evaluateSend` exécuté **dans** l'export ; répond « ce prospect peut-il être contacté légalement ? » sans envoyer. |
| **owner-role / app-role** | `DATABASE_URL_OWNER` (rôle `postgres`, migrations, hors code) vs app (rôle restreint `orion_app`). |
| **j-h** | jour-homme. |

**Invariants non négociables (testés par des tripwires) :**
1. `tenantId` ← Bearer `mcp_*` uniquement (REQ-6, REQ-19, REQ-21).
2. Aucun chemin d'export ne contourne `evaluateSend` (REQ-22).
3. Orion **n'envoie jamais** de cold via une infra cliente (Instantly et consorts sont **les outils du client**) — Orion produit le brief, le client envoie (REQ-20).
4. Clés partenaires **per-tenant en DB**, jamais en env (REQ-18, REQ-25).
5. `baseURL` Anthropic **inclut `/v1`** (REQ-23).

---

# GROUPE A — SETUP / REPO

## REQ-1 — Dépôt séparé répliquant la layout `app/` (pas le root sandbox)

**User story.** *En tant qu'*ingénieur fondateur, *je veux* un dépôt Orion neuf qui copie
exactement la structure `app/` d'Elevay (monorepo pnpm+Turbo) *afin de* réutiliser les coutures
sans hériter du bac à sable racine.

- **GIVEN** un repo Orion vide
  **WHEN** on initialise la structure
  **THEN** elle est `app/` (workspace root `name:"orion"`) avec `apps/web` (`@orion/web`),
  et **PAS** de `package.json` à la racine du repo (le root d'Elevay est un sandbox à ignorer,
  `orion-backend-verification:13-21`).
- **GIVEN** `app/pnpm-workspace.yaml`
  **WHEN** on déclare les workspaces
  **THEN** `packages: ["apps/*", "packages/*"]` — `packages/*` est aspirationnel ; le dossier
  n'existe pas, le code partagé vit dans `apps/web/src` exposé via l'alias tsconfig `@web/*`
  (`orion-backend-verification:18-21,502-504`).
- **GIVEN** `app/turbo.json`
  **WHEN** on définit les tâches
  **THEN** `dev` (`cache:false`, `persistent:true`), `build` (`dependsOn:["^build"]`,
  `outputs:[".next/**","dist/**"]`), `lint`/`test`/`tsc` déclarées vides
  (`orion-backend-verification:44-48`).

**Edge cases.** (a) Un `package.json` à la racine du repo → CI doit échouer (garde « no root
package.json »). (b) `packages/` absent → `pnpm install` ne doit pas échouer (glob tolérant).
(c) Apps `admin`/`worker` optionnelles : ne PAS les scaffolder tant qu'Orion n'en a pas besoin
(Orion = web + Inngest + MCP ; pas de daemon BullMQ au départ).

**Acceptation testable.** `pnpm -w install --frozen-lockfile` réussit depuis `app/` ; un test de
structure (vitest node) asserte : `app/pnpm-workspace.yaml` contient `apps/*`, `app/apps/web`
existe, `<repoRoot>/package.json` **absent**.

**Plug point.** NET-NEW (copie de `app/package.json`, `app/pnpm-workspace.yaml`, `app/turbo.json`,
`app/.npmrc`, `.nvmrc`). **Effort : 0,5 j-h.**

---

## REQ-2 — Versions épinglées à l'identique (table de pin)

**User story.** *En tant que* mainteneur, *je veux* épingler les versions exactes vérifiées *afin
d'*éviter toute divergence de comportement (drizzle dual-resolution, AI SDK v6, zod 4).

- **GIVEN** `app/apps/web/package.json`
  **WHEN** on déclare les deps
  **THEN** elles correspondent **exactement** au tableau ci-dessous
  (`orion-backend-verification:99-138`).

| Package | Version | Note |
|---|---|---|
| `pnpm` (packageManager) | `10.15.1` | aussi dans CI `pnpm/action-setup@v6` |
| Node | `22` (`.nvmrc`) | CI `setup-node@v5 node-version:22`, `@types/node ^22` |
| `turbo` (dev, root) | `^2.9.17` | |
| `next` | `^15.5.15` | App Router + Turbopack |
| `react` / `react-dom` | `^19.2.7` | |
| `typescript` (dev) | `^5.9.3` | `strict:true` |
| `tailwindcss` + `@tailwindcss/postcss` (dev) | `^4.3.0` | config-less (REQ-26) |
| `drizzle-orm` | `^0.45.2` | **+ override pnpm tree-wide** (REQ-3) |
| `drizzle-kit` (dev) | `^0.31.10` | |
| `drizzle-zod` | `^0.8.3` | |
| `next-auth` | `5.0.0-beta.30` | **pin exact du beta** |
| `@auth/drizzle-adapter` | `^1.11.2` | |
| `inngest` | `^4.5.1` | createFunction 2-arg (REQ-15) |
| `ai` (AI SDK) | `^6.0.199` | v6, **pas de Gateway** |
| `@ai-sdk/anthropic` | `^3.0.82` | |
| `@ai-sdk/openai` | `^3.0.69` | + réutilisé pour Mistral baseURL |
| `@ai-sdk/provider` / `@ai-sdk/react` | `^3.0.10` / `^3.0.201` | |
| `@anthropic-ai/sdk` | `^0.104.1` | SDK brut (coexiste avec AI SDK) |
| `openai` | `^6.42.0` | embeddings + fallback |
| `postgres` (postgres-js) | `^3.4.9` | **le driver réellement utilisé** |
| `@neondatabase/serverless` | `^1.1.0` | **PRÉSENT mais INUTILISÉ → à drop dans Orion** |
| `zod` | `^4.4.3` | **zod 4** |
| `vitest` + `@vitest/coverage-v8` (dev) | `^4.1.8` | |
| `@vitejs/plugin-react` / `happy-dom` / `@testing-library/react` (dev) | `^6.0.2` / `^20.10.2` / `^16.3.2` | |
| `@playwright/test` (dev) | `^1.60.0` | |

**Edge cases.** (a) `@neondatabase/serverless` : le retirer car le client DB utilise postgres-js
(`orion-backend-verification:118-119,444,530-531`) ; s'il casse la dual-resolution drizzle
(peer), garder le dep MAIS ne jamais l'importer. (b) zod 4 (pas 3) : API `.refine`/`z.enum`
diffèrent — viser zod 4. (c) AI SDK v6 + provider v3 : ne pas mélanger avec v5.

**Acceptation testable.** Test « versions-lock » : lit `package.json`, asserte chaque pin du
tableau (égalité de chaîne). `pnpm why drizzle-orm` ne montre qu'**une** version résolue (REQ-3).

**Plug point.** NET-NEW (copie de `apps/web/package.json` d'Elevay, deps filtrées par feature).
**Effort : 0,5 j-h.**

---

## REQ-3 — Override pnpm `drizzle-orm` + cast `db as any` (dual-resolution)

**User story.** *En tant que* dev, *je veux* forcer une seule version de `drizzle-orm` *afin que*
le DrizzleAdapter et le client DB ne se battent pas sur deux résolutions de types.

- **GIVEN** `app/package.json`
  **WHEN** on configure pnpm
  **THEN** `pnpm.overrides["drizzle-orm"] = "^0.45.2"` (force tree-wide,
  `orion-backend-verification:76-78,440,522-524`).
- **GIVEN** le DrizzleAdapter (REQ-7)
  **WHEN** on instancie `DrizzleAdapter(db, …)`
  **THEN** `db` est casté `as any` avec eslint-disable, car pnpm dual-résout drizzle-orm via le
  peer `@neondatabase` — types structurellement identiques (`orion-backend-verification:239-241`,
  Elevay `auth.ts:198`).

**Edge cases.** (a) Sans override : `tsc` casse sur incompatibilité de types
`PostgresJsDatabase`. (b) Junctioned node_modules dans un worktree PR → peut passer `tsc` local
mais échouer en CI sur install divergente (`orion-backend-verification:519-521`) ; toujours
vérifier sur un `--frozen-lockfile` propre.

**Acceptation testable.** `pnpm ls drizzle-orm --depth=Infinity` → une seule version ; `pnpm tsc`
vert avec le DrizzleAdapter câblé.

**Plug point.** REUSE pattern (`app/package.json:19-23` Elevay). **Effort : 0,25 j-h.**

---

## REQ-4 — CI gate (pnpm 10.15.1 + Node 22, filtre `@orion/web`)

**User story.** *En tant que* mainteneur, *je veux* un CI identique à Elevay *afin de* garantir
tsc+vitest+gitleaks verts avant merge.

- **GIVEN** `.github/workflows/ci.yml`
  **WHEN** la CI tourne
  **THEN** `pnpm/action-setup@v6 version:10.15.1`, `setup-node@v5 node-version:22`,
  `working-directory: app`, `NODE_OPTIONS=--max-old-space-size=6144`, exécute
  `pnpm --filter @orion/web tsc` + `pnpm --filter @orion/web test`, plus gitleaks
  (`orion-backend-verification:64-65,499-501,516-518`).

**Edge cases.** (a) CI ne typecheck **que** `@orion/web` — si Orion ajoute admin/worker, ajouter
des filtres (sinon drift non gatée, `orion-backend-verification:516-518`). (b) `.gitleaks.toml`
au root du repo pour allowlister les faux positifs de noms de types. (c) un secret partenaire en
clair dans un test → gitleaks bloque ; déplacer en fixture/env.

**Acceptation testable.** Un PR de démo passe la CI verte (tsc+vitest+gitleaks). Test local :
`act` ou exécution manuelle de `pnpm --filter @orion/web tsc && test`.

**Plug point.** REUSE (`.github/workflows/ci.yml` Elevay, adapter le nom de filtre).
**Effort : 0,25 j-h.**

---

# GROUPE B — AUTH

## REQ-5 — NextAuth v5 + DrizzleAdapter, session JWT 8h/1h, tenant résolu

**User story.** *En tant qu'*opérateur Orion, *je veux* l'auth Elevay (NextAuth v5 + DrizzleAdapter
+ JWT) *afin de* réutiliser la résolution de tenant éprouvée pour la console Orion.

- **GIVEN** `app/apps/web/src/auth.ts`
  **WHEN** on configure NextAuth
  **THEN** `DrizzleAdapter(db as any, { usersTable, accountsTable, sessionsTable,
  verificationTokensTable })` sur `src/db/schema/auth.ts`, `linkAccount` **wrappé** pour chiffrer
  les tokens OAuth au repos (`lib/crypto/oauth-token-crypto`, `orion-backend-verification:237-243`).
- **GIVEN** la session
  **WHEN** un user se connecte
  **THEN** `session.strategy:"jwt"`, `maxAge:8h`, `updateAge:1h` ; pages
  `signIn:"/sign-in"`, `error:"/sign-in"` (`orion-backend-verification:253-255`).
- **GIVEN** le callback `jwt` au premier sign-in
  **WHEN** `resolveUserTenant(authUserId, email)` s'exécute
  **THEN** il stamp `token.tenantId / appUserId / role` :
  user existant → réutilise tenant/role ; invite pending non expirée → join atomiquement dans
  `withTenantTx(invite.tenantId,…)` ; sinon si `!SELF_SERVE_SIGNUP_ENABLED && !hasBetaAccess()`
  → **throw** (invitation-only) ; sinon crée tenant+admin dans un `withTenantTx`
  (`orion-backend-verification:256-265`).
- **GIVEN** les providers
  **WHEN** les env sont posés
  **THEN** `Google` (si `GOOGLE_CLIENT_ID`), `MicrosoftEntraId` (si `MICROSOFT_CLIENT_ID`),
  `Credentials` (bcrypt + dummy-hash timing-safe + lockout par-email/par-IP + TOTP +
  deactivated-block) (`orion-backend-verification:244-252`).

**Edge cases.** (a) Tokens OAuth **JAMAIS** sur le JWT — uniquement server-side dans
`auth_account` (`orion-backend-verification:268-270`). (b) email inconnu → comparer un dummy hash
(anti-timing). (c) `users.clerkId` = nom de colonne legacy portant l'id NextAuth. (d) Orion peut
n'avoir que `Credentials` au départ (Google/MS env-gated, donc inactifs sans env).

**Acceptation testable.** Vitest : `resolveUserTenant` retourne le tenant existant pour un user
connu ; throw en invitation-only sans invite/beta ; e2e Playwright : login Credentials → session
porte `tenantId/role`.

**Plug point.** REUSE (`apps/web/src/auth.ts` 605 l + `lib/crypto/oauth-token-crypto` +
`src/db/schema/auth.ts`). **Effort : 1,5 j-h** (copie + renommage `elevay`→`orion`).

---

## REQ-6 — Auth MCP par Bearer `mcp_*` scopé tenant (clé per-tenant en DB)

**User story.** *En tant qu'*agent externe (Claude/Cursor/Instantly), *je veux* m'authentifier par
un Bearer `mcp_*` *afin que* mon `tenantId` soit dérivé du token, jamais d'un argument.

- **GIVEN** `POST /api/mcp`
  **WHEN** une requête arrive avec `Authorization: Bearer mcp_…`
  **THEN** `authenticateMcpRequest(req)` (Elevay `route.ts:~230`) résout
  `{tenantId, keyId, scopes}` en lisant `tenants.settings.mcpApiKeys` (`McpApiKeyEntry`,
  `lib/config/tenant-settings.ts:431`) ; un token absent/invalide → `401`, **aucun** dispatch.
- **GIVEN** un outil MCP quelconque
  **WHEN** son handler s'exécute
  **THEN** `tenantId` provient **exclusivement** de l'auth ; tout `tenantId` passé en argument est
  **ignoré** (et idéalement rejeté par le schéma zod qui ne l'expose pas)
  (`signal-agent-mcp:147`, `signal-outreach-brief:123`).

**Edge cases.** (a) Bearer valide mais scope insuffisant (ex. clé read-only tentant
`export_to_outbound`) → `403`. (b) Clé révoquée (présente mais `revokedAt` set) → `401`.
(c) Header absent → `401` (jamais un tenant par défaut). (d) clé hashée au repos (ne pas stocker
le secret en clair ; comparer un hash).

**Acceptation testable.** Vitest : requête sans Bearer → 401 ; Bearer valide → handler reçoit le
`tenantId` de la clé ; un `tenantId` injecté en argument n'altère pas le scope (test
d'isolation). Tripwire : grep du tree interdit `tenantId` comme champ d'`inputSchema`.

**Plug point.** REUSE (`api/mcp/route.ts:~230` `authenticateMcpRequest` + `tenant-settings.ts:431`).
**Effort : 0,5 j-h** (réutilisation directe).

---

# GROUPE C — DATA

## REQ-7 — Client DB postgres-js (PAS neon-http) + guard EU/GDPR

**User story.** *En tant que* dev, *je veux* le client DB drizzle-orm/postgres-js exact d'Elevay
*afin d'*avoir une connexion TCP fiable (et pas le driver Neon HTTP inutilisé).

- **GIVEN** `app/apps/web/src/db/index.ts`
  **WHEN** on instancie le client
  **THEN** `import { drizzle } from "drizzle-orm/postgres-js"` ; `import postgres from "postgres"` ;
  `const client = postgres(process.env.DATABASE_URL!)` ; `export const db = drizzle({ client,
  schema })` — **postgres-js**, pas neon-http, malgré `@neondatabase/serverless` présent
  (`orion-backend-verification:167-179`).
- **GIVEN** `GDPR_REGION=eu`
  **WHEN** le host de `DATABASE_URL` n'est pas EU/CH-allowlisté
  **THEN** `assertEuHost` **log** CRITICAL (prod) / WARNING (dev), **sans throw**
  (`orion-backend-verification:181-184`, `lib/region-config.ts`).

**Edge cases.** (a) `DATABASE_URL` absent → crash explicite au boot (acceptable). (b) Supabase via
**Supavisor transaction pooler (port 6543)** → **jamais** de `set_config(..., false)` session
(REQ-9). (c) prod = Supabase/Postgres (différenciation tranche : swap connection string, pas
Convex, `signal-brief-backend stub:6`).

**Acceptation testable.** Vitest : import de `db` OK ; un host non-EU sous `GDPR_REGION=eu` produit
un log CRITICAL en prod simulée (spy console), sans exception.

**Plug point.** REUSE (`apps/web/src/db/index.ts` + `lib/region-config.ts`).
**Effort : 0,5 j-h.**

---

## REQ-8 — Runner de migrations custom (`__orion_migrations`), `db:migrate` désactivé

**User story.** *En tant qu'*opérateur, *je veux* le runner idempotent custom *afin d'*appliquer
les SQL même si le journal drizzle-kit diverge.

- **GIVEN** `apps/web/package.json`
  **WHEN** on définit les scripts DB
  **THEN** `db:migrate` = `echo '[ERROR] drizzle-kit journal diverge. Use db:migrate:apply' &&
  exit 1` ; `db:migrate:apply` = `tsx scripts/apply-migrations.ts` ; `db:push`/`db:generate`/
  `db:studio` = drizzle-kit (`orion-backend-verification:85-88,206-207`).
- **GIVEN** `scripts/apply-migrations.ts`
  **WHEN** on l'exécute
  **THEN** `postgres(url, { max:1 })` → `CREATE TABLE IF NOT EXISTS __orion_migrations (filename
  PK, hash, applied_at)` → lit `drizzle/*.sql` triés lexicalement → pour chaque non-appliqué :
  `sql.begin(tx => { tx.unsafe(content); INSERT … (filename, sha256) })` (**une tx par fichier**) ;
  hash-mismatch sur déjà-appliqué → warn+skip (`orion-backend-verification:208-217`).

**Edge cases.** (a) Toute migration doit être **additive + `IF NOT EXISTS`** (re-run sûr,
`orion-backend-verification:213-217`). (b) Renommer la table de tracking en `__orion_migrations`
(pas `__elevay_migrations`, pas `__drizzle_migrations`). (c) localdev = `db:push` ; prod = appliquer
via `DATABASE_URL_OWNER` (REQ-9) — jamais auto-migrer prod depuis une branche non mergée.
(d) garder le journal drizzle synchronisé **dès le jour 0** est l'alternative propre, mais adopter
le runner custom est le choix tranché (`orion-backend-verification:508-512`).

**Acceptation testable.** Vitest (DB de test) : appliquer deux fois la même migration → 1 seule
ligne `__orion_migrations`, 0 erreur (idempotence). `db:migrate` retourne exit 1.

**Plug point.** REUSE (`apps/web/scripts/apply-migrations.ts`, renommer la table).
**Effort : 0,5 j-h.**

---

## REQ-9 — Split rôle owner/app + `withTenantTx` (RLS Supavisor-safe)

**User story.** *En tant que* RSSI, *je veux* deux rôles DB (owner pour migrations, app restreint)
+ binding tenant transaction-scoped *afin que* la multi-tenance soit sûre derrière le pooler.

- **GIVEN** la prod
  **WHEN** on applique des migrations privilégiées
  **THEN** elles tournent via `DATABASE_URL_OWNER` (rôle `postgres`, **0 hit dans le code**,
  shell opérateur uniquement) ; l'app tourne en rôle restreint `orion_app`
  (`orion-backend-verification:185-188,536-538`).
- **GIVEN** `apps/web/src/db/rls.ts`
  **WHEN** on borne le contexte tenant
  **THEN** `withTenantTx(tenantId, fn)` ouvre une **vraie transaction** et exécute
  `SELECT set_config('app.tenant_id', <id>, true)` (transaction-scoped, le `true`) avant `fn(tx)` ;
  **aucun** `set_config(..., false)` session-scoped nulle part — Supavisor mode TRANSACTION
  (6543) empoisonne les backends poolés sinon (`orion-backend-verification:189-197,525-527`).

**Edge cases.** (a) un `set_config(..., false)` ajouté par mégarde → tripwire test grep le tree et
échoue (`orion-backend-verification:197`). (b) postgres-js + Supavisor : pas de prepared
statements de session — Orion ne dépend pas du cache de prepared (mémoire). (c) si Orion n'active
pas RLS au jour 1, `withTenantTx` reste l'unique seam pour le faire plus tard sans rewrite.

**Acceptation testable.** Vitest tripwire : grep `set_config(.*,\s*false)` → 0 hit. Test
d'isolation : deux `withTenantTx` concurrents ne fuient pas `app.tenant_id`.

**Plug point.** REUSE (`apps/web/src/db/rls.ts`). **Effort : 0,5 j-h.**

---

# GROUPE D — SCHEMA (Drizzle)

> Schéma = barrel `schema.ts` ré-exportant `src/db/schema/*` ; `drizzle.config.ts` :
> `schema:["./src/db/schema.ts","./src/db/billing-schema.ts"]`, `out:"./drizzle"`,
> `dialect:"postgresql"`, `dbCredentials.url: process.env.DATABASE_URL`
> (`orion-backend-verification:149-165`). Toutes les tables Orion sont **additives**
> (`CREATE TABLE … IF NOT EXISTS`), appliquées via le runner (REQ-8).

## REQ-10 — `tenants` + `mcpApiKeys` (clés MCP per-tenant) + `integration_credentials`

**User story.** *En tant que* plateforme, *je veux* un porteur de tenant avec clés MCP et
credentials partenaires per-tenant *afin de* scoper l'auth et les sinks sans variables d'env.

- **GIVEN** `db/schema/core.ts`
  **WHEN** on définit `tenants`
  **THEN** colonnes minimales `{ id (pk), name, settings jsonb, createdAt, updatedAt }` ;
  `settings.mcpApiKeys: McpApiKeyEntry[]` (`{ keyId, hashedSecret, scopes[], createdAt,
  revokedAt? }`, REUSE `tenant-settings.ts:431`).
- **GIVEN** les credentials partenaires
  **WHEN** un tenant connecte Instantly/Fiber/Orange Slice/Lopus
  **THEN** table `integration_credentials` (NET-NEW) :

```ts
// db/schema/integrations.ts (NET-NEW)
export const integrationCredentials = pgTable("integration_credentials", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),          // 'instantly'|'fiber'|'orange_slice'|'lopus'|'webhook'
  encryptedApiKey: text("encrypted_api_key"),     // chiffré au repos (lib/crypto/*) — JAMAIS clair
  config: jsonb("config").$type<Record<string, unknown>>().default({}),
  // ex: { baseUrl, webhookUrl, webhookSecret, defaultCampaignId }
  status: text("status").notNull().default("active"), // 'active'|'revoked'|'error'
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantProviderUx: uniqueIndex("ic_tenant_provider_ux").on(t.tenantId, t.provider) }));
```

**Edge cases.** (a) `INSTANTLY_API_KEY` n'existe **pas** en env : Instantly se branche en credential
par-tenant (`orion-backend-verification:419-422`, `signal-outreach-brief:168`). (b) clé chiffrée au
repos (analogue `oauth-token-crypto`) — gitleaks doit ne jamais voir de clair. (c) un provider
unique par tenant (`uniqueIndex(tenantId, provider)`) ; reconnexion = upsert.

**Acceptation testable.** Vitest : upsert credential Instantly puis lecture → clé déchiffrée
correcte ; deux insert même `(tenant,provider)` → conflit géré (upsert). Tripwire : aucune valeur
de clé en clair en DB (le champ stocké ≠ la clé fournie).

**Plug point.** REUSE `McpApiKeyEntry` (`tenant-settings.ts:431`) + NET-NEW
`integration_credentials`. **Effort : 1,0 j-h.**

---

## REQ-11 — `signals` (taxonomie canonique) + sink `recordCompanySignal`

**User story.** *En tant que* moteur, *je veux* persister les signaux dérivés avec une **taxonomie
canonique** *afin que* les multipliers appris ne tombent pas au plancher 1.0 (bug vérifié mémoire
`signals-world-class`).

- **GIVEN** un signal acquis
  **WHEN** on l'enregistre
  **THEN** `recordCompanySignal` écrit dans `companies.properties.signals[]` (JSONB merge `||`,
  REUSE `lib/signals/record-signal.ts:86,94`), `SignalEntry { type, detectedAt, strength?,
  detail?, source?, evidence? }` (`record-signal.ts:38-45`).
- **GIVEN** la lecture pour scoring
  **WHEN** on cherche le multiplier
  **THEN** la clé `type` doit être **canonique** (`triggers.ts:27`, 9 types) — un alias-map
  normalise `funding_recent`→`funding`, etc., sinon `bestMultiplierForCompany` retourne `undefined`
  → plancher 1.0 (`signals-world-class`, `signal-agent-mcp:189`).

**Edge cases.** (a) ≥6 taxonomies disjointes existent en amont → un **alias-map** est un prérequis
dur (`taxonomy.ts`, `signal-agent-mcp:355`) avant d'annoncer le contrat `get_signals.polarity`.
(b) signal périmé (TTL) → exclu par `isSignalFresh` (`freshness.ts:98`, REQ-13). (c) sur un tenant
100%-CSV sans hookpoint signal → `signals[]` vide → `priorityScore` plancher, why-now absent
(gap #455, REQ-16/REQ-17).

**Acceptation testable.** Vitest : `recordCompanySignal` ajoute sans écraser (merge `||`) ; un
type non-canonique passé à l'alias-map ressort canonique ; un multiplier appris s'applique
(≠ 1.0) pour un type connu.

**Plug point.** REUSE (`record-signal.ts:86,94`, `triggers.ts:27`) + NET-NEW alias-map
`lib/signals/taxonomy.ts`. **Effort : 1,0 j-h** (dont alias-map).

---

## REQ-12 — Cache `intelligence_briefs` (TTL 14 j) + `buildIntelligenceBrief`

**User story.** *En tant que* surface MCP, *je veux* le cache de briefs Elevay *afin de* servir
`get_outreach_brief` sans recalculer l'intelligence à chaque appel.

- **GIVEN** un sujet (company/contact)
  **WHEN** on demande son brief
  **THEN** `buildIntelligenceBrief(...)` (REUSE `lib/campaign-engine/build-intelligence-brief.ts:26`)
  construit/lit `IntelligenceBrief` (`types.ts:50-75`), caché **14 jours** (`BRIEF_TTL_DAYS:24`),
  lu read-only via `readCachedBrief:190` (0-LLM) ; `forceRefresh` (`:30`) reconstruit.
- **GIVEN** la table de cache
  **WHEN** on persiste
  **THEN** `intelligence_briefs { id, tenantId, subjectType, subjectId, brief jsonb, researchedAt,
  expiresAt }` (REUSE schéma `intelligence`), `uniqueIndex(tenantId, subjectType, subjectId)`.

**Edge cases.** (a) `briefIsEmpty` (`:245`) → `briefCompleteness=0`, `confidence:"low"`. (b) brief
expiré → reconstruire (sauf `refresh:false` qui sert le périmé taggé). (c) le hero de démo doit
avoir ≥1 `publicContent.type:"metric"` + firmo/provenance non vides
(`firmographicsHaveSignal:198`) sinon le WOW meurt (`signal-outreach-brief:179`).

**Acceptation testable.** Vitest : 2e appel en <14 j ne déclenche pas de LLM (spy
`tracedGenerateText` non appelé) ; `forceRefresh:true` reconstruit ; brief vide →
`briefCompleteness:0`.

**Plug point.** REUSE (`build-intelligence-brief.ts:24,26,190,198,245` + `types.ts:50-75`).
**Effort : 0,5 j-h.**

---

## REQ-13 — `ingest_jobs` + `ingest_items` (dédup 3 niveaux)

**User story.** *En tant que* pipeline d'ingestion, *je veux* deux tables additives *afin de*
dédupliquer à 3 niveaux (job / item / sujet) et reprendre un job sans doublon.

- **GIVEN** `db/schema/ingest.ts` (NET-NEW)
  **WHEN** on définit les tables
  **THEN** :

```ts
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

  Dédup : **niveau 1** `(tenantId, fingerprint)` `onConflictDoUpdate` (re-soumettre le même CSV ne
  relance pas) ; **niveau 2** `(jobId, sourceRef)` `onConflictDoNothing` (retry Inngest rejoue une
  page sans double-insert, resume exact) ; **niveau 3** = `findAccountMatch`/`findContactMatch`
  merge sur identityKey/domain/email (REUSE, REQ-16) (`signal-agent-mcp:113-117,149-151`).

**Edge cases.** (a) aucune migration sur `companies`/`contacts`/`account_field_source` — tout
existe (`signal-agent-mcp:151`). (b) fingerprint identique mais options différentes → `DoUpdate`
des options, pas re-pull. (c) item en erreur → `outcome:'error'` + `error`, job continue
(fault-isolation).

**Acceptation testable.** Vitest (DB test) : re-soumettre le même fingerprint → 1 seul job ;
rejouer une page → 0 item dupliqué ; merge CSV(`name=ACME,FR`)+Apollo(`domain=acme.io`) → un seul
`companies.id`.

**Plug point.** NET-NEW (`db/schema/ingest.ts`). **Effort : 1,0 j-h** (avec helpers
`openIngestJob`/`getJob`).

---

## REQ-14 — `export_jobs` + `outbound_destinations` (traçabilité des handoffs)

**User story.** *En tant qu'*opérateur, *je veux* tracer chaque export vers un sink *afin d'*auditer
qui a été poussé où, et pourquoi un prospect a été skippé par le gate.

- **GIVEN** `db/schema/outbound.ts` (NET-NEW, additif)
  **WHEN** on lance un `export_to_outbound`
  **THEN** :

```ts
export const outboundDestinations = pgTable("outbound_destinations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  tenantId: text("tenant_id").notNull(),
  kind: text("kind").notNull(),                  // 'instantly'|'fiber'|'orange_slice'|'lopus'|'webhook'|'generic'
  label: text("label"),
  config: jsonb("config").$type<Record<string, unknown>>().default({}), // campaignId/listId/webhookUrl
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
  result: jsonb("result").$type<{
    exported: { prospectId: string; externalId?: string }[];
    skipped: { prospectId: string; code: string; reason: string }[];
  }>(),
  status: text("status").notNull().default("running"), // running|done|error
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**Edge cases.** (a) chaque `skipped` porte le `{code, reason}` du gate (`not_targeted`,
`opt_out`,…) — auditabilité GDPR. (b) `dryRun:true` n'écrit pas chez le tiers mais enregistre le
plan. (c) un export partiel (gate refuse certains) → `status:done` avec `exported<requested`.

**Acceptation testable.** Vitest : un export de 3 prospects dont 1 `unreviewed` → `export_jobs`
`requested:3, exported:2, skipped:1` avec `code:"not_targeted"`.

**Plug point.** NET-NEW (`db/schema/outbound.ts`). **Effort : 0,75 j-h.**

---

# GROUPE E — INNGEST (jobs de fond)

## REQ-15 — Client Inngest `id:"orion"` + serve route `maxDuration=300`, createFunction 2-arg

**User story.** *En tant que* dev, *je veux* le câblage Inngest exact d'Elevay *afin que* les jobs
durables s'enregistrent et tournent jusqu'à 300 s.

- **GIVEN** `apps/web/src/inngest/client.ts`
  **WHEN** on instancie
  **THEN** `export const inngest = new Inngest({ id: "orion" })` (3 lignes ;
  `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` lus au runtime,
  `orion-backend-verification:281-287`).
- **GIVEN** `apps/web/src/app/api/inngest/route.ts`
  **WHEN** on sert
  **THEN** `import { serve } from "inngest/next"` ; `export const maxDuration = 300` ;
  `export const { GET, POST, PUT } = serve({ client: inngest, functions:[…] })`
  (`orion-backend-verification:288-292`).
- **GIVEN** toute `createFunction`
  **WHEN** on la déclare
  **THEN** forme **2-arg** : `createFunction(config, handler)` ; **triggers DANS la config**
  (`triggers:[{cron:"…"}]` ou `[{event:"…"}]`), **`concurrency` = ARRAY** (ex
  `concurrency:[{ key:"event.data.jobId", limit:1 }]`) — jamais l'ancienne forme 3-arg
  (`orion-backend-verification:295-311,513-515`).

**Edge cases.** (a) si Orion déploie sur Vercel, des crons `vercel.json` peuvent coexister — éviter
le double-fire (`orion-backend-verification:312-315,534-535`) ; au jour 1 Orion n'a pas de cron
Vercel. (b) Inngest ne tourne **pas** sous `pnpm dev` local (pas de sync local — mémoire inbox) ;
tester les handlers en appel direct + e2e via dev server Inngest.

**Acceptation testable.** Vitest : `inngest.id === "orion"` ; le module route exporte
`GET/POST/PUT` + `maxDuration===300` ; un test de forme asserte que chaque `createFunction` a
`triggers` dans l'arg 0 et `concurrency` array.

**Plug point.** REUSE (`inngest/client.ts` + `app/api/inngest/route.ts` +
`signal-score-daily.ts:95-108` comme gabarit). **Effort : 0,5 j-h.**

---

## REQ-16 — `inngest/ingest-run` (résolution d'identité + composition par précédence)

**User story.** *En tant que* pipeline, *je veux* un orchestrateur durable qui résout l'identité et
compose les champs par précédence *afin que* CSV et providers convergent vers le même
`companies.id` sans code conditionnel.

- **GIVEN** `inngest/ingest-run.ts` (NET-NEW, clone structurel de `custom-signal-backfill.ts:29`)
  **WHEN** un job s'exécute
  **THEN** 5 stages durables : `open-job` → loop `pull/ledger/resolve/signals` par page →
  `score` → `close-job` ; `concurrency:[{ key:"event.data.jobId", limit:1 }]`
  (`signal-agent-mcp:109-119`).
- **GIVEN** la résolution
  **WHEN** un `IngestItem` arrive
  **THEN** `upsertAccount`/`upsertContact` (REUSE `db/canonical/upsert.ts:108/:223`) avec
  `accountMatchPlan` registry→domain→name (`identity.ts:67/:125`), `findAccountMatch` insert-ou-merge
  (`upsert.ts:60`).
- **GIVEN** la composition firmo
  **WHEN** plusieurs sources couvrent un champ
  **THEN** précédence `PROVIDER_RANK` (`precedence.ts:9` : manual 100 > sirene/zefix 80 >
  linkedin 55 > apollo 50 > csv 40 > inferred/llm 20), tie → `observedAt` récent, `pickWinner:53` ;
  tracé dans `account_field_source` (`signal-agent-mcp:124-137`).

**Edge cases.** (a) CSV(40) ne peut **jamais** écraser Sirene(80) (`signal-agent-mcp:137`).
(b) `vendorIds` = side-map, **jamais** dans l'identité (`upsert.ts` AC4,
`signal-agent-mcp:90`). (c) un signal n'entre **jamais** dans `field_source` (sink séparé). (d) le
provenance hookpoint `writeFieldSource` (`functions.ts:~220`) est NET-NEW (gap #455) ; sans lui,
firmo composée mais provenance partielle.

**Acceptation testable.** Vitest : merge CSV+Apollo+Sirene → un `companies.id`, `name`←CSV,
`domain`←Apollo, `industry`←Sirene (rank 80 gagne) ; re-run du job idempotent (REQ-13).

**Plug point.** NET-NEW sur REUSE (`custom-signal-backfill.ts:29`, `upsert.ts:108/:223/:60`,
`identity.ts:67/:125`, `precedence.ts:9/:53`). **Effort : 2,0 j-h.**

---

## REQ-17 — `inngest` build-brief + score (acquisition signaux + scoring ciblé)

**User story.** *En tant que* moteur, *je veux* acquérir les signaux et recalculer le priorityScore
des seuls sujets touchés *afin de* doter chaque prospect d'un why-now sans recompute global.

- **GIVEN** des `rawSignals` sur un `IngestItem`
  **WHEN** le stage signaux s'exécute
  **THEN** `recordCompanySignal` (REUSE `record-signal.ts:86`) écrit `properties.signals[]` ;
  hookpoint signal post-import = NET-NEW (`agentic-executor.ts:~240`, gap #455,
  `signal-agent-mcp:278-285`).
- **GIVEN** les sujets touchés
  **WHEN** le stage score s'exécute
  **THEN** `score-touched.ts` (NET-NEW) appelle `scoreCompanyBatch(tenantId, touchedIds, icps,
  customFields)` (`fit-recompute-core.ts:140`) + `bestMultiplierForCompany` →
  `computePriorityScore` (`priority-score.ts:70`, floors `:54-55`) — **pas** de recompute tenant
  entier (`signal-agent-mcp:119`).
- **GIVEN** un brief à construire
  **WHEN** un sujet a firmo + ≥1 signal frais
  **THEN** `buildIntelligenceBrief` (REQ-12) peut être déclenché (pré-construction la veille pour
  la démo, `signal-outreach-brief:179`).

**Edge cases.** (a) sans alias-map (REQ-11) → multiplier plancher 1.0 (bug vérifié). (b) tenant
100%-CSV sans hookpoint → why-now vide (`signal-agent-mcp:285`). (c) signal périmé exclu du score
(REQ-13/`freshness.ts:98`).

**Acceptation testable.** Vitest : `rawSignals:[{type:'hiring'}]` → `properties.signals[]` non
vide → `priorityScore > floor` ; un score ciblé ne touche que `touchedIds` (spy sur le batch).

**Plug point.** NET-NEW (`lib/ingest/score-touched.ts`) sur REUSE (`record-signal.ts:86`,
`fit-recompute-core.ts:140`, `priority-score.ts:70`). **Effort : 1,0 j-h.**

---

## REQ-18 — `inngest/export-to-outbound` (handoff durable vers les sinks)

**User story.** *En tant qu'*agent, *je veux* exporter en masse vers un sink via un job durable
*afin de* gérer 1000 prospects avec backoff 429 et gate par prospect.

- **GIVEN** `inngest/export-to-outbound.ts` (NET-NEW)
  **WHEN** un export est demandé
  **THEN** pour chaque prospect (tenant du Bearer) : `brief = get_outreach_brief` →
  `gate = evaluateSend({…, isCold:true, interactive:false})` (REQ-22) → si `send:false` SKIP +
  record `{code,reason}` (pas d'export) → si `send:true` `project = toInstantlyCustomVars(brief)` →
  POST sink ; bulk `≤1000`/appel, backoff exponentiel sur `429`
  (`signal-outreach-brief:147-160,168`).

**Edge cases.** (a) credential per-tenant lu dans `integration_credentials` (REQ-10), jamais env.
(b) `dryRun:true` → planifie sans POST tiers. (c) doublon dans le sink (`skip_if_in_workspace`)
→ compté `duplicates`. (d) sink injoignable → `export_jobs.status:error`, retries Inngest.

**Acceptation testable.** Vitest : 3 prospects (1 `unreviewed`) → 2 exportés, 1 skip
`not_targeted` ; un mock 429 déclenche le backoff ; clé absente → erreur explicite (pas de POST).

**Plug point.** NET-NEW sur REUSE (`evaluateSend:212`, `toInstantlyCustomVariables:19`).
**Effort : 1,5 j-h.**

---

# GROUPE F — INPUT (ingestion)

## REQ-19 — Contrat unifié `IngestItem`/`IngestSource` + outils MCP d'ingestion

**User story.** *En tant que* source de données, *je veux* produire des `IngestItem` par pages
*afin que* CSV et providers convergent vers le même pipeline aval.

- **GIVEN** `lib/ingest/types.ts` (NET-NEW)
  **WHEN** on définit le contrat
  **THEN** :

```ts
export interface IngestItem {
  kind: "company" | "person";
  identity: { domain?: string; name?: string; country?: string; siren?: string; siret?: string;
              uid?: string; email?: string; linkedinUrl?: string; firstName?: string;
              lastName?: string; companyRef?: string; };
  fields: Partial<Record<"industry"|"size"|"revenue"|"description"|"title"|"phone", string|null>>;
  vendorIds?: Record<string, string>;          // side-map, JAMAIS dans l'identité
  rawSignals?: Array<{ type: string; detectedAt: string; strength?: string; detail?: string }>;
  sourceRef: string;                            // 'row:42' | apollo id → dédup intra-job
  provider: string;                             // 'csv'|'apollo'|'sirene'|'fiber' → précédence
}
export interface IngestSource {
  name: string; kind: "file" | "provider"; subjectKind: "company" | "person";
  inputFingerprint(): string;                   // sha256(entrée) → dédup job-level
  pull(ctx: unknown, cursor?: string): Promise<{ items: IngestItem[]; nextCursor?: string; total?: number }>;
}
```

- **GIVEN** les outils MCP d'ingestion
  **WHEN** on les expose
  **THEN** `ingest_csv` (`{ csv_text(≤5MB), entity_type?, acquire_signals?, score? }`, annotation
  `{readOnly:false, destructive:false, idempotent:false, openWorld:true}`, retour `{job_id,
  status:"queued", estimated_records, poll:"get_ingest_job"}`), `ingest_from_provider`
  (`{provider: enum[apollo_people|apollo_orgs|waterfall_enrich|fiber], query, max_records(≤2000),
  …}`), `get_ingest_job` (`{job_id}` → progress) ; `tenantId` du Bearer
  (`signal-agent-mcp:139-147`).

**Edge cases.** (a) JSON-RPC synchrone sans SSE → async = **job-id + poll**, pas de push
(`signal-agent-mcp:142`). (b) CSV <50 lignes : mode `sync=true` rétro-compat (`signal-agent-mcp:121`).
(c) `csv_text` >5MB → rejet validé par zod.

**Acceptation testable.** Vitest : `ingest_csv` retourne un `job_id` ; `get_ingest_job` reflète la
progression ; un même `csv_text` re-soumis → même job (fingerprint, REQ-13).

**Plug point.** NET-NEW (`lib/ingest/types.ts`, `lib/ingest/mcp-handlers.ts`) + cases dans
`MCP_TOOLS:19` / `handleTool:293`. **Effort : 1,0 j-h** (contrat + 3 outils).

---

## REQ-20 — Sources Tier 0/1 (CSV, Apollo, waterfall firmo, registres FR/CH)

**User story.** *En tant que* tenant, *je veux* importer un CSV et brancher Apollo + registres
souverains *afin d'*alimenter le sujet de départ (table stakes + avantage EU).

- **GIVEN** `csvSource(text, hint)` (NET-NEW)
  **WHEN** on importe un CSV
  **THEN** réutilise `parseCSVLine`/`mapColumnsWithAI`/`applyMapping` extraits de
  `import/smart/route.ts:115/:141/:256` vers `lib/ingest/csv-parse.ts` ; mémoïse le mapping Haiku
  dans le cursor ; pagine par 200 (`signal-agent-mcp:105`).
- **GIVEN** `apolloPeopleSource`/`apolloOrgsSource` (NET-NEW)
  **WHEN** on requête Apollo
  **THEN** `pull()` appelle le MCP Apollo (`apollo_mixed_people_api_search` /
  `apollo_mixed_companies_search`) ; `num_current_job_openings` → `rawSignals:[{type:'hiring'}]`,
  **pas** un champ firmo (`signal-agent-mcp:106`).
- **GIVEN** `waterfallSource(seeds)` (NET-NEW)
  **WHEN** on gap-fill la firmo
  **THEN** wrappe `enrichCompany` (REUSE `waterfall.ts:148`, merge first-non-null `:77`,
  geo-routing TLD, `isSaturated:181`) ; provider par champ = `provenance[i].provider`.
- **GIVEN** les registres souverains
  **WHEN** un sujet est FR/CH
  **THEN** Sirene/recherche-entreprises FR (keyless, 7 req/s, rank 80) et Pappers/Zefix-LINDAS CH
  alimentent firmo officielle + état entreprise (`orion-differentiation:60-70`).

**Edge cases.** (a) `enrichment par défaut OFF`, **FullEnrich banni** (mémoire) — LinkedIn
Sales-Nav primaire ; les sources Tier 0/1 servent le brief, pas un enrichissement automatique.
(b) Apollo `hiring count` → signal dérivé, jamais firmo (`signal-agent-mcp:106`). (c) US-centric
vendors aveugles à la donnée FR → le registre souverain est l'edge EU.

**Acceptation testable.** Vitest : `csvSource` produit des `IngestItem` paginés (200) ;
`apolloOrgsSource` route `num_current_job_openings` vers `rawSignals`, pas `fields` ;
`waterfallSource` remplit firmo first-non-null avec provenance par champ.

**Plug point.** NET-NEW sur REUSE (`import/smart/route.ts:115/:141/:256`, `waterfall.ts:148/:77/:181`,
MCP Apollo). **Effort : 1,5 j-h** (CSV 0,5 + Apollo 0,5 + waterfall 0,5).

---

## REQ-21 — Sources Tier 2 (l'edge : SEC/BODACC/ATS/GitHub/velocité + Fiber-as-input)

**User story.** *En tant que* moteur de différenciation, *je veux* des sources hard-to-get
historisées *afin d'*émettre une dérivée (velocité, tech-churn, adoption) que les wrappers n'ont
pas.

- **GIVEN** des sources Tier 2 (NET-NEW, même interface `IngestSource`)
  **WHEN** on les branche
  **THEN** chacune produit des `rawSignals` interprétés (`orion-differentiation:72-86`) :
  - **SEC EDGAR Form D / 8-K** (efts.sec.gov + Atom, **User-Agent obligatoire**, parse XML,
    CIK→domaine) → `funding` pré-annonce (J+0 vs Crunchbase J+30).
  - **BODACC FR** (Opendatasoft + recherche-entreprises) → `job_change` dirigeant + financement FR.
  - **ATS publics JSON** (Greenhouse/Lever/Ashby, endpoints publics) → stack réel + **velocité
    d'embauche** par fonction (dérivée, slug ATS→domaine + NLP description).
  - **GitHub/npm/PyPI/deps.dev** → **dérivée d'adoption** (snapshot+diff historisé, « +40%/mois »).
  - **tech-churn** (diff snapshot) → fenêtre de migration (intent max).
  - **crt.sh + DNS** (JSON, diff quotidien) → lancement produit/infra (nouveau sous-domaine).
- **GIVEN** **Fiber AI comme INPUT** (data-API)
  **WHEN** un tenant connecte Fiber
  **THEN** `FiberSignalIngestor` (NET-NEW générique) normalise n'importe quel payload Tracker/webhook
  vers `IngestItem.rawSignals` + `recordCompanySignal` via l'alias-map (REQ-11) — aucune casse si
  la taxonomie Fiber diffère (`orion-differentiation:145,165`).

**Edge cases.** (a) **velocité** = la dérivée n'existe qu'avec des snapshots propres (table de
snapshot + diff) — un wrapper ne lit qu'un *count* (`orion-differentiation:76,101`). (b) exiger
**convergence 2+ sources** avant haute priorité (`orion-differentiation:86`). (c) SEC User-Agent
obligatoire, latence crt.sh, mapping repo→entreprise = contraintes opérationnelles à valider
(`orion-differentiation:168`). (d) Fiber : noms exacts des règles Tracker non vérifiés →
ingestor générique (mitigation, `orion-differentiation:165`).

**Acceptation testable.** Vitest (avec fixtures réseau enregistrées) : un payload Form D fixture →
`rawSignals:[{type:'funding'}]` daté + CIK→domaine ; deux snapshots ATS J et J+21 → dérivée
`+N roles/3sem` ; payload Fiber arbitraire → signal canonique via alias-map.

**Plug point.** NET-NEW (`lib/ingest/sources/{sec,bodacc,ats,oss,techchurn,crtsh,fiber}-source.ts`)
+ table snapshot NET-NEW pour la velocité. **Effort : 3,0 j-h** (priorité : ATS + SEC + BODACC
d'abord ; OSS/churn/crt.sh + Fiber en second).

---

# GROUPE G — OUTPUT (surface MCP + export)

## REQ-22 — `get_outreach_brief` (remplace `draft_outreach`, zéro prose)

**User story.** *En tant qu'*agent outbound tiers, *je veux* un brief structuré (faits citables,
why-now, angle, garde-fous) *afin de* rédiger un mail grounded sans inventer.

- **GIVEN** l'outil MCP `get_outreach_brief`
  **WHEN** on l'appelle
  **THEN** input `GetOutreachBriefInput = { subjectType: enum[contact,company].default("contact"),
  subjectId, channel: enum[email,linkedin].default("linkedin"), refresh:bool.default(false),
  gateCheck:bool.default(true) }`, annotation `{readOnlyHint:true, idempotentHint:true,
  openWorldHint:false}` ; sortie = le schéma sections A-G validé par `OutreachBrief` zod (autorité
  serveur, `lib/mcp/outreach-brief.ts` NET-NEW) (`signal-outreach-brief:93-103`).
- **GIVEN** la sortie
  **WHEN** on l'assemble
  **THEN** sections : A `identity` (firmo + `firmographicProvenance[]`), B `whyNow`
  (`topSignal{type,strength,detectedAt,source,fresh,ttlDays,evidence}`, `priorityScore`,
  `priorityFactors`), C `messaging` (`bestAngle`, `angleGuidance`, `painPoints[]`, `methodology`,
  `suggestedCta`, `timing{sendWindow,recipientTz,signalFreshUntilIso}` — **PAS de prose**),
  D `warmPath`, E **`citableFacts[]`/`doNotClaim[]`/`groundingNote`** (la valeur du pivot),
  F `persona`, G `meta{confidence, briefCompleteness, gate{exportable,verdict}}`
  (`signal-outreach-brief:13-88`).

- **GIVEN** `citableFacts[]`
  **WHEN** on le dérive
  **THEN** NET-NEW = `publicContent.filter(type==="metric")` (`types.ts:109`, cappés 6,
  `build-intelligence-brief.ts:227-234`) ∪ firmo+provenance (`:238-240`) → seule liste de
  chiffres autorisés à l'écriture.
- **GIVEN** `doNotClaim[]`
  **WHEN** on le dérive
  **THEN** NET-NEW = `GeneratedOpener.guardrails` (`signal-opener.ts:139` = `Methodology.whatNotToDo`)
  + tout champ firmo `null`/sans provenance → `"ne pas affirmer {field}"` + constantes
  (`"aucune métrique fabriquée"`, `"pas d'effectif non cité"`) (`signal-outreach-brief:62-72`).

**Edge cases.** (a) ce chemin **ne touche jamais** `generate-message`/`copy_asset_block` (le défaut
« copy vide » sort du périmètre, `signal-outreach-brief:11,203`). (b) brief vide →
`briefCompleteness:0`, `confidence:"low"`, mais structure valide. (c) `gateCheck:true` embarque le
verdict `evaluateSend` (REQ-22-gate). (d) `refresh:true` → `buildIntelligenceBrief forceRefresh`
(`:30`).

**Acceptation testable.** Vitest : un sujet avec metric → `citableFacts` non vide, `verified:true` ;
un champ firmo `null` → entrée `doNotClaim` correspondante ; sortie validée par le zod `OutreachBrief`
(structuredContent typé) ; 0 `subject`/`body` dans la sortie.

**Plug point.** NET-NEW (`lib/mcp/outreach-brief.ts`) sur REUSE (`build-intelligence-brief.ts:26,190`,
`types.ts:50-75,109`, `signal-opener.ts:139`, `outbound-methodologies.ts:159-208`).
**Effort : 1,5 j-h.**

---

## REQ-23 — `export_to_outbound` vers Instantly / Fiber / Orange Slice / Lopus / webhook / generic

**User story.** *En tant qu'*agent, *je veux* pousser des prospects gatés vers le sink du client
*afin que* son moteur outbound consomme notre intelligence — interop, pas concurrence.

- **GIVEN** l'outil MCP `export_to_outbound`
  **WHEN** on l'appelle
  **THEN** input `{ prospectIds: string[].min(1).max(1000), destination:
  enum[instantly,fiber,orange_slice,lopus,webhook,generic], campaignId?, listId?,
  skipIfInWorkspace:bool.default(true), webhookUrl?, dryRun:bool.default(false) }` avec
  `.refine(destination!=="instantly" || (!!campaignId !== !!listId))` (XOR), annotation
  `{readOnlyHint:false, destructiveHint:true, openWorldHint:true}` ; sortie `{destination,
  exported[]{prospectId,externalId}, skipped[]{prospectId,code,reason},
  counts{requested,exported,skipped,duplicates}}` (`signal-outreach-brief:105-117`).
- **GIVEN** `destination:"instantly"`
  **WHEN** on projette le brief
  **THEN** `toInstantlyCustomVariables` (REUSE `providers/instantly/send-adapter.ts:19`, **scalaires
  uniquement** — objets/arrays droppés) ; mapping plat `why_now`, `signal_type`,
  `signal_evidence_url`, `pain_point_1..3`, `citable_metric_1..3`, `do_not_claim` (joint `" | "`),
  `priority_score`, `grounded`, `brief_expires_at`… ; POST `https://api.instantly.ai/api/v2/leads`
  (single) / `/leads/list` (bulk ≤1000), header `Authorization: Bearer <clé V2>`, `campaign_id`
  XOR `list_id`, backoff `429` (`signal-outreach-brief:127-144,168`).
- **GIVEN** `destination:"generic"`
  **WHEN** un 2e agent consomme
  **THEN** il reçoit le **brief imbriqué complet** (pas de flatten) + `citableFacts[]`/`doNotClaim[]`
  en `structuredContent` ; peut interroger le verdict via `evaluate_send` (dry-run).
- **GIVEN** `destination:"webhook"`
  **WHEN** on pousse
  **THEN** POST **HMAC-signé** d'une enveloppe portant **à la fois** le map plat (moteurs de
  template) et le `brief` complet (agents IA) — handoff vendor-neutre (Smartlead/Lemlist/maison)
  (`signal-outreach-brief:166`).
- **GIVEN** Fiber / Orange Slice / Lopus
  **WHEN** on les cible
  **THEN** Orange Slice consomme le brief en **custom fields** via webhook entrant (mécanisme exact
  SUPPOSÉ, à valider) ; Lopus = input faible / output quasi nul (best-effort, API NON VÉRIFIÉE) ;
  Fiber = principalement INPUT (REQ-21), output = push d'audience surveillée optionnel
  (`orion-differentiation:144-148`).

**Edge cases.** (a) clés sinks **per-tenant** dans `integration_credentials` (REQ-10), jamais env.
(b) Instantly `custom_variables` = map scalaire plat → **jamais** le brief imbriqué
(`signal-outreach-brief:127`). (c) bulk ≤1000/appel ; `429` → backoff exponentiel.
(d) `skipIfInWorkspace` → compté `duplicates`. (e) `dryRun:true` → plan sans POST tiers.

**Acceptation testable.** Vitest : Instantly sans exactement un de campaignId/listId → refine
échoue ; un brief imbriqué → projection 100% scalaire (objets droppés) ; webhook → enveloppe signée
HMAC vérifiable ; generic → brief imbriqué complet en structuredContent.

**Plug point.** NET-NEW (`lib/mcp/export-to-outbound.ts`, `lib/outbound/instantly-map.ts`) sur REUSE
(`send-adapter.ts:19`). **Effort : 2,0 j-h** (orchestrateur 1,0 + flatten 0,5 + client/dedup/429
0,5 ; Fiber/OrangeSlice/Lopus adapters incrémentaux).

---

## REQ-24 — Protocole MCP : structuredContent + outputSchema + annotations + resources

**User story.** *En tant qu'*agent conforme, *je veux* des outils annotés avec `outputSchema` et
`structuredContent` *afin de* recevoir des objets typés, pas un blob texte à re-parser.

- **GIVEN** le retour `tools/call` (Elevay `route.ts:953-957` renvoie `{content:[{text:JSON…}]}`)
  **WHEN** on corrige
  **THEN** ajouter `structuredContent: result` **en plus** de `content` (rétro-compat) — gap **P0**
  bloquant pour le brief (`signal-outreach-brief:122`, `signal-agent-mcp:172-175`).
- **GIVEN** `MCP_TOOLS` (`route.ts:19`)
  **WHEN** on déclare les outils
  **THEN** chacun porte `annotations` (`readOnlyHint`/`destructiveHint`/`idempotentHint`/
  `openWorldHint`) + `outputSchema` ; défaut absent = `destructiveHint:true` (friction), donc les
  lectures pures **doivent** être annotées `readOnly` (`signal-agent-mcp:171-173`).
- **GIVEN** `initialize` (`route.ts:921`)
  **WHEN** on négocie
  **THEN** `protocolVersion:"2025-06-18"` + `capabilities:{tools, resources}` ; routeur méthodes
  +`resources/list|read|templates` (`signal-agent-mcp:226-231`).
- **GIVEN** les resources
  **WHEN** un agent lit un dossier
  **THEN** `crm://company/{id}/dossier` (firmo + signaux+evidence + angle + contacts + deals +
  warm-path) et `crm://policy/sending-rules` (lawful basis, fenêtre 08-18, cold policy, caps) —
  lus une fois, cacheables (`signal-agent-mcp:214-220`).

**Edge cases.** (a) annotations = **hints non-fiables** (spec MCP) : améliorent l'UX, ne remplacent
**jamais** les gates serveur (`signal-agent-mcp:176`). (b) SSE/élicitation = différable (P2) : tant
qu'absente, la confirmation des destructifs reste portée serveur-side
(`signal-agent-mcp:167,347`). (c) warm-path dans le dossier = différable (P3).

**Acceptation testable.** Vitest : `tools/call` retourne `structuredContent` validé par
`outputSchema` ; `initialize` annonce `2025-06-18` + capability `resources` ; `get_outreach_brief`
annoté `readOnlyHint:true`, `export_to_outbound` `destructiveHint:true`.

**Plug point.** NET-NEW (modif `route.ts:19/:293/:921/:953-957/:917/:926`) + REUSE
`handleGetCompany route.ts:475` pour le dossier. **Effort : 1,5 j-h** (P0 structuredContent 1,0 +
resources 0,5 ; SSE exclu).

---

# GROUPE H — GATES

## REQ-25 — `evaluateSend` comme oracle d'éligibilité dans tout export (8 gates fail-closed)

**User story.** *En tant que* RSSI, *je veux* que **chaque** export traverse `evaluateSend` *afin
qu'*un agent ne puisse jamais pousser un prospect interdit, même piloté en JSON-RPC.

- **GIVEN** `export_to_outbound` (REQ-23)
  **WHEN** on traite chaque prospect
  **THEN** `evaluateSend({tenantId(Bearer), toAddress, companyId, contactId, isCold:true,
  interactive:false})` (REUSE `lib/guardrails/sending-gate.ts:212`) s'exécute **dans** le wrapper —
  inatteignable depuis le JSON-RPC ; `send:false` → SKIP+record, `send:true` → export
  (`signal-outreach-brief:147-164`).
- **GIVEN** l'ordre des gates
  **WHEN** ils s'évaluent
  **THEN** opt-out `:216` → account ctx `:227` (null→unreviewed) → suppression DB `:240` →
  email-status `:258` → lawful-basis `:270` (block-by-default) → deliverability `:283` → SAFE_MODE
  targeting `:301` (unreviewed→deny) → identity/cold/cap `:324` ; `catch` final → `{send:false}`
  (`:339-345`) ; `settings:null` → `DEFAULTS` protecteurs (`signal-agent-mcp:264`).
- **GIVEN** un `evaluate_send` (dry-run MCP)
  **WHEN** un agent veut lire la règle avant d'agir
  **THEN** input `{toAddress, isCold?, sentTodayFromPrimary, companyId?, contactId?, interactive?}`
  (PAS de tenantId), sortie miroir de `SendingGateOutcome` `{send,reason}` ou `{send:false,code,
  reason}` (`signal-agent-mcp:200-202`).

**Edge cases.** (a) omettre `companyId` n'échappe **pas** au targeting (force unreviewed=deny,
`signal-agent-mcp:264`). (b) `interactive:false` maintient SAFE_MODE actif → un compte fraîchement
importé n'est **pas** exporté (`signal-outreach-brief:162`). (c) `interactive:true` n'esquive **que**
le gate 7. (d) un Bearer `viewer` ne peut **aucune** action outbound (`decide-action.ts:80`).
(e) lawful-basis non enregistré + flag on → gate 5 bloque.

**Acceptation testable.** Vitest : prospect opt-out → `{send:false, code:"opt_out"}` ; prospect
`unreviewed` + SAFE_MODE → `{send:false, code:"not_targeted"}` ; un `catch` simulé → `{send:false}`
(fail-closed) ; tripwire : aucun chemin d'export n'appelle un POST sink avant `evaluateSend`.

**Plug point.** REUSE (`sending-gate.ts:212-346`) + NET-NEW wrapper `lib/mcp/evaluate-send.ts`.
**Effort : 1,0 j-h.**

---

## REQ-26 — Élevay n'envoie jamais ses colds via une infra cliente (séparation handoff)

**User story.** *En tant que* fondateur, *je veux* qu'Orion **émette le brief** et n'envoie jamais
de cold via Instantly/Fiber *afin de* préserver le warmup et la position « couche amont ».

- **GIVEN** un export
  **WHEN** Orion pousse vers Instantly/sink
  **THEN** l'envoi est celui **du client** sur **ses** comptes ; Orion ne touche ni `sendViaMailbox`
  ni owner-SMTP sur ce chemin (`signal-outreach-brief:164`, mémoire `elevay-own-infra-sending`).
- **GIVEN** un éventuel envoi propre Orion (hors slice brief)
  **WHEN** Orion enverrait un cold lui-même
  **THEN** uniquement depuis une **infra Orion-owned** (owner-SMTP DNS-vérifié), **jamais** Instantly
  (conflit warmup, creds jamais cédées).

**Edge cases.** (a) `send_message` reste exposable mais **hors** du slice brief (climax =
`export_to_outbound`, économie ≈1,5 j-h, `signal-outreach-brief:196`). (b) si Orion ajoute un envoi
propre : owner-SMTP + fenêtre 08-18 + caps + cold-on-primary (REUSE patterns Elevay).

**Acceptation testable.** Tripwire grep : le chemin `export_to_outbound` n'importe ni
`sendViaMailbox` ni de transport SMTP ; un test asserte que `destination:"instantly"` n'appelle que
le client Instantly (mock), jamais un mailer interne.

**Plug point.** REUSE directive + NET-NEW tripwire. **Effort : 0,25 j-h.**

---

# GROUPE I — AI / COÛT

## REQ-27 — Provider AI lazy (`/v1` obligatoire) + routing + kill-switch + circuit-breaker

**User story.** *En tant que* dev, *je veux* le provider AI exact d'Elevay *afin de* router Claude
correctement avec fallback et kill-switch, sans Gateway.

- **GIVEN** `lib/ai/ai-provider.ts`
  **WHEN** on instancie
  **THEN** `createAnthropic({ baseURL, apiKey: ANTHROPIC_API_KEY })` en singleton lazy derrière un
  `Proxy` (env lu au call-time) ; `baseURL` via `resolveAnthropicBaseUrl()` : `ANTHROPIC_API_BASE`
  (allowlist EU `https://eu.anthropic.com/v1` / US `https://api.anthropic.com/v1`, garde SSRF) →
  `ANTHROPIC_REGION=eu` → défaut US — **le baseURL DOIT inclure `/v1`** (sinon 404/empty,
  `orion-backend-verification:324-330,528-529`).
- **GIVEN** le routing
  **WHEN** on choisit un modèle
  **THEN** `MODEL_MAP` : `chat`→`claude-sonnet-4-6`, `lightweight`→`claude-haiku-4-5-20251001`,
  `embedding`→`text-embedding-3-small` (OpenAI) ; `getModelForTask` honore `AI_DISABLED=1`
  (kill-switch, null), Mistral si `LLM_PROVIDER=mistral|auto`, sinon Anthropic si circuit fermé,
  sinon OpenAI fallback (`gpt-4o`/`gpt-4o-mini`) (`orion-backend-verification:334-345`).

**Edge cases.** (a) **pas de Vercel AI Gateway** — providers câblés en direct
(`orion-backend-verification:142,322`). (b) `@anthropic-ai/sdk` brut coexiste avec l'AI SDK (appels
hors AI SDK). (c) baseURL sans `/v1` = piège classique → assertion au boot.

**Acceptation testable.** Vitest : `resolveAnthropicBaseUrl` retourne une URL **finissant par
`/v1`** ; `AI_DISABLED=1` → `getModelForTask` retourne null ; circuit ouvert → fallback OpenAI.

**Plug point.** REUSE (`lib/ai/ai-provider.ts` 317 l). **Effort : 0,5 j-h.**

---

## REQ-28 — `traced-ai` : `enforceLlmBudget(tenantId)` + `recordTrace` (coût par tenant)

**User story.** *En tant que* plateforme, *je veux* que tout appel LLM passe par les wrappers tracés
*afin de* plafonner le coût par tenant et mesurer via `agent_traces.estimated_cost`.

- **GIVEN** `lib/ai/traced-ai.ts`
  **WHEN** on génère
  **THEN** `tracedGenerateText`/`tracedGenerateObject`/`tracedStreamText` (drop-in de l'AI SDK)
  appellent `enforceLlmBudget(_trace.tenantId)` **avant** dispatch (throw `BudgetExceededError`
  si dépassement), honorent `AI_DISABLED`, injectent le prompt versionné + few-shot, et sur finish
  `recordTrace(...)` (model id, tokens, latence, status) non-bloquant
  (`orion-backend-verification:347-360`).
- **GIVEN** la mesure de coût
  **WHEN** on calcule la dépense
  **THEN** lire `agent_traces.estimated_cost` (**pas** `llm_calls`, <5% de couverture — mémoire
  `anthropic-cost-audit`).

**Edge cases.** (a) `_trace` (agentId/tenantId/traceId) **strippé** avant de passer les params à
l'SDK. (b) `recordTrace` `.catch(...)` (échec de trace ne casse pas l'appel). (c) clé `maxTokens`
morte en ai@^6 → output non capé à risque (mémoire) : caper explicitement la sortie.

**Acceptation testable.** Vitest : un tenant au-dessus du cap → `BudgetExceededError` avant tout
appel réseau (spy) ; un appel réussi écrit une ligne `agent_traces` avec `estimated_cost`>0.

**Plug point.** REUSE (`lib/ai/traced-ai.ts` 314 l + `lib/billing/llm-budget` +
`lib/observability/observability`). **Effort : 0,5 j-h.**

---

# GROUPE J — CONFIG / ENV

## REQ-29 — Inventaire env (sous-ensemble pertinent des 140) + creds per-tenant

**User story.** *En tant qu'*opérateur, *je veux* la liste exacte des env Orion *afin de* déployer
sans variable manquante ni clé partenaire en env.

- **GIVEN** la config Orion
  **WHEN** on pose les env
  **THEN** sous-ensemble pertinent des 140 `process.env.*` d'Elevay
  (`orion-backend-verification:364-426`) :
  - **Core** : `NODE_ENV`, `NEXT_RUNTIME`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`,
    `ELEVAY_APP_SECRET`(→`ORION_APP_SECRET`).
  - **DB** : `DATABASE_URL` (seul en code) ; `DATABASE_URL_OWNER` **opérateur-only, hors code**.
  - **Auth** : `AUTH_SECRET`/`NEXTAUTH_SECRET`, `AUTH_URL`/`NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`,
    `MICROSOFT_CLIENT_ID/SECRET`, `BETA_SIGNUP_CODE`, `SELF_SERVE_SIGNUP_ENABLED`.
  - **LLM** : `ANTHROPIC_API_KEY`, `ANTHROPIC_API_BASE`, `ANTHROPIC_REGION`, `OPENAI_API_KEY`,
    `MISTRAL_API_KEY`, `LLM_PROVIDER`, `AI_DISABLED`.
  - **Inngest** : `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
  - **Sources Tier 0/1** : `APOLLO_API_KEY`, `PAPPERS_API_KEY`, `ZEFIX_API_USER/PASSWORD`
    (+ Sirene keyless). Tier 2 : pas de clé (SEC/BODACC/ATS/crt.sh keyless).
  - **GDPR/region** : `GDPR_REGION`, `NEXT_PUBLIC_GDPR_REGION`, `LAWFUL_BASIS_GATE`,
    `DSAR_ERASE_ENABLED`.
  - **Flags** : `TARGETING_GATE_ENABLED`, `RESEARCH_AGENT_ENABLED`, `GENERATE_BRIEF_TIMEOUT_MS`,
    (Orion-spécifiques à créer) `ORION_INGEST_ENABLED`, `ORION_EXPORT_ENABLED`.
  - **Observability** : `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY/HOST`.
- **GIVEN** les clés partenaires (Instantly/Fiber/Orange Slice/Lopus)
  **WHEN** un tenant les fournit
  **THEN** stockées **per-tenant en DB** (`integration_credentials`, REQ-10), **PAS** en env —
  exactement comme Instantly chez Elevay (pas d'`INSTANTLY_API_KEY` env,
  `orion-backend-verification:419-422`).

**Edge cases.** (a) `DATABASE_URL_OWNER` ne doit **jamais** apparaître dans `src` (grep=0 hit).
(b) env voice/Twilio/Stripe/Recall/BullMQ = **non pertinents** pour Orion (drop). (c) secrets en
`.env`, jamais commités (hook secret-scan).

**Acceptation testable.** Test « env-shape » : un démarrage avec `DATABASE_URL`+`AUTH_SECRET`+
`ANTHROPIC_API_KEY` boote ; grep `DATABASE_URL_OWNER` dans `src` → 0 ; aucun `*_API_KEY` partenaire
sink lu depuis `process.env`.

**Plug point.** NET-NEW (`.env.example` Orion) sur REUSE inventaire. **Effort : 0,5 j-h.**

---

## REQ-30 — Tailwind 4 config-less + tsconfig strict + alias `@web/*`

**User story.** *En tant que* dev, *je veux* la config front exacte (Tailwind 4 CSS-first, tsconfig
strict, alias) *afin que* le partage de code et le build se comportent comme Elevay.

- **GIVEN** Tailwind 4
  **WHEN** on configure le CSS
  **THEN** **aucun** `tailwind.config.*` ; `globals.css` = `@import "tailwindcss"; @plugin
  "@tailwindcss/typography"; @theme {…}` ; `postcss.config.mjs` = `@tailwindcss/postcss`
  (`orion-backend-verification:493-495,532-533`).
- **GIVEN** `apps/web/tsconfig.json`
  **WHEN** on configure TS
  **THEN** `strict:true`, `moduleResolution:"bundler"`, `paths:{ "@/*":["./src/*"] }`,
  `exclude:["node_modules","scripts"]`, `plugins:[{name:"next"}]` ; admin/worker (si présents)
  portent `paths:{ "@web/*":["../web/src/*"] }` (`orion-backend-verification:475-476,502-504`).
- **GIVEN** les exports de page Next
  **WHEN** on ajoute un export à `page.tsx`/`layout.tsx`
  **THEN** uniquement `default` + route-config ; un export nommé passe tsc+CI mais casse
  `next build` Vercel → utiliser des siblings `_`-préfixés (mémoire
  `nextjs-page-export-build-gap`).

**Edge cases.** (a) ne pas scaffolder un `tailwind.config.ts` v3-style. (b) `next.config.ts` = CSP
headers + wrap Sentry optionnel ; `.npmrc` 2 lignes `public-hoist-pattern` uniquement si Sentry/OTel
(`orion-backend-verification:50-60`).

**Acceptation testable.** `pnpm build` (next build) vert ; `pnpm tsc` vert ; test : pas de
`tailwind.config.*` présent ; un export nommé sur une page est détecté par un garde.

**Plug point.** REUSE (`tsconfig.json`, `globals.css`, `postcss.config.mjs`, `next.config.ts`).
**Effort : 0,5 j-h.**

---

# GROUPE K — INTÉGRATION ELEVAY (récap des coutures réutilisées)

## REQ-31 — Carte de branchement REUSE vs NET-NEW (preuve de plug-sans-rewrite)

**User story.** *En tant que* lead, *je veux* la table exhaustive des coutures Elevay réutilisées
*afin de* prouver qu'Orion est un adaptateur d'entrée + orchestrateur + exposition MCP, sans
rewrite du cœur métier.

| Couture (REUSE) | file:line Elevay | Utilisée par |
|---|---|---|
| MCP auth Bearer | `api/mcp/route.ts:~230` `authenticateMcpRequest` | REQ-6 |
| MCP dispatch / tools | `api/mcp/route.ts:19` (`MCP_TOOLS`), `:293` (`handleTool`), `:953-957` (retour) | REQ-19/22/23/24 |
| MCP initialize/resources | `route.ts:921`/`:926`/`:917`, `handleGetCompany :475` | REQ-24 |
| Clé MCP per-tenant | `lib/config/tenant-settings.ts:431` (`McpApiKeyEntry`) | REQ-6/10 |
| Gate d'envoi | `lib/guardrails/sending-gate.ts:212-346` (`evaluateSend`, catch `:339`) | REQ-22/25/26 |
| Anti-fabrication | `lib/guardrails/fabrication-gate.ts:173` (`judgeFabrication`) | REQ-22 (dérive `doNotClaim`) |
| Brief | `lib/campaign-engine/build-intelligence-brief.ts:26` (`:24` TTL, `:190` read, `:245` empty), `types.ts:50-75` | REQ-12/22 |
| Signaux | `lib/signals/record-signal.ts:86/:94` (`recordCompanySignal`), `:38-45` (`SignalEntry`), `:60` (`personFromSignals`) | REQ-11/17 |
| Taxonomie/triggers | `lib/sequences/triggers.ts:27` (9 types), `:143` (`pickSequenceForSignal`) | REQ-11 |
| Freshness | `lib/signals/freshness.ts:98` (`isSignalFresh`), `:88` (`ttlDaysFor`), `:31` (TTL) | REQ-13/22 |
| Identité/précédence | `db/canonical/upsert.ts:108/:223/:60`, `identity.ts:67/:125`, `precedence.ts:9/:53` | REQ-16 |
| Waterfall enrichissement | `lib/providers/company-enrichment/waterfall.ts:148/:77/:181`, `registry.ts`, `precedence.ts` | REQ-20 |
| Scoring | `lib/icp/fit-recompute-core.ts:140` (`scoreCompanyBatch`), `lib/scoring/priority-score.ts:70` (floors `:54-55`) | REQ-17 |
| Opener/méthodo | `lib/scoring/signal-opener.ts:139` (guardrails), `lib/scoring/outbound-methodologies.ts:159-208/:144` | REQ-22 |
| Import CSV | `app/api/import/smart/route.ts:115/:141/:256` | REQ-20 |
| Instantly adapter | `providers/instantly/send-adapter.ts:19` (`toInstantlyCustomVariables`, scalaires) | REQ-23 |
| Inngest gabarit | `inngest/signal-score-daily.ts:95-108` (2-arg, concurrency array), `custom-signal-backfill.ts:29` | REQ-15/16 |
| HITL approval | `inngest/signal-to-sequence.ts:42/:248/:283`, `lib/agent/decide-action.ts:80/:128-136`, `approval-mode.ts:149/:155` | REQ-25 |
| Provider AI | `lib/ai/ai-provider.ts` (baseURL `/v1`, MODEL_MAP, kill-switch) | REQ-27 |
| Traced AI | `lib/ai/traced-ai.ts` (`enforceLlmBudget`, `recordTrace`) | REQ-28 |
| DB client / RLS / runner | `db/index.ts`, `db/rls.ts`, `scripts/apply-migrations.ts` | REQ-7/8/9 |
| Auth | `auth.ts` (605 l), `lib/crypto/oauth-token-crypto`, `db/schema/auth.ts` | REQ-5 |

**NET-NEW (exhaustif) :** `lib/ingest/{types,csv-parse,mcp-handlers,score-touched}.ts`,
`lib/ingest/sources/{csv,apollo,waterfall,sec,bodacc,ats,oss,techchurn,crtsh,fiber}-source.ts`,
`lib/signals/taxonomy.ts` (alias-map), `inngest/{ingest-run,export-to-outbound}.ts`,
`lib/mcp/{outreach-brief,export-to-outbound,evaluate-send}.ts`, `lib/outbound/instantly-map.ts`,
tables `db/schema/{ingest,integrations,outbound}.ts`, hookpoints provenance
(`functions.ts:~220`) + signal post-import (`agentic-executor.ts:~240`).

**Acceptation testable.** Tripwire : aucun fichier sous `db/canonical/`, `lib/guardrails/`,
`lib/scoring/`, `lib/ai/`, `api/mcp/route.ts` n'est réécrit (diff = additif/wrappers seulement).

**Effort : 0 j-h** (table de référence).

---

## Récapitulatif effort & séquençage

| Slice | REQ inclus | j-h |
|---|---|---|
| **Fondation repo+DB+auth+AI** (bootable, multi-tenant, MCP authed) | REQ-1..9, 27, 28, 30 | **~6,75** |
| **Schéma** (tenants/creds/signals/briefs/ingest/export) | REQ-10..14 | **~4,25** |
| **Inngest + ingestion CSV minimale** | REQ-15, 16, 17, 19, 20 (CSV) | **~5,0** |
| **Brief + export gaté (le slice cœur, MVP démo)** | REQ-22, 23, 24, 25, 26 | **~6,25** |
| **Sources Tier 2 (l'edge)** | REQ-21 | **~3,0** |
| **Config/env** | REQ-29 | **~0,5** |
| **Total** | REQ-1..31 | **~25,75 j-h** |

**Slice minimal démontrable** (CSV → résolution → signal → `get_outreach_brief` → export gaté vers
Instantly, sans SSE/resources/Tier2/multi-provider) ≈ **8,0 j-h** (cf. `signal-outreach-brief:199`),
**prérequis durs** : (1) alias-map taxonomie (REQ-11, sinon multiplier plancher 1.0) ; (2)
hookpoints provenance/signal post-import (REQ-16/17, sinon CSV→brief sans why-now, gap #455) ; (3)
`structuredContent`/`outputSchema` (REQ-24, P0 bloquant pour le brief).

**Dépendances bloquantes (à cadencer avant d'annoncer le contrat de sortie) :**
1. `lib/signals/taxonomy.ts` (REQ-11) — canonicalisation avant `get_signals.polarity`/multipliers.
2. Hookpoints provenance (`functions.ts:~220`) + signal (`agentic-executor.ts:~240`) (REQ-16/17).
3. Correction retour `tools/call` → `structuredContent` (REQ-24, `route.ts:953-957`).
4. Hero de démo avec ≥1 `publicContent.type:"metric"` + firmo/provenance non vides
   (`firmographicsHaveSignal:198`), brief pré-construit la veille (REQ-12).
