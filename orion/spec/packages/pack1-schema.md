# Orion — LOT 1 « Schema + Contrats partagés » · BRIEF DE LOT AUTO-SUFFISANT

> **Tu n'as QUE ce fichier + les docs pointés.** Exécute sans rien redériver. Tous les
> `file:line` Elevay ci-dessous sont la **SOURCE À COPIER** (vérifiés dans le repo Elevay
> `C:/Users/ombel/leads/app/apps/web/`) — provenance, **jamais** un import workspace. Convention : dans
> le **repo Orion séparé** les fichiers vivent sous `src/…` ; un chemin `app/apps/web/src/…` désigne la
> source Elevay à copier depuis.
>
> **Ce que ce lot livre, en une phrase :** les **6 tables net-new** d'Orion (DDL Drizzle + migration
> SQL idempotente + RLS) **ET** les **7 fichiers de contrats partagés** que pack2/3/4/5/6 importent —
> de sorte que **chacun de ces 5 packs `tsc` en n'important QUE des fichiers produits par pack0 +
> pack1** (critère d'acceptation dur, §5.0). pack1 est le **mur porteur** : tant qu'il n'est pas
> mergé, aucun pack parallèle ne compile.
>
> **Docs à (re)lire au besoin — dans cet ordre, SEULEMENT la section utile :**
> - `orion/spec/00-ARCHITECTURE.md` §1 (D4 tables additives, D5 migrations, D7 clés chiffrées), §3 (règles d'or 5/6), **règle 10 accent UI = `#2C6BED`** (voir C9 ci-dessous).
> - `orion/spec/00-EXECUTION-GUIDE.md` §3.1 (ownership pack1), §3.2c (barrel append-only), §4 (versions). **§3.2 plages migration = FAUSSES** (voir C5/C9).
> - `orion/spec/00-PREREQUISITES.md` §«DÉCISIONS DB», GAP-1 (repo Orion séparé + DB partagée), GAP-4 (GRANT/RLS).
> - `orion/spec/requirements.md` REQ-10 / REQ-13 / REQ-14 (DDL + acceptation), REQ-12 (cache briefs).
> - `orion/spec/design.md` §2.6 (DDL net-new), §2.4 (runner), §2.5 (RLS), §5.1 (`IngestItem`/`InputSource`), §6.1 (`OutboundDestination`/`ExportResult`), §7.1 (contrat `OutreachBrief` A-G), §4.2 (bug taxonomie → `taxonomy.ts` prérequis dur).
> - `orion/spec/tasks.md` T-9, T-10, T-11, T-14, T-15, T-36 ; contrats T-21 / T-28 / T-32 ; DDL `signal_snapshots` de T-20.

---

## 0. CORRECTIONS LOAD-BEARING vs les specs (LIS-MOI D'ABORD)

Les specs ont été écrites pour un **repo séparé `orion/`** — **c'est la cible retenue** (repo Orion,
package `@orion/web`, distinct du monorepo Elevay). **Mais la DB reste partagée** (la base `leads`,
Supabase Postgres, scope tenant `elevay`), et **les tables/modules/schéma Elevay qu'Orion utilise sont
COPIÉS** dans le repo Orion (les `file:line` Elevay = provenance). Conséquences **vérifiées sur disque**
(DB partagée + copie) qui **priment** sur le texte littéral de `tasks.md`/`design.md`/`00-EXECUTION-GUIDE.md` :

| # | Ce que la spec dit | **Ce qu'il faut faire (vérifié)** | Preuve |
|---|---|---|---|
| C1 | Mettre les tables export dans `db/schema/outbound.ts` | **COLLISION** — `db/schema/outbound.ts` est **COPIÉ depuis Elevay** (20 tables, requis par les modules copiés). **Crée des fichiers PRÉFIXÉS `orion-`** : `orion-integrations.ts`, `orion-ingest.ts`, `orion-outbound.ts`, `orion-snapshots.ts`. | source Elevay `outbound.ts:36..665` (20 `pgTable`) |
| C2 | `id: text(...).$defaultFn(() => createId())` (cuid2) | **Utilise `crypto.randomUUID()`** — convention Elevay partout. N'ajoute **pas** `@paralleldrive/cuid2`. | `db/schema/agent.ts:32` `…$defaultFn(() => crypto.randomUUID())` |
| C3 | `tenants` à (re)définir avec `$type<TenantSettings>` + `mcpApiKeys` (T-9) | **`tenants` est COPIÉ depuis Elevay** (`core.ts:20`, `settings jsonb default({})` non typé) par pack0. **NE LE REDÉFINIS PAS.** Le home des clés partenaires de CE lot = la table net-new `integration_credentials`, **pas** `tenants.settings.partnerKeys`. | source `core.ts:20-24` |
| C4 | Table de migration `__orion_migrations` (00-ARCHITECTURE §D5) | **Superseded par la DB partagée** : le runner `scripts/apply-migrations.ts` est **copié depuis Elevay** et le ledger reste **`__elevay_migrations`** (c'est la table de tracking de la DB partagée). **Ne crée PAS** de 2e runner ni de 2e table de tracking. | source `scripts/apply-migrations.ts:52` `__elevay_migrations` ; `package.json` `db:migrate:apply` |
| C5 | Numérotation migration `pack1 0010–0029` (EXECUTION-GUIDE §3.2) | **Collision DB partagée** : le ledger `__elevay_migrations` de la DB partagée va déjà jusqu'à **`0106_linkedin_inbound_enums.sql`**. pack1 = **`0107_orion_schema.sql`** ; pack7 = **`0108+`**. La plage `0010–0029` (modèle naïf de la spec) est **FAUSSE** : la numérotation continue à partir de 0107 (0106 = dernière existante). | DB partagée : dernière migration `0106_…` |
| C6 | Secret chiffré = objet `{iv, ciphertext, tag}` (design §2.3) | **Utilise `encryptSecret(plaintext): string` / `decryptSecret(encoded): string`** — l'helper réel renvoie **une seule chaîne encodée** → tient dans une colonne `text`. | `lib/crypto/settings-encryption.ts:49` / `:65` / `:90` |
| C7 | dev = `drizzle-kit push` (CLAUDE.md) | Sur la **DB partagée**, `db:push` diff **tout** le schéma Elevay et peut proposer des changements destructifs. **Applique plutôt le `.sql` additif via `db:migrate:apply` sur `leadsens-localdev`** (idempotent, net-new seulement). `db:push` toléré seulement si le diff ne concerne **que** les 6 tables Orion. | `package.json` `db:push`/`db:migrate:apply` |
| **C8** | EXECUTION-GUIDE §3.1 : pack1 possède `lib/guardrails/sending-gate.ts (réexport evaluateSend)` | **COLLISION** — `lib/guardrails/sending-gate.ts` est la **copie Elevay** vivante dans Orion (`evaluateSend` à `:212`, copié avec les modules). On **ne le re-modifie pas**. Le wrapper Orion = un **fichier neuf** `lib/guardrails/orion-send-gate.ts` qui **réexporte** `evaluateSend` + ses types depuis la copie. Idem `campaign-engine/brief.ts` = fichier neuf qui réexporte `buildIntelligenceBrief`/`readCachedBrief` du fichier copié. | source `lib/guardrails/sending-gate.ts:212` (`export evaluateSend`) |
| **C9** | 00-ARCHITECTURE règle 10 : accent UI `#3D99F5` ; EXECUTION-GUIDE §3.2 plages migration | **Hors-périmètre code de ce lot, mais à corriger dans les docs** : (a) accent **app = `#2C6BED`** ; `#3D99F5` est la valeur **scopée `.inbox-shell`** (upstream), **erronée** comme accent app → corriger 00-ARCHITECTURE règle 10. (b) plages migration de la spec (`0001-0009`/`0010-0029`/`0090+`) FAUSSES (DB partagée → continue à 0107, 0106 = dernière existante) → corriger 00-EXECUTION-GUIDE (cf. C5). (c) toute mention `__drizzle_migrations`/`__orion_migrations` → `__elevay_migrations` (cf. C4). | mémoire `upstream-design-dna` ; `apply-migrations.ts:52` |

Si une instruction de `tasks.md`/`design.md`/`00-EXECUTION-GUIDE.md` contredit ce tableau, **ce tableau
gagne** (il est vérifié contre le code réel).

---

## 1. OBJECTIF + PÉRIMÈTRE

**Objectif.** Deux livrables indissociables :

**(I) Schéma.** Ajouter, **en additif** au schéma Drizzle partagé d'Elevay, les **6 tables net-new**
d'Orion, leur **migration SQL idempotente** (RLS pour `elevay_app`), les **réexports barrel**, et
**appliquer sur la DB dev** (`leadsens-localdev`). Zéro `ALTER`/`DROP` sur une table Elevay existante.

**(II) Contrats partagés.** **Produire** les **7 fichiers** contre lesquels les 5 packs parallèles
codent et mockent. Sans eux, pack2/3/4/5/6 importent des modules **sans producteur → ne `tsc` pas**.
Ces fichiers étaient listés «siblings/hors-scope» dans la v1 de ce brief : **c'était le bug d'audit
#1**. Ils sont désormais **possédés ET produits par pack1**.

**IN (ce lot possède, crée et applique) :**

*Schéma Elevay COPIÉ (sous-ensemble requis par les modules vendorés) :*
0. Le **sous-ensemble de schéma business Elevay** que les modules copiés utilisent est **COPIÉ
   (vendoré)** dans le repo Orion, **pas importé via workspace** — la DDL Drizzle doit **matcher
   exactement** les colonnes des tables de la DB partagée (aucune de ces tables n'est re-migrée : la DB
   partagée les a déjà). **Frontière de copie** (pour éviter qu'un fichier soit copié 2×) : `core.ts`
   (→ `tenants`/`companies`/`contacts`), `canonical.ts`, `auth.ts` sont **copiés par pack0** (foundational,
   pack0 doit merger en 1er) ; **CE lot copie tout schéma module-spécifique non couvert par pack0** —
   p.ex. la table cache `intelligence_briefs` (`build-intelligence-brief.ts:2`) et les priors/alias
   `lib/scoring/signal-outcomes.ts` (étendus par `taxonomy.ts`, étape 8) — et **garantit que les modules
   copiés compilent contre ce schéma**.

*Tables & migration (net-new, ajoutées en additif à la DB partagée) :*
1. `integration_credentials` — clés partenaires per-tenant **chiffrées au repos** (entrée + sortie). *(REQ-10, T-9)*
2. `ingest_jobs` + `ingest_items` — orchestration + ledger d'ingestion (dédup niveaux 1 & 2). `ingest_jobs` porte une colonne discriminante `kind` (`'ingest'|'discovery'`) + une colonne `result` jsonb dans laquelle `getJob` renvoie le payload (`result.discovery` = sortie du moteur offline-discovery de pack2, lue par pack7 via `get_ingest_job`). *(REQ-13, T-10)*
3. `outbound_destinations` + `export_jobs` + `export_items` — registre des cibles + traçabilité des handoffs gatés. *(REQ-14, T-11)*
4. `signal_snapshots` — historique pour la **vélocité** (la dérivée, l'EDGE). **Table seulement** ; le cron `velocity-snapshot` est pack5. *(DDL de T-20)*
5. Le **barrel** `db/schema.ts` : 4 lignes de réexport (zone append).
6. La **migration** `drizzle/0107_orion_schema.sql` + application dev via `db:migrate:apply`.

*Contrats partagés (les 7 fichiers — §4 partie B) :*
7. `lib/signals/taxonomy.ts` — **NET-NEW** (n'existe PAS chez Elevay) : vocab **SCORING** (`SignalType`, `signal-detectors.ts:16-22`) + ALIAS map + `toCanonicalSignal()`. *(T-14 ; corrige le bug multipliers-au-plancher, design §4.2)*
8. `lib/ingest/types.ts` — `IngestItem` / `InputSource` (+ `IngestSource` alias). *(contrat de T-21)*
9. `lib/ingest/jobs.ts` — `openIngestJob` / `getJob` / `bumpJobCounters`. *(helper d'ownership pack1, PAS pack2/4/5)*
10. `lib/outbound/types.ts` — `OutboundDestination` / `ExportResult`. *(contrat de T-32)*
11. `lib/mcp/contracts/outreach-brief.schema.ts` — **zod** du brief (sections A-G, `citableFacts[]`/`doNotClaim[]`). *(contrat de T-28)*
12. `lib/campaign-engine/brief.ts` — **wrapper** réexport `buildIntelligenceBrief`/`readCachedBrief` + cache `intelligence_briefs`. *(T-15 / REQ-12)*
13. `lib/guardrails/orion-send-gate.ts` — **wrapper** réexport `evaluateSend` + types (C8). *(T-36)*

**OUT (possédé par d'autres lots — NE PAS toucher) :**
- `tenants`, `companies`, `contacts`, `*_field_source`, `account_field_source` (`core.ts`, `canonical.ts`) → **copiés par pack0** (foundational, pack0 merge en 1er). Le schéma module-spécifique restant (p.ex. cache `intelligence_briefs`) est copié par **CE lot** (IN item 0). Tous importés par alias `@/…`, **jamais redéfinis ni re-migrés** (la DB partagée les a déjà).
- `db/schema/auth.ts`, `db/index.ts`, `db/rls.ts`, `scripts/apply-migrations.ts`, `drizzle.config.ts`, `lib/mcp/registry.ts`, `lib/mcp/types.ts`, squelette `app/api/mcp/route.ts` (+ balises `<<<ORION:*>>>`) → **pack0** (copiés/posés tel quel ; voir C8/§7 pour la frontière MCP).
- Implémentations consommatrices : `lib/ingest/sources/*`, `lib/ingest/csv-parse.ts`, `lib/ingest/score-touched.ts`, `lib/ingest/mcp-handlers.ts`, tous les `inngest/*`, adaptateurs export `lib/outbound/destinations/*`, `lib/mcp/outreach-brief.ts` → **pack2/3/4/5**. Ce lot ne livre **que** le DDL + les contrats que ces lots consomment.

**Dépendances dures :** **pack0 doit être mergé** (fournit `db/index.ts` driver postgres-js, `db/rls.ts`
`withTenantTx`, `scripts/apply-migrations.ts`, le barrel `db/schema.ts` + sa zone append, `drizzle.config.ts`,
`lib/mcp/{registry,types}.ts`, squelette route MCP avec balises). Rien d'autre.

**Completeness target : 10/10** — toutes les colonnes, tous les `uniqueIndex`, RLS sur chaque table,
idempotence, `tenant_id` nullable géré (lignes globales `signal_snapshots`), **et** les 7 contrats
typés/validés contre lesquels les 5 packs aval compilent.

---

## 2. PRÉREQUIS (à confirmer AVANT de coder)

1. **pack0 mergé** sur `main` : `git log --oneline | grep pack0` non vide ; `db/rls.ts` exporte `withTenantTx` (`:44`), `scripts/apply-migrations.ts` existe (`:52` table `__elevay_migrations`), barrel `db/schema.ts` présent avec zone `// <<< ORION:SCHEMA … >>>` (sinon append en fin, étape 6), `lib/mcp/types.ts` exporte `McpToolModule`/`ToolDef`.
2. **Cartes 00-PREREQUISITES nécessaires :** GAP-1 reco **A** (même runner, même `__elevay_migrations` → C4) ; GAP-4 (GRANT/RLS `elevay_app` par table net-new → étape 5 + VERIFY runtime) ; pièges #5 (runner custom, `db:migrate` exit 1), #2/#6 (RLS `set_config(...,true)` **seulement** — jamais `…,false`), #10 (`DATABASE_URL_OWNER` opérateur-only, 0 hit `src`).
3. **Env dev :** `DATABASE_URL` → `leadsens-localdev` (rôle app `elevay_app`) ; `DATABASE_URL_OWNER` → rôle `postgres` (pour `db:migrate:apply` uniquement, hors-bande). Boot minimal = `DATABASE_URL` + `AUTH_SECRET` + `ANTHROPIC_API_KEY`.
4. **Helpers/seams COPIÉS depuis Elevay** (réexportés par les wrappers, non re-modifiés ; `file:line` = source à copier) :
   - `lib/crypto/settings-encryption.ts` (`encryptSecret:49`, `decryptSecret:65`, `verifyCiphertextIntegrity:90`).
   - `db/rls.ts:44` `withTenantTx`.
   - `lib/guardrails/sending-gate.ts` : `evaluateSend:212`, `EvaluateSendArgs:166`, `SendingGateOutcome:56` (union `{send:true,…}|{send:false,code,reason}`).
   - `lib/campaign-engine/build-intelligence-brief.ts` : `buildIntelligenceBrief:26`, `readCachedBrief:190` ; type `IntelligenceBrief` (`campaign-engine/types.ts:50`) ; cache table `intelligenceBriefs` (importée `build-intelligence-brief.ts:2`).
   - `lib/signals/record-signal.ts` : `recordCompanySignal:94`, `personFromSignals:61`, `SignalEntry:39`.
   - `lib/scoring/signal-outcomes.ts` : `SIGNAL_CANONICAL_ALIAS:119`, `SIGNAL_PRIORS:59`, `priorMultiplier:95` (à **étendre** dans `taxonomy.ts`, pas réécrire).

---

## 3. FICHIERS POSSÉDÉS PAR CE LOT (zéro chevauchement)

| Fichier | Statut | Note |
|---|---|---|
| **— Tables & migration —** | | |
| `src/db/schema/orion-integrations.ts` | **NET-NEW** | `integration_credentials` |
| `src/db/schema/orion-ingest.ts` | **NET-NEW** | `ingest_jobs`, `ingest_items` |
| `src/db/schema/orion-outbound.ts` | **NET-NEW** | `outbound_destinations`, `export_jobs`, `export_items` (préfixe `orion-` car `outbound.ts` est pris, C1) |
| `src/db/schema/orion-snapshots.ts` | **NET-NEW** | `signal_snapshots` |
| `src/db/schema.ts` | **MODIFY** (append-only, 4 lignes) | barrel — n'ajoute QUE tes 4 `export *`, ne réordonne rien (§3.2c) |
| `drizzle/0107_orion_schema.sql` | **NET-NEW** | migration additive idempotente + RLS |
| **— Contrats partagés —** | | |
| `src/lib/signals/taxonomy.ts` | **NET-NEW** | vocab SCORING (`SignalType`) + alias (Elevay + pack5) + `toCanonicalSignal()` |
| `src/lib/ingest/types.ts` | **NET-NEW** | `IngestItem`, `InputSource`, `IngestSource`, `PullCtx`, `PullResult` |
| `src/lib/ingest/jobs.ts` | **NET-NEW** | `openIngestJob`, `getJob`, `bumpJobCounters` |
| `src/lib/outbound/types.ts` | **NET-NEW** | `OutboundDestination`, `ExportResult` (dir `lib/outbound/` existe — n'écrase PAS `queue.ts`) |
| `src/lib/mcp/contracts/outreach-brief.schema.ts` | **NET-NEW** | zod `OutreachBriefSchema` + `type OutreachBrief` |
| `src/lib/campaign-engine/brief.ts` | **NET-NEW** | wrapper réexport brief + cache |
| `src/lib/guardrails/orion-send-gate.ts` | **NET-NEW** | wrapper réexport `evaluateSend` (C8) |
| **— Tests (fichiers NOMMÉS — ownership par fichier, PAS un glob, blocker #4) —** | | |
| `src/__tests__/orion-schema-credentials.test.ts` | **NET-NEW** | chiffrement + colonnes + barrel |
| `src/__tests__/orion-schema-ingest-dedup.test.ts` | **NET-NEW** | dédup niveaux 1 & 2 |
| `src/__tests__/orion-schema-export.test.ts` | **NET-NEW** | export + gate_code |
| `src/__tests__/orion-schema-snapshots.test.ts` | **NET-NEW** | snapshots + global tenant NULL |
| `src/__tests__/orion-taxonomy.test.ts` | **NET-NEW** | canonicalisation alias (Elevay + pack5) |
| `src/__tests__/orion-contracts.test.ts` | **NET-NEW** | zod `OutreachBrief` + réexports wrappers + `openIngestJob` |

> **Ownership tests (blocker #4) :** pack1 écrit **uniquement ces 6 fichiers nommés** dans `src/__tests__/`.
> pack0/pack3/pack5 y écrivent **d'autres fichiers nommés distincts**. Personne ne possède `src/__tests__/*`
> en glob → pas de collision. `git add` toujours scopé aux fichiers du lot, jamais `src/__tests__` entier.

**COPIÉS depuis Elevay (réexportés, jamais re-modifiés) :** voir §2.4. Plus `db/index.ts` (`db`), `db/schema/core.ts:20`
(`tenants` — FK `tenant_id`).

---

## 4. ÉTAPES ORDONNÉES (action → code → VERIFY → TEST)

> Branche : `feat/orion-pack1` (ou worktree dédié). Re-vérifie `git rev-parse --abbrev-ref HEAD` **avant
> chaque commit** (repo Orion, sessions concurrentes). Pathspecs scopés, **jamais `git add -A`**.
> Trailer de commit obligatoire (§DoD).
>
> **Ordre :** PARTIE A (tables) d'abord — les contrats `ingest/jobs.ts` et `campaign-engine/brief.ts`
> dépendent des tables. PARTIE B ensuite.

---

### PARTIE A — Tables, migration, barrel

#### Étape 1 — `orion-integrations.ts` : `integration_credentials`
**Action.** Crée `src/db/schema/orion-integrations.ts`. ID = `crypto.randomUUID()` (C2), `tenantId` text FK → `tenants.id`, clé chiffrée en `text` (C6), uniqueIndex `(tenantId, provider)`.

```ts
// src/db/schema/orion-integrations.ts — NET-NEW (Orion lot schema)
import { pgTable, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./core";                       // COPIÉ depuis Elevay (source core.ts:20)

export const integrationCredentials = pgTable("integration_credentials", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  provider: text("provider").notNull(),                 // sinks de SORTIE: 'instantly'|'orange_slice'|'lopus'|'webhook' · sources d'ENTRÉE: 'fiber'|'apollo'|'hunter'|'pappers'
  encryptedApiKey: text("encrypted_api_key"),           // encryptSecret(...) — JAMAIS en clair (C6)
  config: jsonb("config").$type<Record<string, unknown>>().default({}), // baseUrl|webhookUrl|webhookSecret|defaultCampaignId
  status: text("status").notNull().default("active"),   // 'active'|'revoked'|'error'
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ tenantProviderUx: uniqueIndex("ic_tenant_provider_ux").on(t.tenantId, t.provider) }));
```
**VERIFY.** `cd app && pnpm --filter @orion/web tsc` vert.
**TEST** (`orion-schema-credentials.test.ts`) : round-trip chiffrement — `encryptSecret('sk-live-X')` puis `decryptSecret(stored) === 'sk-live-X'` **ET** `stored !== 'sk-live-X'` ; `getTableColumns(integrationCredentials)` contient `encrypted_api_key`, `tenant_id`, `provider`.

#### Étape 2 — `orion-ingest.ts` : `ingest_jobs` + `ingest_items`
**Action.** Crée `src/db/schema/orion-ingest.ts`. Dédup niveau 1 = uniqueIndex `(tenantId, fingerprint)` ; niveau 2 = uniqueIndex `(jobId, sourceRef)`.

```ts
// src/db/schema/orion-ingest.ts — NET-NEW
import { pgTable, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const ingestJobs = pgTable("ingest_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  sourceName: text("source_name").notNull(),            // 'csv'|'apollo_people'|'waterfall'|'fiber'…
  sourceKind: text("source_kind").notNull(),            // 'file'|'provider'
  kind: text("kind").notNull().default("ingest"),       // 'ingest'|'discovery' — discriminant de job (pack2 discovery, pack7 lit result.discovery)
  fingerprint: text("fingerprint").notNull(),           // sha256(entrée) → dédup niveau 1
  status: text("status").notNull().default("queued"),   // queued|running|done|error
  totalEstimate: integer("total_estimate"),
  pulled: integer("pulled").default(0),
  resolved: integer("resolved").default(0),
  created: integer("created").default(0),
  merged: integer("merged").default(0),
  skipped: integer("skipped").default(0),
  signals: integer("signals").default(0),
  scored: integer("scored").default(0),
  options: jsonb("options").$type<Record<string, unknown>>().default({}),
  result: jsonb("result").$type<{ discovery?: unknown; [k: string]: unknown }>(), // payload de sortie ; result.discovery = sortie du moteur offline-discovery (pack2), lue par pack7 via get_ingest_job
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ jobUx: uniqueIndex("ingest_jobs_tenant_fp_ux").on(t.tenantId, t.fingerprint) }));

export const ingestItems = pgTable("ingest_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  jobId: text("job_id").notNull().references(() => ingestJobs.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  sourceRef: text("source_ref").notNull(),              // 'row:42' | apollo id → dédup niveau 2
  subjectKind: text("subject_kind").notNull(),          // 'company'|'person'
  resolvedId: text("resolved_id"),                      // companies.id|contacts.id après merge
  outcome: text("outcome"),                             // 'created'|'merged'|'skipped'|'error'
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ itemUx: uniqueIndex("ingest_items_job_ref_ux").on(t.jobId, t.sourceRef) }));
```
**VERIFY.** `tsc` vert ; après migration (étape 7) : deux `INSERT … ON CONFLICT (tenant_id, fingerprint) DO UPDATE` du même fingerprint → 1 ligne ; rejouer un `(jobId, sourceRef)` `ON CONFLICT DO NOTHING` → 0 dup.
**TEST** (`orion-schema-ingest-dedup.test.ts`) : intégration gardé `DATABASE_URL` (sinon `describe.skip`) sous `withTenantTx(elevayTenantId, …)` — 2× le même `(tenant_id, fingerprint)` via `onConflictDoUpdate` → `count(*)`=1 ; 2× le même `(job_id, source_ref)` via `onConflictDoNothing` → count=1. + test pur : `getTableColumns(ingestJobs)` contient les 8 compteurs.

#### Étape 3 — `orion-outbound.ts` : `outbound_destinations` + `export_jobs` + `export_items`
**Action.** Crée `src/db/schema/orion-outbound.ts` (**pas** `outbound.ts`, C1). uniqueIndex export = `(exportJobId, prospectId)`.

```ts
// src/db/schema/orion-outbound.ts — NET-NEW
import { pgTable, text, integer, boolean, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./core";
import { integrationCredentials } from "./orion-integrations";

export const outboundDestinations = pgTable("outbound_destinations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  kind: text("kind").notNull(),                         // SINK de SORTIE seulement : 'instantly'|'orange_slice'|'lopus'|'webhook'|'generic' (Fiber = ENTRÉE, jamais ici)
  label: text("label"),
  config: jsonb("config").$type<Record<string, unknown>>().default({}), // campaignId|listId|webhookUrl
  credentialId: text("credential_id").references(() => integrationCredentials.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exportJobs = pgTable("export_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  destinationId: text("destination_id").references(() => outboundDestinations.id),
  destinationKind: text("destination_kind").notNull(),
  requested: integer("requested").default(0),
  exported: integer("exported").default(0),
  skipped: integer("skipped").default(0),              // gate-rejected → JAMAIS poussés
  duplicates: integer("duplicates").default(0),
  dryRun: boolean("dry_run").default(false),
  result: jsonb("result").$type<{
    exported: { prospectId: string; externalId?: string }[];
    skipped: { prospectId: string; code: string; reason: string }[];
  }>(),
  status: text("status").notNull().default("running"),  // running|done|error
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exportItems = pgTable("export_items", {     // grain prospect (audit ligne-à-ligne / GDPR)
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  exportJobId: text("export_job_id").notNull().references(() => exportJobs.id),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  prospectId: text("prospect_id").notNull(),
  outcome: text("outcome").notNull(),                  // exported|skipped|duplicate|error
  gateCode: text("gate_code"),                         // si skipped : code SendingGateOutcome (not_targeted, opted_out…)
  externalId: text("external_id"),                     // instantlyLeadId, etc.
  reason: text("reason"),
}, (t) => ({ jobProspectUx: uniqueIndex("export_items_job_prospect_ux").on(t.exportJobId, t.prospectId) }));
```
> `gate_code` stocke un code du `SendingGateOutcome` Elevay (`sending-gate.ts:56` : `opted_out|suppressed|invalid_email|lawful_basis_blocked|not_targeted|deliverability_paused|…`).
**VERIFY.** `tsc` vert ; après migration : `export_jobs{requested:3,exported:2,skipped:1}` + 3 `export_items` dont 1 `outcome:'skipped', gate_code:'not_targeted'` → relecture OK.
**TEST** (`orion-schema-export.test.ts`) : intégration gardé — export 3 prospects dont 1 `unreviewed` → `export_jobs.skipped=1`, l'`export_items` correspondant a `gate_code='not_targeted'` ; uniqueIndex `(export_job_id, prospect_id)` empêche le double. + test pur : colonnes.

#### Étape 4 — `orion-snapshots.ts` : `signal_snapshots`
**Action.** Crée `src/db/schema/orion-snapshots.ts`. **`tenantId` NULLABLE** (lignes globales partagées npm/PyPI/SEC) → **pas** de `.notNull()`, **pas** de FK obligatoire. Index `(subjectKey, source, metric, observedAt DESC)`.

```ts
// src/db/schema/orion-snapshots.ts — NET-NEW (l'EDGE : la dérivée = vélocité)
import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const signalSnapshots = pgTable("signal_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id"),                          // NULL = snapshot global partagé (npm/PyPI/SEC)
  subjectKey: text("subject_key").notNull(),            // domaine|repo|package|CIK
  source: text("source").notNull(),                     // greenhouse|lever|ashby|npm|pypi|builtwith|crtsh|edgar
  metric: text("metric").notNull(),                     // open_roles|weekly_downloads|tech_set_hash|subdomain_set
  value: jsonb("value").notNull(),                      // scalaire ou set (pour diff)
  observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  bySubject: index("snap_subject_source_metric_time").on(t.subjectKey, t.source, t.metric, t.observedAt.desc()),
}));
```
> N.B. `tenant_id` est `text` (cohérent avec `tenants.id` text), **pas** `uuid` — la DDL `uuid` de `design.md §2.6`/`tasks.md T-20` supposait une DB dédiée. **La DB reste partagée**, donc `text` (FK vers `tenants.id` text copié) est obligatoire.
**VERIFY.** `tsc` vert ; après migration : 2 snapshots ATS (J0 open_roles=5, J+21 open_roles=9), `ORDER BY observed_at DESC LIMIT 2` → diff = +4.
**TEST** (`orion-schema-snapshots.test.ts`) : intégration gardé — insérer une ligne `tenant_id=NULL` **sous** `withTenantTx(elevay…)` → lecture OK (policy RLS autorise `tenant_id IS NULL`). + test pur : colonnes.

#### Étape 5 — Migration `drizzle/0107_orion_schema.sql` (additive + idempotente + RLS)
**Action.** Crée `app/apps/web/drizzle/0107_orion_schema.sql`. **Tout en `IF NOT EXISTS`** ; RLS sur chaque table en calquant l'idiom Elevay vérifié (`drizzle/0089_suppression.sql:25-38`). Les `id text` portent un `DEFAULT gen_random_uuid()::text` (permet les `INSERT` SQL bruts des tests).

```sql
-- 0107_orion_schema.sql — Orion lot « Schema ». Additif + idempotent. Tables net-new,
-- toutes tenant_id-scopées, RLS app.tenant_id (idiom 0089_suppression.sql). Aucun ALTER/DROP Elevay.

-- 1. integration_credentials -------------------------------------------------
CREATE TABLE IF NOT EXISTS integration_credentials (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id         text NOT NULL REFERENCES tenants(id),
  provider          text NOT NULL,
  encrypted_api_key text,
  config            jsonb DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'active',
  last_verified_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ic_tenant_provider_ux ON integration_credentials (tenant_id, provider);

-- 2. ingest_jobs / ingest_items ----------------------------------------------
CREATE TABLE IF NOT EXISTS ingest_jobs (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id      text NOT NULL REFERENCES tenants(id),
  source_name    text NOT NULL,
  source_kind    text NOT NULL,
  kind           text NOT NULL DEFAULT 'ingest',   -- 'ingest'|'discovery' — discriminant (pack2 discovery ; pack7 lit result.discovery)
  fingerprint    text NOT NULL,
  status         text NOT NULL DEFAULT 'queued',
  total_estimate integer,
  pulled integer DEFAULT 0, resolved integer DEFAULT 0, created integer DEFAULT 0,
  merged integer DEFAULT 0, skipped integer DEFAULT 0, signals integer DEFAULT 0,
  scored integer DEFAULT 0,
  options        jsonb DEFAULT '{}'::jsonb,
  result         jsonb,                            -- payload de sortie ; result.discovery = sortie offline-discovery
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ingest_jobs_tenant_fp_ux ON ingest_jobs (tenant_id, fingerprint);

CREATE TABLE IF NOT EXISTS ingest_items (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  job_id       text NOT NULL REFERENCES ingest_jobs(id),
  tenant_id    text NOT NULL REFERENCES tenants(id),
  source_ref   text NOT NULL,
  subject_kind text NOT NULL,
  resolved_id  text,
  outcome      text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ingest_items_job_ref_ux ON ingest_items (job_id, source_ref);

-- 3. outbound_destinations / export_jobs / export_items ----------------------
CREATE TABLE IF NOT EXISTS outbound_destinations (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     text NOT NULL REFERENCES tenants(id),
  kind          text NOT NULL,
  label         text,
  config        jsonb DEFAULT '{}'::jsonb,
  credential_id text REFERENCES integration_credentials(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id               text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id        text NOT NULL REFERENCES tenants(id),
  destination_id   text REFERENCES outbound_destinations(id),
  destination_kind text NOT NULL,
  requested integer DEFAULT 0, exported integer DEFAULT 0,
  skipped integer DEFAULT 0, duplicates integer DEFAULT 0,
  dry_run boolean DEFAULT false,
  result   jsonb,
  status   text NOT NULL DEFAULT 'running',
  error    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_items (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  export_job_id text NOT NULL REFERENCES export_jobs(id),
  tenant_id     text NOT NULL REFERENCES tenants(id),
  prospect_id   text NOT NULL,
  outcome       text NOT NULL,
  gate_code     text,
  external_id   text,
  reason        text
);
CREATE UNIQUE INDEX IF NOT EXISTS export_items_job_prospect_ux ON export_items (export_job_id, prospect_id);

-- 4. signal_snapshots (tenant_id NULLABLE = global) --------------------------
CREATE TABLE IF NOT EXISTS signal_snapshots (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   text,                         -- NULL = global (npm/PyPI/SEC)
  subject_key text NOT NULL,
  source      text NOT NULL,
  metric      text NOT NULL,
  value       jsonb NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS snap_subject_source_metric_time
  ON signal_snapshots (subject_key, source, metric, observed_at DESC);

-- 5. RLS — idiom 0089_suppression.sql:25-38 (tenant_id NULL global toléré) ----
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'integration_credentials','ingest_jobs','ingest_items',
    'outbound_destinations','export_jobs','export_items','signal_snapshots'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation_%I ON %I FOR ALL
      USING (
        (NULLIF(current_setting('app.tenant_id', true), '') IS NULL)
        OR (tenant_id IS NULL)
        OR (tenant_id = current_setting('app.tenant_id', true))
      )
      WITH CHECK (
        (NULLIF(current_setting('app.tenant_id', true), '') IS NULL)
        OR (tenant_id IS NULL)
        OR (tenant_id = current_setting('app.tenant_id', true))
      )$f$, t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO elevay_app', t);  -- GAP-4 ; idempotent
  END LOOP;
END $$;
```
> **Note GRANT** : si le rôle `elevay_app` n'existe pas sur `leadsens-localdev`, enveloppe le GRANT dans `IF EXISTS (SELECT FROM pg_roles WHERE rolname='elevay_app')` ou retire-le pour le dev (la VERIFY runtime tranchera, GAP-4).

**VERIFY.** `pnpm db:migrate` → **exit 1** (attendu, piège #5). Lecture de `0089_suppression.sql` confirme l'idiom RLS copié.
**TEST.** Couvert par l'idempotence (étape 7) + les tests d'intégration des étapes 1-4.

#### Étape 6 — Barrel `db/schema.ts` (append-only, 4 lignes)
**Action.** Ajoute **uniquement** ces 4 réexports, dans la zone `// <<< ORION:SCHEMA … >>>` posée par pack0 (sinon append en fin sous `// --- Orion (lot schema) ---`). Ne réordonne **rien**.

```ts
// --- Orion (lot schema) — append-only ---
export * from "./schema/orion-integrations";
export * from "./schema/orion-ingest";
export * from "./schema/orion-outbound";
export * from "./schema/orion-snapshots";
```
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `import * as schema from "@/db/schema"` expose `integrationCredentials`, `ingestJobs`, `ingestItems`, `outboundDestinations`, `exportJobs`, `exportItems`, `signalSnapshots`.
**TEST** (`orion-schema-credentials.test.ts`, bloc « barrel ») : import des 7 tables depuis `@/db/schema` → tous `!== undefined`.

#### Étape 7 — Appliquer sur la DB dev (`leadsens-localdev`) + idempotence
**Action.** `DATABASE_URL` pointe `leadsens-localdev`. Applique via le runner (C7 — **pas** `drizzle-kit push`) :
```sh
cd app/apps/web
pnpm db:migrate:apply          # tsx scripts/apply-migrations.ts → applique 0107, INSERT __elevay_migrations
pnpm db:migrate:apply          # 2e run = 0 changement (IF NOT EXISTS + tracking sha256)
```
**VERIFY (preuve concrète) :**
- `pnpm db:migrate` → exit **1** (piège #5).
- 1er apply : « applied 0107_orion_schema.sql » ; 2e : « already applied / skip ».
- `SELECT count(*) FROM __elevay_migrations WHERE filename='0107_orion_schema.sql'` → **1**.
- `SELECT to_regclass('public.signal_snapshots')` (et les 6 autres) → non NULL.
- **GAP-4 runtime** : sous `elevay_app`, `withTenantTx(elevayTenantId, tx => tx.insert(integrationCredentials)…)` réussit ; si `permission denied` → ajuster le GRANT (étape 5) et ré-appliquer.

---

### PARTIE B — Contrats partagés (les 7 fichiers que pack2/3/4/5/6 importent)

> **Critère qui gouverne cette partie :** à la fin, **pack2/3/4/5/6 doivent `tsc` en n'important QUE des
> fichiers produits par pack0 + pack1.** Chaque contrat ci-dessous est donc complet, typé, exporté, et
> testé. C'est la correction du blocker d'audit #1.

#### Étape 8 — `lib/signals/taxonomy.ts` (T-14 — PRÉREQUIS DUR : corrige le bug multipliers-au-plancher)
**Action.** Crée `src/lib/signals/taxonomy.ts` (**NET-NEW — n'existe PAS chez Elevay : à CRÉER, pas à copier**). Le vocab **CANONIQUE** = l'union `SignalType` / `SIGNAL_DETECTORS` de `lib/scoring/signal-detectors.ts:16-22` (source-of-truth du scoring, sur laquelle `SIGNAL_PRIORS` `signal-outcomes.ts:59` keye). ⚠ **À NE PAS CONFONDRE avec `KNOWN_SIGNAL_TYPES` (`lib/sequences/triggers.ts:27` : `website_visit`/`post_funding`/`hiring_signal`…)** qui est le vocab **TRIGGER-CONFIG** — un axe DIFFÉRENT, **jamais** la cible des alias. La ALIAS map **étend** (n'écrase pas) l'`SIGNAL_CANONICAL_ALIAS` Elevay (`lib/scoring/signal-outcomes.ts:119`) avec les variantes producteur + **les alias dérivés de pack5** (`hiring_velocity`, `adoption_accel`, `tech_churn`, `job_change`). **RÈGLE D'OR** : une cible d'alias doit **exister dans `SIGNAL_PRIORS`** — normaliser vers une famille SANS prior (p.ex. `engagement`/`expansion`) FLOORERAIT le signal, soit exactement le bug qu'on corrige ; les types engagement/warm (`positive_reply:2.5`, `meeting_booked:2.5`, `warm_connection:1.8`…) sont DÉJÀ des clés `SIGNAL_PRIORS` → on les laisse **passer tels quels**. `toCanonicalSignal()` normalise n'importe quel `type` producteur vers sa clé de scoring ; inconnu / hors-vocab → renvoyé en l'état (jamais droppé). **Sans ce fichier, le daily score keye `{funding_recent,…}` contre des multipliers keyés `{funding,…}` → `undefined` → plancher 1.0×** (design §4.2, mémoire `signals-world-class-report`).

```ts
// src/lib/signals/taxonomy.ts — NET-NEW (contrat partagé pack1 ; n'existe PAS chez Elevay — à CRÉER, pas à copier)
import { SIGNAL_CANONICAL_ALIAS } from "@/lib/scoring/signal-outcomes"; // COPIÉ depuis Elevay (source signal-outcomes.ts:119)
import type { SignalType } from "@/lib/scoring/signal-detectors";       // COPIÉ depuis Elevay (source signal-detectors.ts:16-22)

/**
 * Vocab CANONIQUE de scoring = l'union `SignalType` de signal-detectors.ts:16-22
 * (source-of-truth ; `SIGNAL_PRIORS` signal-outcomes.ts:59 keye dessus, et c'est CE
 * vocab que `priorMultiplier()` consomme). ⚠ DIFFÉRENT de `KNOWN_SIGNAL_TYPES`
 * (triggers.ts:27 — vocab TRIGGER-CONFIG : website_visit/post_funding/…), JAMAIS la
 * cible des alias de scoring.
 */
export const CANONICAL_SIGNALS = [
  "funding",            // levée / Form D / financement
  "funding_crunchbase", // levée détectée via Crunchbase
  "hiring",             // surge / vélocité d'embauche
  "tech_stack_change",  // adoption / churn / accélération d'outils
  "leadership_change",  // exec hire, job-change dirigeant
  "investor_overlap",   // warm-path : investisseur commun
] as const satisfies readonly SignalType[];
export type CanonicalSignal = (typeof CANONICAL_SIGNALS)[number];

const isCanonical = (s: string): s is CanonicalSignal =>
  (CANONICAL_SIGNALS as readonly string[]).includes(s);

/**
 * Alias producteur → clé de scoring. On part de la map Elevay (funding_recent→funding,
 * hiring_surge→hiring, executive_hire→leadership_change ; signal-outcomes.ts:119) et on
 * AJOUTE les variantes producteur + les signaux DÉRIVÉS de pack5 (vélocité = l'EDGE).
 * RÈGLE D'OR : toute cible doit EXISTER dans SIGNAL_PRIORS (signal-outcomes.ts:59) —
 * normaliser vers une famille sans prior (engagement/expansion/…) FLOORERAIT le signal
 * (le bug même qu'on corrige). Les types engagement/warm (positive_reply:2.5,
 * meeting_booked:2.5, warm_connection:1.8…) sont DÉJÀ des clés SIGNAL_PRIORS → on les
 * laisse PASSER tels quels (jamais ré-écrits vers une « engagement » sans prior).
 */
export const SIGNAL_ALIASES: Record<string, CanonicalSignal> = {
  ...(SIGNAL_CANONICAL_ALIAS as Record<string, CanonicalSignal>), // funding_recent→funding, hiring_surge→hiring, executive_hire→leadership_change
  // — variantes producteur Elevay (toutes cibles ∈ SIGNAL_PRIORS) —
  hiring_intent: "hiring",
  tech_adoption: "tech_stack_change",   // prior-only → ride le détecteur canonique tech_stack_change
  // — DÉRIVÉS pack5 (velocity-snapshot → recordCompanySignal) [BLOCKER #1 DEP-1] —
  hiring_velocity: "hiring",
  adoption_accel: "tech_stack_change",
  tech_churn: "tech_stack_change",
  job_change: "leadership_change",
};

/** Normalise un type de signal producteur vers sa clé de scoring canonique.
 *  Inconnu / hors-vocab → renvoyé tel quel (jamais droppé : un type neuf reste scoré sur son prior). */
export function toCanonicalSignal(type: string): CanonicalSignal | string {
  const t = type.trim().toLowerCase();
  if (isCanonical(t)) return t;
  return SIGNAL_ALIASES[t] ?? t;
}
```
**VERIFY.** `tsc` vert ; `node -e "..."` ou test.
**TEST** (`orion-taxonomy.test.ts`) : `toCanonicalSignal('funding_recent')==='funding'` ; les dérivés pack5 → `toCanonicalSignal('hiring_velocity')==='hiring'`, `'adoption_accel'==='tech_stack_change'`, `'tech_churn'==='tech_stack_change'`, `'job_change'==='leadership_change'` ; `tech_adoption` (prior-only) → `'tech_stack_change'` ; un type inconnu (`'foo_bar'`) **et** hors-vocab (`'product_launch'`, sans prior) → passe-plat (`'foo_bar'`/`'product_launch'`) ; `CANONICAL_SIGNALS.length===6` (= l'union `SignalType`).

#### Étape 9 — `lib/ingest/types.ts` (contrat de T-21 — design §5.1)
**Action.** Crée `src/lib/ingest/types.ts` (dir `lib/ingest/` ABSENT → création propre). `IngestItem` = exactement la forme consommée par `upsertAccount`/`upsertContact`. `InputSource` (alias exporté `IngestSource`) = ce que pack2/pack5 implémentent. **`pull()` NE THROW JAMAIS** (contrat : erreur source → items partiels + log).

```ts
// src/lib/ingest/types.ts — NET-NEW (contrat partagé pack1 ; consommé par pack2 sources + pack5 Tier2)
export interface IngestItem {
  kind: "company" | "person";
  identity: {
    domain?: string; name?: string; country?: string; siren?: string; siret?: string; uid?: string; // account
    email?: string; linkedinUrl?: string; firstName?: string; lastName?: string; companyRef?: string; // person
  };
  fields: Partial<Record<"industry" | "size" | "revenue" | "description" | "title" | "phone", string | null>>;
  vendorIds?: Record<string, string>;          // side-map, JAMAIS dans l'identité (upsert.ts AC4)
  rawSignals?: Array<{
    type: string; detectedAt: string; strength?: string; detail?: string;
    evidence?: { url: string; quote?: string };
  }>;                                            // → recordCompanySignal ; type normalisé via toCanonicalSignal()
  sourceRef: string;                            // 'row:42' | apollo id → dédup intra-job (niveau 2)
  provider: string;                             // 'csv'|'apollo'|'sirene'|'edgar'|… → précédence
}

export interface PullCtx { tenantId: string; signal?: AbortSignal; }
export interface PullResult { items: IngestItem[]; nextCursor?: string; total?: number; }

export interface InputSource {
  name: string;
  kind: "file" | "provider";
  subjectKind: "company" | "person" | "mixed";
  inputFingerprint(): string;                   // sha256(entrée) → dédup job-level (niveau 1)
  pull(ctx: PullCtx, cursor?: string): Promise<PullResult>; // NE THROW JAMAIS — items partiels + log
}

/** Alias attendu par pack5 (00-EXECUTION-GUIDE nomme le contrat `IngestSource`). */
export type IngestSource = InputSource;
```
**VERIFY.** `tsc` vert.
**TEST** (`orion-contracts.test.ts`, bloc « ingest types ») : type-only — une `const s: IngestSource = {…}` minimal compile ; un `IngestItem` minimal (`kind`, `identity`, `fields`, `sourceRef`, `provider`) compile.

#### Étape 10 — `lib/ingest/jobs.ts` (ownership pack1 — `openIngestJob`/`getJob`/`bumpJobCounters`)
**Action.** Crée `src/lib/ingest/jobs.ts`. **Possédé par pack1** (PAS pack2/4/5 — blocker #1). `openIngestJob` = upsert dédup-niveau-1 `(tenantId, fingerprint)` `onConflictDoUpdate` (resoumettre le même CSV ne relance pas). Tout sous `withTenantTx` (RLS).

```ts
// src/lib/ingest/jobs.ts — NET-NEW (contrat partagé pack1 ; appelé par pack2 orchestrateur + import/smart route)
import { withTenantTx } from "@/db/rls";                 // REUSE pack0
import { ingestJobs } from "@/db/schema";                // pack1 étape 2
import { eq, and, sql } from "drizzle-orm";

export interface OpenIngestJobInput {
  tenantId: string; sourceName: string; sourceKind: "file" | "provider";
  kind?: "ingest" | "discovery";                  // discriminant ; défaut 'ingest' (pack2 discovery passe 'discovery')
  fingerprint: string; totalEstimate?: number; options?: Record<string, unknown>;
}

/** Crée (ou récupère) le job pour ce (tenant, fingerprint). Idempotent — dédup niveau 1. */
export async function openIngestJob(input: OpenIngestJobInput): Promise<{ id: string; reused: boolean }> {
  return withTenantTx(input.tenantId, async (tx) => {
    const [row] = await tx
      .insert(ingestJobs)
      .values({
        tenantId: input.tenantId, sourceName: input.sourceName, sourceKind: input.sourceKind,
        kind: input.kind ?? "ingest",
        fingerprint: input.fingerprint, totalEstimate: input.totalEstimate ?? null,
        options: input.options ?? {}, status: "queued",
      })
      .onConflictDoUpdate({
        target: [ingestJobs.tenantId, ingestJobs.fingerprint],
        set: { updatedAt: new Date() },                  // no-op touch → renvoie la ligne existante
      })
      .returning({ id: ingestJobs.id, createdAt: ingestJobs.createdAt, updatedAt: ingestJobs.updatedAt });
    return { id: row.id, reused: row.createdAt.getTime() !== row.updatedAt.getTime() };
  });
}

/** Renvoie la ligne complète du job (toutes colonnes, dont `result`) ou null.
 *  `select()` retourne `result` jsonb → pack7 lit `(await getJob(...))?.result?.discovery`
 *  (sortie du moteur offline-discovery) via get_ingest_job. */
export async function getJob(tenantId: string, jobId: string) {
  return withTenantTx(tenantId, async (tx) => {
    const [row] = await tx.select().from(ingestJobs)   // inclut `result` (et `kind`)
      .where(and(eq(ingestJobs.id, jobId), eq(ingestJobs.tenantId, tenantId))).limit(1);
    return row ?? null;                                // row.result?.discovery dispo pour pack7
  });
}

/** Incrémente atomiquement les compteurs d'un job (pulled/resolved/created/merged/skipped/signals/scored). */
export async function bumpJobCounters(
  tenantId: string, jobId: string,
  delta: Partial<Record<"pulled" | "resolved" | "created" | "merged" | "skipped" | "signals" | "scored", number>>,
) {
  return withTenantTx(tenantId, async (tx) => {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(delta)) {
      set[k] = sql`${(ingestJobs as Record<string, unknown>)[k]} + ${v}`;
    }
    await tx.update(ingestJobs).set(set as never)
      .where(and(eq(ingestJobs.id, jobId), eq(ingestJobs.tenantId, tenantId)));
  });
}
```
**VERIFY.** `tsc` vert ; après migration : `openIngestJob` 2× même fingerprint → même `id`, 2e `reused:true`.
**TEST** (`orion-schema-ingest-dedup.test.ts`, bloc « openIngestJob ») : intégration gardé `DATABASE_URL` — 2 appels même `(tenant, fingerprint)` → même `id`, 2e `reused===true` ; `bumpJobCounters({pulled:3})` puis `getJob` → `pulled===3`. + test pur : `openIngestJob` est une fonction exportée.

#### Étape 11 — `lib/outbound/types.ts` (contrat de T-32 — design §6.1)
**Action.** Crée `src/lib/outbound/types.ts` (dir `lib/outbound/` EXISTE avec `queue.ts` — **n'écrase PAS** `queue.ts`, ajoute un fichier voisin). `OutboundDestination.push` ne voit que des briefs **déjà gatés** (gate AVANT push). `apiKey` = secret per-tenant déchiffré au call (C6/D6).

```ts
// src/lib/outbound/types.ts — NET-NEW (contrat partagé pack1 ; implémenté par pack4 destinations/*)
import type { OutreachBrief } from "@/lib/mcp/contracts/outreach-brief.schema"; // pack1 étape 12

export interface OutboundDestination {
  name: "instantly" | "orange_slice" | "lopus" | "webhook" | "generic"; // SINKS de sortie — Fiber EXCLU (= source d'ENTRÉE) ; Lopus INCLUS (sortie webhook)
  /** flatten/push DOIT être appelé APRÈS le gate — il ne voit que des prospects autorisés. */
  push(args: {
    tenantId: string;                                  // du Bearer, jamais argument
    briefs: OutreachBrief[];                            // déjà gatés exportable:true
    config: { campaignId?: string; listId?: string; webhookUrl?: string; dryRun?: boolean };
    apiKey?: string;                                    // per-tenant, déchiffré au call (decryptSecret, C6)
  }): Promise<ExportResult>;
}

export type ExportResult = {
  destination: string;
  exported: Array<{ prospectId: string; externalId?: string }>;
  skipped: Array<{ prospectId: string; code: string; reason: string }>; // code = gate code (SendingGateOutcome)
  counts: { requested: number; exported: number; skipped: number; duplicates: number };
};
```
> `apiKey` est `string` (chaîne **déchiffrée** au call via `decryptSecret`) — cohérent avec C6 (l'helper renvoie/consomme une chaîne), pas l'objet `{iv,ciphertext,tag}` du design §6.1.
**VERIFY.** `tsc` vert.
**TEST** (`orion-contracts.test.ts`, bloc « outbound types ») : type-only — une `const d: OutboundDestination = {…}` minimal compile ; un `ExportResult` minimal compile.

#### Étape 12 — `lib/mcp/contracts/outreach-brief.schema.ts` (contrat de T-28 — zod, design §7.1)
**Action.** Crée `src/lib/mcp/contracts/outreach-brief.schema.ts` (dir `lib/mcp/` créé par pack0 ; `contracts/` net-new). **zod 4** (`zod ^4.4.3`). Schéma des **7 sections A-G** ; `type OutreachBrief = z.infer<…>`. C'est l'**autorité serveur** : pack3 valide sa sortie contre lui ; pack4 importe le `type`. Met en avant **E. `citableFacts[]` (whitelist) + `doNotClaim[]` (denylist)** = le pivot anti-hallucination livré comme **donnée**.

```ts
// src/lib/mcp/contracts/outreach-brief.schema.ts — NET-NEW (contrat partagé pack1 ; zod 4)
import { z } from "zod";

const Evidence = z.object({ url: z.string(), quote: z.string().optional(), verified: z.boolean().optional() });
const CitableFact = z.object({
  fact: z.string(), value: z.string().optional(), source: z.string(),
  url: z.string().optional(), quote: z.string().optional(), verified: z.literal(true),
});

export const OutreachBriefSchema = z.object({
  // A. identity
  identity: z.object({
    companyId: z.string(), name: z.string().optional(), domain: z.string().optional(),
    industry: z.string().nullable().optional(), size: z.string().nullable().optional(),
    firmographicProvenance: z.array(z.object({ field: z.string(), provider: z.string(), atIso: z.string() })),
  }),
  // B. whyNow
  whyNow: z.object({
    topSignal: z.object({
      type: z.string(), strength: z.string().optional(), detectedAt: z.string(),
      source: z.string().optional(), fresh: z.boolean(), ttlDays: z.number().optional(),
      evidence: Evidence.optional(),
    }).nullable(),
    priorityScore: z.number(), priorityFactors: z.record(z.string(), z.number()).optional(),
    whyNowSummary: z.string(),
  }),
  // C. messaging (ZÉRO prose libre — angles/méthodo seulement)
  messaging: z.object({
    bestAngle: z.string(), angleKey: z.string().optional(), angleGuidance: z.string().optional(),
    painPoints: z.array(z.string()), competitorDetected: z.string().nullable().optional(),
    communicationStyle: z.object({ tone: z.string() }).partial().optional(),
    methodology: z.object({
      name: z.string(), structure: z.string().optional(), maxWords: z.number().optional(),
      toneNotes: z.string().optional(), ctaType: z.string().optional(),
    }),
    suggestedCta: z.string().optional(),
    channel: z.enum(["email", "linkedin"]).default("linkedin"),
    timing: z.object({ sendWindow: z.string().optional(), recipientTz: z.string().optional(), signalFreshUntilIso: z.string().optional() }).optional(),
  }),
  // D. warmPath
  warmPath: z.object({
    warmthSignals: z.array(z.object({ type: z.string(), detail: z.string() })),
    recommendedPerson: z.object({ contactId: z.string().optional(), fullName: z.string().optional() }).nullable().optional(),
  }),
  // E. anti-hallucination AS DATA — la valeur du pivot
  citableFacts: z.array(CitableFact),
  doNotClaim: z.array(z.string()),
  // F. persona
  persona: z.object({
    contactId: z.string().optional(), fullName: z.string().optional(), title: z.string().optional(),
    seniority: z.string().optional(), departments: z.array(z.string()).optional(), linkedinUrl: z.string().optional(),
    reachable: z.object({ hasEmail: z.boolean(), hasPhone: z.boolean(), hasLinkedin: z.boolean() }),
  }),
  // G. meta + gate
  meta: z.object({
    sourcesAttempted: z.number().optional(), sourcesSucceeded: z.number().optional(),
    sourceErrors: z.array(z.string()).optional(),
    researchedAt: z.string(), expiresAt: z.string(),
    confidence: z.number(), briefCompleteness: z.boolean(),
    gate: z.object({ exportable: z.boolean(), verdict: z.string() }),
  }),
});

export type OutreachBrief = z.infer<typeof OutreachBriefSchema>;
```
**VERIFY.** `tsc` vert ; `OutreachBriefSchema.safeParse(fixture).success === true`.
**TEST** (`orion-contracts.test.ts`, bloc « OutreachBrief zod ») : un brief fixture complet `safeParse → success:true` ; un brief **sans** `citableFacts`/`doNotClaim` → `success:false` (les deux sont requis — c'est le pivot) ; un `citableFacts[i].verified:false` → `success:false` (literal true).

#### Étape 13 — `lib/campaign-engine/brief.ts` (wrapper T-15 / REQ-12)
**Action.** Crée `src/lib/campaign-engine/brief.ts` (fichier libre). **Wrapper mince** qui réexporte `buildIntelligenceBrief`/`readCachedBrief` du fichier Elevay (cache `intelligence_briefs`, 14 j) — point d'import **stable et unique** pour pack3, qui ne dépend ainsi pas du chemin exact du module Elevay.

```ts
// src/lib/campaign-engine/brief.ts — NET-NEW (wrapper d'import pack1 ; T-15/REQ-12)
// Réexport de la copie Elevay — buildIntelligenceBrief construit + cache (intelligenceBriefs, 14j), readCachedBrief lit.
export {
  buildIntelligenceBrief,   // (companyId, tenantId, contactId?, options?) => Promise<IntelligenceBrief|null>
  readCachedBrief,          // (tenantId, companyId, contactId|null) => Promise<IntelligenceBrief|null>
} from "@/lib/campaign-engine/build-intelligence-brief"; // Elevay build-intelligence-brief.ts:26 / :190
export type { IntelligenceBrief } from "@/lib/campaign-engine/types"; // Elevay types.ts:50
```
**VERIFY.** `tsc` vert ; `import { buildIntelligenceBrief } from "@/lib/campaign-engine/brief"` résout.
**TEST** (`orion-contracts.test.ts`, bloc « brief wrapper ») : `typeof buildIntelligenceBrief === "function"` && `typeof readCachedBrief === "function"`.

#### Étape 14 — `lib/guardrails/orion-send-gate.ts` (wrapper T-36 — C8)
**Action.** Crée `src/lib/guardrails/orion-send-gate.ts` (**PAS** `sending-gate.ts` qui existe, C8). **Wrapper mince** réexport `evaluateSend` + ses types. C'est l'**oracle d'éligibilité** que le chemin d'export pack4 importe ; le gate tourne **dans** le wrapper d'export → inatteignable depuis le JSON-RPC (invariant DB8 / design §6.2).

```ts
// src/lib/guardrails/orion-send-gate.ts — NET-NEW (wrapper d'import pack1 ; T-36, C8)
// Réexport de la copie Elevay, INCHANGÉ — evaluateSend = 8 gates fail-closed (source sending-gate.ts:212).
// On NE réécrit PAS sending-gate.ts ; on expose un point d'import Orion stable.
export { evaluateSend } from "@/lib/guardrails/sending-gate";          // Elevay sending-gate.ts:212
export type { EvaluateSendArgs, SendingGateOutcome } from "@/lib/guardrails/sending-gate"; // :166 / :56
```
**VERIFY.** `tsc` vert ; `import { evaluateSend } from "@/lib/guardrails/orion-send-gate"` résout.
**TEST** (`orion-contracts.test.ts`, bloc « gate wrapper ») : `typeof evaluateSend === "function"`. (Le comportement fail-closed du gate est testé par sa propre suite Elevay — on ne le re-teste pas, on vérifie le réexport.)

#### Étape 15 — Commit (un par changement logique)
Un commit par fichier logique : chaque `orion-*.ts` schéma → la migration → le barrel → chaque contrat
(`taxonomy`, `ingest/types`, `ingest/jobs`, `outbound/types`, `outreach-brief.schema`, `campaign-engine/brief`,
`orion-send-gate`) → les tests. Pathspecs scopés. Trailer obligatoire (§DoD).

---

## 5. CRITÈRES D'ACCEPTATION (testables)

**5.0 — LE critère porteur (blocker #1) :** sur une branche qui contient **pack0 + pack1 uniquement**,
chacun de pack2/3/4/5/6 **`tsc` vert** quand il n'importe **que** des fichiers produits par pack0+pack1.
Preuve : `grep -rn "@/lib/ingest\|@/lib/outbound/types\|@/lib/mcp/contracts\|@/lib/campaign-engine/brief\|@/lib/guardrails/orion-send-gate\|@/lib/signals/taxonomy\|@/db/schema" <fichiers pack2..6>` ne référence **que** des symboles exportés par pack0/pack1 ; un `pnpm --filter @orion/web tsc` sur un checkout pack0+pack1 + un fichier stub par pack importateur compile.

1. `pnpm --filter @orion/web tsc` **vert** ; `pnpm --filter @orion/web test` **vert** (les 6 fichiers de test du lot inclus).
2. `import * as s from "@/db/schema"` expose les **7 tables** Orion ; aucune table Elevay redéfinie (`pgTable("tenants"`/`pgTable("outbound…"` n'apparaît **que** dans les fichiers Elevay).
3. `pnpm db:migrate` → **exit 1** ; `db:migrate:apply` 2× → **1** ligne `__elevay_migrations` pour `0107_orion_schema.sql`, **0** erreur.
4. Les 7 tables existent sur `leadsens-localdev` (`to_regclass` non NULL) avec leurs uniqueIndex (`ic_tenant_provider_ux`, `ingest_jobs_tenant_fp_ux`, `ingest_items_job_ref_ux`, `export_items_job_prospect_ux`) + l'index `snap_subject_source_metric_time`.
5. **Chiffrement** : `integration_credentials.encrypted_api_key` `!==` la clé fournie ; `decryptSecret` la restitue.
6. **Dédup** : même `(tenant_id, fingerprint)` → 1 `ingest_jobs` (et `openIngestJob` renvoie le même `id`, `reused:true`) ; même `(job_id, source_ref)` → 1 `ingest_items`.
7. **Audit gate** : un `export_items` skippé porte `gate_code` ; `export_jobs{requested,exported,skipped}` cohérents.
8. **RLS/global** : sous `withTenantTx(elevay…)`, une ligne `signal_snapshots.tenant_id=NULL` est lisible ; une ligne d'un autre tenant **ne l'est pas**.
9. **Taxonomie** : `toCanonicalSignal` mappe les 3 alias Elevay (`funding_recent`/`hiring_surge`/`executive_hire`) **ET** les dérivés pack5 vers le vocab SCORING (`SignalType`, signal-detectors.ts) — `hiring_velocity`→`hiring`, `adoption_accel`/`tech_churn`→`tech_stack_change`, `job_change`→`leadership_change` ; inconnu / hors-vocab (`product_launch`) → passe-plat ; `CANONICAL_SIGNALS.length===6`.
10. **Contrats** : `OutreachBriefSchema` valide un brief complet et rejette `citableFacts`/`doNotClaim` manquants ; `evaluateSend`/`buildIntelligenceBrief`/`openIngestJob` importables depuis leurs wrappers Orion.
11. **0 violation tripwire** : aucun `set_config(..., false)` ; aucun `DATABASE_URL_OWNER` dans `src` ; aucun `createId(`/`@paralleldrive/cuid2` ajouté ; `sending-gate.ts` Elevay **non modifié** (wrapper = fichier neuf, C8).

---

## 6. DEFINITION OF DONE

- [ ] 4 fichiers schéma `orion-*.ts` (C1/C2/C3), 7 tables, tous les index.
- [ ] `drizzle/0107_orion_schema.sql` additif + idempotent + RLS (idiom `0089`), appliqué 2× sur `leadsens-localdev` sans erreur (1 ligne tracking dans **`__elevay_migrations`**).
- [ ] Barrel `db/schema.ts` : 4 réexports append-only, rien d'autre modifié.
- [ ] **7 contrats partagés** créés et exportés : `signals/taxonomy.ts` (vocab SCORING `SignalType` + alias Elevay+pack5), `ingest/types.ts`, `ingest/jobs.ts` (`openIngestJob`), `outbound/types.ts`, `mcp/contracts/outreach-brief.schema.ts` (zod), `campaign-engine/brief.ts` (wrapper), `guardrails/orion-send-gate.ts` (wrapper, C8).
- [ ] **Critère porteur §5.0 prouvé** : pack2/3/4/5/6 `tsc` en n'important QUE pack0+pack1.
- [ ] 6 fichiers de test (chiffrement, dédup ingest+openIngestJob, export+gate_code, snapshots+global, taxonomy, contracts) verts ; blocs DB `describe.skip` si `DATABASE_URL` absent.
- [ ] `tsc` + `test` verts ; `git diff --stat` scopé aux fichiers du §3 (aucun fichier hors ownership ; `src/__tests__/` touché par les **6 fichiers nommés** uniquement).
- [ ] GAP-4 vérifié runtime (`elevay_app` lit/écrit les 7 tables sous `withTenantTx`) ; sinon GRANT corrigé.
- [ ] Commits atomiques avec le trailer :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: <URL de ta propre session Claude Code>
  ```
- [ ] PR `feat/orion-pack1` ouverte, CI pleine verte (gitleaks + tsc/vitest + Vercel) **avant** merge ; surveiller le push CI de `main` après squash.
- [ ] **Ne PAS migrer prod** depuis cette branche non mergée. Prod (tenant `elevay`) s'applique **après merge**, one-shot via `DATABASE_URL_OWNER` (`db:migrate:apply`), idempotent.

---

## 7. PIÈGES SPÉCIFIQUES À CE LOT

1. **`db/schema/outbound.ts` est PRIS** (20 tables Elevay). Mets l'export Orion dans `orion-outbound.ts`. *(C1, `outbound.ts:36..665`)*
2. **`tenants` est COPIÉ depuis Elevay** non typé (`core.ts:20`, par pack0). Ne le redéfinis pas, ne le migre pas, n'ajoute pas `TenantSettings`/`mcpApiKeys` ici (hors-scope auth/pack0). FK = `references(() => tenants.id)`. *(C3)*
3. **`crypto.randomUUID()`, pas `createId()`** — pas de cuid2. *(C2, `agent.ts:32`)*
4. **`__elevay_migrations`, pas `__orion_migrations`/`__drizzle_migrations`** — runner copié depuis Elevay, ledger de la **DB partagée** conservé. *(C4, `apply-migrations.ts:52`)*
5. **Migration `0107`** ; pack7 = `0108+`. Les plages `0010–0029`/`0090+` de l'EXECUTION-GUIDE (modèle naïf) sont **FAUSSES** : DB partagée → numérotation continue à partir de 0107 (0106 = dernière existante). *(C5/C9)*
6. **N'utilise PAS `drizzle-kit push` sur la DB partagée** — applique le `.sql` additif via `db:migrate:apply`. *(C7)*
7. **`encryptSecret`/`decryptSecret` renvoient une chaîne** (pas `{iv,ciphertext,tag}`) → colonne `text` ; `OutboundDestination.apiKey: string` (déchiffrée). *(C6, `settings-encryption.ts:49/:65`)*
8. **`signal_snapshots.tenant_id` NULLABLE + `text`** (pas `uuid`, pas `notNull`) — lignes globales ; la policy RLS tolère `tenant_id IS NULL` (idiom `0089:31`).
9. **RLS obligatoire sur chaque table net-new** (GAP-4) ; copie l'idiom `0089` (`set_config(...,true)` côté `withTenantTx`, **jamais** `false`). *(pièges #2/#6/#10)*
10. **Migration idempotente** : `IF NOT EXISTS` partout, `DROP POLICY IF EXISTS` avant `CREATE POLICY`.
11. **Les wrappers ne RÉÉCRIVENT rien.** `orion-send-gate.ts` et `campaign-engine/brief.ts` sont des **réexports** de fichiers Elevay vivants — ne pas copier/modifier `sending-gate.ts` ni `build-intelligence-brief.ts` (invariant T-38 reuse-untouched). *(C8)*
12. **`taxonomy.ts` étend l'alias Elevay, ne le redéfinit pas** — il `...spread` `SIGNAL_CANONICAL_ALIAS` puis ajoute. Cibles d'alias ∈ vocab SCORING (`SignalType`, signal-detectors.ts:16-22) — **jamais** `KNOWN_SIGNAL_TYPES` (triggers.ts:27, vocab trigger-config). Sans les alias dérivés pack5, le daily score reste au plancher 1.0× (le bug que ce lot corrige). *(blocker #1 DEP-1, design §4.2)*
13. **`lib/outbound/` et `lib/mcp/` existent partiellement** : `lib/outbound/queue.ts` (Elevay) ne doit PAS être touché ; `lib/mcp/{registry,types}.ts` sont pack0 — pack1 n'ajoute QUE `lib/mcp/contracts/outreach-brief.schema.ts`.
14. **Frontière MCP (blocker #5, NON une violation reuse) :** pack0 pose le squelette `app/api/mcp/route.ts` + les balises `<<<ORION:*>>>` + le fallback `tools/call`. pack3 **patche LÉGITIMEMENT** l'envelope Elevay (`route.ts ~953-957`, ajout `structuredContent`) **et** `initialize` (bump proto `2024-11-05`→`2025-06-18`, `route.ts:921`). C'est **autorisé et séquentiel (pack3 après pack0)**, dans les balises — pack1 ne touche pas la route MCP.
15. **Tree partagé** : re-vérifie branche+HEAD avant chaque commit ; `git add` scopé (jamais `-A`).
