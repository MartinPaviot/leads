# Orion — design.md (Kiro) · configuration backend

> ⚠️ **BANNIÈRE DE CORRECTION (post-audit, 2026-06-28) — à lire AVANT ce document.**
> Plusieurs décisions de `design.md` ont été **dépassées**. Documents qui priment :
> 1. **`00-ARCHITECTURE.md` est AUTORITAIRE** et prime sur ce fichier — notamment §0 (D1/D2/D3) :
>    **DB PARTAGÉE** (celle d'Elevay, même `DATABASE_URL`), **modules réutilisés PAR IMPORT**
>    (pas copiés), **PAS** de repo séparé, **PAS** de Convex, scope **tenant `elevay`** seul.
> 2. **`00-EXECUTION-GUIDE.md`** fige l'ownership de fichiers et la parallélisation en 8 lots :
>    **pack1 PRODUIT les contrats partagés** (`taxonomy.ts`, `ingest/types.ts`, `ingest/jobs.ts`,
>    `outbound/types.ts`, `outreach-brief.schema.ts`, `campaign-engine/brief.ts`, wrapper
>    `sending-gate.ts`). Migrations : `drizzle/` réel **0001→0106** → prochaine **0107** ; table
>    ledger **`__elevay_migrations`** (PAS `__drizzle_migrations`/`__orion_migrations`).
> 3. **`research/partner-apis-2026-06-27.md`** fait foi sur les sorties :
>    - **Fiber AI = ENTRÉE, PAS sortie** (OpenAPI v1.40.0 : zéro endpoint d'envoi) — reveal
>      waterfall + signaux Tracker Svix. **Aucun `FiberAdapter`/`LopusAdapter` REST.**
>    - **Sorties RÉELLES** : **Instantly** (natif) · **Orange Slice** (webhook colonne) ·
>      **Lopus** (aucune API → webhook générique) · **webhook générique HMAC**.
> 4. **Accent UI = `#2C6BED`** (accent applicatif Elevay). `#3D99F5` est la valeur *scoped*
>    inbox upstream — **PAS** l'accent app ; ne pas l'employer globalement.
> Là où ce `design.md` diverge des points ci-dessus, **les 3 documents ci-dessus gagnent.**

> Spec d'ingénierie pour le **backend Orion** : la couche signal → interprétation →
> grounding → brief → export, *en amont* de l'envoi. Orion ne rédige pas le mail ; il
> émet le **brief** (`citableFacts[]` / `doNotClaim[]`, why-now daté et sourcé) qu'un agent
> outbound consomme. Ce document est **buildable sans relire le code Elevay** : versions
> épinglées, DDL Drizzle exact, signatures TS, et `file:line` pour chaque seam réutilisé.
>
> Sources de vérité (lues, vérifiées) : `_reports/orion-backend-verification-2026-06-27.md`
> (le backend Elevay réel), `_reports/orion-differentiation-2026-06-27.md` (entrées/sorties),
> `_reports/signal-agent-mcp-2026-06-27.md` (plomberie agent-native ingestion→MCP),
> `_reports/signal-outreach-brief-2026-06-27.md` (le contrat brief, le pivot draft→brief).
>
> Convention de chemins : tout `file:line` non préfixé est relatif à
> **`C:/Users/ombel/leads/app/apps/web/src/`** (le monorepo RÉEL ; le root du repo est un bac
> à sable à IGNORER). Le code Orion vivra dans `orion/apps/web/src/` (mêmes chemins relatifs).
>
> Légende effort : **j-h** = jours-homme. **REUSE** = copie d'un module Elevay (avec `file:line`).
> **NET-NEW** = code neuf (souvent un assemblage pur au-dessus de REUSE).

---

## 0. DÉCISIONS (tranché)

| # | Décision | Choix tranché | Trade-off accepté |
|---|---|---|---|
| D1 | **Base de données** | **Postgres + Drizzle ORM** (driver `postgres-js` sur le paquet `postgres`, TCP), hébergé sur **Supabase** (Supavisor pooler, port 6543, transaction-mode). **PAS** Neon-http, **PAS** Convex. | On renonce au temps-réel / auth / scheduler natifs d'un BaaS comme Convex. Justifié : 100 % de la logique signal/brief/gate d'Elevay est déjà Drizzle/Postgres → rapatriement = `pg_dump` → swap connection string, et non une réécriture. `@neondatabase/serverless` reste dans le `package.json` d'Elevay mais **n'est jamais utilisé** par le client DB (vérifié `db/index.ts:1-2,31-32`) → **on le DROP dans Orion**. |
| D2 | **Repo : monorepo ou single app ?** | **Repo séparé `orion/`, MÊME stack, modules copiés.** Au démarrage : **single Next app suffit** (`orion/apps/web`), mais on garde le **layout `apps/*` + `pnpm-workspace.yaml`** dès J0 pour que l'ajout futur d'un `worker` (BullMQ) ou `admin` soit un `mkdir`, pas une migration. **Pas de `packages/`** (Elevay n'en a pas : le glob `packages/*` est déclaré mais le dossier n'existe pas — vérifié) ; le code partagé vit dans `apps/web/src` et s'importe via l'alias tsconfig `@web/*`. | On copie des modules Elevay plutôt que de dépendre d'un paquet publié → risque de drift. Mitigé : Orion ne copie que des seams *stables* (gates, identité, précédence, brief, scorers) et les fige par tests Vitest portés (les `*.test.ts` voisins). |
| D3 | **Couplage avec Elevay** | **Découplé.** Orion est un produit autonome (sa propre DB, son propre tenant store). Il **n'appelle pas** l'API Elevay. Il **copie** les modules métier (REUSE = copie, pas import cross-repo). | Deux copies du code des gates/brief à maintenir. Accepté : c'est le prix de l'autonomie de déploiement (Orion peut être vendu/déployé sans Elevay). |
| D4 | **Frontière de produit** | Orion = **amont seulement** : ingestion → résolution d'identité → composition par précédence → acquisition de signaux → scoring → **brief** → **export gaté**. Orion **ne rédige pas** la prose et **n'envoie pas** les colds. `draft_outreach` (prose) est **supprimé** ; remplacé par `get_outreach_brief` (intelligence structurée, zéro `subject`/`body`). | On ne capte pas la valeur « sender ». Accepté : c'est *le* pivot défendable — on devient la couche que Instantly/Fiber/OrangeSlice **consomment**, pas un concurrent frontal (`signal-outreach-brief:6`). Le défaut « copy vide » d'Elevay (mémoire `project_copy-quality-eval`) sort structurellement du périmètre. |
| D5 | **Envoi** | `evaluateSend` est un **oracle d'éligibilité** (« ce prospect peut-il être contacté légalement ? »), **jamais** un sender, sur le chemin d'export. L'envoi réel est celui du partenaire (Instantly/agent client), sur **ses** comptes. | On hérite de la complexité des 8 gates fail-closed sans en tirer le revenu d'envoi. Accepté : le gate **comme donnée** (`gate{exportable,verdict}` dans le brief) est une feature différenciante, pas un coût. |
| D6 | **Clés partenaires (entrée ET sortie)** | **Per-tenant, stockées en DB** (chiffrées), **JAMAIS en env** — exactement le pattern Instantly d'Elevay (pas d'`INSTANTLY_API_KEY` env ; clé passée par appel, vérifié `orion-backend-verification §6`). Les clés de *sources souveraines gratuites* (SEC/BODACC/Sirene/crt.sh/npm) n'ont pas de clé. | Un store de secrets par tenant à chiffrer/gérer. Accepté : multi-tenant SaaS l'exige de toute façon. |
| D7 | **Migrations** | **Runner custom** `scripts/apply-migrations.ts` (table `__orion_migrations`, sha256, 1 tx/fichier, idempotent) **dès J0**. `db:migrate` (drizzle-kit) câblé à `exit 1`. On **n'hérite pas** du journal cassé d'Elevay (idx 15 vs 32 `.sql`) — Orion démarre le journal propre, mais adopte *quand même* le runner custom car ses `IF NOT EXISTS` rendent les ré-applications sûres en prod. | Drizzle-kit `migrate` standard inutilisable. Accepté : c'est le pattern éprouvé d'Elevay. |
| D8 | **Scheduler** | **Inngest uniquement** (`new Inngest({id:"orion"})`). On **n'adopte pas** les crons Vercel parallèles d'Elevay (double mécanisme = double-fire risk, trap #10). | Pas de cron HTTP de secours hors Inngest. Accepté : un seul mécanisme = pas de double-fire. |
| D9 | **AI** | Providers câblés en direct (`createAnthropic` lazy, allowlist baseURL EU/US **avec `/v1` obligatoire**), routing `chat→sonnet` / `light→haiku` / `embed→text-embedding-3-small`, circuit-breaker → OpenAI. **Pas de Vercel AI Gateway.** Tout passe par `tracedGenerateText/Object` (budget + trace). | Pas de routing multi-provider managé. Accepté : contrôle EU-souveraineté + coût par tenant l'emportent. |

**Completeness score de ce design : 9/10.** Manquant assumé : (a) le détail opérationnel des snapshots historisés pour la *vélocité* (Tier 2 #1/#4/#5) — flaggé comme un chantier « océan » (table `signal_snapshots` + diff cron, §5.4) ; (b) l'élicitation SSE native MCP (différable, §3.3 du rapport MCP).

---

## 1. MONOREPO & INSTALL

### 1.1 Layout cible

```
orion/                              # repo séparé ; le root n'est PAS un bac à sable (≠ Elevay)
  .nvmrc                            # 22
  .github/workflows/ci.yml          # pnpm 10.15.1 + node 22, working-directory: app… → ici: apps
  app/                              # = racine workspace (on garde le niveau app/ d'Elevay)
    package.json                    # name: "orion", private, packageManager pnpm@10.15.1
    pnpm-workspace.yaml             # packages: ["apps/*", "packages/*"]  (packages/ n'existe pas — OK)
    turbo.json
    .npmrc                          # 2 lignes hoist SEULEMENT si Sentry/OTel adopté
    apps/
      web/   (@orion/web)           # Next 15 — produit + TOUT lib/db/schema
      # worker/ (@orion/worker)     # OPTIONNEL plus tard (BullMQ) — pas J0
```

> **Tranche single-vs-mono :** on **garde le niveau `app/` + `apps/web/`** d'Elevay même avec une
> seule app. Coût nul (un dossier de plus), bénéfice : copier-coller des chemins Elevay
> `apps/web/src/...` **1:1** (aucune réécriture de `file:line`), et un `worker` futur s'ajoute sans
> restructurer. Le `pnpm-workspace.yaml` déclare `packages/*` (aspirationnel, comme Elevay) sans
> créer le dossier.

### 1.2 `app/package.json` (root workspace) — à recréer EXACTEMENT

```jsonc
{
  "name": "orion",
  "private": true,
  "packageManager": "pnpm@10.15.1",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "tsc": "turbo tsc"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.104.1"          // root-level comme Elevay (app/package.json:17)
  },
  "devDependencies": {
    "turbo": "^2.9.17",
    "typescript": "^5.8.0"
  },
  "pnpm": {
    "overrides": { "drizzle-orm": "^0.45.2" } // OBLIGATOIRE : force une seule version tree-wide (trap #5)
  }
}
```

### 1.3 `apps/web/package.json` — deps épinglées (valeurs EXACTES du backend vérifié)

```jsonc
{
  "name": "@orion/web",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "tsc": "tsc --noEmit",
    "test": "vitest run",
    "eval:run": "vitest run --reporter=verbose <gate suites>", // listera les suites brief/gate
    "e2e": "playwright test",
    "e2e:install": "playwright install chromium",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "echo '[ERROR] use db:migrate:apply (custom runner) — drizzle journal not source of truth' && exit 1",
    "db:migrate:apply": "tsx scripts/apply-migrations.ts",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "next": "^15.5.15",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "drizzle-orm": "^0.45.2",
    "drizzle-zod": "^0.8.3",
    "postgres": "^3.4.9",                     // LE driver réellement utilisé (postgres-js)
    "next-auth": "5.0.0-beta.30",            // pin exact du beta
    "@auth/drizzle-adapter": "^1.11.2",
    "inngest": "^4.5.1",
    "ai": "^6.0.199",                        // AI SDK v6
    "@ai-sdk/anthropic": "^3.0.82",
    "@ai-sdk/openai": "^3.0.69",
    "@ai-sdk/provider": "^3.0.10",
    "@ai-sdk/react": "^3.0.201",
    "@anthropic-ai/sdk": "^0.104.1",
    "openai": "^6.42.0",                      // embeddings + fallback circuit-breaker
    "zod": "^4.4.3",                          // ZOD 4 (pas 3)
    "bcryptjs": "^3.0.3",                     // Credentials provider
    "papaparse": "^5.5.3",                    // CSV source
    "cheerio": "^1.2.0",                      // parse HTML sources publiques (ATS, etc.)
    "libphonenumber-js": "^1.13.7"
    // DROP vs Elevay : @neondatabase/serverless (inutilisé) ; twilio/deepgram/googleapis/
    //   resend/nodemailer/imapflow/stripe/recall/zoom (canaux d'envoi — hors périmètre Orion D4)
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "tailwindcss": "^4.3.0",
    "@tailwindcss/postcss": "^4.3.0",
    "drizzle-kit": "^0.31.10",
    "vitest": "^4.1.8",
    "@vitest/coverage-v8": "^4.1.8",
    "@vitejs/plugin-react": "^6.0.2",
    "happy-dom": "^20.10.2",
    "@testing-library/react": "^16.3.2",
    "@playwright/test": "^1.60.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.22.4"                          // requis pour le runner de migration
  }
}
```

> **`@sentry/nextjs ^10.57.0`** est ce qui force les 2 lignes `public-hoist-pattern` du `.npmrc`
> d'Elevay (`*require-in-the-middle*`, `*import-in-the-middle*`). **N'ajouter le `.npmrc` que si on
> adopte Sentry.** Sinon, pas de `.npmrc`.

### 1.4 Package manager / Node / Turbo

- **pnpm `10.15.1`** (`packageManager` field + `pnpm/action-setup@v6 version: 10.15.1` en CI).
- **Node `22`** (`.nvmrc` = `22` ; `actions/setup-node@v5 node-version: 22` ; `@types/node ^22`).
- **Turbo `^2.9.17`**. `turbo.json` : `dev` (`cache:false`, `persistent:true`), `build`
  (`dependsOn:["^build"]`, `outputs:[".next/**","dist/**"]`), `lint`/`test`/`tsc` (vides).
- Pas d'`engines` field (comme Elevay).

### 1.5 Checklist des fichiers de config à recréer

| # | Fichier | Contenu critique (vérifié sur Elevay) |
|---|---|---|
| 1 | `app/package.json` | §1.2 — `pnpm.overrides.drizzle-orm`, scripts turbo |
| 2 | `app/pnpm-workspace.yaml` | `packages: ["apps/*", "packages/*"]` |
| 3 | `app/turbo.json` | 5 tâches (dev persistent/no-cache ; build dependsOn ^build) |
| 4 | `app/.npmrc` | **seulement si Sentry** : 2 `public-hoist-pattern[]` |
| 5 | `.nvmrc` | `22` |
| 6 | `apps/web/tsconfig.json` | `strict:true`, `moduleResolution:"bundler"`, `paths:{"@/*":["./src/*"]}`, `exclude:["node_modules","scripts"]`, `plugins:[{name:"next"}]` |
| 7 | `apps/web/drizzle.config.ts` | §2.1 |
| 8 | `apps/web/src/db/index.ts` | §2.2 — `drizzle-orm/postgres-js` + `postgres(DATABASE_URL)` + EU guard |
| 9 | `apps/web/src/db/rls.ts` | §2.5 — `withTenantTx` (transaction-scoped `set_config`) |
| 10 | `apps/web/scripts/apply-migrations.ts` | §2.4 — runner custom, `__orion_migrations` |
| 11 | `apps/web/src/auth.ts` | §3 — NextAuth v5, DrizzleAdapter, `resolveUserTenant` |
| 12 | `apps/web/src/middleware.ts` | rate-limit IP + RBAC ; importe `auth` |
| 13 | `apps/web/src/inngest/client.ts` | `new Inngest({ id: "orion" })` |
| 14 | `apps/web/src/app/api/inngest/route.ts` | `serve({client, functions:[…]})` + `export const maxDuration = 300` |
| 15 | `apps/web/src/lib/ai/ai-provider.ts` | §9 — provider singleton lazy + MODEL_MAP + baseURL `/v1` allowlist |
| 16 | `apps/web/src/lib/ai/traced-ai.ts` | §9 — `tracedGenerateText/Object` + `enforceLlmBudget` + `recordTrace` |
| 17 | `apps/web/next.config.ts` | CSP headers (+ wrap Sentry si adopté) |
| 18 | `apps/web/postcss.config.mjs` | `@tailwindcss/postcss` |
| 19 | `apps/web/src/app/globals.css` | **Tailwind 4 config-less** : `@import "tailwindcss"; @theme {…}` — **PAS** de `tailwind.config.ts` (trap #9) |
| 20 | `apps/web/vitest.config.ts` | env node, alias `@`→`src`, dotenv loader (ANTHROPIC_*/OPENAI_*) |
| 21 | `apps/web/vercel.json` | `framework: nextjs`, `installCommand: pnpm install --frozen-lockfile` ; **PAS** de crons (D8) |
| 22 | `.github/workflows/ci.yml` | pnpm 10.15.1 + node 22, `working-directory: app`, `NODE_OPTIONS=--max-old-space-size=6144`, `pnpm --filter @orion/web tsc` + `test`, gitleaks |

---

## 2. SCHÉMA Drizzle

Schéma = barrel `db/schema.ts` (réexporte `db/schema/*`) + (optionnel) `billing-schema.ts`.
Toutes les tables sont **additives** ; les secrets sont chiffrés au repos. La précédence et
l'identité (companies/contacts/`*_field_source`) sont **copiées d'Elevay** (REUSE) — DDL non
réécrit ici (voir la carte §8) ; ce qui suit est le **NET-NEW** d'Orion + le pattern tenant.

### 2.1 `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: ["./src/db/schema.ts"],            // 1 barrel (pas de billing-schema au départ)
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### 2.2 `db/index.ts` (driver = postgres-js)

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertEuHost } from "@/lib/region-config";   // REUSE Elevay region-config
import * as schema from "./schema";

assertEuHost(process.env.DATABASE_URL);              // logs CRITICAL/WARN si GDPR_REGION=eu et host non-EU ; ne throw PAS
const client = postgres(process.env.DATABASE_URL!);  // TCP, PAS neon-http
export const db = drizzle({ client, schema });
```

> Le **role applicatif** est `orion_app` (restreint, RLS). Le **role opérateur** = `postgres`
> via `DATABASE_URL_OWNER`, **jamais référencé dans le code** (0 hit) ; il sert au runner de
> migration hors-bande (split owner/app, trap #11).

### 2.3 Tenants & clés API (REUSE le pattern Elevay `tenants.settings.mcpApiKeys`)

```ts
// db/schema/tenants.ts
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  settings: jsonb("settings").$type<TenantSettings>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// TenantSettings (TS, dans le jsonb) — porte les secrets per-tenant CHIFFRÉS
export interface TenantSettings {
  mcpApiKeys?: McpApiKeyEntry[];               // REUSE forme Elevay (auth Bearer mcp_*)
  // clés partenaires SORTIE (per-tenant, chiffrées — D6) :
  partnerKeys?: {
    instantly?: EncryptedSecret;               // {iv, ciphertext, tag}
    fiber?: EncryptedSecret;
    orangeSlice?: EncryptedSecret;
  };
  // clés sources ENTRÉE commerciales (per-tenant, chiffrées) :
  sourceKeys?: {
    apollo?: EncryptedSecret; hunter?: EncryptedSecret; pappers?: EncryptedSecret;
    // SEC/BODACC/Sirene/crt.sh/npm = SANS clé (sources souveraines/gratuites)
  };
  sending?: SendingRules;                       // fenêtre 08-18, caps, cold policy, lawful basis
}
export interface McpApiKeyEntry {              // REUSE (tenant-settings.ts:431)
  id: string; name: string; keyHash: string;  // keyHash = bcrypt(rawKey, 10) — PAS sha256
  keyPrefix: string; createdAt: string; keyOwnerId?: string;
}
```

> **Auth Bearer** : la clé en clair `mcp_<random>` n'est **jamais** stockée ; on stocke
> `keyHash` = **bcrypt(rawKey, 10)** (+ `keyPrefix` = `rawKey.slice(0,8)+"..."`). `authenticateMcpRequest`
> (REUSE, `app/api/mcp/route.ts:230` ; lit `settings.mcpApiKeys` à `:249`, met à jour `lastUsedAt`
> à `:264`) compare le Bearer entrant via **`bcryptjs.compare(token, keyHash)`** → en déduit `tenantId`.
> **PAS sha256** : une clé stockée en sha256 ne matche jamais (401). Recette : `SETUP-RUNBOOK §4.2`.
> **`tenantId` vient TOUJOURS du Bearer, jamais d'un argument.**

### 2.4 Runner de migration `scripts/apply-migrations.ts` (NET-NEW, calqué Elevay)

```ts
// table de tracking PROPRE à Orion (≠ __drizzle_migrations)
const TRACK = "__orion_migrations";
const sql = postgres(process.env.DATABASE_URL_OWNER!, { max: 1 });   // role owner, hors-bande
// 1. CREATE TABLE IF NOT EXISTS __orion_migrations (filename text PK, hash text, applied_at timestamptz default now())
// 2. lire drizzle/*.sql triés lexicalement
// 3. pour chaque non-appliqué : sql.begin(tx => { tx.unsafe(content); INSERT … filename, sha256(content) })
//    → 1 transaction/fichier ; hash mismatch d'un fichier déjà appliqué → warn + skip
```

### 2.5 RLS — `withTenantTx` (REUSE `db/rls.ts:44-54`)

```ts
export async function withTenantTx<T>(tenantId: string, fn: (tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`); // true = TRANSACTION-scoped
    return fn(tx);
  });
}
```

> **TRAP #6 (Supavisor transaction-mode, port 6543) :** **jamais** de `set_config(..., false)`
> (session-scoped) — il empoisonne les backends poolés (incident Elevay 2026-06-10). Un test
> tripwire (`rls.test.ts`, REUSE) greppe l'arbre pour l'interdire. **À porter tel quel.**

### 2.6 Tables NET-NEW

**Ingestion (REUSE design `signal-agent-mcp §2.6`)** — `db/schema/ingest.ts` :

```sql
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  source_name     text NOT NULL,
  source_kind     text NOT NULL,              -- 'file' | 'provider'
  fingerprint     text NOT NULL,              -- sha256(entrée) → dédup niveau 1
  status          text NOT NULL DEFAULT 'queued', -- queued|running|done|error
  total_estimate  integer,
  pulled          integer NOT NULL DEFAULT 0,
  resolved        integer NOT NULL DEFAULT 0,
  created         integer NOT NULL DEFAULT 0,
  merged          integer NOT NULL DEFAULT 0,
  skipped         integer NOT NULL DEFAULT 0,
  signals         integer NOT NULL DEFAULT 0,
  scored          integer NOT NULL DEFAULT 0,
  options         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ingest_jobs_tenant_fp ON ingest_jobs (tenant_id, fingerprint);

CREATE TABLE IF NOT EXISTS ingest_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL,
  tenant_id    uuid NOT NULL,
  source_ref   text NOT NULL,                 -- 'row:42' | apollo id → dédup niveau 2
  subject_kind text NOT NULL,                 -- 'company' | 'person'
  resolved_id  uuid,                          -- companies.id | contacts.id après résolution
  outcome      text,                          -- created|merged|skipped|error
  error        text
);
CREATE UNIQUE INDEX IF NOT EXISTS ingest_items_job_ref ON ingest_items (job_id, source_ref);
```

**Export (NET-NEW Orion)** — `db/schema/export.ts` :

```sql
CREATE TABLE IF NOT EXISTS export_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  destination   text NOT NULL,                -- instantly|fiber|orange_slice|webhook|generic
  status        text NOT NULL DEFAULT 'queued',
  requested     integer NOT NULL DEFAULT 0,
  exported      integer NOT NULL DEFAULT 0,
  skipped       integer NOT NULL DEFAULT 0,   -- gate-rejected → JAMAIS poussés
  duplicates    integer NOT NULL DEFAULT 0,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb, -- campaignId|listId|webhookUrl|dryRun
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS export_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_job_id uuid NOT NULL,
  tenant_id     uuid NOT NULL,
  prospect_id   uuid NOT NULL,
  outcome       text NOT NULL,                -- exported|skipped|duplicate|error
  gate_code     text,                         -- si skipped : le code evaluateSend (not_targeted, opted_out…)
  external_id   text,                         -- instantlyLeadId, etc.
  reason        text
);
CREATE UNIQUE INDEX IF NOT EXISTS export_items_job_prospect ON export_items (export_job_id, prospect_id);
```

**Snapshots de vélocité (NET-NEW, chantier Tier 2 — l'EDGE non-copiable)** —
`db/schema/snapshots.ts` :

```sql
-- historise les sources où la DÉRIVÉE (vélocité) est la valeur : ATS, npm/PyPI, tech-stack, sous-domaines.
CREATE TABLE IF NOT EXISTS signal_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,                            -- NULL = snapshot global partagé (npm/PyPI/SEC)
  subject_key text NOT NULL,                   -- domaine | repo | package | CIK
  source      text NOT NULL,                   -- greenhouse|lever|ashby|npm|pypi|builtwith|crtsh|edgar
  metric      text NOT NULL,                   -- open_roles|weekly_downloads|tech_set_hash|subdomain_set
  value       jsonb NOT NULL,                  -- scalaire ou set (pour diff)
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snap_subject_source_metric_time
  ON signal_snapshots (subject_key, source, metric, observed_at DESC);
```

> **Le moat est ici** (`orion-differentiation §5`) : la dérivée (vélocité d'embauche,
> accélération d'adoption, tech-churn) n'existe **qu'avec l'historique snapshotté**. Un entrant
> démarre avec un retard égal à tout l'historique accumulé — irrattrapable rétroactivement. Le
> cron `velocity-snapshot` (§4) écrit ici ; `recordCompanySignal` lit le diff et émet un signal
> *dérivé* (`hiring_velocity`, `adoption_accel`, `tech_churn`).

---

## 3. AUTH

Fichier `src/auth.ts` (NextAuth v5, `5.0.0-beta.30`, `@auth/drizzle-adapter ^1.11.2`).
**Double canal** : NextAuth (UI humaine) + Bearer `mcp_*` (agents).

### 3.1 NextAuth v5 + DrizzleAdapter

```ts
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db as any, {        // `as any` OBLIGATOIRE — pnpm dual-resolve drizzle-orm (trap #5)
    usersTable: authUsers, accountsTable: authAccounts,
    sessionsTable: authSessions, verificationTokensTable: authVerificationTokens,
  }),
  // linkAccount WRAPPÉ pour chiffrer les tokens OAuth au repos (lib/crypto/oauth-token-crypto)
  providers: [
    // Google — seulement si GOOGLE_CLIENT_ID set
    // MicrosoftEntraId — seulement si MICROSOFT_CLIENT_ID set
    // Credentials — email+password (bcrypt + dummy hash timing-safe) + TOTP + lockout par email/IP
  ],
  session: { strategy: "jwt", maxAge: 8 * 3600, updateAge: 3600 },  // 8h / refresh 1h
  pages: { signIn: "/sign-in", error: "/sign-in" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {                              // 1er sign-in
        const t = await resolveUserTenant(user.id, user.email);
        token.tenantId = t.tenantId; token.appUserId = t.appUserId; token.role = t.role;
      }
      return token;                            // tokens OAuth PAS sur le JWT (restent server-side dans auth_account)
    },
    async session({ session, token }) {
      session.tenantId = token.tenantId; session.appUserId = token.appUserId; session.role = token.role;
      return session;
    },
  },
});
```

### 3.2 `resolveUserTenant(authUserId, email)` (REUSE `auth.ts:80-196`)

Ordre exact : (1) user app existant (`users.clerkId == authUserId`) → réutilise tenant/role ;
(2) sinon invite pending non-expirée pour l'email → rejoint le tenant (rôle invité), **dans**
`withTenantTx(invite.tenantId)` ; (3) sinon si `!SELF_SERVE_SIGNUP_ENABLED && !hasBetaAccess()`
→ **throw** (invitation-only) ; (4) sinon crée tenant + admin user dans un seul
`withTenantTx(newId)`. (`users.clerkId` = nom de colonne legacy portant l'id NextAuth.)

### 3.3 Bearer `mcp_*` (REUSE `app/api/mcp/route.ts:230`)

```ts
// dans POST /api/mcp, AVANT tout dispatch :
const authResult = await authenticateMcpRequest(req);   // route.ts:894
//   → lit Authorization: Bearer mcp_… → bcryptjs.compare(token, keyHash) sur tenants.settings.mcpApiKeys[]
//     (match keyPrefix puis bcrypt.compare ; PAS sha256 — sinon 401 systématique ; cf. SETUP-RUNBOOK §4.2)
//   → renvoie { tenantId } (+ bump lastUsedAt) ; 401 si absent/révoqué.
// tenantId ainsi obtenu est passé à TOUS les handlers ; AUCUN outil ne l'accepte en argument.
```

> **Invariant transverse :** `tenantId` est dérivé **serveur** dans les trois cas (JWT, Bearer,
> `event.data` Inngest), **jamais** un argument client. Un Bearer mappé à un rôle `viewer` ne peut
> **aucune** action destructive (export/send).

---

## 4. INNGEST

`client.ts` : `export const inngest = new Inngest({ id: "orion" });`.
`app/api/inngest/route.ts` : `export const { GET, POST, PUT } = serve({ client: inngest,
functions: [ … ] });` + **`export const maxDuration = 300;`**.

**Pattern OBLIGATOIRE (trap #2)** : `createFunction(config, handler)` — **2 arguments**. Les
triggers vivent **dans** le config (`triggers: [{cron}]` ou `[{event}]`) ; `concurrency` est un
**array**. Modèle vérifié `inngest/signal-score-daily.ts:95-108`.

### 4.1 `ingest-run` — orchestrateur durable (event-triggered)

```ts
export const ingestRun = inngest.createFunction(
  { id: "ingest-run", name: "Ingest: resolve → compose → signals → score",
    retries: 2, concurrency: [{ key: "event.data.jobId", limit: 1 }],
    triggers: [{ event: "ingest/run" }] },
  async ({ event, step }) => {
    const { jobId, tenantId } = event.data;
    // 5 stages durables (clone structurel custom-signal-backfill.ts:29) :
    //  [open-job] → loop page { pull() → ledger ingest_items → resolve identity → record signals } → [score] → [close-job]
  },
);
```

Stages (chacun `step.run`, resume-safe par la dédup 3-niveaux §5/§2.6) :
1. **IDENTITY-RESOLVE** : `upsertAccount`/`upsertContact` (REUSE `db/canonical/upsert.ts:108`/`:223`),
   dédup `accountMatchPlan` (REUSE `identity.ts:67`/`:125`), `findAccountMatch` insert-ou-merge (`upsert.ts:60`).
2. **COMPOSE** : `enrichCompany` waterfall (REUSE `providers/company-enrichment/waterfall.ts:148`,
   merge first-non-null `:77`) → `account_field_source` + précédence `pickWinner` (`precedence.ts:53`).
3. **ACQUIRE SIGNALS** : `recordCompanySignal` (REUSE `lib/signals/record-signal.ts:94`) ←
   `IngestItem.rawSignals` → `properties.signals[]`.
4. **SCORE (ciblé)** : `scoreCompanyBatch` (REUSE `icp/fit-recompute-core.ts:140`) +
   `bestMultiplierForCompany` → `computePriorityScore` (REUSE `scoring/priority-score.ts:70`,
   floors `:54-55`) — touched IDs uniquement, pas tout le tenant.

### 4.2 `signal-score-daily` — cron recompute (REUSE `signal-score-daily.ts:95-108`)

```ts
{ id: "signal-score-daily", retries: 1, concurrency: [{ limit: 1 }],
  triggers: [{ cron: "0 6 * * *" }] }   // recompute priority_score (multipliers appris) chaque jour
```

> **BUG À NE PAS PORTER (mémoire `signals-world-class-report`) :** le daily n'appliquait jamais
> les multipliers appris car signal-monitor écrivait `{funding_recent,…}` mais les multipliers
> étaient keyés canonique `{funding,…}` → `undefined` → plancher 1.0× (`signal-score-daily.ts:87`).
> **Fix Orion = `taxonomy.ts` (alias-map canonique) AVANT d'annoncer le contrat signal** (dur
> prérequis, `signal-agent-mcp §6.3`). Sinon `get_signals.polarity` et les multipliers restent
> dégradés au plancher.

### 4.3 `velocity-snapshot` — cron Tier 2 (NET-NEW, l'EDGE)

```ts
{ id: "velocity-snapshot", retries: 1, concurrency: [{ limit: 2 }],
  triggers: [{ cron: "0 4 * * *" }] }   // snapshote ATS/npm/PyPI/tech/crt.sh → signal_snapshots ; diff → signal dérivé
```

Lit les sujets actifs, pull les sources Tier 2 historisables (§5.4), écrit `signal_snapshots`,
calcule le diff vs le snapshot précédent → `recordCompanySignal` avec un signal **dérivé**
(`hiring_velocity:+4 roles/3wk`, `adoption_accel:+40%/mo`, `tech_churn:<outil> removed`).

### 4.4 `export-to-outbound` — push gaté (event-triggered)

```ts
{ id: "export-to-outbound", retries: 2, concurrency: [{ key: "event.data.exportJobId", limit: 1 }],
  triggers: [{ event: "export/run" }] }
```

Boucle prospects → `get_outreach_brief` → **`evaluateSend` (gate-dans-le-wrapper)** → si
`send:true` : flatten + push vers la destination ; si `send:false` : SKIP + `export_items.gate_code`.
(Détail §6.)

> **Pas de crons Vercel (D8).** Un seul scheduler = pas de double-fire (trap #10 évité).

---

## 5. ADAPTATEURS ENTRÉE

### 5.1 L'interface unifiante (NET-NEW `lib/ingest/types.ts`, REUSE design `signal-agent-mcp §2.1`)

CSV-row et provider-record **convergent vers le même `IngestItem`** = exactement la forme consommée
par `upsertAccount`/`upsertContact`. Une source ne sait rien de l'aval ; elle produit des
`IngestItem` paginés.

```ts
export interface IngestItem {
  kind: "company" | "person";
  identity: {                          // → accountMatchPlan / contactMatchPlan (identity.ts:67/:125)
    domain?: string; name?: string; country?: string; siren?: string; siret?: string; uid?: string; // account
    email?: string; linkedinUrl?: string; firstName?: string; lastName?: string; companyRef?: string; // person
  };
  fields: Partial<Record<"industry"|"size"|"revenue"|"description"|"title"|"phone", string|null>>;
  vendorIds?: Record<string, string>;  // side-map, JAMAIS dans l'identité (upsert.ts AC4)
  rawSignals?: Array<{ type: string; detectedAt: string; strength?: string; detail?: string;
                       evidence?: { url: string; quote?: string } }>; // → recordCompanySignal
  sourceRef: string;                   // 'row:42' | apollo id → dédup intra-job (niveau 2)
  provider: string;                    // 'csv'|'apollo'|'sirene'|'edgar'|'bodacc'|'greenhouse'|… → précédence
}

export interface InputSource {
  name: string; kind: "file" | "provider"; subjectKind: "company" | "person" | "mixed";
  inputFingerprint(): string;          // sha256(entrée) → dédup job-level (niveau 1)
  pull(ctx: PullCtx, cursor?: string): Promise<{ items: IngestItem[]; nextCursor?: string; total?: number }>;
  // pull() NE THROW JAMAIS — erreur source → items partiels + log ; le pipeline reste durable.
}
```

### 5.2 Dédup à 3 niveaux (REUSE intégral du design)

| Niveau | Mécanisme | Garantie | Ancrage |
|---|---|---|---|
| 1 job | `ingest_jobs` uniqueIndex `(tenant_id, fingerprint)`, `onConflictDoUpdate` | re-soumettre le même CSV/requête ne relance pas | NET-NEW table §2.6 |
| 2 item | `ingest_items` uniqueIndex `(job_id, source_ref)`, `onConflictDoNothing` | un retry Inngest ne ré-insère pas une page ; resume exact | NET-NEW table §2.6 |
| 3 sujet | `findAccountMatch`/`findContactMatch` → merge sur identityKey/domain/email | « ACME SAS » + « acme.io » fusionnent sur le même `companies.id` | REUSE `upsert.ts:60`/`:192`, `identity.ts:44`/`:103` |

### 5.3 Tier 0/1 — table stakes (CSV, Apollo, waterfall)

| Source | `InputSource` | Endpoint / auth | Coût | Fraîcheur | REUSE / NET-NEW | j-h |
|---|---|---|---|---|---|---|
| **CSV / inbound** | `csvSource(text, hint)` | parser local (papaparse) | 0 | n/a | REUSE `parseCSVLine`/`mapColumnsWithAI`/`applyMapping` extraits de `app/api/import/smart/route.ts:115`/`:141`/`:256` → `lib/ingest/csv-parse.ts` ; mapping Haiku mémoïsé dans le cursor ; pagine 200 | 1.0 |
| **Apollo (people)** | `apolloPeopleSource(query)` | `apollo_mixed_people_api_search` (MCP Apollo, dispo) ou REST per-tenant key | inclus / crédits | personnes 1-2 mois | NET-NEW pull ; `num_current_job_openings` → `rawSignals:[{type:'hiring'}]`, **pas** un champ | 0.75 |
| **Apollo (orgs)** | `apolloOrgsSource(query)` | `apollo_mixed_companies_search` | inclus | entreprises 2-3 sem | NET-NEW | 0.5 |
| **Waterfall firmo** | `waterfallSource(seeds)` | wrappe `enrichCompany` (8 providers cascade, geo-routée TLD) | conditionnel | variable | REUSE `waterfall.ts:148` ; provider/champ = `provenance[i].provider` | 0.5 |
| **Sirene / recherche-entreprises FR** | `sireneSource(query)` | `recherche-entreprises.api.gouv.fr` (keyless, ~7 req/s) | **0** | quotidienne | NET-NEW ; firmo officielle FR + état entreprise (souverain, aveugle aux wrappers US) | 0.75 |

> **`import/smart/route.ts` MODIFIÉ** : l'insert brut (`route.ts:57-101`) devient un producteur
> d'event (`openIngestJob` + `inngest.send("ingest/run")`), rétro-compatible `sync=true` pour <50 lignes.

### 5.4 Tier 2 — l'EDGE (hard-to-get, souvent gratuit, historisable)

Chacun est un `InputSource` ; ceux marqués **[snap]** alimentent `signal_snapshots` (§2.6) via le
cron `velocity-snapshot` (§4.3) pour produire la **dérivée** (la valeur non-copiable).

| # | Source | `InputSource` | Endpoint / auth | Coût | Fraîcheur | Signal interprété | Difficulté (= la barrière) | j-h |
|---|---|---|---|---|---|---|---|---|
| 1 | **ATS publics** [snap] | `greenhouseSource`/`leverSource`/`ashbySource` | endpoints JSON publics (`boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com`), **no auth** | **0** | 2-3 j | stack réel + intent + **vélocité d'embauche/fonction** | mapper slug ATS→domaine + NLP description ; diff snapshot | 1.5 |
| 2 | **SEC EDGAR Form D / 8-K** [snap] | `edgarSource` | `efts.sec.gov/LATEST/search-index` + flux Atom ; **User-Agent obligatoire** | **0** | J+0 | financement US **pré-annonce** (avant Crunchbase J+30) | User-Agent SEC, parse XML, CIK→domaine | 1.0 |
| 3 | **BODACC FR** | `bodaccSource` | Opendatasoft (`bodacc-datadila.opendatasoft.com`) + recherche-entreprises ; keyless | **0** | quotidienne | **job-change dirigeant** + financement FR (gratuit là où UserGems = 2750$/mo) | non indexé par les wrappers US ; mapping SIREN→domaine | 1.0 |
| 4 | **Adoption open-source** [snap] | `npmSource`/`pypiSource`/`githubSource` | `api.npmjs.org`, `pypistats.org`, `deps.dev`, GitHub REST | 0 | quotidienne | **dérivée d'adoption** (+40%/mo) ; repo poussé cette semaine | la dérivée n'existe qu'avec snapshots propres | 1.0 |
| 5 | **Tech churn** [snap] | `techStackSource` | tech-detect (cheerio sur HTML + headers) diff snapshot | 0 DIY | hebdo | **fenêtre de migration** (intent le + haut) | l'historique tech est ce que BuiltWith paywalle (995$/mo) | 1.0 |
| 6 | **crt.sh / sous-domaines** [snap] | `crtshSource` | `crt.sh/?q=…&output=json`, diff quotidien | 0 | quotidienne | **lancement produit/infra** (sous-domaine neuf) | personne ne corrèle sous-domaine→trigger commercial | 0.75 |
| 7 | **Job-change champion** (warm) | `championSource` | graphe relationnel tenant (LinkedIn/import) ∩ BODACC | ~0 | event | warm-signal n°1 (×3-5) | tisse le graphe propre du tenant — non-achetable | (porté warm-path) |
| 8 | **Investor overlap** (warm) | `investorOverlapSource` | cap-table tenant ∩ `apollo investor_names` | 0 | statique | diligence partagée → intro chaude | aucun wrapper ne connaît le cap-table du client | 0.5 |

> **Principe de priorisation (anti-réflexe-wrapper) :** plafonner à **3-5 signaux actionnables**,
> exiger **convergence 2+ sources** avant haute-priorité, classer par corrélation closed-won.
> « Plus de sources = mieux » est faux ; le compound vérifié est la valeur.

### 5.5 Fiber-as-input (data-API agent-native)

| Source | `InputSource` | Endpoint / auth | Rôle |
|---|---|---|---|
| **Fiber Search + Tracker** | `fiberSource(query)` / `fiberSignalIngestor(payload)` | API Fiber publique (200+ ops, MCP, webhooks Tracker), header `x-api-key` **per-tenant** | INPUT : tap d'enrichissement (100+ providers, contact reveal cascade) + flux de signaux bruts (job-change, Tracker, live LinkedIn/GitHub). `fiberSignalIngestor` **normalise n'importe quel payload** → `IngestItem.rawSignals` (résilient si la taxonomie Tracker diffère). |

> **Fiber-Sales EXCLU** (pas d'API d'injection). **Lopus EXCLU en dur** (API non vérifiée ;
> `docs.lopus.ai` ne résout pas) — si jamais branché, en best-effort via `fiberSignalIngestor`-like,
> jamais en dépendance.

---

## 6. ADAPTATEURS SORTIE

### 6.1 L'interface (NET-NEW `lib/outbound/types.ts`)

```ts
export interface OutboundDestination {
  name: "instantly" | "fiber" | "orange_slice" | "webhook" | "generic";
  /** flatten DOIT être appelé APRÈS le gate — il ne voit que des prospects autorisés. */
  push(args: {
    tenantId: string;                          // du Bearer, jamais argument
    briefs: OutreachBrief[];                    // §7 — déjà gatés exportable:true
    config: { campaignId?: string; listId?: string; webhookUrl?: string; dryRun?: boolean };
    apiKey?: EncryptedSecret;                   // per-tenant, déchiffré au call (D6)
  }): Promise<ExportResult>;
}
export type ExportResult = {
  destination: string;
  exported: Array<{ prospectId: string; externalId?: string }>;
  skipped:  Array<{ prospectId: string; code: string; reason: string }>;   // code = gate code
  counts: { requested: number; exported: number; skipped: number; duplicates: number };
};
```

### 6.2 Le gate AVANT push (invariant de sécurité — REUSE `sending-gate.ts:212`)

```
export_to_outbound({ prospectIds[], destination, config })
  pour chaque prospect (tenantId du Bearer) :
    1. brief = getOutreachBrief(...)                       // §7 — REUSE buildIntelligenceBrief:26 + assemblage
    2. GATE = evaluateSend({ tenantId, toAddress, companyId, contactId,
                            isCold:true, interactive:false }) // sending-gate.ts:212 (REUSE, INCHANGÉ)
         send:false → SKIP + export_items{outcome:'skipped', gate_code} ; PAS d'export
         send:true  → continue
    3. project = destination.flatten(brief)                // §6.4 — par destination
    4. destination.push(...)                               // POST tiers
  retour ExportResult
```

> **`evaluateSend` est un ORACLE D'ÉLIGIBILITÉ** ici (« contactable légalement ? »), **pas** un
> envoi (D5). Il tourne **dans** le wrapper → inatteignable depuis le JSON-RPC : un agent externe
> **ne peut pas le bypasser**. `interactive:false` garde la targeting SAFE_MODE active
> (`sending-gate.ts:296-301`) : un compte fraîchement importé/non-revu n'est **pas** exporté.
> Gates traversés (ordre fixe, fail-closed) : opt-out `:216` → suppression DB `:240` →
> email-status `:258` → lawful-basis `:270` → deliverability `:283` → targeting SAFE_MODE `:301` →
> identity/cold/cap `:324` ; `catch` final → `{send:false}` `:339` (zéro fail-open).

### 6.3 Les destinations

| Destination | API à encoder | Clé | REUSE / NET-NEW | j-h |
|---|---|---|---|---|
| **Instantly** | base `https://api.instantly.ai/api/v2`, `Authorization: Bearer <V2>` ; `POST /api/v2/leads` (single) ou `/api/v2/leads/list` (bulk ≤1000) ; `campaign_id` **XOR** `list_id` ; `429` → backoff exp. | per-tenant (`TenantSettings.partnerKeys.instantly`) | REUSE `toInstantlyCustomVariables` (`providers/instantly/send-adapter.ts:19`, **scalaires uniquement** — objets/arrays droppés) ; NET-NEW client + dedup `skip_if_in_workspace:true` | 1.5 |
| **Fiber** | `createAudience`/`addTrackerCompanies` (push d'une audience résolue+scorée à surveiller) | per-tenant `x-api-key` | NET-NEW ; **le brief ne va PAS à Fiber** (il ne sait pas envoyer) — seulement l'audience | 0.5 |
| **Orange Slice** | webhook entrant → custom fields de sheet (endpoints exacts = À CONFIRMER avec une clé) | per-tenant | NET-NEW (flatten partagé avec webhook) | 0.5 |
| **webhook générique** | POST **HMAC-signé** d'une enveloppe portant **à la fois** le map plat (moteurs de template) ET le `brief` complet (agents IA) | secret HMAC per-tenant | NET-NEW ; vendor-neutre (Smartlead/Lemlist/maison) | 0.5 |
| **generic (2e agent)** | renvoie le **brief imbriqué complet** + `citableFacts[]`/`doNotClaim[]` en `structuredContent` ; l'agent écrit+envoie sur sa pile, interroge notre verdict via `evaluate_send` (dry-run) | — | NET-NEW (pas de flatten) | 0.25 |

### 6.4 Mapping brief → custom variables (verrou Instantly, REUSE `send-adapter.ts:19`)

**Contrainte dure :** Instantly V2 `custom_variables` = **map scalaire plat**
(`string|number|boolean|null` ; objets/arrays interdits). Les templates consomment `{{key}}`,
correspondance exacte sensible à la casse. **On n'envoie jamais le brief imbriqué** — sa
**projection scalaire** (`lib/outbound/instantly-map.ts`, flatten pur) :

| Clé Instantly | Source brief (§7) | Flatten |
|---|---|---|
| `email`/`first_name`/`company_name`/`job_title` (natifs) | persona + identity | as-is ; `email` gaté |
| `personalization` (natif) | `messaging.bestAngle` | une phrase d'angle |
| `why_now` | `whyNow.whyNowSummary` | string |
| `signal_type`/`signal_strength` | `whyNow.topSignal.{type,strength}` | string |
| `signal_evidence_url`/`signal_evidence_quote` | `topSignal.evidence.{url,quote}` | url ; quote ≤200c |
| `pain_point_1..3` | `messaging.painPoints[]` | indexé, blank-fill |
| `citable_metric_1..3` | `citableFacts` (type metric) | `"{quote} [{url}]"` |
| `best_angle`/`cta_type`/`max_words`/`tone` | `messaging.{bestAngle,suggestedCta,methodology.maxWords,communicationStyle.tone}` | scalaires |
| `warm_path` | `warmPath.warmthSignals[0].detail` | `"{type}: {detail}"` |
| `firmo_source` | `firmographicProvenance[]` | `"industry:apollo; funding:crunchbase"` |
| `do_not_claim` | `doNotClaim[]` | **string** joint `" \| "` (garde-fou aval) |
| `priority_score` | `whyNow.priorityScore` | number |
| `grounded`/`brief_expires_at` | `meta.{briefCompleteness>0, expiresAt}` | bool / iso |

> **Directive non-négociable :** Elevay/Orion **n'envoie JAMAIS** ses colds via Instantly (conflit
> warmup, mémoire `elevay-own-infra-sending`). Sur ce chemin on ne touche ni `sendViaMailbox` ni
> owner-SMTP : l'envoi est celui d'Instantly, sur les comptes **du client**.

---

## 7. PIPELINE BRIEF

Le brief est l'artefact central (D4). **`draft_outreach` (prose) supprimé** → **`get_outreach_brief`**
(intelligence structurée, zéro `subject`/`body`). L'artefact existe déjà : `IntelligenceBrief`
(REUSE `lib/campaign-engine/types.ts:50`), construit par `buildIntelligenceBrief`
(REUSE `build-intelligence-brief.ts:26`), caché **14 j** (`BRIEF_TTL_DAYS:24`), lu read-only via
`readCachedBrief:190`. `get_outreach_brief` = **wrapper de mise en forme**, pas une nouvelle
intelligence.

### 7.1 Le contrat `OutreachBrief` (NET-NEW `lib/mcp/outreach-brief.ts`, validé zod)

7 sections (provenance complète dans `signal-outreach-brief §1`) :

- **A. `identity`** — firmo + **provenance par champ** (`firmographicProvenance[]{field,provider,atIso}`,
  `types.ts:26-30,72`). Règle : affirmer un chiffre **uniquement** si une provenance le couvre.
- **B. `whyNow`** — `topSignal{type,strength,detectedAt,source,fresh,ttlDays,evidence{url,quote,verified}}`
  (REUSE `SignalEntry` `record-signal.ts:40-45` ; fraîcheur `freshness.ts:98`/`:88` ; un signal
  périmé est **pire** qu'aucun, `freshness.ts:5-8`) ; `priorityScore` + `priorityFactors`
  (`priority-score.ts:70`, floors `:54-55`) ; `whyNowSummary` (NET-NEW, 1 phrase).
- **C. `messaging`** — `bestAngle` (`types.ts:64`), `angleKey` (`signal-opener.ts:135`),
  `angleGuidance` (`SIGNAL_ANGLES outbound-methodologies.ts:159-208`), `painPoints[]`,
  `competitorDetected`, `communicationStyle`, `methodology{name,structure,maxWords,toneNotes,ctaType}`
  (`getMethodology outbound-methodologies.ts:144`), `suggestedCta`, `channel` (défaut **linkedin**),
  `timing{sendWindow,recipientTz,signalFreshUntilIso}`. **Zéro prose.**
- **D. `warmPath`** — `warmthSignals[]{type,detail}` (`WarmthSignal types.ts:122-125`),
  `recommendedPerson` (`personFromSignals record-signal.ts:61` — le producteur du signal, pas le
  top-séniorité par défaut).
- **E. `citableFacts[]` (whitelist) + `doNotClaim[]` (denylist)** — **LA valeur du pivot** : la
  couche anti-hallucination livrée comme **donnée**. `citableFacts` = `publicContent.filter(type==="metric")`
  (cappés 6, `build-intelligence-brief.ts:227-234`) ∪ firmo+provenance (`:238-240`), chacun
  `{fact,value,source,url?,quote?,verified:true}`. `doNotClaim` = `GeneratedOpener.guardrails`
  (`signal-opener.ts:139` = `Methodology.whatNotToDo`) + **dérivés** : tout champ firmo `null` ou
  sans provenance → `"ne pas affirmer {field}"` ; + base constante (`"aucune métrique fabriquée"`,
  `"pas d'effectif non cité"`). C'est l'analogue agent-natif du gate `judgeFabrication`
  (`guardrails/fabrication-gate.ts:173`) transposé en données vers un agent qui n'a pas notre juge.
- **F. `persona`** — `contactId/fullName/title/seniority/departments[]/linkedinUrl`
  (`prospect-context.ts:267-279`) + `reachable{hasEmail,hasPhone,hasLinkedin}`
  (`ContactReachability priority-score.ts:85-89`). `seniority` pilote `getMethodology`.
- **G. `meta`** — `sourcesAttempted/Succeeded`, `sourceErrors[]`, `researchedAt/expiresAt`
  (TTL 14 j), `confidence` (NET-NEW = f(succès, signal frais, provenance)), `briefCompleteness`
  (NET-NEW = ¬`briefIsEmpty build-intelligence-brief.ts:245`), `gate{exportable,verdict}`
  (`evaluateSend` — on ne livre QUE l'autorisé).

### 7.2 Outil MCP `get_outreach_brief`

```ts
GetOutreachBriefInput = z.object({
  subjectType: z.enum(["contact","company"]).default("contact"),
  subjectId: z.string(),
  channel: z.enum(["email","linkedin"]).default("linkedin"),
  refresh: z.boolean().default(false),   // → buildIntelligenceBrief forceRefresh (build-intelligence-brief.ts:30)
  gateCheck: z.boolean().default(true),  // embarque le verdict evaluateSend
});
// out = schéma §7.1 (A-G), validé OutreachBrief zod (autorité serveur) ; renvoyé en structuredContent.
```

> **Grounding (la frontière de vérité n'est PAS le LLM, c'est la liste d'evidence).** Chaîne REUSE
> non-contournable : evidence = faits vérifiés uniquement (`prospectContextToEvidence db-evidence.ts:29`)
> → floor de confiance (`generate-message.ts:185`) → pas d'evidence ⇒ **pas de personnalisation**
> (fallback flaggé `["no-evidence"]`) → anti-fabrication rejette tout id absent (`:158`/`:167`).

### 7.3 Surface MCP (delta sur l'existant `app/api/mcp/route.ts`)

| Point | Modif | Ligne |
|---|---|---|
| `MCP_TOOLS` | + `get_outreach_brief`, `export_to_outbound`, `find_prospects`, `get_signals`, `explain_priority`, `evaluate_send`, `enroll_in_sequence` + ingestion (`ingest_csv`/`ingest_from_provider`/`get_ingest_job`) ; **ajouter `annotations`+`outputSchema`** à tous | `:19` |
| `handleTool` switch | + N cases (wrappers minces 10-40 l → `lib/mcp/*`, `lib/ingest/*`) | `:293` |
| retour `tools/call` | renvoyer `content` (rétro-compat) **+ `structuredContent: result`** (sinon blob opaque — gap P0) | `:957` (actuellement `:953-957` texte seul) |
| `initialize` | **bump `protocolVersion` `"2024-11-05"`→`"2025-06-18"`** (vérifié actuel `:921`) ; `capabilities:{tools,resources}` | `:921`/`:926` |
| routeur méthodes | + `resources/list\|read\|templates` → handlers (dossier prospect) | `:917` |
| POST (conditionnel) | branche upgrade `text/event-stream` pour `get_signals deep` + élicitation — **différable** | `:892` |

> Annotations = **hints non-fiables** (spec MCP) : améliorent l'UX/sûreté de l'agent, ne remplacent
> **jamais** les gates serveur (`evaluateSend`).

---

## 8. CARTE D'INTÉGRATION ELEVAY

`file:line` = chemins réels `app/apps/web/src/...`. « Import-direct » = lecture <1 s, dans le corps
d'une requête. « Event Inngest » = travail long/durable.

| Module Orion | Seam Elevay (`file:line`) | Mécanisme | REUSE / NET-NEW | Comment |
|---|---|---|---|---|
| Client DB | `db/index.ts:1-2,31-32` | import-direct | REUSE | postgres-js + EU guard ; DROP neon |
| RLS tenant | `db/rls.ts:44-54` | import-direct | REUSE | `withTenantTx` transaction-scoped (trap #6) |
| Runner migration | `scripts/apply-migrations.ts:42-103` | CLI | REUSE (renomme table) | `__orion_migrations` |
| Auth | `auth.ts:80-196,227` | import-direct | REUSE | `resolveUserTenant` + DrizzleAdapter `as any` |
| MCP auth Bearer | `app/api/mcp/route.ts:230,249,264` | import-direct | REUSE | `authenticateMcpRequest` → tenantId |
| MCP dispatch | `app/api/mcp/route.ts:19,293,921,957` | import-direct | REUSE + extension | +outils, +structuredContent, bump proto |
| Identité | `db/canonical/upsert.ts:60,108,223` ; `identity.ts:44,67,103,125` | import-direct (dans event) | REUSE | dédup niveau 3 |
| Précédence | `db/canonical/precedence.ts:9,53` | import-direct | REUSE | `pickWinner` ; manual 100 > sirene/zefix 80 > linkedin 55 > apollo 50 > csv 40 > llm 20 |
| Waterfall enrich | `providers/company-enrichment/waterfall.ts:77,148,181` | import-direct (dans event) | REUSE | merge first-non-null, geo-routée |
| Sink signaux | `lib/signals/record-signal.ts:39,61,86` | import-direct | REUSE | `recordCompanySignal` ; `personFromSignals` |
| Taxonomie signaux | `lib/signals/taxonomy.ts` (À CRÉER) | import-direct | **NET-NEW (prérequis dur)** | alias-map canonique — sans lui, multipliers au plancher 1.0× (§4.2 bug) |
| Fraîcheur signaux | `lib/signals/freshness.ts:5-8,31,88,98` | import-direct | REUSE | `isSignalFresh`/`ttlDaysFor` |
| Fit/scoring | `icp/fit-recompute-core.ts:140` ; `scoring/priority-score.ts:54-55,70` | import-direct | REUSE | `scoreCompanyBatch` + `computePriorityScore` |
| Cron score | `inngest/signal-score-daily.ts:70,87,95-108` | event Inngest | REUSE (corriger le bug taxonomie) | pattern 2-arg + concurrency array |
| Brief | `lib/campaign-engine/types.ts:50-75` ; `build-intelligence-brief.ts:24,26,30,190,227-245` | import-direct | REUSE | `buildIntelligenceBrief` + cache 14 j |
| Contexte prospect | `context/prospect-context.ts:138-167,267-279,358` | import-direct | REUSE | firmo + signaux frais + persona |
| Angle / méthodo | `scoring/signal-opener.ts:79,135,139,162` ; `outbound-methodologies.ts:12-21,144,159-208,217` | import-direct | REUSE | `SIGNAL_ANGLES`, `getMethodology`, `pickBestSignal` |
| Anti-fabrication | `guardrails/fabrication-gate.ts:173` ; `db-evidence.ts:6,29` ; `generate-message.ts:158,167,185,204,236` | import-direct | REUSE (→ donnée) | source de `doNotClaim`/`citableFacts` |
| **Gate d'envoi** | `lib/guardrails/sending-gate.ts:212-346` | import-direct (dans wrapper export) | REUSE | oracle d'éligibilité, 8 gates fail-closed |
| Instantly flatten | `providers/instantly/send-adapter.ts:19` | import-direct | REUSE | scalaires uniquement |
| AI provider | `lib/ai/ai-provider.ts:66-86,105-145,186-193,227-270` | import-direct | REUSE | baseURL `/v1`, MODEL_MAP, kill-switch |
| AI tracé | `lib/ai/traced-ai.ts:15,84-100,158,216` | import-direct | REUSE | budget + trace |
| CSV parse | `app/api/import/smart/route.ts:57-101,115,141,256` | import-direct (extraction) | NET-NEW sur REUSE | extraire vers `lib/ingest/csv-parse.ts` ; route → producteur d'event |
| Orchestrateur ingest | pattern `inngest/custom-signal-backfill.ts:29` | event Inngest | NET-NEW sur pattern | 5 stages durables |
| Hookpoint provenance | `inngest/functions.ts:~220` | import-direct | NET-NEW (gap connu #455) | `writeFieldSource` post-enrich |
| Hookpoint signal | `agentic-executor.ts:~240` | import-direct | NET-NEW (gap connu #455) | trigger signal post-import |

**Preuve de plug-sans-rewrite :** on ne réécrit ni le resolver, ni la précédence, ni la waterfall,
ni le sink signaux, ni les scorers, ni les gates, ni le brief, ni le dispatch MCP. Tout le NET-NEW =
**adaptateurs d'entrée/sortie + orchestrateur + couche d'exposition MCP + taxonomie + 2 hookpoints**.

---

## 9. AI / COÛT

Fichiers `lib/ai/ai-provider.ts` (REUSE) + `lib/ai/traced-ai.ts` (REUSE). **AI SDK v6**, pas de Gateway.

- **Provider** : `createAnthropic({ baseURL, apiKey: ANTHROPIC_API_KEY })` en **singleton lazy
  derrière un `Proxy`** (env lu au call-time, `:105-145`). `baseURL` résolu `:66-86` :
  `ANTHROPIC_API_BASE` (allowlist SSRF : EU `https://eu.anthropic.com/v1` ou US
  `https://api.anthropic.com/v1`) → `ANTHROPIC_REGION=eu` → défaut US. **`/v1` OBLIGATOIRE
  (trap #7)** — l'omettre = 404 qui surface en réponse LLM vide.
- **MODEL_MAP** (`:186-193`) : `chat → claude-sonnet-4-6` ; `lightweight → claude-haiku-4-5-20251001` ;
  `embedding → text-embedding-3-small` (OpenAI). `getModelForTask` (`:227-270`) : honore
  `AI_DISABLED=1` (kill-switch, renvoie null) ; circuit-breaker fermé → Anthropic, sinon → OpenAI
  fallback (`gpt-4o`/`gpt-4o-mini`). Mistral EU-souverain opt-in réutilise `createOpenAI` (pas de
  nouvelle dep).
- **Tracé/coût** : `tracedGenerateText`/`tracedGenerateObject` (`:15`) = drop-in autour de l'AI SDK :
  honore `AI_DISABLED` ; **`enforceLlmBudget(tenantId)` AVANT dispatch** (throw `BudgetExceededError`
  au-delà du cap mensuel du tenant, `:91`) ; injecte le prompt versionné ; `recordTrace(...)` au
  finish (coût dérivé de **`agent_traces.estimated_cost`**, pas `llm_calls` — mémoire
  `anthropic-cost-audit`).
- **Usage Orion** : le LLM ne sert qu'à (a) le mapping de colonnes CSV (Haiku, `mapColumnsWithAI`),
  (b) le `whyNowSummary`/compound (Sonnet, mode deep, différable), (c) la recherche groundée
  (`runResearchAgent`). **Tout passe par `traced*`** → budget per-tenant + trace systématiques.
  Orion **ne rédige pas de prose** (D4) → pas de coût `generate-message` body.

---

## 10. PIÈGES PORTÉS + RISQUES

### 10.1 Pièges du backend vérifié (à porter tels quels)

1. **Journal de migration ≠ source de vérité.** Drizzle-kit `migrate` skip les `.sql` non-journalés
   → `db:migrate` câblé `exit 1`, runner custom `apply-migrations.ts` (`__orion_migrations`). Orion
   démarre le journal propre MAIS garde le runner (ré-applications sûres via `IF NOT EXISTS`).
2. **`createFunction` est 2-arg** : triggers DANS le config (`triggers:[{cron|event}]`),
   `concurrency` = **array** (`signal-score-daily.ts:95-108`). Pas la forme 3-arg.
3. **CI gate = `@orion/web` seul** (filtre `pnpm --filter @orion/web`). Un worker/admin ajouté plus
   tard n'est pas typé/testé sans ajouter son filtre.
4. **Junction node_modules divergence** : un worktree à node_modules junctionné peut passer `tsc`
   local et casser en CI (install divergent). CI = `pnpm install --frozen-lockfile` depuis `app/`.
5. **drizzle-orm dual-resolution** : pnpm résout drizzle-orm 2× (direct + peer `@neondatabase`) →
   `pnpm.overrides.drizzle-orm` + `db as any` à l'adapter (`auth.ts:198`). Garder les deux.
6. **postgres-js + Supavisor transaction-mode (6543)** : **jamais** `set_config(..., false)` ;
   tenant context **uniquement** dans `withTenantTx`. Tripwire `rls.test.ts`.
7. **Anthropic baseURL `/v1` obligatoire** (`ai-provider.ts:36-46`).
8. **`@neondatabase/serverless` présent mais inutilisé** chez Elevay → **DROP dans Orion** (D1).
9. **Tailwind 4 config-less** : theme dans `globals.css @theme`, **pas** de `tailwind.config.ts`.
10. **Deux schedulers chez Elevay** (Inngest + crons Vercel) → Orion = **Inngest seul** (D8), pas de
    double-fire.
11. **Split role owner/app** : migrations privilégiées via `DATABASE_URL_OWNER` (role `postgres`,
    hors-bande, 0 hit code) ; app en `orion_app` restreint.

### 10.2 Risques spécifiques Orion (chiffrés)

| Risque | Impact | Mitigation | Coût |
|---|---|---|---|
| **Multipliers au plancher 1.0×** (bug taxonomie #455/`signals-world-class`) | `get_signals.polarity` et priority_score dégradés → brief sans why-now scoré | `taxonomy.ts` (alias-map canonique) **AVANT** d'annoncer le contrat signal | 1.0 j-h (prérequis dur) |
| **Tenant 100 %-CSV sans signaux** | `find_prospects` renvoie priority plancher, pas de why-now | hookpoints provenance + signal post-import (`functions.ts:~220`, `agentic-executor.ts:~240`) DANS le MVP | 1.0 j-h |
| **Instantly scalaire-only** | un brief imbriqué poussé tel quel serait droppé silencieusement | flatten obligatoire `instantly-map.ts` ; `toInstantlyCustomVariables` filtre déjà | inclus 6.3 |
| **Timeout Vercel sur mode deep** (fan-out 3-5 sources + Sonnet, 10-40 s) | requête MCP qui dépasse | job-id + poll (sync) ; SSE `notifications/progress` différé | 2.0 j-h (P2, différable) |
| **Sources Tier 2 fragiles** (User-Agent SEC, latence crt.sh, mapping repo→entreprise) | couverture annoncée non tenue | valider chaque contrainte opérationnelle avant de promettre ; `pull()` ne throw jamais (items partiels) | inclus 5.4 |
| **Vélocité sans historique** | la dérivée (l'EDGE) n'existe pas à J0 | démarrer `signal_snapshots` + cron `velocity-snapshot` **dès le lancement** (le retard est irrattrapable rétroactivement) | inclus §2.6/§4.3 |
| **API partenaires non vérifiées** (Orange Slice endpoints, Lopus API inexistante) | intégration cassée | Orange Slice = flatten partagé webhook (À CONFIRMER avec clé) ; **Lopus exclu en dur** ; `fiberSignalIngestor` normalise tout payload | — |
| **Drift des modules copiés** (Orion ≠ Elevay) | divergence des gates/brief | porter les `*.test.ts` voisins (Vitest) qui figent le comportement | 2.0 j-h (accompagne) |

---

## ANNEXE — Diagramme de flux

```
  ENTRÉE (InputSource — lib/ingest/types.ts NET-NEW)
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  TIER 0/1 (table stakes)        TIER 2 (l'EDGE, hard-to-get, [snap]=historisé) │
  │  csvSource · apolloSource ·     greenhouse/lever/ashby[snap] · edgar[snap] ·   │
  │  waterfallSource · sireneSource bodacc · npm/pypi/github[snap] · techStack[snap]│
  │  fiberSource (data-API input)   · crtsh[snap] · investorOverlap · champion(warm)│
  └───────────────────────────────┬───────────────────────────────────────────────┘
                                   │ pull() paginé → IngestItem[]  (SEUL point spécifique-source)
                                   ▼
  ┌── ORCHESTRATEUR DURABLE  inngest/ingest-run.ts (NET-NEW, clone custom-signal-backfill.ts:29) ──┐
  │  dédup 3 niv (job/item/sujet)                                                                    │
  │  [1] RÉSOUDRE identité   upsert.ts:108/:223 · identity.ts:67   → 1 seul companies.id            │
  │  [2] COMPOSER firmo      waterfall.ts:148 · precedence.ts:53   → account_field_source           │
  │  [3] ACQUÉRIR signaux    record-signal.ts:94                   → properties.signals[]            │
  │  [4] SCORER (ciblé)      fit-recompute-core.ts:140 · priority-score.ts:70                        │
  │       cron velocity-snapshot:4 → signal_snapshots → diff → signal DÉRIVÉ (vélocité = le moat)   │
  └───────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                   ▼
  ┌── COMPOSE BRIEF  lib/mcp/outreach-brief.ts (NET-NEW assemblage) ────────────────────────────────┐
  │  buildIntelligenceBrief:26 (cache 14j) → A identity · B whyNow · C messaging · D warmPath ·     │
  │  E citableFacts[] + doNotClaim[] (anti-hallucination = DONNÉE) · F persona · G meta+gate         │
  └───────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                   ▼
  ┌── SURFACE MCP  app/api/mcp/route.ts (Bearer mcp_* → tenantId ; structuredContent ; proto 2025-06-18) ┐
  │  get_outreach_brief · find_prospects · get_signals · explain_priority · evaluate_send ·          │
  │  enroll_in_sequence · ingest_csv/from_provider/get_ingest_job · export_to_outbound               │
  │  resources: crm://company/{id}/dossier · crm://policy/sending-rules                              │
  └───────────────────────────────┬─────────────────────────────────────────────────────────────┘
              ┌────────────────────┴─────────────────────┐
              ▼                                            ▼
  AGENT EXTERNE (Claude/Cursor/maison)          EXPORT  inngest/export-to-outbound.ts
  consomme le brief, ÉCRIT le mail              ┌──────────────────────────────────────────────────┐
  (Orion ne rédige pas — D4)                    │  pour chaque prospect :                            │
                                                │   GATE evaluateSend:212 (oracle, 8 gates fail-closed)│
                                                │     send:false → SKIP + gate_code ; PAS d'export   │
                                                │     send:true  → flatten → push                    │
                                                │   destinations : Instantly(scalaire send-adapter:19)│
                                                │     · Fiber(audience) · OrangeSlice · webhook(HMAC) │
                                                │     · generic(brief imbriqué + citableFacts/doNotClaim)│
                                                └──────────────────────────────────────────────────┘
   INVARIANT : l'agent pilote QUOI tenter ; il ne décide JAMAIS si ça passe (gate dans le wrapper,
               inatteignable depuis le JSON-RPC). evaluateSend = éligibilité, pas envoi.
```

---

## ANNEXE — Effort agrégé

| Lot | j-h | Inclus MVP |
|---|---|---|
| Bootstrap repo + 22 fichiers config (§1.5) | 2.0 | OUI |
| Schéma : tenants/keys + ingest + export + snapshots + runner (§2) | 2.0 | OUI |
| Auth double canal (§3) | 1.0 | OUI |
| Inngest : ingest-run + score-daily + export (§4.1/4.2/4.4) | 3.0 | OUI |
| **taxonomy.ts (prérequis dur)** (§4.2) | 1.0 | OUI |
| Entrée Tier 0/1 : csv+apollo+waterfall+sirene (§5.3) | 3.5 | OUI |
| Hookpoints provenance + signal post-import (§10.2) | 1.0 | OUI |
| Brief : `get_outreach_brief` + contrat A-G (§7) | 1.5 | OUI |
| Export : `export_to_outbound` + gate + Instantly flatten (§6) | 3.0 | OUI |
| MCP : annotations + outputSchema + structuredContent + proto bump (§7.3) | 1.0 | OUI |
| Tests Vitest portés (dédup, idempotence, précédence, gates fail-closed) | 2.0 | accompagne |
| **Sous-total MVP (CSV→brief→export gaté, sans Tier 2/SSE/Fiber)** | **≈ 21 j-h** | |
| Entrée Tier 2 (ATS/SEC/BODACC/npm/tech/crt.sh) + velocity-snapshot (§5.4/§4.3) | 6.0 | P1 (l'EDGE) |
| Fiber input + export Fiber/OrangeSlice/webhook (§5.5/§6.3) | 2.0 | P1 |
| resources (dossier + sending-rules) + `find_prospects`/`explain_priority`/`enroll` | 3.5 | P1 |
| `get_signals` mode deep + SSE/élicitation | 4.0 | P2 (différable) |
| warm-path (champion/investor k-hop) | 4-6 | P3 |

**Le métier (scoring, grounding, gates, identité, précédence, waterfall, brief) est 100 % REUSE.**
Le NET-NEW se limite à : adaptateurs entrée/sortie, orchestrateur durable, couche d'exposition MCP
(annotations/outputSchema/resources), `taxonomy.ts`, snapshots de vélocité, et 2 hookpoints déjà
identifiés. **Aucun rewrite.**
