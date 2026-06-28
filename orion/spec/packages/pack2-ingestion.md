# Orion — BRIEF DE LOT · pack2 « Ingestion » (`feat/orion-pack2`)

> **Brief auto-suffisant.** Cette session n'a QUE ce fichier + les docs pointés. Tu EXÉCUTES
> sans rien redériver. Toute décision structurelle est déjà tranchée ici (copiée des docs
> autoritaires). Si un détail manque, il est dans : `00-ARCHITECTURE.md` (autoritaire),
> `00-EXECUTION-GUIDE.md` (§3 ownership, §4 conventions, §5 multi-session),
> `00-PREREQUISITES.md` (pièges + seed), `design.md §4` (Inngest) / `§5` (ADAPTATEURS ENTRÉE),
> `requirements.md` REQ-16/17/18/19/20, `research/signal-intelligence-design-2026-06-27.md`,
> `research/signal-agent-mcp-2026-06-27.md`.
>
> **Convention de chemins.** Orion est un **repo SÉPARÉ** (app Next/pnpm autonome, package
> `@orion/web`) ; ses fichiers vivent sous **`src/`**. Tout `file:line` REUSE non préfixé désigne
> la **SOURCE Elevay À COPIER** (la provenance), relative à
> **`C:/Users/ombel/leads/app/apps/web/src/`** (le repo Elevay d'où l'on **copie** le module) —
> **vérifié sur disque** le 2026-06-28. Le module copié vit sous le **même chemin relatif** dans
> `src/` du repo Orion. Les modules Elevay ne sont **PAS** importés via workspace : ils sont
> **vendorés (copiés)** dans Orion (avec leurs dépendances de schéma).

---

## 0. CONTEXTE NON-NÉGOCIABLE (décisions founder — priment sur tout langage antérieur)

- **DB = la base du repo `leads`** (Supabase Postgres d'Elevay), **PARTAGÉE** via `DATABASE_URL`.
  PAS de DB séparée, PAS Convex. Le schéma Orion est **additif** au schéma Elevay.
- **SCOPE = tenant `elevay` UNIQUEMENT.** Isolation RLS : runtime en rôle restreint **`elevay_app`**
  (jamais owner), tout accès data **DANS** `withTenantTx(elevayTenantId, fn)` (`db/rls.ts`).
  **PIÈGE** : postgres-js + Supavisor `:6543` (transaction-mode) → `set_config(..., true)` =
  TRANSACTION-LOCAL. **JAMAIS** `set_config(..., false)` (empoisonne le pool). Tu n'écris jamais
  `set_config` toi-même : tu passes par `withTenantTx`. Le `tenantId` vient **toujours** du Bearer
  / `event.data` Inngest — **jamais** un argument d'outil.
- **Modules Elevay COPIÉS (vendorés) dans Orion** (même schéma, même DB partagée), **non importés
  via workspace** — copie fidèle, jamais réécrite. pack2 **copie depuis Elevay** `upsertAccount`/
  `upsertContact`, `accountMatchPlan`, `enrichCompany`, `recordCompanySignal`, `scoreCompanyBatch`,
  `computePriorityScore`, `pickWinner` (+ leurs dépendances de schéma) depuis leurs `file:line`
  sources — tels quels.
- **Tables net-new additives** (`ingest_jobs`/`ingest_items`) : créées par **pack1**, pas par toi.
  Tu les **consommes** via le barrel `@/db/schema`. dev `db:push` ; prod runner custom (hors-bande).
- **Stack épinglée** (ne dévie pas) : pnpm 10.15.1 · Node 22 · next ^15.5.15 · react ^19.2.7 ·
  typescript ^5.9.3 · drizzle-orm ^0.45.2 (`pnpm.overrides` + `db as any`) · **inngest ^4.5.1
  (`createFunction` 2-arg, triggers DANS la config, `concurrency` = array, `maxDuration 300`)** ·
  ai ^6.0.199 · @ai-sdk/anthropic ^3.0.82 · @anthropic-ai/sdk ^0.104.1 · postgres ^3.4.9
  (driver `postgres-js`, **PAS** neon-http) · zod ^4.4.3 · vitest ^4.1.8 · **papaparse ^5.5.3**
  (déjà dans `package.json:53`). AI : baseURL Anthropic **DOIT finir par `/v1`** ; routing
  `chat→sonnet` / `light→haiku` ; tout LLM passe par `tracedGenerateText/Object` +
  `enforceLlmBudget(tenantId)`.

---

## 1. OBJECTIF + PÉRIMÈTRE

### 1.1 Objectif (une phrase)
Faire converger **CSV** et **providers (Apollo/waterfall)** vers **un même contrat `IngestItem`**,
poussés dans un **orchestrateur Inngest durable et idempotent** (`ingest-run`) qui enchaîne
**identity-resolve → compose (précédence) → acquire signals → score (ciblé)**, plus les **3 outils
MCP** d'ingestion (`ingest_csv`, `ingest_from_provider`, `get_ingest_job`). Le métier (identité,
précédence, waterfall, signaux, scoring) est **100% COPIÉ depuis Elevay** (vendoré, pas importé via
workspace) ; pack2 n'écrit que la
**plomberie d'ingestion** au-dessus.

### 1.2 IN (ce que pack2 POSSÈDE et livre)
- L'orchestrateur durable `inngest/ingest-run.ts` (5 stages, REQ-16/17).
- Le cron `inngest/signal-score-daily.ts` (recompute quotidien des `priority_score`, REQ-17).
- `lib/ingest/csv-parse.ts` (extraction des helpers CSV depuis `import/smart/route.ts`).
- `lib/ingest/score-touched.ts` (scoring ciblé des seuls IDs touchés, REQ-17).
- `lib/ingest/sources/csv-source.ts` + `lib/ingest/sources/apollo-source.ts` (impl. du contrat, REQ-20).
- `lib/ingest/enrich/fiber-reveal.ts` (**adaptateur Fiber reveal — INPUT, contact reveal en
  waterfall**, branché dans le stage COMPOSE ; `POST api.fiber.ai/v1/contact-details/single`,
  clé `x-api-key` per-tenant). Fiber est une **source d'ENTRÉE** (data API), **jamais** une
  destination outbound — il n'a aucun endpoint d'envoi (OpenAPI v1.40.0,
  `research/partner-apis-2026-06-27.md §2`).
- `lib/ingest/mcp-handlers.ts` (module registre MCP : `ingest_csv` / `ingest_from_provider` /
  `get_ingest_job`, REQ-19).
- Les **2 hookpoints additifs** du gap #455 (T-18) : provenance + signal post-import (§4 étape 4).
- **MODIF coordonnée** de `app/api/import/smart/route.ts` : l'insert brut devient producteur
  d'event (`openIngestJob` + `inngest.send("ingest/run")`), rétro-compat `sync=true` <50 lignes (REQ-16).

### 1.3 OUT (possédé par d'autres lots — NE PAS TOUCHER)
- **pack0** : scaffold, `src/inngest/client.ts`, `src/inngest/registry.ts`,
  `src/app/api/inngest/route.ts`, `src/lib/mcp/registry.ts` + `route.ts` (squelette) + `types.ts`,
  `src/db/index.ts` + `src/db/rls.ts`, `src/lib/ai/*`, runner de migration. Tu **importes**, tu n'édites
  pas (sauf l'ajout d'**une ligne** dans les zones append-only des registres — §4 étape 7).
- **pack1** : **tous** les schémas (`db/schema/{tenants,integrations,ingest,outbound,snapshots}.ts`
  + barrel `db/schema.ts`), `lib/ingest/types.ts` (**contrat `IngestItem`/`IngestSource`**),
  `lib/ingest/jobs.ts` (helper `openIngestJob`), `lib/signals/taxonomy.ts` (alias-map),
  `lib/outbound/types.ts`, le réexport gate `lib/guardrails/sending-gate.ts`. Tu les **importes**.
- **pack3** Brief+MCP (`get_outreach_brief`), **pack4** Output+export+gate-wrapper, **pack5** sources
  Tier 2 + `velocity-snapshot` (elles se branchent sur TON orchestrateur via l'interface
  `IngestSource` — additif, ne change rien chez toi), **pack6** UI, **pack7** tests d'intégration/seed.
- **Modules métier Elevay** (`db/canonical/*`, `lib/providers/company-enrichment/*`,
  `lib/signals/record-signal.ts`, `lib/scoring/*`, `lib/icp/*`) : **copiés depuis Elevay tels quels,
  jamais édités** — sauf les 2 hookpoints additifs explicitement listés (T-18, §4 étape 4).

---

## 2. PRÉREQUIS (à finir AVANT de coder)

### 2.1 Lots bloquants (durs)
- **pack0 mergé** : la coquille boote (`pnpm install --frozen-lockfile` + `pnpm --filter @orion/web tsc`
  verts), registres MCP/Inngest/barrel-schéma en place avec leurs balises append-only.
- **pack1 mergé** : tables `ingest_jobs`/`ingest_items` (`db:push` sur `leadsens-localdev`),
  contrats `lib/ingest/types.ts` (`IngestItem`/`IngestSource`), `lib/ingest/jobs.ts` (`openIngestJob`),
  `lib/signals/taxonomy.ts` (alias-map canonique). **Sans `taxonomy.ts`, le scoring tombe au plancher
  1.0× (bug vérifié, §7).**

### 2.2 Cartes nécessaires (de `00-PREREQUISITES.md`)
- **Env minimal pour booter** : `DATABASE_URL` (rôle `elevay_app`, Supavisor `:6543`) + `AUTH_SECRET`
  + `ANTHROPIC_API_KEY` (+ `/v1`). Pour Apollo : `APOLLO_API_KEY` (REST per-tenant possible aussi) —
  sinon `ingest_from_provider provider:apollo_*` ne peut pas pull (le test mocke le client).
  `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY` pour exécuter les jobs.
- **Flag** : `ORION_INGEST_ENABLED` est net-new (à créer si la démo le gate). N'empêche pas le build.
- **DÉP-1 (dur)** : `taxonomy.ts` (pack1) doit exister — alias `{funding_recent,…}` → canonique
  `{funding,…}` (9 types `triggers.ts:27`). Tu y appelles l'alias dans `record-signal` ? **Non** :
  `recordCompanySignal` consomme déjà la taxonomie ; tu passes le `type` brut du provider, l'alias-map
  le canonicalise en aval. Vérifie juste que `taxonomy.ts` est importable.
- **DÉP-2 (dur, T-18)** : les 2 hookpoints provenance + signal post-import sont **dans le MVP** ;
  sans eux un tenant 100%-CSV produit un brief **sans why-now** (gap #455).
- **Pièges vérifiés applicables** (`00-PREREQUISITES §3`) : #1 (`createFunction` 2-arg),
  #2 (`set_config(...,true)`), #5 (runner de migration custom — pas `db:migrate`), #13 (junctioned
  `node_modules` → valider sur install propre).

---

## 3. FICHIERS POSSÉDÉS PAR CE LOT (création/édition exclusives — zéro chevauchement)

> Tous sous `src/` (repo Orion). **REUSE** = module Elevay **copié depuis** sa source (file:line réel
> chez Elevay, la provenance). **NET-NEW** = fichier créé par pack2. **MODIF** = fichier (copié d'Elevay
> ou net-new) édité, diff additif/wrapper only.

| Fichier | Type | Détail |
|---|---|---|
| `inngest/ingest-run.ts` | **NET-NEW** sur pattern REUSE | orchestrateur 5 stages ; clone structurel `inngest/custom-signal-backfill.ts:29` ; exporte `ingestRun` |
| `inngest/signal-score-daily.ts` | **NET-NEW** sur pattern REUSE | cron recompute ; gabarit `createFunction` = l'actuel `inngest/signal-score-daily.ts:95-108` (`bestMultiplierForCompany:72`) ; exporte `signalScoreDaily` |
| `lib/ingest/csv-parse.ts` | **NET-NEW (extraction de REUSE)** | extrait `parseCSVLine` (`import/smart/route.ts:115`), `mapColumnsWithAI` (`:141`), `applyMapping` (`:256`) ; mapping Haiku mémoïsé dans le cursor ; pagine 200 |
| `lib/ingest/score-touched.ts` | **NET-NEW** sur REUSE | `scoreCompanyBatch` (`lib/icp/fit-recompute-core.ts:140`) + `bestMultiplierForCompany` → `computePriorityScore` (`lib/scoring/priority-score.ts:70`, floors `:54-55`) — **touchedIds uniquement** |
| `lib/ingest/sources/csv-source.ts` | **NET-NEW** | `csvSource(text, hint)` : `InputSource` ; `pull()` → `IngestItem[]` paginés 200 |
| `lib/ingest/sources/apollo-source.ts` | **NET-NEW** | `apolloPeopleSource(query)` / `apolloOrgsSource(query)` ; `num_current_job_openings` → `rawSignals:[{type:'hiring'}]`, **jamais** un champ firmo |
| `lib/ingest/enrich/fiber-reveal.ts` | **NET-NEW** | `fiberReveal(linkedinUrl, opts)` : `POST api.fiber.ai/v1/contact-details/single` (waterfall email/phone) ; clé `x-api-key` per-tenant déchiffrée (`decryptSecret`, `lib/crypto/settings-encryption.ts:65`) ; never-throw → `null` si pas de clé/erreur. Dossier `enrich/` = namespace exclusif pack2 (**pas** `sources/`, qui chevauche pack5) |
| `lib/ingest/mcp-handlers.ts` | **NET-NEW (module registre)** | exporte `ingestTools: McpToolModule` (`{tools, handlers}`) pour `ingest_csv`/`ingest_from_provider`/`get_ingest_job` |
| `app/api/import/smart/route.ts` | **MODIF (un seul pack y touche : pack2)** | insert brut (`:40-101`) → `openIngestJob` + `inngest.send("ingest/run")` ; rétro-compat `sync=true` <50 lignes |
| `db/canonical/field-source.ts` | **MODIF additif (hookpoint T-18)** | provenance : `writeFieldSource` existe déjà (`:42`) — **brancher** son appel dans le compose du job (additif, ne pas réécrire la fn) |
| `lib/import/agentic-executor.ts` | **MODIF additif (hookpoint T-18)** | signal post-import : ajouter l'appel `recordCompanySignal` après import (additif, autour de `executeImport:49`) |
| `lib/ingest/enrich/__tests__/fiber-reveal.test.ts` | **NET-NEW (test pack2)** | client `fetch` mocké + fixture `contact-details/single` ; pas de clé → `null` ; jamais d'appel réseau réel |
| `src/__tests__/ingest/*.test.ts` | **NET-NEW (tests pack2)** | Vitest — voir étapes ; **ne pas** écrire dans `src/__tests__/*` racine (réservé pack7) |

**Zones append-only à éditer (UNE ligne chacune, balisées — §3.2 EXECUTION-GUIDE) :**
- `inngest/registry.ts` : `import { ingestRun, signalScoreDaily } from "./ingest-run";` + ajout au tableau `INNGEST_FUNCTIONS`, dans `// <<< ORION:INNGEST-FNS >>>`.
- `lib/mcp/registry.ts` : `import { ingestTools } from "@/lib/ingest/mcp-handlers";` + ajout à `MCP_MODULES`, dans `// <<< ORION:MCP-MODULES >>>`.

> **Anti-collision (multi-session).** En cas de conflit sur une ligne append-only → **garder les
> deux** (additif). Si une session voisine est active, tu peux **livrer le module handler** et
> **déléguer le câblage du registre à pack7** (mentionne-le dans la PR). Jamais `git add -A` :
> pathspecs scopés `git add app/apps/web/src/lib/ingest app/apps/web/src/inngest/ingest-run.ts …`.

---

## 4. ÉTAPES ORDONNÉES (chacune : action → code/signature → VERIFY → TEST)

> Démarrage session :
> ```sh
> git fetch origin && git checkout main && git pull
> git checkout -b feat/orion-pack2 && git rebase origin/main   # récupère pack0+pack1
> cd app && pnpm install --frozen-lockfile && pnpm --filter @orion/web tsc
> ```
> Boucle par tâche : **code → TEST écrit → VERIFY exécuté toi-même (log/preuve) → commit unique**.
> Trailer de commit obligatoire (voir §6). Re-vérifie branche+HEAD juste avant chaque commit.

### Étape 1 — `lib/ingest/csv-parse.ts` (extraction des helpers CSV) · ~0,5 j-h · T-27/REQ-20
**Action.** Extraire (déplacer, pas dupliquer) `parseCSVLine` (`import/smart/route.ts:115`),
`mapColumnsWithAI` (`:141`, mapping LLM → Haiku via `getModelForTask('light')`), `applyMapping`
(`:256`) vers `lib/ingest/csv-parse.ts`. `route.ts` réimporte ces helpers depuis le nouveau module
(diff additif, pas de réécriture de logique). Le mapping Haiku est **mémoïsé** (calculé une fois sur
l'en-tête + 5 lignes échantillon, réutilisé pour toutes les pages → stocké dans le cursor).

**Signature clé.**
```ts
export function parseCSVLine(line: string): string[];
export async function mapColumnsWithAI(headers: string[], sample: string[][], entity: "company"|"person"|"deal"): Promise<{ fieldMap: Record<string,string> }>;
export function applyMapping(headers: string[], row: string[], fieldMap: Record<string,string>): Record<string,string|null>;
```
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `node -e` ou un mini-test parse un CSV de 3 lignes
et imprime les colonnes mappées. `git diff app/api/import/smart/route.ts` ne montre que des imports
déplacés (pas de logique modifiée).
**TEST.** `csv-parse.test.ts` : `parseCSVLine('a,"b,c",d')` → `['a','b,c','d']` (quote-escaping) ;
`applyMapping` mappe en-têtes hétérogènes vers champs canoniques ; `mapColumnsWithAI` mocké (pas
d'appel réseau réel) renvoie un `fieldMap` déterministe.

### Étape 2 — `lib/ingest/sources/csv-source.ts` (`csvSource`) · ~0,5 j-h · T-27/REQ-20
**Action.** Implémenter `csvSource(text, hint?)` conforme à `InputSource` (importé de
`@/lib/ingest/types`, pack1). `inputFingerprint()` = `sha256(text)` (dédup job niveau 1).
`pull(ctx, cursor?)` parse via `csv-parse.ts`, mappe, et **pagine par 200** ; `sourceRef = 'row:'+i`
(dédup item niveau 2) ; `provider = 'csv'`. **Ne throw jamais** : ligne invalide → skip + log, items
partiels retournés.

**Signature.**
```ts
export function csvSource(text: string, hint?: { entityType?: "company"|"person" }): InputSource;
// pull() → { items: IngestItem[]; nextCursor?: string; total: number }
```
**VERIFY.** Mini-script : `csvSource(<500 lignes>).pull(ctx)` → 200 items + `nextCursor` ; page suivante
→ 200 items réutilisant le mapping mémoïsé (0 appel LLM sur la 2e page).
**TEST.** `csv-source.test.ts` : 500 lignes → 3 pages (200/200/100) ; `provider:'csv'`,
`sourceRef:'row:N'` ; `inputFingerprint()` stable pour le même texte ; une ligne corrompue ne fait pas
throw `pull()`.

### Étape 3 — `lib/ingest/sources/apollo-source.ts` (`apolloPeopleSource`/`apolloOrgsSource`) · ~0,5 j-h · T-27/REQ-20
**Action.** `pull()` appelle l'API Apollo (MCP `apollo_mixed_people_api_search` /
`apollo_mixed_companies_search`, ou REST avec la clé per-tenant déchiffrée de `integration_credentials`).
Mapper le record Apollo → `IngestItem` (`identity.domain/name/linkedinUrl`, `fields.industry/size/…`,
`vendorIds.apollo = <id>`). **CRITIQUE** : `num_current_job_openings` → `rawSignals:[{type:'hiring',
detectedAt:<now ISO>, strength, detail}]`, **JAMAIS** un champ `fields` (`signal-agent-mcp:106`).
`provider = 'apollo'`. `pull()` ne throw jamais.

**VERIFY.** Avec un fixture de réponse Apollo enregistré : `apolloOrgsSource(q).pull(ctx)` → IngestItems
où le hiring count est dans `rawSignals`, pas `fields` (assert explicite).
**TEST.** `apollo-source.test.ts` (client Apollo mocké, fixture JSON) : `num_current_job_openings:4` →
`rawSignals[0].type==='hiring'` et `fields.size === undefined` ; `vendorIds.apollo` posé, pas dans
`identity` ; pagination via cursor.

### Étape 4 — Hookpoints provenance + signal post-import (T-18, gap #455) · ~1,0 j-h · REQ-17
**Action.** Deux ajouts **additifs** (ne réécris pas les fonctions REUSE) :
1. **Provenance** : dans le stage COMPOSE du job, après le merge waterfall, appeler
   `writeFieldSource` (`db/canonical/field-source.ts:42`, **déjà existant**) pour tracer
   `provider`/`field`/`observedAt` dans `account_field_source`. Sans ça, firmo composée mais
   provenance partielle → `citableFacts` plus faibles.
2. **Signal post-import** : autour de `executeImport` (`lib/import/agentic-executor.ts:49`), ajouter
   l'appel `recordCompanySignal` (`lib/signals/record-signal.ts:94`, jsdoc `:86`) pour les
   `rawSignals` issus de l'import. Sans ce hookpoint, un tenant 100%-CSV → **why-now vide**.

**VERIFY.** Après un job CSV avec une ligne portant un `rawSignal`, requêter (via `withTenantTx`)
`account_field_source` (provenance présente) **et** `companies.properties.signals[]` (signal présent).
**TEST.** `hookpoints.test.ts` : un `IngestItem` avec `rawSignals:[{type:'hiring'}]` → après run,
`properties.signals[]` non vide ; le compose multi-source écrit ≥1 ligne `account_field_source`.

### Étape 4bis — `lib/ingest/enrich/fiber-reveal.ts` (Fiber reveal INPUT, branché COMPOSE) · ~0,75 j-h · REQ-17/REQ-20
**Action.** Adaptateur d'**enrichissement contact** Fiber (source d'ENTRÉE, jamais de sortie).
`fiberReveal(linkedinUrl, opts)` appelle **`POST https://api.fiber.ai/v1/contact-details/single`**
(reveal sync standard, waterfall multi-providers, 2–5 crédits, timeout reco 2 min ;
`research/partner-apis-2026-06-27.md §2(4)`). Auth = header **`x-api-key: <clé>`** (Fiber accepte
aussi `Authorization: Bearer` et `apiKey` body ; on standardise sur `x-api-key`). La clé est
**per-tenant chiffrée** lue depuis `integration_credentials` (pack1) puis déchiffrée via
`decryptSecret` (`lib/crypto/settings-encryption.ts:65`, pattern Instantly
`lib/providers/instantly-client.ts:16-17`) — **jamais** `process.env` (directive D7). Body :
`{ linkedinUrl, enrichmentType:{getWorkEmails,getPersonalEmails,getPhoneNumbers}, validateEmails:true }`.
Retour Fiber : `profile.emails[]{email,type,status}` + `phoneNumbers[]{number,type}` →
on retient l'email **work + status valide** prioritaire (puis perso), le 1er téléphone.

**Branchement COMPOSE.** Appelé dans le stage 3 (COMPOSE) de `ingest-run.ts` (Étape 6),
**uniquement** quand un `IngestItem` (kind `person`) porte un `identity.linkedinUrl` **sans email
résolu** — Fiber matérialise alors `email`/`phone` avant `upsertContact`
(`db/canonical/upsert.ts:223`). Tracé en provenance `provider:'fiber'` (rank côté précédence
`< sirene 80`, à confirmer pack1) via `writeFieldSource` (hookpoint Étape 4). **OFF par défaut**
(mémoire `no-fullenrich` : pas d'enrichment auto ; n'enrichit que sur `opts.enabled` du job /
flag tenant). Jamais de throw : pas de clé / 402 out-of-credits / 429 → retourne `null`, le compose
continue sans email (jamais de blocage du job durable).

**Signature.**
```ts
export interface FiberRevealResult { email?: string; emailStatus?: string; phone?: string; raw?: unknown; }
export async function fiberReveal(
  linkedinUrl: string,
  opts: { tenantId: string; enabled?: boolean; tier?: "single" | "exhaustive" },
): Promise<FiberRevealResult | null>;   // null = désactivé / pas de clé / erreur (never-throw)
```
> `tier:"exhaustive"` (waterfall max-coverage async `contact-details/exhaustive/start`+`poll`,
> 4–12 crédits) **réservé** aux prospects `priority_score` haut — soft, non-MVP ; le MVP n'implémente
> que `single`. `tenantId` vient du job (`event.data.tenantId`), **jamais** d'un argument d'outil.

**VERIFY.** Avec un fixture de réponse `contact-details/single` enregistré : `fiberReveal(url,{tenantId,enabled:true})`
→ `{email, phone}` extraits (email work-valide prioritaire) ; sans clé en `integration_credentials`
→ `null` (et **0** appel réseau). Lancer un job person avec un `linkedinUrl` sans email → après COMPOSE,
le contact a un `email` + une ligne `account_field_source`/contact provenance `provider:'fiber'`.
**TEST.** `fiber-reveal.test.ts` (client `fetch` mocké, fixture JSON ; **aucun** appel réseau réel) :
fixture `emails:[{email,type:'work',status:'valid'}]` → `email` = celui-là ; `enabled:false` ou pas de
clé → `null` sans `fetch` ; `429`/`402` mockés → `null` (never-throw) ; le header `x-api-key` est posé,
**aucune** clé lue de `process.env`.

### Étape 5 — `lib/ingest/score-touched.ts` (scoring ciblé) · ~0,5 j-h · T-19/REQ-17
**Action.** `scoreTouched(tenantId, touchedIds)` : `scoreCompanyBatch(tenantId, touchedIds, icps,
customFields)` (`lib/icp/fit-recompute-core.ts:140`) + `bestMultiplierForCompany`
(`inngest/signal-score-daily.ts:72`) → `computePriorityScore` (`lib/scoring/priority-score.ts:70`,
`FIT_FLOOR=0.6`/`ACCESS_FLOOR=0.6` aux `:54-55`). **Ne recompute QUE les IDs touchés**, jamais tout le
tenant. **Pattern insert-then-score** : on calcule, on ne plaque pas un `priority_score` à la main.

**VERIFY.** Spy/log : `scoreTouched(tenant, [a,b])` n'appelle `scoreCompanyBatch` qu'avec `[a,b]` ;
le `priority_score` résultant > plancher quand un signal frais existe.
**TEST.** `score-touched.test.ts` : un signal `hiring` frais → `priorityScore > floor` ; sans signal →
plancher ; le batch ne reçoit que `touchedIds` (assert sur l'arg).

### Étape 6 — `inngest/ingest-run.ts` (orchestrateur 5 stages durable) · ~2,0 j-h · T-17/REQ-16
**Action.** Clone structurel de `inngest/custom-signal-backfill.ts:29`. **`createFunction` 2-arg**
(piège #1) :
```ts
export const ingestRun = inngest.createFunction(
  { id: "ingest-run", name: "Ingest: resolve → compose → signals → score",
    retries: 2,
    concurrency: [{ key: "event.data.jobId", limit: 1 }],   // array, pas objet
    triggers: [{ event: "ingest/run" }] },                  // triggers DANS la config
  async ({ event, step }) => {
    const { jobId, tenantId, source } = event.data;          // tenantId du producteur, jamais argument outil
    // tout accès data DANS withTenantTx(tenantId, …)
  },
);
```
**5 stages durables** (chacun `step.run(...)`, resume-safe par la dédup 3 niveaux) :
1. **open-job** : marquer `ingest_jobs.status='running'` (la ligne est créée par `openIngestJob` côté
   producteur, dédup niveau 1 sur `(tenant_id, fingerprint)`).
2. **loop page** : `source.pull(ctx, cursor)` → pour chaque `IngestItem` : ledger `ingest_items`
   (`onConflictDoNothing` sur `(job_id, source_ref)`, dédup niveau 2) → **IDENTITY-RESOLVE**
   `upsertAccount` (`db/canonical/upsert.ts:108`) / `upsertContact` (`:223`) via `accountMatchPlan`
   (`db/canonical/identity.ts:67`) / `contactMatchPlan` (`:125`), `findAccountMatch` insert-ou-merge
   (`upsert.ts:60`, dédup niveau 3 sur identityKey/domain/email).
3. **COMPOSE** : `enrichCompany` waterfall (`lib/providers/company-enrichment/waterfall.ts:148`,
   merge first-non-null `:77`, geo-routée TLD) → précédence `pickWinner` (`db/canonical/precedence.ts:53`,
   `PROVIDER_RANK` `:9` : manual 100 > sirene/zefix 80 > linkedin 55 > apollo 50 > csv 40 > llm 20) →
   trace `writeFieldSource` (étape 4 hookpoint 1). **Contact reveal Fiber (Étape 4bis)** : pour un
   `IngestItem` person avec `identity.linkedinUrl` **sans** email, appeler `fiberReveal(linkedinUrl,
   {tenantId, enabled})` AVANT `upsertContact` → matérialise `email`/`phone` (provenance `provider:'fiber'`).
   `null` (clé absente / OFF / erreur) → on poursuit sans email (never-throw, le job reste durable).
4. **ACQUIRE SIGNALS** : `recordCompanySignal` (`lib/signals/record-signal.ts:94`) ←
   `IngestItem.rawSignals` → `properties.signals[]` (étape 4 hookpoint 2).
5. **score + close-job** : `scoreTouched(tenantId, touchedIds)` (étape 5) ; incrémente les compteurs
   `ingest_jobs` (`pulled/resolved/created/merged/skipped/signals/scored`) ; `status='done'`
   (ou `'error'` + `error` sur exception, retries Inngest gèrent le transient).

**VERIFY.** Lancer un job CSV en local (`inngest dev` ou invocation directe du handler avec un event
mocké). Preuve : log des 5 stages + `ingest_jobs` à `done` avec compteurs > 0 + un `companies.id`
résolu. **Re-soumettre le même CSV** → même `jobId` (fingerprint), 0 ré-insertion (idempotence prouvée).
**TEST.** `ingest-run.test.ts` : merge CSV(name)+Apollo(domain)+Sirene(industry) → **un seul**
`companies.id`, `name`←CSV, `domain`←Apollo, `industry`←Sirene (rank 80 gagne, CSV 40 n'écrase
jamais) ; re-run du job → idempotent (aucune nouvelle ligne) ; un retry de page ne ré-insère pas
(dédup niveau 2).

### Étape 7 — `inngest/signal-score-daily.ts` (cron recompute) · ~0,25 j-h · REQ-17
**Action.** Cron quotidien qui recalcule les `priority_score` du tenant en appliquant les multipliers
**appris** (via l'alias-map `taxonomy.ts` de pack1). Gabarit = l'actuel `signal-score-daily.ts:95-108` :
```ts
export const signalScoreDaily = inngest.createFunction(
  { id: "signal-score-daily", retries: 1, concurrency: [{ limit: 1 }],
    triggers: [{ cron: "0 6 * * *" }] },
  async ({ step }) => { /* withTenantTx(elevayTenantId) → bestMultiplierForCompany → computePriorityScore */ },
);
```
**BUG À NE PAS PORTER (§7).** Les signaux écrits `{type:'funding_recent'}` doivent matcher les
multipliers keyés canonique `{funding}` — c'est `taxonomy.ts` (pack1) qui canonicalise. Vérifie que le
chemin de lecture du multiplier passe par l'alias-map, sinon plancher 1.0×.
**VERIFY.** Invoquer le handler une fois → `priority_score` recalculé avec multiplier > 1.0 pour une
société portant un signal `funding` frais (log avant/après).
**TEST.** `signal-score-daily.test.ts` : société avec signal `funding_recent` frais → multiplier appliqué
(> 1.0×, **pas** le plancher) après recompute.

### Étape 8 — `lib/ingest/mcp-handlers.ts` (3 outils MCP) · ~0,5 j-h · T-23/REQ-19
**Action.** Exporter `ingestTools: McpToolModule` (`{ tools: ToolDef[]; handlers: Record<string,Handler> }`,
type de pack0 `lib/mcp/types.ts`). `tenantId` est **injecté par le serveur** (Bearer) — **jamais** un
champ d'`inputSchema` (tripwire `no-tenant-arg.test.ts`).
- `ingest_csv` — input zod `{ csv_text(≤5MB), entity_type?, acquire_signals?, score? }` ;
  annotation `{readOnly:false, destructive:false, idempotent:false, openWorld:true}` ;
  handler = `openIngestJob(tenantId, csvSource(csv_text, hint))` (`lib/ingest/jobs.ts`, pack1) +
  `inngest.send("ingest/run", {data:{jobId, tenantId, source:'csv'}})` →
  retour `{ job_id, status:"queued", estimated_records, poll:"get_ingest_job" }`.
  CSV <50 lignes : mode `sync=true` rétro-compat (exécution inline, pas de poll).
- `ingest_from_provider` — input `{ provider: enum[apollo_people|apollo_orgs|waterfall_enrich|fiber],
  query, max_records(≤2000) }` ; route vers `apolloPeopleSource`/`apolloOrgsSource` (`waterfall_enrich`
  = pack5/soft). **`fiber` = ENTRÉE uniquement** : pour le reveal contact, Fiber agit **dans le COMPOSE**
  (Étape 4bis, `fiberReveal`), pas comme un `pull()` autonome ; l'enum `fiber` ici ne déclenche **que**
  l'enrichissement contact d'un job existant (jamais un envoi — Fiber n'a aucun endpoint outbound). La
  source signaux Fiber (Tracker webhook) est **pack5** (`fiber-source.ts`), pas ce switch.
- `get_ingest_job` — input `{ job_id }` ; annotation `readOnly:true` ; lit `ingest_jobs` (via
  `withTenantTx`) → `{ status, progress:{pulled,resolved,signals,scored,total}, result:{created,merged,skipped}, error }`.

**VERIFY.** `curl -H "Authorization: Bearer mcp_…" .../api/mcp` méthode `tools/call` `ingest_csv` →
`{job_id}` ; `get_ingest_job{job_id}` → progression qui évolue. (Ou test d'intégration du handler.)
**TEST.** `mcp-handlers.test.ts` : `ingest_csv` retourne un `job_id` + `status:queued` ;
`get_ingest_job` reflète la progression ; même `csv_text` re-soumis → **même** `job_id` (fingerprint) ;
`csv_text` > 5MB → rejet zod ; **aucun** outil n'expose `tenantId` dans son `inputSchema`.

### Étape 9 — MODIF `app/api/import/smart/route.ts` (producteur d'event) · inclus · T-22/REQ-16
**Action.** Remplacer l'insert brut (`route.ts:40-101`, inserts directs `companies`/`contacts`/`deals`
aux `:66/:76/:90`) par : `openIngestJob(tenantId, csvSource(text, hint))` + `inngest.send("ingest/run")`.
Conserver un chemin **`sync=true`** rétro-compatible pour < 50 lignes (exécution inline, réponse
immédiate). Diff **additif/wrapper uniquement** (invariant T-38 `reuse-untouched.test.ts`).
**VERIFY.** POST d'un CSV sur la route → réponse `{job_id}` (mode async) ; un CSV <50 lignes avec
`sync=true` → réponse immédiate avec le résumé. `git diff` montre un wrapper, pas une réécriture.
**TEST.** couvert par `ingest-run.test.ts` + un test de route asserttant la bascule async/sync.

### Étape 10 — Câblage registres (append-only) + tripwires pack · inclus · §3
**Action.** Ajouter les **2 lignes** append-only (§3) dans `inngest/registry.ts` et `lib/mcp/registry.ts`.
**VERIFY.** `tools/list` MCP liste `ingest_csv`/`ingest_from_provider`/`get_ingest_job` ;
`INNGEST_FUNCTIONS` contient `ingestRun` + `signalScoreDaily` (le endpoint `/api/inngest` les sert).
**TEST.** un test asserte que `MCP_MODULES` expose les 3 outils et qu'aucun n'a `tenantId` en input.

---

## 5. CRITÈRES D'ACCEPTATION (testables)

1. **Convergence/identité** : merge CSV+Apollo+Sirene du même sujet → **un seul** `companies.id` ;
   `name`←CSV, `domain`←Apollo, `industry`←Sirene (précédence rank 80 > 40). CSV(40) n'écrase
   **jamais** Sirene(80).
2. **Idempotence (3 niveaux)** : re-soumettre le même `csv_text` → **même** `job_id` (fingerprint, niv.1) ;
   un retry Inngest d'une page → 0 ré-insertion (niv.2) ; « ACME SAS » + « acme.io » fusionnent (niv.3).
3. **Signal, pas firmo** : Apollo `num_current_job_openings` arrive dans `rawSignals` (`type:'hiring'`),
   **jamais** dans `fields`.
4. **Why-now non vide (gap #455 fermé)** : un CSV portant un `rawSignal` → après run,
   `companies.properties.signals[]` non vide **et** ≥1 ligne `account_field_source` (hookpoints T-18).
5. **Scoring ciblé** : `scoreTouched` n'appelle `scoreCompanyBatch` qu'avec les `touchedIds` ; un signal
   frais → `priorityScore > floor` ; multiplier `funding_recent` appliqué (> 1.0×) après le cron daily
   (alias-map, pas de plancher).
6. **Outils MCP** : `ingest_csv` → `{job_id, status:"queued"}` ; `get_ingest_job` reflète la progression ;
   `csv_text>5MB` → rejet zod ; **aucun** outil n'accepte `tenantId` en argument.
7. **Durabilité/résilience** : `ingest-run` = `createFunction` 2-arg, `concurrency` array,
   `triggers` dans la config ; tout accès data via `withTenantTx` ; `source.pull()` ne throw jamais ;
   un job en échec → `ingest_jobs.status='error'` + retries.
8. **REUSE intact** : `git diff` ne modifie aucun module métier Elevay hors des 2 hookpoints additifs
   listés ; le `diff` de `import/smart/route.ts` est un wrapper.
9. **Fiber reveal = ENTRÉE, never-throw, clé per-tenant** : `fiberReveal` appelle
   `POST /v1/contact-details/single` avec `x-api-key` déchiffré de `integration_credentials` (jamais
   `process.env`) ; pas de clé / OFF / `402`/`429` → `null` sans casser le job ; un person avec
   `linkedinUrl` sans email → email matérialisé + provenance `provider:'fiber'`. Aucun chemin d'envoi
   Fiber n'existe (entrée seule).

---

## 6. DEFINITION OF DONE

- Tous les fichiers de §3 livrés ; **chaque** étape §4 a son TEST Vitest + son VERIFY exécuté
  **par toi** (preuve : log/sortie collée dans la PR, pas « teste chez toi »).
- `cd app && pnpm --filter @orion/web tsc` **vert** + `pnpm --filter @orion/web test` **vert**
  (sur un `pnpm install --frozen-lockfile` **propre**, pas un `node_modules` junctionné — piège #13).
- Les 8 critères d'acceptation §5 passent.
- Aucun fichier hors ownership modifié (`git diff --stat` scopé pack2 + les 2 lignes append-only).
- Tripwires verts : `no-tenant-arg`, `rls` (pas de `set_config(...,false)`), `reuse-untouched`.
- Commits atomiques (un changement logique chacun : extraction, sources, orchestrateur, cron, outils,
  MODIF route — séparés). Trailer obligatoire sur chaque commit :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017cpMyY7RNVYTQmqzYp8Qz4
  ```
- Re-vérifier branche+HEAD juste avant chaque commit/push (tree partagé, sessions parallèles).
- PR ouverte sur `feat/orion-pack2` ; **full CI verte** (gitleaks + tsc/vitest + Vercel) avant merge ;
  squash + delete-branch ; surveiller le push CI de `main`.

---

## 7. PIÈGES SPÉCIFIQUES À CE LOT

1. **`createFunction` est 2-arg** (`createFunction(config, handler)`) : triggers **dans** la config
   (`triggers:[{event}|{cron}]`), `concurrency` est un **array**. Gabarit vérifié
   `inngest/signal-score-daily.ts:95-108`. La forme 3-arg ne compile pas ici.
2. **Le bug `funding_recent` (mémoire `signals-world-class`)** : le daily n'appliquait jamais les
   multipliers car les signaux étaient écrits `{type:'funding_recent'}` mais les multipliers keyés
   canonique `{funding}` → `undefined` → **plancher 1.0×** (`signal-score-daily.ts:87`). Fix =
   `taxonomy.ts` (pack1, DÉP-1) en amont ; **vérifie** que ton chemin de lecture du multiplier passe
   par l'alias-map. Ne réintroduis pas le bug en comparant des types bruts.
3. **Apollo hiring → signal, jamais firmo** : `num_current_job_openings` va dans `rawSignals`
   (`type:'hiring'`), **pas** dans `fields`. C'est un critère d'acceptation testé (§5.3).
4. **`pull()` ne throw JAMAIS** : une erreur source → items partiels + log ; le job reste durable
   (resume-safe). Un throw casse la durabilité Inngest.
5. **Dédup 3 niveaux = la garantie d'idempotence** : niveau 1 `ingest_jobs (tenant_id, fingerprint)`
   `onConflictDoUpdate` ; niveau 2 `ingest_items (job_id, source_ref)` `onConflictDoNothing` ;
   niveau 3 `findAccountMatch`/`findContactMatch` (REUSE). Ne pas court-circuiter : c'est ce qui rend
   un retry Inngest sûr.
6. **`vendorIds` = side-map, JAMAIS dans l'identité** (`upsert.ts` AC4). Apollo id va dans
   `vendorIds.apollo`, pas dans `identity`.
7. **Précédence stricte** : CSV (rank 40) ne doit **jamais** écraser Sirene/Zefix (80) ni manual (100).
   `pickWinner` (`precedence.ts:53`) tranche, tie → `observedAt` récent. Un signal n'entre **jamais**
   dans `field_source` (sink séparé `properties.signals[]`).
8. **MODIF chirurgicale de `import/smart/route.ts`** : wrapper/additif only (un seul pack y touche).
   Ne réécris pas la logique ; garde le chemin `sync=true` <50 lignes. `reuse-untouched.test.ts`
   (pack7) échouera sinon.
9. **`tenantId` dérivé serveur** : Bearer `mcp_*` pour les outils, `event.data.tenantId` pour Inngest —
   jamais un argument d'outil. Tripwire `no-tenant-arg.test.ts` interdit `tenantId` dans `inputSchema`.
10. **Tout accès data via `withTenantTx(tenantId, fn)`** (`set_config(...,true)` transaction-local).
    Jamais le `db` global hors transaction, jamais `set_config(...,false)` (empoisonne Supavisor).
11. **Mémoïser le mapping Haiku** : calculé une fois (en-tête + échantillon), réutilisé pour toutes les
    pages via le cursor. Recompute par page = coût LLM inutile + non-déterminisme.
12. **CI = `@orion/web` uniquement** ; valide sur install `--frozen-lockfile` propre (piège #13 :
    `node_modules` junctionné passe tsc local mais peut échouer en CI).
13. **`writeFieldSource` existe déjà** (`db/canonical/field-source.ts:42`) — tu **branches son appel**
    dans le compose, tu ne le réécris pas. Le doc parlait de `functions.ts:~220` (obsolète) ; le fichier
    réel est `field-source.ts`. De même `recordCompanySignal` est à `:94` (jsdoc `:86`).
14. **Fiber = INPUT, jamais OUTPUT** (`research/partner-apis-2026-06-27.md §2`, OpenAPI v1.40.0 lue :
    **zéro** endpoint d'envoi). Ne construis **aucun** `FiberAdapter` de sortie. Le reveal vit dans
    `enrich/` (pas `sources/` — `sources/fiber-source.ts` est à pack5 pour le **Tracker** signaux) :
    deux rôles Fiber distincts, deux fichiers, deux packs. La clé `x-api-key` est **per-tenant**
    (1 clé = 1 org Fiber) — lue chiffrée de `integration_credentials`, jamais en clair, jamais en env.
15. **Fiber reveal OFF par défaut** : pas d'enrichment auto (mémoire `no-fullenrich`). N'enrichit que
    sur opt-in job/tenant ; `tier:"exhaustive"` (waterfall async cher) réservé `priority_score` haut,
    non-MVP. Le MVP n'implémente que `single`.

---

## 8. OFFLINE DISCOVERY — le wedge day-one (capacité AJOUTÉE à pack2)

> **Pourquoi ici.** L'ingestion d'un CSV closed-won/lost EST le premier contact d'un nouveau tenant
> avec Orion. Avant tout outbound, avant tout signal live, on doit **dériver de son historique** quel
> signal **discrimine** réellement ses deals. C'est le moment « aha » de la démo (HERO FIGÉ
> `orion/spec/demo-hero-FROZEN.md`). Le pipeline d'ingestion (§4) reste inchangé ; la discovery est un
> **mode additif** branché sur le même upload CSV — réutilise `csv-parse.ts` (Étape 1) pour lire les
> lignes labellisées et l'orchestrateur durable pour tourner hors-ligne.
>
> **Contrat d'entrée minimal (le CSV ne donne QUE) :** `identité` (`company`[, `domain`]),
> `label ∈ {won,lost}`, `close_date` (= J), `deal_source?` (pour la stratification du confounder).
> **Rien d'autre.** Orion **reconstruit** tout le vecteur de signaux depuis des sources HORODATÉES,
> jamais depuis un état firmo présent.

### 8.1 La chaîne (6 maillons, ordre strict)

1. **Enrichir CHAQUE won ET lost** d'un vecteur de signaux **candidats** (pas seulement les won —
   le dénominateur, ce sont les LOST). Un won sans son contrefactuel lost ne discrimine rien.
2. **POINT-IN-TIME (la règle d'or).** Un signal ne compte que si **son événement DATÉ tombe dans la
   fenêtre `[J−90 → J]`**, reconstruite depuis des sources **horodatées** (levée/Crunchbase+SEC Form D,
   job-change/`leadership_change`, commits GitHub-velocity, BODACC modification-dirigeant FR). **JAMAIS
   un état permanent** (« ils ONT un VP Eng » est interdit ; « un VP Eng est ARRIVÉ entre J−90 et J »
   est la seule forme admise). REUSE : `detectActiveSignals(props, asOf)`
   (`lib/scoring/signal-detectors.ts:144`) renvoie déjà `{type, firedAt}` filtré `isFreshAt(type,
   firedAt, asOf)` — on l'appelle avec `asOf = close_date` puis on **réintersecte** avec la fenêtre
   FIXE 90 j (override de la freshness per-type, ex. `leadership_change` = 120 j à
   `signal-detectors.ts:54`, trop large pour le hero). Les `firedAt` viennent des détecteurs
   `SIGNAL_DETECTORS` (`:76`).
3. **DISCRIMINER.** `lift = P(signal|won) / P(signal|lost)`, **dénominateur = les LOST**. REUSE de la
   même mathématique de lift que le scoring : `computeMultiplier({wonWithSignal, lostWithSignal,
   baselineWinRate})` (`lib/scoring/signal-outcomes.ts:217`) — `observedRate/baselineWinRate`, clamp
   `[MIN_MULTIPLIER 0.5, MAX_MULTIPLIER 2.5]` (`:39-40`), `MIN_SAMPLE_SIZE 10` (`:33`). On expose AUSSI
   le ratio brut `P(won)/P(lost)` pour la restitution (le « 6/10 vs 1/7 » du hero).
4. **FILTRER : non-évidence × acquérabilité-à-froid** (les deux portes, AND).
   - **Non-évidence** : pénaliser/jeter toute **reformulation firmo** (`ils-sont-plus-gros`,
     industrie, taille, ARR) — ce n'est pas un *événement*, c'est une description. `isEvidence(type)`
     rejette tout type firmo statique.
   - **Acquérabilité-à-froid** : le signal doit être **re-cherchable sur un compte JAMAIS touché** via
     **le catalogue réel** — c.-à-d. avoir un détecteur dans `SIGNAL_DETECTORS`
     (`signal-detectors.ts:76`, union `SignalType` `:16-22`) / `KNOWN_SIGNAL_TYPES`
     (`lib/sequences/triggers.ts:27`). Sinon **jeter** (un signal qu'on ne sait pas re-détecter à froid
     est inactionnable, peu importe son lift).
5. **PRIOR cross-tenant (sauver le petit N).** 10 won / 7 lost → par-signal, `won+lost` tombe souvent
   **sous `MIN_SAMPLE_SIZE`**. On **rétrécit** (shrinkage bayésien) le lift brut vers le benchmark
   cross-tenant **anonymisé** : REUSE `getAnonymizedBenchmark(industry, companySize)`
   (`lib/scoring/anonymized-signals.ts:225`) — table `anonymized_signal_benchmarks`, garde
   `k = K_ANONYMITY_THRESHOLD ≥ 10` (`:27`), agrégée par `aggregateAnonymizedSignals` (`:56`). Le
   pipeline de multiplier tourne **À FROID sur l'historique uploadé** (pas la table live
   `signal_outcomes`) : `getColdSignalMultipliers` (8.3) alimente `computeMultiplier` avec la
   contingence reconstruite, puis blende le prior, clamp final `[0.5, 2.5]` (= la même bande que
   `getSignalMultipliers` `:245`). Hero : 4,2× brut → **≈3,5× postérieur** (k=14).
6. **RESTITUER (sortie = hypothèse honnête, pas loi).** `{ preuve concrète, confiance HONNÊTE
   (hypothèse, le N est petit), action ("je le guette à froid via Fiber + LinkedIn ; BODACC pour les
   FR"), UNE confirmation }`. Mot-pour-mot calé sur `demo-hero-FROZEN.md` §Restitution 90s.

### 8.2 Modes d'échec À CODER (pas optionnels)

- **Confounder de sourcing** → **stratifier sur `deal_source`/réseau**. Un signal qui n'a de lift que
  parce que les won proviennent d'un même canal (intro fonds) n'est pas un signal de marché. On
  recalcule le lift **dans le stratum froid** (`deal_source = outbound`, comptes jamais touchés) ; s'il
  **s'effondre**, on le démasque (le reveal hero `investor_overlap`). `detectSourcingConfounder` (8.3).
- **Survivorship / data-sale** : **pas de lost dans le CSV** (ou trop peu) → le dénominateur est creux
  → **baisser la confiance AFFICHÉE** (`confidence: "insufficient"` + caveat explicite), ne jamais
  présenter un lift sans contrefactuel comme une loi. `survivorshipPenalty` (8.3).
- **Signal non-ré-acquérable** → **jeter** (porte 4, acquérabilité-à-froid). Pas de demi-mesure : s'il
  n'est pas dans le catalogue de détecteurs à froid, il ne sort pas du rapport.

### 8.3 FICHIERS POSSÉDÉS (net-new pack2 ; namespace exclusif `lib/discovery/`)

> Tous sous `src/` (repo Orion). Aucun chevauchement avec §3. REUSE = copie depuis Elevay (file:line
> source vérifié 2026-06-28). Les **détecteurs datés à froid** (Fiber Tracker, Unipile changed-jobs, BODACC,
> SEC Form D, GitHub-velocity) sont **pack5** ; la discovery les **consomme** via `SIGNAL_DETECTORS` /
> les `signal_snapshots` datés (le seed hero est matérialisé par **pack7**). pack2 livre la **machine
> de découverte** par-dessus, indépendante de l'arrivée de pack5 (testée sur fixtures + le seed FIGÉ).

| Fichier | Type | Détail |
|---|---|---|
| `lib/discovery/types.ts` | **NET-NEW** | `LabeledDeal`, `DatedSignal`, `SignalHypothesis`, `DiscoveryReport` (8.4) |
| `lib/discovery/point-in-time.ts` | **NET-NEW sur REUSE** | `reconstructPointInTime(deal, opts)` ; `DISCOVERY_WINDOW_DAYS=90` ; appelle `detectActiveSignals(props, closeDate)` (`signal-detectors.ts:144`) puis réintersecte `[J−90,J]` ; **jamais d'état permanent** |
| `lib/discovery/lift.ts` | **NET-NEW sur REUSE** | `computeDiscriminantLift(deals)` ; dénominateur = LOST ; réutilise `computeMultiplier` (`signal-outcomes.ts:217`) + ratio brut `P(won)/P(lost)` |
| `lib/discovery/filters.ts` | **NET-NEW** | `isEvidence(type)` (rejette firmo) × `isColdAcquirable(type)` (∈ `SIGNAL_DETECTORS`/`KNOWN_SIGNAL_TYPES`) ; `filterCandidates(hyps)` |
| `lib/discovery/prior.ts` | **NET-NEW sur REUSE** | `getColdSignalMultipliers(...)` : `computeMultiplier` sur la contingence uploadée + shrinkage vers `getAnonymizedBenchmark` (`anonymized-signals.ts:225`, k≥10 `:27`), clamp `[0.5,2.5]` |
| `lib/discovery/confounders.ts` | **NET-NEW** | `stratifyByDealSource(deals)` ; `detectSourcingConfounder(type, strata)` (effondrement sur stratum froid) ; `survivorshipPenalty(totals)` |
| `lib/discovery/discover.ts` | **NET-NEW (orchestrateur pur)** | `runOfflineDiscovery(input)` → `DiscoveryReport` (enchaîne 8.1 maillons 1→6 + 8.2 modes d'échec) ; pur/testable sans DB hormis le prior |
| `inngest/discovery-run.ts` | **NET-NEW sur pattern REUSE** | `discoveryRun` ; `createFunction` 2-arg, `triggers:[{event:"discovery/run"}]`, `concurrency:[{key:"event.data.jobId",limit:1}]` ; tout dans `withTenantTx(tenantId)` ; exporte `discoveryRun` |
| `lib/discovery/__tests__/*.test.ts` | **NET-NEW (tests pack2)** | Vitest — voir 8.5 ; **le seed hero FIGÉ est la fixture d'or** |

**Surface MCP (append-only dans `lib/ingest/mcp-handlers.ts`, Étape 8) :** ajouter l'outil
`discover_from_history` — input zod `{ csv_text(≤5MB), window_days?(défaut 90) }` ; annotation
`{readOnly:false, destructive:false, idempotent:false, openWorld:true}` ; handler = parse via
`csv-parse.ts` (colonnes `company/label/close_date/deal_source`) → `openIngestJob(tenantId, …, kind:'discovery')`
+ `inngest.send("discovery/run", {data:{jobId, tenantId}})` → `{ job_id, status:"queued",
poll:"get_ingest_job" }`. `tenantId` **toujours** du Bearer, jamais en `inputSchema` (tripwire
`no-tenant-arg.test.ts`). Le rapport final se lit via `get_ingest_job` (`result.discovery`).

**Câblage Inngest (append-only, §3) :** étendre la ligne `inngest/registry.ts` →
`import { ingestRun, signalScoreDaily } from "./ingest-run"; import { discoveryRun } from "./discovery-run";`
+ `discoveryRun` dans `INNGEST_FUNCTIONS` (balise `// <<< ORION:INNGEST-FNS >>>`).

### 8.4 Signatures clés

```ts
// lib/discovery/types.ts
export interface LabeledDeal {
  company: string;
  domain?: string;
  label: "won" | "lost";
  closeDate: string;          // J (ISO) — borne haute de la fenêtre
  dealSource?: string;        // "outbound" | "intro fonds …" — stratification confounder
}
export interface DatedSignal {
  type: string;               // type CANONIQUE du catalogue (re-acquérable à froid)
  subtype?: string;           // ex. "vp_eng" pour leadership_change
  eventDate: string;          // date HORODATÉE de l'événement (∈ [J−90,J])
  source: string;             // fiber_tracker | unipile | bodacc | sec_formd | github | crunchbase
}
export interface SignalHypothesis {
  signalType: string;
  nWon: number; nLost: number;       // comptes dans la fenêtre PIT
  pWon: number; pLost: number;       // P(signal|won), P(signal|lost) — DÉNOM = lost
  liftRaw: number;                   // pWon/pLost (la phrase « 6/10 vs 1/7 »)
  liftPosterior: number;             // après prior cross-tenant + clamp [0.5,2.5]
  evidence: boolean;                 // passe le filtre non-évidence
  coldAcquirable: boolean;           // ∈ catalogue détecteurs
  confounder?: { stratum: string; liftInStratum: number; collapsed: boolean };
  confidence: "hypothesis" | "weak" | "insufficient";
  action?: string;                   // "je le guette à froid via Fiber + LinkedIn ; BODACC (FR)"
}
export interface DiscoveryReport {
  hero?: SignalHypothesis;           // le meilleur signal évidence × acquérable, confounder écarté
  ranked: SignalHypothesis[];
  baselineWinRate: number;
  totals: { won: number; lost: number };
  caveats: string[];                 // survivorship/data-sale, petit N…
  restitution: { proof: string; confidence: string; reveal?: string; action: string; confirm: string };
}

// lib/discovery/point-in-time.ts
export const DISCOVERY_WINDOW_DAYS = 90;
export function withinWindow(eventDate: string, closeDate: string, windowDays?: number): boolean;
export async function reconstructPointInTime(
  deal: LabeledDeal,
  opts: { tenantId: string; windowDays?: number },
): Promise<DatedSignal[]>;          // events ∈ [J−windowDays, J] uniquement ; jamais d'état permanent

// lib/discovery/lift.ts  (dénominateur = LOST ; réutilise computeMultiplier)
export function computeDiscriminantLift(
  deals: Array<{ label: "won" | "lost"; signals: Set<string> }>,
): Record<string, { pWon: number; pLost: number; lift: number; nWon: number; nLost: number }>;

// lib/discovery/filters.ts
export function isEvidence(signalType: string): boolean;        // false sur reformulation firmo
export function isColdAcquirable(signalType: string): boolean;  // ∈ SIGNAL_DETECTORS / KNOWN_SIGNAL_TYPES
export function filterCandidates(hyps: SignalHypothesis[]): SignalHypothesis[];

// lib/discovery/prior.ts  (getSignalMultipliers À FROID sur l'historique uploadé)
export async function getColdSignalMultipliers(
  tenantId: string,
  contingency: Record<string, { won: number; lost: number }>,
  baselineWinRate: number,
  ctx?: { industry?: string; companySize?: string },
): Promise<Record<string, number>>; // computeMultiplier(:217) + shrinkage getAnonymizedBenchmark(:225, k≥10), clamp [0.5,2.5]

// lib/discovery/confounders.ts
export function stratifyByDealSource<T extends { dealSource?: string }>(deals: T[]): Record<string, T[]>;
export function detectSourcingConfounder(
  signalType: string,
  strata: Record<string, Array<{ label: "won" | "lost"; signals: Set<string> }>>,
): { stratum: string; liftInStratum: number; collapsed: boolean };
export function survivorshipPenalty(totals: { won: number; lost: number }): { factor: number; caveat?: string };

// lib/discovery/discover.ts
export async function runOfflineDiscovery(input: {
  tenantId: string;
  deals: LabeledDeal[];
  windowDays?: number;            // défaut 90
}): Promise<DiscoveryReport>;
```

### 8.5 ÉTAPES (chacune : action → VERIFY → TEST ; la fixture d'or = le seed hero FIGÉ)

> Le seed FIGÉ (`demo-hero-FROZEN.md`) est encodé une fois en fixture
> `lib/discovery/__tests__/fixtures/hero-seed.ts` : 10 won / 7 lost, colonnes
> `company, close_date, vp_eng_date, deal_source`, + les autres vecteurs datés (funding/hiring/tech/
> investor_overlap/github) tirés de `demo-hero-offers.md §1.2`. **VERIFY de bout en bout = le lift
> calculé sur ce seed FIGÉ.**

- **Étape D1 — `point-in-time.ts`.** `withinWindow` + `reconstructPointInTime`.
  **VERIFY.** Sur le seed : Tessellate (`vp_eng_date 2024-09-30`, close `2024-11-21`, J−90=`2024-08-23`)
  → `leadership_change.vp_eng` PRÉSENT ; un `vp_eng_date` hors `[J−90,J]` → ABSENT (jamais d'état
  permanent). **TEST.** `point-in-time.test.ts` : événement à J−45 → in ; à J−120 → out ; à J+1 → out ;
  un état firmo sans `eventDate` → jamais émis.
- **Étape D2 — `lift.ts`.** `computeDiscriminantLift`, dénominateur = LOST, réutilise `computeMultiplier`.
  **VERIFY.** Seed : `leadership_change` → `nWon/won = 6/10` (P=0,60), `nLost/lost = 1/7` (P≈0,143),
  `liftRaw ≈ 4,2`. **TEST.** `lift.test.ts` : **`leadership_change.vp_eng` FIRE à ~4,2×** sur le seed
  FIGÉ (assert `liftRaw` ∈ [4,0 ; 4,4]) ; un signal présent à parts égales won/lost → lift ≈ 1,0.
- **Étape D3 — `filters.ts`.** `isEvidence` × `isColdAcquirable`.
  **VERIFY.** Un type firmo (`company_size_bigger`) → `isEvidence=false` (jeté) ; `leadership_change`,
  `funding`, `hiring`, `tech_stack_change`, `investor_overlap` → `isColdAcquirable=true` (∈
  `SIGNAL_DETECTORS`). **TEST.** `filters.test.ts` : reformulation firmo jetée ; un type hors catalogue
  → jeté même à lift élevé ; les 6 types du seed passent l'acquérabilité.
- **Étape D4 — `prior.ts`.** `getColdSignalMultipliers` (computeMultiplier À FROID + shrinkage benchmark).
  **VERIFY.** Seed (k=14) : `leadership_change` 4,2× brut → `liftPosterior ≈ 3,5×` (clamp [0,5 ; 2,5]
  appliqué sur le multiplier de scoring ; le `liftPosterior` rapporté reste la croyance honnête ≈3,5).
  **TEST.** `prior.test.ts` : avec benchmark mocké k≥10 → postérieur entre brut et prior (shrinkage
  visible) ; benchmark k<10 → ignoré (pas de prior, on garde le brut + baisse de confiance).
- **Étape D5 — `confounders.ts`.** `stratifyByDealSource` + `detectSourcingConfounder` + `survivorshipPenalty`.
  **VERIFY.** Seed : `investor_overlap` a un lift global fort MAIS **s'effondre sur le stratum froid**
  (`deal_source = outbound`) → `collapsed=true`, `liftInStratum ≈ 0/≈baseline` ; `leadership_change`
  **tient** dans le stratum froid (Tessellate + Meridian côté won, Pinnacle côté lost). Un CSV sans
  lost → `survivorshipPenalty.factor < 1` + caveat. **TEST.** `confounders.test.ts` :
  **l'effondrement du confounder `investor_overlap` sur le stratum froid** (assert `collapsed===true`
  ET `leadership_change` non effondré) ; 0 lost → confidence dégradée.
- **Étape D6 — `discover.ts` + `inngest/discovery-run.ts` + MCP `discover_from_history`.**
  **VERIFY.** `runOfflineDiscovery({tenantId, deals: heroSeed})` → `report.hero.signalType ===
  'leadership_change'`, `report.hero.confidence === 'hypothesis'`, `report.hero.confounder` absent,
  un `investor_overlap` présent dans `ranked` AVEC `confounder.collapsed===true`, et
  `report.restitution` non vide (preuve + confiance honnête + reveal + action + 1 confirmation).
  Job durable : `discover_from_history{csv_text}` → `{job_id}` ; `get_ingest_job{job_id}` →
  `result.discovery`. **TEST.** `discover.test.ts` (end-to-end sur le seed FIGÉ) : hero =
  `leadership_change.vp_eng` à ~4,2× brut / ~3,5× postérieur, **confounder `investor_overlap`
  effondré sur le stratum froid**, sortie **hypothèse** (jamais « loi »).

### 8.6 CRITÈRES D'ACCEPTATION discovery (testables — s'ajoutent à §5)

10. **Point-in-time strict** : un signal n'est compté que si son `eventDate ∈ [J−90,J]` ; un état
    permanent (sans date d'événement dans la fenêtre) n'entre **jamais** dans la contingence.
11. **Lift discriminant, dénominateur = lost** : sur le seed FIGÉ, `leadership_change.vp_eng` →
    `liftRaw ≈ 4,2×` (6/10 vs 1/7) ; le calcul réutilise `computeMultiplier` (`signal-outcomes.ts:217`).
12. **Filtre non-évidence × acquérabilité** : toute reformulation firmo est jetée ; tout signal absent
    du catalogue `SIGNAL_DETECTORS`/`KNOWN_SIGNAL_TYPES` est jeté, peu importe son lift.
13. **Prior cross-tenant à froid** : petit N rattrapé par `getAnonymizedBenchmark` (k≥10), clamp
    `[0,5 ; 2,5]` ; hero 4,2× brut → ≈3,5× postérieur (k=14).
14. **Confounder de sourcing démasqué** : `investor_overlap` s'effondre sur le stratum froid
    (`deal_source=outbound`) tandis que `leadership_change` tient → reveal hero reproductible.
15. **Honnêteté du N** : sortie = `confidence:"hypothesis"` (jamais « loi ») ; pas de lost → confiance
    AFFICHÉE dégradée + caveat survivorship ; signal non-ré-acquérable → jeté.
16. **Tenant + durabilité** : `discovery-run` = `createFunction` 2-arg, `withTenantTx`, `tenantId` du
    Bearer/`event.data` ; `discover_from_history` n'expose pas `tenantId` (tripwire `no-tenant-arg`).

### 8.7 PIÈGES discovery (s'ajoutent à §7)

16. **Point-in-time ≠ freshness live.** La discovery FIGE la fenêtre à **90 j** (`DISCOVERY_WINDOW_DAYS`)
    et la calcule **relative à `close_date`**, PAS à `now`. `isFreshAt`/`SIGNAL_WINDOWS`
    (`signal-detectors.ts:46-55`, ex. `leadership_change=120`) servent à dater les détecteurs, mais la
    fenêtre de discrimination est ré-intersectée à 90 j autour de J. Ne pas réutiliser la freshness
    per-type comme fenêtre de lift.
17. **Dénominateur = LOST, toujours.** Le piège classique = calculer P(signal|won) seul (survivorship).
    Sans lost, pas de lift — `survivorshipPenalty` baisse la confiance AFFICHÉE, on ne masque jamais.
18. **`getSignalMultipliers` À FROID ≠ la table live.** La discovery NE lit PAS `signal_outcomes`
    (vide pour un nouveau tenant) ni n'y écrit ; elle alimente `computeMultiplier` avec la **contingence
    reconstruite** depuis l'upload, et n'emprunte à la base que le **benchmark anonymisé** cross-tenant
    (`anonymized-signals.ts`). Ne pas polluer les multipliers appris du tenant avec l'historique uploadé.
19. **Acquérabilité d'abord, lift ensuite.** Un signal au lift énorme mais introuvable à froid (hors
    catalogue) est **inactionnable** : il est jeté AVANT le classement, jamais présenté « pour info ».
20. **Sortie = hypothèse, pas loi.** Toute restitution porte la confiance honnête (« 10 contre 7, c'est
    petit »). Interdiction de formuler une certitude. Le wording est calé sur `demo-hero-FROZEN.md`.
