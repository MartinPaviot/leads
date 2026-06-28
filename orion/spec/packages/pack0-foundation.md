# Orion — LOT 0 · Foundation — BRIEF DE LOT AUTO-SUFFISANT

> **Tu n'as que ce fichier + les docs pointés.** Exécute sans rien redériver. Ce lot **bloque
> tous les autres** (pack1..pack7). Branche : `feat/orion-pack0`.
>
> **Docs à garder ouverts** (lis seulement les sections citées) :
> - `orion/spec/00-ARCHITECTURE.md` — §1 (D1..D8), §3 (11 règles d'or), §5 (versions), §6 (amorçage).
> - `orion/spec/00-EXECUTION-GUIDE.md` — §0 (DB1..DB8), §3.1 (ownership), §3.2 (registres append-only), §4 (conventions/tripwires).
> - `orion/spec/00-PREREQUISITES.md` — §0 (décisions DB), §1 (env + tenant elevay + rôle `elevay_app`), §3 (13 pièges), GAP-1 (repo Orion séparé, DB partagée), GAP-4 (GRANT).
> - `orion/spec/design.md` — §1 (MONOREPO & INSTALL), §2.1/2.2/2.4/2.5 (drizzle.config / db client / runner / withTenantTx), §3 (AUTH), §4 (Inngest), §9 (AI).
> - `orion/spec/requirements.md` — REQ-5/6 (auth), REQ-7/8/9 (DB/RLS/migrations), REQ-27/28 (AI), REQ-29 (env/boot), REQ-30 (front).

---

## 0. RÉALITÉ DU REPO — LIS CECI EN PREMIER (décision founder tranchée)

`design.md`/`tasks.md` ont été écrits pour un **repo `orion/` séparé** — **c'est la cible retenue.**
**Décision founder (2026-06-28) :**

> **Orion est un repo SÉPARÉ** — sa propre app Next/pnpm, package **`@orion/web`** — **PAS** un
> sous-projet du monorepo Elevay. Dans le repo Orion les fichiers vivent sous `src/…`. La **DB reste
> partagée** : `DATABASE_URL` pointe la **DB Supabase `leads` partagée** ; le runtime est **scopé
> tenant `elevay`** via RLS (rôle `elevay_app` + `withTenantTx` `set_config(...,true)` LOCAL). Les
> **~6 modules Elevay + le sous-ensemble de schéma qu'ils utilisent sont COPIÉS (vendorés) dans le
> repo Orion**, **PAS importés via workspace**. Les `file:line` Elevay ci-dessous sont la **SOURCE À
> COPIER** (provenance), jamais un import workspace `@leadsens/web`.

**Conséquence directe — chaque "fichier pack0" est soit COPIÉ depuis l'infra Elevay
(`app/apps/web/src/…` = la source à copier ; dans Orion il vit sous `src/…`), soit NET-NEW propre à
Orion.**

> **Layout du repo Orion (miroir monorepo) :** Orion est un repo SÉPARÉ qui **reproduit en interne le
> monorepo Elevay** — `app/` = racine du monorepo (turbo + `pnpm-workspace` + `pnpm.overrides`),
> `app/apps/web/` = le package `@orion/web`, code sous `app/apps/web/src/`. Les commandes se lancent
> **depuis `app/`** (ex. `cd app && pnpm --filter @orion/web tsc`). Le raccourci **`src/…`** employé dans
> les tableaux de ce brief désigne donc **`app/apps/web/src/…`** ; un module copié garde son **chemin
> miroir exact** (`app/apps/web/src/lib/…`). (Orion n'est PAS un sous-projet du monorepo Elevay — il a
> son **propre** monorepo interne.)

Donc pack0 = **COPY d'infra Elevay** (DB client, RLS, runner migration, auth, AI tracé,
region-guard, route MCP, client Inngest) + **NET-NEW transverse** (registres append-only + helper
tenant elevay + scaffolding env) + un **wiring additif** dans les 3 fichiers copiés (route MCP, route
Inngest, barrel schéma). Toute copie est **VERIFY** : le `tsc`/`test` Orion prouve qu'elle compile et
tourne. Tableau de vérité (colonne « Source Elevay » = le `file:line` à COPIER) :

| Fichier (repo Orion, `src/…`) | Source Elevay à COPIER (`file:line`) | Action pack0 |
|---|---|---|
| `package.json` racine + web, versions épinglées | calque Elevay `app/package.json` + `apps/web/package.json` (pins §0) | **COPY** (`name` → `@orion/web`) + VERIFY (test de garde) |
| `tsconfig.json`, `postcss.config.mjs`, `next.config.ts`, `vitest.config.ts`, `turbo.json`, `.nvmrc` | calque Elevay | **COPY** + VERIFY |
| `tailwind.config.*` | **ABSENT chez Elevay** (config-less ✔) ; `@theme` dans `globals.css:18` (à copier) | **COPY `globals.css`** (tripwire : pas de tailwind.config) |
| `src/db/index.ts` (postgres-js + EU guard) | Elevay `src/db/index.ts:31-32` | **COPY** + VERIFY |
| `src/db/rls.ts` `withTenantTx` (`set_config(...,true)`) | Elevay `src/db/rls.ts:44-54` | **COPY** + VERIFY |
| `drizzle.config.ts` | Elevay `drizzle.config.ts` | **COPY** + VERIFY |
| `scripts/apply-migrations.ts` (runner custom) | Elevay `scripts/apply-migrations.ts` (table `__elevay_migrations`) | **COPY** — table reste `__elevay_migrations` (DB partagée, P3) |
| `src/auth.ts` NextAuth v5 + `db as any` adapter | Elevay `src/auth.ts:198-204`, `resolveUserTenant :80-196` | **COPY** + VERIFY |
| `src/middleware.ts` | Elevay `src/middleware.ts` | **COPY** |
| Bearer `mcp_*` `authenticateMcpRequest` | Elevay `api/mcp/route.ts:230` | **COPY** |
| `src/inngest/client.ts` | Elevay `src/inngest/client.ts` (à copier) | **COPY** + renommer `id:"orion"` (repo Orion séparé = app Inngest distincte, P5) |
| `src/app/api/inngest/route.ts` (+`maxDuration=300`) | Elevay `:101`,`:103-105` | **COPY** + **MODIF additive** (registre) |
| `src/app/api/mcp/route.ts` (`MCP_TOOLS:19`, `handleTool:293`, `tools/list:934`, `tools/call:938`) | Elevay `app/api/mcp/route.ts` | **COPY** + **MODIF additive** (registre, zones balisées) |
| `src/db/schema.ts` (barrel) | Elevay `src/db/schema.ts` | **COPY** + **MODIF additive** (zone append `<<< ORION:SCHEMA >>>`) |
| `src/lib/ai/ai-provider.ts` (baseURL `/v1`, MODEL_MAP) | Elevay `:43-46` (baseURL `/v1`), `:186` (`MODEL_MAP`) | **COPY** + VERIFY |
| `src/lib/ai/traced-ai.ts` (`enforceLlmBudget`) | Elevay `src/lib/ai/traced-ai.ts` | **COPY** |
| `src/lib/region-config.ts` (`assertEuHost`) | Elevay `src/lib/region-config.ts` | **COPY** |
| `src/__tests__/rls.test.ts` (tripwire `set_config(...,false)`) | Elevay `src/__tests__/rls.test.ts` | **COPY** + VERIFY |
| `src/lib/mcp/registry.ts` + `types.ts` | — | **NET-NEW** |
| `src/inngest/registry.ts` | — | **NET-NEW** |
| helper/constante tenant `elevay` | — | **NET-NEW** |
| scaffolding env Orion (`ORION_*`) | — | **NET-NEW** |

**Versions — épingle aux pins Elevay (copie le manifeste tel quel, ne PAS bump) :** `packageManager
pnpm@10.15.1`, `turbo ^2.9.17`, `pnpm.overrides.drizzle-orm ^0.45.2` (racine) ; web : `next ^15.5.15`,
`react ^19.2.7`, `typescript ^5.9.3`, `tailwindcss/@tailwindcss/postcss ^4.3.0`, `drizzle-orm ^0.45.2`,
`drizzle-kit ^0.31.10`, `next-auth 5.0.0-beta.30`, `@auth/drizzle-adapter ^1.11.2`, `inngest ^4.5.1`,
`ai ^6.0.199`, `@ai-sdk/anthropic ^3.0.82`, `@anthropic-ai/sdk ^0.104.1`, `postgres ^3.4.9`,
`zod ^4.4.3`, `vitest ^4.1.8`, `@playwright/test ^1.60.0`. `.nvmrc=22`. **`@neondatabase/serverless`
est DROP** (repo Orion séparé = driver `postgres-js` seul — voir P4). Deltas du manifeste copié =
`name` → `@orion/web` + retrait de `@neondatabase/serverless`.

---

## 1. OBJECTIF + PÉRIMÈTRE

**Objectif.** Établir la couche transverse Orion dans le **repo Orion séparé**, en **copiant l'infra
Elevay** nécessaire et en posant le NET-NEW, pour que pack1..pack7 puissent brancher sans collision :
(a) **copier puis prouver** par test que l'infra vendorée (DB postgres-js, `withTenantTx`, auth
humaine + Bearer `mcp_*`, AI tracé, runner migration, Tailwind4 config-less, versions) est en place et
conforme ; (b) **livrer le NET-NEW transverse** : helper+constante du tenant `elevay`, scaffolding env
Orion, **squelettes de registre append-only** MCP + Inngest + barrel schéma ; (c) **câbler en additif**
ces registres dans les 3 fichiers copiés (route MCP, route Inngest, barrel) **sans diverger** de leur
logique source.

**IN (possédé par pack0) :** voir §3. **OUT (possédé par d'autres lots — NE PAS TOUCHER) :**

- **pack1** : toutes les tables net-new (`integration_credentials`, `ingest_*`, `export_*`,
  `outbound_destinations`, `signal_snapshots`), `lib/signals/taxonomy.ts`, contrats
  `lib/ingest/types.ts` / `lib/outbound/types.ts` / `lib/mcp/contracts/outreach-brief.schema.ts`,
  wrappers de réexport `lib/guardrails/orion-send-gate.ts` & `lib/campaign-engine/brief.ts`, gate
  `evaluateSend` (T-36). **pack0 ne crée AUCUN fichier `db/schema/{tenants,integrations,ingest,outbound,snapshots}.ts`** (`tenants` est COPIÉ depuis Elevay, pas net-new ; les tables net-new sont à pack1).
- **pack2** : `inngest/ingest-run.ts`, `lib/ingest/*` (csv, score, mcp-handlers, sources), MODIF de `import/smart/route.ts`.
- **pack3** : `lib/mcp/outreach-brief.ts`, `evaluate-send.ts`, `brief-tools.ts`, T-29 (`structuredContent` dans la zone `<<< ORION:MCP-INIT >>>`).
- **pack4** : `lib/outbound/*`, `lib/mcp/export-to-outbound.ts`, `outbound-tools.ts`, `inngest/export-to-outbound.ts`.
- **pack5** : `lib/ingest/sources/{sirene,sec,bodacc,...}-source.ts`, `inngest/velocity-snapshot.ts`.
- **pack6** : `packages/ui/*`, `app/(orion)/*`, `components/orion/*`, l'extraction de `globals.css`.
- **pack7** : `__tests__/*` (suite cœur), `e2e/*`, `.env.example`, `scripts/seed-demo.ts`, l'édition **finale** des arrays de registres.

> **Note registre / repo Orion :** pack0 crée les registres avec une **zone balisée
> `<<< ORION:* >>>` vide** + des **commentaires montrant où chaque pack ajoute SA ligne**. Le câblage
> réel des handlers/fonctions de pack2..pack5 dans les arrays se fait **par eux** (append-only) ou en
> intégration **pack7**. pack0 ne référence aucun module inexistant (sinon `tsc` casse).

---

## 2. PRÉREQUIS

- **Lots à finir avant :** **AUCUN** — pack0 est la racine. Rien d'autre ne démarre tant que pack0
  n'est pas mergé (CI verte sur `pnpm install --frozen-lockfile` + `pnpm tsc`).
- **Cartes nécessaires de 00-PREREQUISITES :**
  - §1.1 — boot minimal = `DATABASE_URL` + `AUTH_SECRET` + `ANTHROPIC_API_KEY` (le `tsc`/`vitest` de
    pack0 n'en a pas besoin ; ils servent au runtime/démo). Flags net-new à **définir** ici :
    `ORION_INGEST_ENABLED`, `ORION_EXPORT_ENABLED` (G5).
  - §1.2 — tenant `elevay` : **vérification + création = pack7/opérateur** (DB7, GAP-2). pack0
    fournit seulement le **helper de résolution** `getElevayTenantId()` (lecture, pas création).
  - §1.3 — rôle runtime `elevay_app` (non-owner) ; binding tenant **uniquement** via `withTenantTx`.
  - §3 — les 13 pièges (P1..P13 repris en §7).
  - GAP-1 — **repo Orion séparé + DB partagée** **est la base de ce brief** (décision founder §0).

---

## 3. FICHIERS POSSÉDÉS PAR CE LOT

**Création + édition exclusives. Aucun chevauchement avec un autre lot.** Chemins relatifs au package
**`@orion/web`** (`app/apps/web/`) du repo Orion séparé (les fichiers vivent sous `app/apps/web/src/…`,
raccourci `src/…` ci-dessous ; les `file:line` Elevay sont la source à copier depuis le **même chemin
miroir** `app/apps/web/src/…`).

### 3.1 NET-NEW (création — propres à pack0)

| Fichier | Rôle |
|---|---|
| `src/lib/orion/tenant.ts` | **Constante + helper tenant `elevay`** : `getElevayTenantId()` (résout depuis env `ORION_TENANT_ID` sinon lookup `tenants WHERE name ILIKE 'elevay'`, mémoïsé) + `withElevayTx(fn)` = sucre sur `withTenantTx(elevayId, fn)`. |
| `src/lib/orion/env.ts` | **Scaffolding env Orion** : getters typés `orionIngestEnabled()`, `orionExportEnabled()` (flags `ORION_INGEST_ENABLED`/`ORION_EXPORT_ENABLED`, défaut OFF) + `assertOrionBootEnv()` (vérifie `DATABASE_URL`/`AUTH_SECRET`/`ANTHROPIC_API_KEY` présents). |
| `src/lib/mcp/types.ts` | **Contrat registre MCP** : `ToolDef`, `Handler`, `McpToolModule` (`{ tools: ToolDef[]; handlers: Record<string, Handler> }`). |
| `src/lib/mcp/registry.ts` | **Agrégateur append-only** `ORION_MCP_MODULES: McpToolModule[]` (zone `<<< ORION:MCP-MODULES >>>` vide) + helpers `orionToolDefs()` / `orionHandlerFor(name)`. |
| `src/inngest/registry.ts` | **Agrégateur append-only** `ORION_INNGEST_FUNCTIONS` (zone `<<< ORION:INNGEST-FNS >>>` vide). |
| `src/__tests__/orion-foundation.test.ts` | **Test de garde pack0** (versions, config-less, helper tenant, registres, tripwire RLS, env-shape de base, imports des modules COPIÉS résolvent). |

### 3.2 MODIF additive (fichiers COPIÉS depuis Elevay — diff additif/wrapper UNIQUEMENT, zones balisées)

| Fichier (copié, repo Orion) | Edit additif |
|---|---|
| `src/db/schema.ts` (barrel) | ajouter le bloc balisé `// <<< ORION:SCHEMA (append-only) >>>` / `// <<< /ORION:SCHEMA >>>` **vide** (pack1 y mettra ses `export * from "./schema/..."`). |
| `src/app/api/mcp/route.ts` | dans `tools/list` (`:934` source) concaténer `...orionToolDefs()` ; dans `tools/call` (`:938`/`:946` source), **fallback** : si `MCP_TOOLS` ne matche pas, tenter `orionHandlerFor(toolName)` ; zones `// <<< ORION:MCP-MODULES >>>` (import) + `// <<< ORION:MCP-INIT >>>` (T-29, laissée à pack3). **Ne pas diverger** de l'auth Bearer (`:230` source) ni de l'envelope JSON-RPC. |
| `src/app/api/inngest/route.ts` | dans le `functions:[...]` (`:105` source) ajouter `...ORION_INNGEST_FUNCTIONS` (spread), import depuis `@/inngest/registry`. **Ne pas toucher** `maxDuration=300` (`:101` source) ni la liste de fonctions copiée. |

### 3.3 COPY — les 6 modules Elevay copiés dans le repo Orion (SOURCE à copier ; ne pas diverger)

Ces 6 modules (+ leurs dépendances transitives + le sous-ensemble de schéma qu'ils utilisent) sont
**COPIÉS depuis Elevay** dans le repo Orion sous `src/…` ; **pack1** copie le schéma qu'ils exigent et
en expose les wrappers. pack0 ne fait que **prouver que les copies importent** (test §3.1). Les
`file:line` ci-dessous sont la **SOURCE À COPIER** (provenance), pas un import workspace :

| Module | Source Elevay à COPIER — `file:line` (vérifié 2026-06-28) |
|---|---|
| `evaluateSend` (oracle gate) | `src/lib/guardrails/sending-gate.ts:212` |
| `IntelligenceBrief` (type) | `src/lib/campaign-engine/types.ts:50` |
| `buildIntelligenceBrief` | `src/lib/campaign-engine/build-intelligence-brief.ts:26` |
| `recordCompanySignal` | `src/lib/signals/record-signal.ts:94` *(JSDoc commence `:86`, l'`export` est `:94`)* |
| `accountMatchPlan` / `upsertAccount` (identité) | `src/db/canonical/identity.ts:67` / `src/db/canonical/upsert.ts:108` |
| serveur MCP (transport + Bearer `mcp_*`) | `src/app/api/mcp/route.ts:230` (`authenticateMcpRequest`), `:293` (`handleTool`), `:19` (`MCP_TOOLS`) |
| `withTenantTx` (RLS) | `src/db/rls.ts:44-54` |

### 3.4 TOOLING (test / MCP / CI) — POSSÉDÉ par pack0

**pack0 POSSÈDE et CRÉE le harnais d'outillage** du **repo Orion séparé** (racine + app web). Le
**contenu intégral** (config + code, copiable tel quel) vit dans **`orion/spec/CONFIG-TOOLING.md`** —
ne pas le dupliquer ici, le pointer. Ces fichiers sont **copiés/calqués depuis Elevay** (config
épinglée) puis posés à leur place dans le repo Orion (cf. CONFIG-TOOLING §6). Aucun autre lot ne touche
ces fichiers (T-38 `reuse-untouched`).

| Fichier (racine repo Orion) | Type | Source / VERIFY | Contenu |
|---|---|---|---|
| `playwright.config.ts` (app web Orion) | **COPY** | calque Elevay `app/apps/web/playwright.config.ts:1-63` (deltas : `webServer` → `pnpm --filter @orion/web dev` + `globalSetup` + `storageState`). **VERIFY :** `pnpm --filter @orion/web e2e:install` puis `pnpm --filter @orion/web e2e` démarre l'app et charge l'auth-fixture. | CONFIG-TOOLING §1 |
| `package.json` (scripts `e2e`, `e2e:install`, `eval:run`) | **COPY** | calque Elevay `app/apps/web/package.json:13-15` ; `name` = `@orion/web`. **VERIFY :** scripts présents ; `eval:run` câblé (ou no-op explicite, ne casse pas la CI). | CONFIG-TOOLING §1, §5 |
| `e2e/global-setup.ts` (app web Orion) | **NET-NEW** | forge le cookie de session **JWE Auth.js** (`@auth/core@0.41.0` `encode`, salt = `authjs.session-token`, `AUTH_SECRET` octet-pour-octet → piège du `\n`) pour un user réel du tenant `elevay` (résolu via `DATABASE_URL_OWNER`, **SELECT only**) → storageState. **VERIFY :** sanity-fetch `GET /api/auth/session` avec le cookie forgé renvoie `user` non-nul avant la suite. | CONFIG-TOOLING §2 |
| `.auth/elevay-tenant.json` (app web Orion) | généré (gitignore) | produit par global-setup au runtime (cookie de session — **jamais commité**). **VERIFY :** présent dans `.gitignore`. | CONFIG-TOOLING §2 |
| `.mcp.json` (racine) | **NET-NEW config** | serveurs `playwright` (`@playwright/mcp@latest`, `--storage-state .auth/elevay-tenant.json`, `--allowed-origins localhost`) + `context7` (`@upstash/context7-mcp@latest`) ; wrapper `cmd /c npx` (Windows). **VERIFY :** un-seul-navigateur (pas de `--isolated` multi-agent) ; outils MCP **mutateurs** hors allowlist. | CONFIG-TOOLING §3 |
| `.claude/settings.local.json` (racine) | **NET-NEW config** | allowlist MCP **lecture seule** (snapshot/screenshot/navigate/console/network/wait/resize) + `enabledMcpjsonServers: ["playwright","context7"]` ; outils mutateurs (`browser_click/type/fill_form/evaluate/...`) **volontairement hors allowlist** (garde-fou DB partagée). **VERIFY :** 0 outil mutateur dans `allow`. | CONFIG-TOOLING §3 |
| `vitest.config.ts` (app web Orion) | **COPY adapté** | base Elevay `app/apps/web/vitest.config.ts:1-51` (loader `.env.local` filtré `ANTHROPIC_*`/`OPENAI_*`, alias `@`→`src`, coverage v8) ; **delta Orion** : `environment: "happy-dom"` + `setupFiles` (tests composants React 19, conforme CLAUDE.md Orion). **VERIFY :** `pnpm --filter @orion/web test` vert sous happy-dom. | CONFIG-TOOLING §4 |
| `vitest.setup.ts` (app web Orion) | **NET-NEW** | `@testing-library/jest-dom/vitest` + `cleanup()` en `afterEach` (démontage React entre tests). **VERIFY :** chargé par `setupFiles`. | CONFIG-TOOLING §4 |
| `.github/workflows/ci.yml` (racine repo Orion) | **COPY** | calque Elevay `.github/workflows/ci.yml:1-58`, filtre → **`@orion/web`** ; 2 jobs (`tsc + vitest`, `gitleaks`) ; pnpm `10.15.1`, Node `22`, `NODE_OPTIONS=--max-old-space-size=6144` ; E2E **hors** CI (QA hostile manuelle, un-seul-navigateur, DB partagée). **VERIFY :** CI verte sur PR. | CONFIG-TOOLING §5 |
| `.gitignore` (entrées `.auth/`, `.playwright-mcp/`, `playwright-report/`, `test-results/`) | **NET-NEW** | secrets de session + artefacts QA jamais commités. **VERIFY :** `git status` ne liste aucun de ces chemins. | CONFIG-TOOLING §2, §3 |

> **Repo Orion séparé :** `vitest.config.ts` / `playwright.config.ts` / `.github/workflows/ci.yml`
> sont **calqués depuis Elevay puis copiés** dans le repo Orion ; le CI gate filtre **`@orion/web`**
> (P12). Le framing `@orion/web` + chemins-racine de CONFIG-TOOLING **est la cible directe** (plus de
> phase « worktree partagé »). Le **net-new réel** (pas un calque) = `global-setup.ts` (auth-fixture
> JWE), `vitest.setup.ts`, `.mcp.json`, `.claude/settings.local.json`.

---

## 4. ÉTAPES ORDONNÉES

> Convention : exécute **depuis `app/`** (racine du monorepo interne du repo Orion séparé ; là où vivent
> `turbo.json` / `pnpm-workspace`). Branche `feat/orion-pack0`. Un commit
> logique par étape (trailer obligatoire, voir §6).

### Étape 0 — Démarrer la session (repo Orion séparé)
**Action.** Sur le **repo Orion** : `git fetch origin && git checkout main && git pull && git checkout
-b feat/orion-pack0` ; puis `pnpm install --frozen-lockfile`. Copier l'infra Elevay listée en §0/§3.3
(DB client, RLS, runner, auth, AI, region-guard, route MCP, client Inngest + le sous-ensemble de schéma
des modules copiés) depuis la source `app/apps/web/src/…` vers `src/…`.
**VERIFY.** `pnpm install --frozen-lockfile` réussit sans modifier le lockfile (`git status` propre) ;
`pnpm --filter @orion/web tsc` vert **une fois l'infra copiée** (baseline : la copie compile telle quelle).
**TEST.** (baseline, pas de nouveau test) — capter la sortie `tsc` verte comme preuve d'état initial.

### Étape 1 — Garde de versions + config-less (VERIFY le manifeste copié)
**Action.** Aucune édition de config. Écrire la 1re partie de `src/__tests__/orion-foundation.test.ts`
qui lit `../../../../package.json` (racine monorepo Orion, `app/package.json`) + `../../package.json` (`app/apps/web/package.json`) et **assert** les pins exacts
(§0), que `apps/web` `name === "@orion/web"`, que `pnpm.overrides["drizzle-orm"] === "^0.45.2"`, que
`@neondatabase/serverless` est **absent** (P4 : `postgres-js` seul), et qu'**aucun** `tailwind.config.*`
n'existe (P7), et que `globals.css` contient
`@import "tailwindcss"` + `@theme` (`:1`, `:18`).
**Signature clé.**
```ts
import root from "../../../../package.json";       // racine du monorepo Orion (app/package.json)
import web from "../../package.json";              // app/apps/web/package.json (name @orion/web)
expect(web.name).toBe("@orion/web");
expect(root.packageManager).toBe("pnpm@10.15.1");
expect(root.pnpm.overrides["drizzle-orm"]).toBe("^0.45.2");
expect(web.dependencies["next"]).toBe("^15.5.15");
expect(web.dependencies["@neondatabase/serverless"]).toBeUndefined(); // P4 : DROP neon (postgres-js seul)
// fs : pas de tailwind.config.*, globals.css a @theme
```
**VERIFY.** `pnpm --filter @orion/web test orion-foundation` → cette suite verte.
**TEST.** = le fichier lui-même (partie versions/config).

### Étape 2 — Helper + constante tenant `elevay` (NET-NEW)
**Action.** Créer `src/lib/orion/tenant.ts`.
**Signature clé.**
```ts
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { sql } from "drizzle-orm";
import { withTenantTx } from "@/db/rls";

let _cached: string | null = null;
/** Résout l'id du tenant `elevay` (scope unique, D2). env override sinon lookup par nom. Mémoïsé. */
export async function getElevayTenantId(): Promise<string> {
  if (_cached) return _cached;
  if (process.env.ORION_TENANT_ID) return (_cached = process.env.ORION_TENANT_ID);
  const rows = await db.select({ id: tenants.id }).from(tenants)
    .where(sql`lower(${tenants.name}) = 'elevay'`).limit(1);
  if (!rows[0]) throw new Error("[orion] tenant 'elevay' introuvable — créer via DATABASE_URL_OWNER (00-PREREQUISITES §1.2)");
  return (_cached = rows[0].id);
}
/** Sucre : toute lecture/écriture Orion passe par withTenantTx(elevayId, fn) (D2, set_config local). */
export async function withElevayTx<T>(fn: Parameters<typeof withTenantTx<T>>[1]): Promise<T> {
  return withTenantTx(await getElevayTenantId(), fn);
}
export function __resetElevayTenantCache() { _cached = null; } // tests
```
**VERIFY.** test : mock `db.select` → renvoie `{id:"...."}`, assert `getElevayTenantId()` retourne l'id +
2e appel = 0 requête (cache) ; `ORION_TENANT_ID` env court-circuite le lookup ; tenant absent → throw.
**TEST.** ajouter ces cas dans `orion-foundation.test.ts`.

### Étape 3 — Scaffolding env Orion (NET-NEW)
**Action.** Créer `src/lib/orion/env.ts`.
**Signature clé.**
```ts
const on = (v?: string) => v === "1" || v?.toLowerCase() === "on";
export const orionIngestEnabled = () => on(process.env.ORION_INGEST_ENABLED); // défaut OFF (G5)
export const orionExportEnabled = () => on(process.env.ORION_EXPORT_ENABLED);
export function assertOrionBootEnv(): void {
  for (const k of ["DATABASE_URL", "AUTH_SECRET", "ANTHROPIC_API_KEY"]) // REQ-29 boot minimal
    if (!process.env[k]) throw new Error(`[orion] env requise manquante: ${k}`);
}
```
**VERIFY.** test : flags OFF par défaut, `="on"`/`="1"` → true ; `assertOrionBootEnv` throw si une var
manque (set/unset via `vi.stubEnv`). **Invariant DB4 :** ce fichier ne lit **jamais**
`DATABASE_URL_OWNER` (le test §6 grep le tree pour 0 hit dans `src`).
**TEST.** dans `orion-foundation.test.ts`.

### Étape 4 — Squelettes de registre append-only MCP (NET-NEW)
**Action.** Créer `src/lib/mcp/types.ts` puis `src/lib/mcp/registry.ts`.
**Signature clé (`types.ts`).**
```ts
export interface ToolDef { name: string; description: string; inputSchema: unknown; outputSchema?: unknown; annotations?: Record<string, unknown>; }
export type Handler = (params: Record<string, unknown>, tenantId: string) => Promise<unknown>;
export interface McpToolModule { tools: ToolDef[]; handlers: Record<string, Handler>; }
```
**Signature clé (`registry.ts`).**
```ts
import type { McpToolModule, ToolDef, Handler } from "./types";
// <<< ORION:MCP-MODULES (append-only — une ligne d'import par pack) >>>
// import { ingestTools }   from "@/lib/ingest/mcp-handlers"; // pack2
// import { briefTools }    from "@/lib/mcp/brief-tools";     // pack3
// import { outboundTools } from "@/lib/mcp/outbound-tools";  // pack4
// <<< /ORION:MCP-MODULES >>>
export const ORION_MCP_MODULES: McpToolModule[] = [
  // ingestTools, briefTools, outboundTools,  // append-only (pack2/3/4 ou pack7)
];
export const orionToolDefs = (): ToolDef[] => ORION_MCP_MODULES.flatMap(m => m.tools);
export function orionHandlerFor(name: string): Handler | undefined {
  for (const m of ORION_MCP_MODULES) if (m.handlers[name]) return m.handlers[name];
  return undefined;
}
```
**VERIFY.** test : `orionToolDefs()` → `[]`, `orionHandlerFor("x")` → `undefined` (vide mais typé/importable).
**TEST.** dans `orion-foundation.test.ts`.

### Étape 5 — Squelette registre Inngest (NET-NEW)
**Action.** Créer `src/inngest/registry.ts`.
**Signature clé.**
```ts
// <<< ORION:INNGEST-FNS (append-only — une ligne d'import par pack) >>>
// import { ingestRun, signalScoreDaily } from "./ingest-run";       // pack2
// import { exportToOutbound }            from "./export-to-outbound";// pack4
// import { velocitySnapshot }            from "./velocity-snapshot"; // pack5
// <<< /ORION:INNGEST-FNS >>>
export const ORION_INNGEST_FUNCTIONS = [
  // ingestRun, signalScoreDaily, exportToOutbound, velocitySnapshot, // append-only
] as const;
```
> **P5 :** utilise le client `inngest` **copié depuis** Elevay (`src/inngest/client.ts`) et **renomme
> `id:"orion"`** (repo Orion séparé = app Inngest distincte). Le registre Orion = spread additif dans
> la route copiée.
**VERIFY.** `pnpm --filter @orion/web tsc` vert (array vide typé).
**TEST.** assert `ORION_INNGEST_FUNCTIONS.length === 0` (placeholder) dans la suite pack0.

### Étape 6 — Wiring additif : barrel schéma
**Action.** Dans `src/db/schema.ts`, ajouter le bloc balisé **vide** (pack1 le remplit) :
```ts
// <<< ORION:SCHEMA (append-only — pack1 ajoute ses tables net-new) >>>
// export * from "./schema/integrations"; // pack1
// export * from "./schema/ingest";       // pack1
// export * from "./schema/outbound";     // pack1
// export * from "./schema/snapshots";    // pack1
// <<< /ORION:SCHEMA >>>
```
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `git diff src/db/schema.ts` = uniquement le bloc commenté.
**TEST.** (couvert par tsc + le diff scopé) ; option : un test asserte la présence des marqueurs `<<< ORION:SCHEMA`.

### Étape 7 — Wiring additif : route Inngest
**Action.** Dans `src/app/api/inngest/route.ts` : `import { ORION_INNGEST_FUNCTIONS } from "@/inngest/registry";`
puis dans `serve({ ..., functions: [ ...elevay, ...ORION_INNGEST_FUNCTIONS ] })`.
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `maxDuration=300` (`:101` source) inchangé ; la liste
de fonctions copiée intacte (`git diff` = +1 import, +1 spread). Lancer `pnpm --filter @orion/web build`
(ou `next build`) localement pour confirmer que la route compile.
**TEST.** assert (import du module route ou inspection statique) que le spread est présent ; sinon
couvert par `build`.

### Étape 8 — Wiring additif : route MCP (zones balisées, sans réécriture)
**Action.** Dans `src/app/api/mcp/route.ts` :
1. ajouter `// <<< ORION:MCP-MODULES >>>` + `import { orionToolDefs, orionHandlerFor } from "@/lib/mcp/registry";` + `// <<< /ORION:MCP-MODULES >>>` près des imports.
2. `tools/list` (`:933-934`) : `return jsonRpcSuccess(id, { tools: [...MCP_TOOLS, ...orionToolDefs()] });`
3. `tools/call` (`:938-957`) : après l'échec de `MCP_TOOLS.find` (`:946`), **fallback additif** :
```ts
const orionHandler = orionHandlerFor(toolName);
if (orionHandler) {
  const result = await orionHandler(toolArgs, tenantId); // tenantId = Bearer (jamais argument)
  return jsonRpcSuccess(id, { content: [{ type: "text", text: JSON.stringify(result) }] /* structuredContent: T-29 pack3 */ });
}
```
4. laisser une zone vide `// <<< ORION:MCP-INIT >>>` dans `initialize` (`:919-921`) pour le bump
   `2024-11-05`→`2025-06-18` + `structuredContent` (**T-29, possédé par pack3** — pack0 ne change PAS la version ici).
> **Invariant #1/#4 :** `tenantId` vient **toujours** de `authenticateMcpRequest` (Bearer), **jamais**
> d'un argument d'outil. Ne pas l'exposer dans un `inputSchema`.
**VERIFY.** `tsc` vert ; `next build` local OK ; un appel `tools/list` (curl ou test) renvoie
`MCP_TOOLS` Elevay + (pour l'instant) 0 outil Orion sans erreur. `git diff` = additif uniquement
(auth/envelope inchangés).
**TEST.** test d'intégration léger : mock `authenticateMcpRequest`, POST `{method:"tools/list"}` →
contient les outils Elevay ; POST `tools/call` d'un nom inconnu → erreur propre (pas de crash).

### Étape 9 — Tripwires & garde finale
**Action.** Compléter `src/__tests__/orion-foundation.test.ts` avec :
- **RLS tripwire (P2/P6) :** réutiliser/relancer la logique de `src/__tests__/rls.test.ts` (existe) —
  grep `src/` : **0** occurrence de `set_config(`...`, false)`. Si `rls.test.ts` couvre déjà tout
  l'arbre, juste **VERIFY** qu'il passe ; sinon ajouter l'assert au test pack0.
- **owner-only (DB4) :** grep `src/` → **0** hit de `DATABASE_URL_OWNER`.
- **imports des modules copiés :** `await import()` des 6 modules §3.3 → ne throw pas (les copies résolvent).
**VERIFY.** `pnpm --filter @orion/web test` (toute la suite web, dont `rls.test.ts`) verte ;
`pnpm --filter @orion/web tsc` vert ; `git diff --stat` scopé aux fichiers §3.
**TEST.** = le fichier complet `orion-foundation.test.ts`.

---

## 5. CRITÈRES D'ACCEPTATION (testables)

1. `pnpm install --frozen-lockfile` n'altère pas le lockfile (`git status` propre après install).
2. `pnpm --filter @orion/web tsc` **vert** ; `pnpm --filter @orion/web test` **vert** (toute la suite, `rls.test.ts` inclus).
3. `pnpm --filter @orion/web build` (ou `next build`) **réussit** — prouve que les MODIF additives des routes MCP/Inngest compilent (P11 : pas d'export nommé sur page/layout — non concerné ici).
4. `orion-foundation.test.ts` assert : versions aux pins (§0), `name === "@orion/web"`, `pnpm.overrides.drizzle-orm` présent, `@neondatabase/serverless` **absent** (P4 : `postgres-js` seul), **aucun** `tailwind.config.*`, `globals.css` a `@theme`.
5. `getElevayTenantId()` : env override > lookup par nom ; mémoïsé (2e appel = 0 requête) ; throw si tenant absent.
6. `orionIngestEnabled()`/`orionExportEnabled()` = false par défaut, true sur `on`/`1` ; `assertOrionBootEnv()` throw si `DATABASE_URL`/`AUTH_SECRET`/`ANTHROPIC_API_KEY` manque.
7. Registres : `orionToolDefs()===[]`, `orionHandlerFor(x)===undefined`, `ORION_INNGEST_FUNCTIONS.length===0` — vides mais typés et importables.
8. Tripwires : grep `src/` → **0** `set_config(..., false)` **et 0** `DATABASE_URL_OWNER`.
9. Les 6 modules copiés (§3.3) s'importent sans throw.
10. `git diff` sur les 3 fichiers copiés (route MCP, route Inngest, barrel) = **additif/balisé uniquement** (auth Bearer, envelope JSON-RPC, `maxDuration`, liste de fonctions copiée, exports existants **intacts**).
11. **Aucun** fichier hors §3 modifié (`git diff --stat` scopé).

---

## 6. DEFINITION OF DONE

- Toutes les étapes §4 faites : code → test → **VERIFY exécuté soi-même** (log/sortie capturé) → commit unique par étape.
- Les 11 critères §5 satisfaits ; tripwires verts.
- `git diff --stat` strictement scopé aux fichiers §3 (3.1 créés + 3.2 additifs).
- Re-vérifier branche+HEAD **juste avant** chaque commit (repo Orion, sessions parallèles) :
  `git rev-parse --abbrev-ref HEAD` == `feat/orion-pack0`. Pathspecs scopés — **jamais** `git add -A`.
- Trailer de commit obligatoire :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: <URL de ta propre session Claude Code>
  ```
- PR `feat/orion-pack0` → attendre **full CI** (gitleaks + tsc/vitest + Vercel) verte → `/evaluate`
  hostile PASS → squash-merge + delete-branch → surveiller le push CI de `main`.
- **pack0 mergé débloque pack1**, qui débloque le fan-out pack2..pack6.

---

## 7. PIÈGES SPÉCIFIQUES À CE LOT (00-PREREQUISITES §3 + repo Orion séparé)

- **P0 — COPIER fidèlement, ne PAS réinventer.** Les "fichiers pack0" du design.md sont l'infra Elevay
  à **copier** (§0) vers `src/…` du repo Orion. Copier `db/index.ts`/`rls.ts`/`auth.ts` + le
  sous-ensemble de schéma (dont `tenants`) depuis la source — ne pas réécrire de zéro (drift + bugs).
- **P1 — `inngest.createFunction` est 2-arg** (config+handler ; triggers DANS la config ; `concurrency`
  = array). pack0 ne définit aucune fonction, mais le registre les **agrège** — ne pas introduire de forme 3-arg.
- **P2/P6 — `set_config(..., true)` UNIQUEMENT** (transaction-local). **JAMAIS** `..., false`
  (Supavisor 6543 empoisonne le pool ; incident 2026-06-10). Le tripwire grep doit rester vert ;
  `withElevayTx` délègue à `withTenantTx` qui fait déjà `true`.
- **P3 — Table de migration : `__elevay_migrations`, PAS `__orion_migrations`.** La **DB est partagée**
  → le ledger reste `__elevay_migrations` (numérotation continue à partir de 0107 ; 0106 = dernière existante). Copier le **runner**
  `scripts/apply-migrations.ts` tel quel ; les migrations additives Orion (pack1/pack7) passent par lui.
  `db:migrate` reste à `exit 1` (déjà le cas dans la copie). pack0 ne crée **aucune** migration.
- **P4 — DROP `@neondatabase/serverless`** : repo Orion séparé = driver **`postgres-js` seul** (design.md,
  CLAUDE.md). L'adapter auth copié pointe le client `postgres-js` (`db as any`, `auth.ts:198` source) ;
  **ne pas réintroduire** neon dans le manifeste copié.
- **P5 — Client Inngest `id:"orion"`** (repo Orion séparé = app Inngest distincte) — renommer depuis la
  copie Elevay (`id:"elevay"`). Registre Orion = spread additif dans la route copiée.
- **P7 — Tailwind 4 config-less :** aucun `tailwind.config.*` ; `@theme` vit dans `globals.css`. Ne
  pas scaffolder un config v3.
- **P8 — `tenantId` jamais argument** (#1/#4) : Bearer `mcp_*` → `authenticateMcpRequest` →
  `tenantId` ; scope = `elevay`. Le fallback registre MCP (étape 8) passe `tenantId` du serveur, pas des args.
- **P9 — baseURL Anthropic finit par `/v1`** (`ai-provider.ts:43-46`) — copie intacte ; ne pas
  "normaliser" en retirant `/v1` (sinon 404 → LLM vide).
- **P10 — DB4 owner-only** : `DATABASE_URL_OWNER` = 0 hit dans `src` (tripwire). `tenant.ts`/`env.ts`
  ne le lisent jamais.
- **P11 — Junctioned `node_modules`** : valider sur `pnpm install --frozen-lockfile` **propre** (CI),
  pas un node_modules junctionné (peut passer `tsc` local mais casser en CI).
- **P12 — CI filtre `@orion/web`** (nom du package de l'app web du **repo Orion séparé**) :
  tsc+vitest ne gatent que `@orion/web`. Garder le diff dans l'app web.
- **P13 — Édition des 3 fichiers copiés = ADDITIVE/balisée uniquement** (invariant T-38
  `reuse-untouched`). Ne jamais diverger de l'auth Bearer, de l'envelope JSON-RPC, de `maxDuration`, de
  la liste de fonctions copiée ou des exports existants du barrel.

---

### RÉSUMÉ
**Titre :** LOT 0 — Foundation (`feat/orion-pack0`), racine bloquante. **Étapes :** 10 (0→9).
**Fichiers possédés :** 6 NET-NEW (`lib/orion/tenant.ts`, `lib/orion/env.ts`, `lib/mcp/types.ts`,
`lib/mcp/registry.ts`, `inngest/registry.ts`, `__tests__/orion-foundation.test.ts`) + 3 MODIF additives
(`db/schema.ts`, `app/api/mcp/route.ts`, `app/api/inngest/route.ts`, sur les fichiers COPIÉS depuis
Elevay). **Repo Orion séparé** (`@orion/web`), **DB partagée** (tenant `elevay` via RLS), modules +
schéma **copiés** depuis Elevay (provenance `file:line`). **Effort :** ~6,75 j-h.
