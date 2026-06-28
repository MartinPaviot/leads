# Orion — 00-PREREQUISITES.md

> **« TOUTES LES CARTES EN MAIN »** — checklist pour qu'une session Claude exécute `tasks.md`
> (T-1..T-42) **sans blocage**. Lis ce fichier **en premier**, avant `requirements.md` /
> `design.md` / `tasks.md`. Il liste : (1) les prérequis d'environnement, (2) les prérequis de
> données (seed), (3) les pièges vérifiés, (4) les 4 dépendances dures, (5) quoi lire par type de
> tâche. La dernière section **GAPS** est la vérité honnête sur ce qui manque encore pour une
> exécution 100 % autonome.

---

## DÉCISIONS DB FINALISÉES (founder — priment sur TOUT langage antérieur)

Ces décisions **annulent** toute mention antérieure de « Supabase séparé », « DB dédiée Orion » ou
« Convex » dans la recherche ou les drafts. En cas de conflit, **ce bloc gagne**.

1. **DB = la base du repo `leads` (Supabase Postgres d'Elevay), PARTAGÉE** via `DATABASE_URL`.
   **PAS** de DB séparée. **PAS** de Convex (la réactivité passe déjà par Supabase Realtime).
2. **SCOPE = tenant `elevay` UNIQUEMENT.** Isolation par **RLS** : le runtime se connecte avec un
   **rôle restreint `elevay_app`** + `withTenantTx(elevayTenantId)`. Au runtime, **jamais**
   d'écriture via le rôle owner (`postgres`) — l'owner est **réservé aux migrations additives
   one-shot** (hors-bande, via `DATABASE_URL_OWNER`).
   - **PIÈGE :** postgres-js + Supavisor (mode TRANSACTION, port 6543) → `set_config(..., true)`
     est **TRANSACTION-LOCAL** (`db/rls.ts`). **JAMAIS** `set_config(..., false)` (session-local) :
     ça empoisonne les backends poolés.
3. **Modules Elevay COPIÉS (vendorés)** dans `src/` du repo Orion séparé, **depuis la source
   Elevay** (même schéma, même DB), pas réécrits from scratch. Le `file:line` = **provenance à
   copier**, pas une cible d'import :
   - `evaluateSend` — `lib/guardrails/sending-gate.ts:212`
   - `IntelligenceBrief` + `buildIntelligenceBrief` — `lib/campaign-engine/types.ts:50`,
     `build-intelligence-brief.ts:26`
   - `recordCompanySignal` — `lib/signals/record-signal.ts:86`
   - waterfall — `lib/providers/company-enrichment/*`
   - identité — `db/canonical/identity.ts:67`, `upsert.ts:108`
   - serveur MCP — `app/api/mcp/route.ts`
4. **Tables net-new EN ADDITIF** au schéma partagé : `integration_credentials` (clés partenaires
   per-tenant chiffrées), `ingest_jobs` / `ingest_items`, `export_jobs` / `outbound_destinations`
   (+ `export_items`), `signal_snapshots` (velocity). dev : `db:push` ; prod : runner custom +
   rôle owner one-shot.
5. **Build sur l'instance DEV** (`leadsens-localdev`) ; **démo sur l'instance portant le tenant
   `elevay`**. Le tenant `elevay` **doit exister** (sinon : créer ligne `tenants` + `user` + clé
   `mcp_*` — procédure §1.2).
6. **Brief ZÉRO prose** (`citableFacts[]` / `doNotClaim[]`). Sorties vers **Instantly + Orange Slice + Lopus + webhook**
   (Fiber AI = ENTRÉE, pas une sortie), TOUTES passées par **`evaluateSend` (oracle d'éligibilité)
   AVANT export** ; le gate est **non contournable depuis JSON-RPC** (il vit DANS le wrapper
   d'export, inatteignable par l'appelant MCP).

> **Nuance de portage (décision founder 2026-06-28).** `tasks.md`/`design.md` ont été écrits en
> mode « dépôt séparé `orion/app`, renommer `elevay`→`orion` ». **La décision founder tranche :**
> **Orion = repo SÉPARÉ** (`@orion/web`) **+ COPIE (vendoré) des modules** depuis Elevay, **mais
> sur la DB PARTAGÉE d'Elevay, scope tenant `elevay`**. Conséquences concrètes :
> - **DB = celle d'Elevay** (Supabase Postgres partagé), pas une base neuve. Les tables net-new
>   sont ajoutées **au schéma partagé** en additif. Le schéma Drizzle **copié** dans Orion doit
>   matcher les tables partagées qu'utilisent les modules copiés.
> - Le code net-new (adaptateurs/orchestrateur/exposition MCP) reste tel que spécifié, et les
>   modules Elevay sont **copiés (vendorés)** dans `src/` du repo Orion **depuis la source**, pas
>   importés via un workspace (repo séparé → pas de dépendance workspace sur Elevay).
> - **`elevayTenantId`** remplace partout le « tenant du Bearer » pour le scope (le Bearer `mcp_*`
>   reste la source du `tenantId` au runtime — il pointera sur le tenant `elevay`).
> - Le repo Orion porte ses propres **`@orion/web`** et `id:"orion"` Inngest. **Mais** la table de
>   migrations **n'est PAS** renommée : la DB partagée impose le **même** ledger
>   `__elevay_migrations` et le **même** runner (`scripts/apply-migrations.ts`, copié). Voir GAP-1.

---

## 1. PRÉREQUIS D'ENVIRONNEMENT

### 1.1 Variables d'environnement (le strict nécessaire pour booter + démo)

Boot minimal (REQ-29, `requirements.md:1138`) : **`DATABASE_URL` + `AUTH_SECRET` +
`ANTHROPIC_API_KEY`** suffisent à démarrer. Le reste est par domaine. `.env` jamais commité (hook
secret-scan).

| Var | Rôle | Valeur attendue | Statut |
|---|---|---|---|
| `DATABASE_URL` | **DB partagée** (rôle app **restreint** `elevay_app`) | dev = `leadsens-localdev` ; démo = instance du tenant `elevay` | **REQUIS** |
| `DATABASE_URL_OWNER` | rôle `postgres` (migrations one-shot) — **opérateur-only, JAMAIS dans `src`** (grep=0) | string owner Supabase | **REQUIS (migrations)** |
| `AUTH_SECRET` / `NEXTAUTH_SECRET` | NextAuth v5 | secret généré | **REQUIS** |
| `AUTH_URL` / `NEXTAUTH_URL` | base URL auth | `http://localhost:3000` en dev | requis (auth) |
| `ANTHROPIC_API_KEY` | LLM principal | clé Anthropic | **REQUIS** |
| `ANTHROPIC_API_BASE` | baseURL — **DOIT inclure `/v1`** | `https://api.anthropic.com/v1` ou `https://eu.anthropic.com/v1` | optionnel (défaut US `/v1`) |
| `ANTHROPIC_REGION` | EU sovereign | `eu` pour la base EU | optionnel |
| `OPENAI_API_KEY` | embeddings + fallback circuit-breaker | clé OpenAI | recommandé |
| `MISTRAL_API_KEY` / `LLM_PROVIDER` | provider EU-souverain opt-in | `mistral`/`auto`/`anthropic` | optionnel |
| `AI_DISABLED` | kill-switch LLM (`getModelForTask`→null) | `1` pour couper | flag |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | bg jobs / crons | clés Inngest | requis (jobs) |
| `APOLLO_API_KEY` | source Tier 1 Apollo (REST per-tenant possible aussi) | clé Apollo | requis pour `apollo_*` source |
| `CRUNCHBASE_API_KEY` | source funding (complément SEC) | clé Crunchbase | optionnel |
| `PAPPERS_API_KEY` | registre FR (complément Sirene keyless) | clé Pappers | optionnel |
| `ZEFIX_API_USER` / `ZEFIX_API_PASSWORD` | registre CH | creds Zefix | optionnel |
| `TARGETING_GATE_ENABLED` | gate 7 (SAFE_MODE targeting, unreviewed→deny) | **`on`** pour la démo (sinon le skip `not_targeted` ne se déclenche pas) | **flag clé démo** |
| `LAWFUL_BASIS_GATE` / `GDPR_REGION` | gate 5 + EU-host guard | `eu` | flag |
| `RESEARCH_AGENT_ENABLED` | recherche per-prospect | `1` | flag |
| `ORION_INGEST_ENABLED` / `ORION_EXPORT_ENABLED` | flags Orion-spécifiques **à créer** | `on` pour la démo | flag (net-new) |
| `SELF_SERVE_SIGNUP_ENABLED` / `BETA_SIGNUP_CODE` | gating sign-up humain | selon besoin | optionnel |
| `SENTRY_DSN` / `NEXT_PUBLIC_POSTHOG_KEY` | observabilité | — | optionnel |

**Clés partenaires SINK (Instantly / Orange Slice / Lopus / webhook) :** **JAMAIS en
env.** Stockées **per-tenant chiffrées** dans `integration_credentials` (REQ-29,
`requirements.md:1128`). Exactement le pattern Instantly d'Elevay (il n'existe **pas**
d'`INSTANTLY_API_KEY` env). Un test « env-shape » asserte : aucune clé sink lue depuis
`process.env`.

**À DROP (hors périmètre Orion) :** voice/Twilio, Deepgram, Stripe, Recall, Zoom, BullMQ/Redis,
googleapis (sauf OAuth login), `@neondatabase/serverless`.

### 1.2 Le tenant `elevay` — vérifier qu'il existe, sinon le créer

Le scope runtime entier dépend d'une ligne `tenants` pour `elevay` + au moins un `user` + une clé
`mcp_*`. Sans elle : `authenticateMcpRequest` → 401 sur tout appel, et `find_prospects` /
`get_outreach_brief` n'ont pas de tenant à interroger.

**Vérifier (rôle owner, hors-bande) :**
```sql
SELECT id, name, settings->'mcpApiKeys' FROM tenants WHERE name ILIKE 'elevay';
```

**Si absent — procédure de création (one-shot, via `DATABASE_URL_OWNER`) :**
1. **Ligne `tenants`** : `INSERT INTO tenants (id, name, settings) VALUES (gen_random_uuid(),
   'elevay', '{"mcpApiKeys":[]}'::jsonb)` → noter l'`id` (= `elevayTenantId`).
2. **User** : créer un `users` rattaché à ce tenant (rôle `admin`) — réutiliser le chemin
   `resolveUserTenant` (`auth.ts:80-196`) ou insert direct owner.
3. **Clé `mcp_*`** : générer une clé `mcp_<random>`, en stocker le **sha256** dans
   `tenants.settings.mcpApiKeys[]` au format `McpApiKeyEntry` (`tenant-settings.ts:431` :
   `{keyId, hashedKey, scopes, createdAt, lastUsedAt?}`). **Conserver la clé en clair UNE fois**
   (côté opérateur) — elle ne sera plus jamais lisible ; c'est le Bearer des appels MCP de démo.
4. Vérifier : `curl -H "Authorization: Bearer mcp_…" .../api/mcp` (méthode `initialize`) → 200 et
   le `tenantId` résolu = `elevayTenantId`.

> Le `tenantId` vient **toujours** du Bearer (invariant #1) — jamais d'un argument. Un tripwire
> (`no-tenant-arg.test.ts`) interdit `tenantId` comme champ d'`inputSchema`.

### 1.3 Le rôle restreint `elevay_app` (RLS)

- Runtime = rôle **`elevay_app`** (non-owner, soumis aux policies RLS 0074). Owner = `postgres` via
  `DATABASE_URL_OWNER`, **0 hit dans `src`** (`design.md:229-231`).
- Le binding tenant se fait **uniquement** dans `withTenantTx(elevayTenantId, fn)`
  (`db/rls.ts:44-54`) → `SELECT set_config('app.tenant_id', <id>, true)`.
- **Vérifier** que `elevay_app` a bien les GRANT nécessaires sur les tables net-new après chaque
  `db:push`/migration (les nouvelles tables doivent être lisibles/écrivables par le rôle app sous
  RLS). Voir GAP-4.

---

## 2. PRÉREQUIS DE DONNÉES (seed du tenant `elevay`)

Sans données, le WOW meurt : `find_prospects` renvoie vide, le brief est plat, le climax (export
gaté) rate. Le seed doit suivre le pattern **insert-then-score** (mémoire `signal-dominant-scoring`)
— insérer puis faire passer par résolution → signal → score, **pas** écrire un `priority_score` à la
main.

### 2.1 Ce qu'il faut seeder (`scripts/seed-demo.ts`, T-42)

1. **Un `ingest_csv` de seed** qui passe par le pipeline réel (résolution → précédence → signal →
   score) → garantit un **why-now réel**, pas un champ plaqué.
2. **Targeting = `targeted`** sur tous les prospects de démo **SAUF un compte-piège** laissé
   `unreviewed` → c'est lui qui prouve le skip `not_targeted` à l'export (le climax du gate).
3. **Un sujet HERO** avec :
   - **≥1 `publicContent.type:"metric"`** (sinon `citableFacts` vide → brief plat),
   - **firmo + provenance non vides** (`firmographicsHaveSignal:198`),
   - **≥1 signal FRAIS** (un signal périmé est **pire** qu'aucun — `freshness.ts:98`),
   - **convergence 2+ sources** sur le hero (exigence anti-bruit).
4. **Brief pré-construit la veille** : appeler `buildIntelligenceBrief` (cache 14 j) pour que
   `get_outreach_brief` soit **0-LLM** et instantané pendant la démo.

### 2.2 Critères d'acceptation du seed (VERIFY T-42)

- `get_outreach_brief(hero)` → `citableFacts` **non vide** (`verified:true`),
  `whyNow.topSignal.fresh:true`, `meta.gate.exportable:true`.
- `export_to_outbound(dryRun:true)` sur le hero → **exporté** (pas skip).
- `export_to_outbound(dryRun:true)` sur le compte-piège `unreviewed` → **skip
  `code:"not_targeted"`** + `export_items.gate_code` renseigné.

### 2.3 Prérequis caché du seed (sinon why-now vide même avec données)

Le tenant `elevay` peut être « 100 % CSV sans signaux » → `find_prospects` renvoie le **plancher**.
Les **hookpoints provenance + signal post-import** (T-18, voir §4 DÉP-2) doivent être **dans le MVP**
pour qu'un CSV produise un why-now scoré. C'est une dépendance dure, pas un nice-to-have.

---

## 3. PIÈGES VÉRIFIÉS (à connaître AVANT de coder)

Issus de `orion-backend-verification:506-538` + `design.md:858-865`. Chacun a déjà brûlé Elevay.

1. **`inngest.createFunction` est 2-arg** : `createFunction(config, handler)`. Les triggers vivent
   **dans la config** (`triggers:[{cron}|{event}]`), `concurrency` est un **array**. Gabarit :
   `signal-score-daily.ts:95-108`. **Pas** la forme 3-arg.
2. **`set_config(..., true)` (transaction-local) UNIQUEMENT** — jamais `false` (session-local).
   Supavisor TRANSACTION (6543) empoisonne les backends poolés. Tripwire `rls.test.ts` grep le tree.
3. **`db as any` à l'adapter** (`auth.ts:198`) **+ `pnpm.overrides.drizzle-orm:"^0.45.2"`** : pnpm
   dual-résout drizzle-orm via le peer `@neondatabase`. Garder **les deux** workarounds.
4. **baseURL Anthropic DOIT finir par `/v1`** (`ai-provider.ts:36-46`) — sinon 404 qui se
   manifestent en réponses LLM vides.
5. **Runner de migration custom** : le journal drizzle s'arrête (idx 12/14) tandis que `drizzle/`
   contient bien plus de `.sql` → `db:migrate` est câblé à **`exit 1`** ; seul
   `scripts/apply-migrations.ts` (`db:migrate:apply`) applique. Migrations **additives +
   `IF NOT EXISTS`** (re-run sûr).
6. **Tailwind 4 config-less** : **aucun** `tailwind.config.*` ; le theme vit dans `globals.css`
   sous `@theme`. Ne pas scaffolder un config v3-style.
7. **CI gate = `@orion/web` uniquement** (`ci.yml`) : tsc + vitest ne tournent que pour le package web ;
   admin/worker non gatés → le drift y passe. (Repo Orion séparé : le CI filtre **`@orion/web`**.)
8. **Pas de neon-http** : `@neondatabase/serverless` est présent mais **inutilisé** ; le vrai driver
   est **postgres-js** (`db/index.ts`). DROP la dep neon.
9. **Deux schedulers chez Elevay** (Inngest in-function + crons Vercel `vercel.json`) → Orion =
   **Inngest seul** (D8). Pas de double-fire ; **pas** de crons dans `vercel.json`.
10. **`DATABASE_URL_OWNER` opérateur-only** : 0 hit dans `src` ; migrations privilégiées
    hors-bande. Split owner/app obligatoire pour la sécu prod.
11. **Export Next nommé sur `page.tsx`/`layout.tsx`** : passe tsc+CI mais **casse `next build`
    Vercel** → utiliser des siblings préfixés `_` (mémoire `nextjs-page-export-build-gap`).
12. **Instantly = scalaires uniquement** : `toInstantlyCustomVariables` (`send-adapter.ts:19`) drop
    silencieusement objets/arrays → **flatten obligatoire** (`instantly-map.ts`) avant POST.
13. **Junctioned `node_modules`** : un worktree junctionné peut passer tsc local mais échouer en CI
    (install divergent). Toujours valider sur un `pnpm install --frozen-lockfile` propre.

---

## 4. LES 4 DÉPENDANCES DURES (bloquantes — cadencer AVANT d'annoncer le contrat de sortie)

Source : `tasks.md:856-861`, `requirements.md:1244-1249`, `design.md:871-872`.

- **DÉP-1 — `lib/signals/taxonomy.ts` (alias-map canonique)** — **T-14, prérequis dur.**
  Sans lui, les signaux écrits `{type:'funding_recent', …}` ne matchent pas les multipliers keyés
  canonique `{funding, …}` → `bestMultiplierForCompany` renvoie `undefined` → **plancher 1.0×**
  (bug vérifié `signals-world-class`, `signal-score-daily.ts:87`). ≥6 taxonomies disjointes existent
  en amont → la canonicalisation est requise **avant** d'exposer `get_signals.polarity`/les
  multipliers. Au-dessus des **9 types canoniques** (`triggers.ts:27`).

- **DÉP-2 — Hookpoints provenance + signal post-import** — **T-18, dans le MVP.**
  Hookpoint provenance `writeFieldSource` (`functions.ts:~220`) + hookpoint signal post-import
  (`agentic-executor.ts:~240`). Sans eux, un tenant 100 % CSV → **brief sans why-now** (gap #455).

- **DÉP-3 — `tools/call` → `structuredContent` + bump proto** — **T-29, P0 bloquant.**
  Le retour actuel (`route.ts:953-957`) renvoie `{content:[{text:JSON}]}` (blob opaque). **Ajouter
  `structuredContent: result`** (rétro-compat) + `outputSchema` + `annotations` par outil + bump
  `protocolVersion "2024-11-05"`→`"2025-06-18"` + `capabilities:{tools, resources}`
  (`route.ts:921`). Sans ça, le brief structuré est inexploitable par l'agent appelant.

- **DÉP-4 — Hero de démo (metric + provenance + signal frais)** — **T-42/T-15.**
  Le WOW meurt sans donnée : sujet hero avec ≥1 metric + firmo/provenance non vides + ≥1 signal
  frais + convergence 2+ sources, **brief pré-construit la veille** (cache 14 j). Voir §2.

---

## 5. QUOI LIRE PAR TYPE DE TÂCHE

Pointeurs docs (lis **seulement** ce qui concerne ta tâche — ne relis pas tout).

| Si tu fais… | Lis (spec) | Lis (file:line Elevay réels) |
|---|---|---|
| **Setup repo/install/CI/front** (T-1..T-4) | `tasks.md` LOT 0 ; REQ-1..4,30 ; `requirements.md:1146` | `app/package.json`, `pnpm-workspace.yaml`, `turbo.json`, `ci.yml`, `tsconfig.json`, `globals.css` |
| **Client AI / LLM** (T-5) | REQ-27/28 ; `orion-backend-verification` §5 | `lib/ai/ai-provider.ts:66-86,105-145,186-193,227-270`, `traced-ai.ts:15,84-100` |
| **Auth (humaine + MCP)** (T-6/T-7) | REQ-5/6 ; §1.2 ci-dessus | `auth.ts:80-196,198,227`, `api/mcp/route.ts:230,249,264`, `tenant-settings.ts:431` |
| **DB / RLS / migrations** (T-8/T-12/T-13) | REQ-7/8/9 ; `design.md:225-231` | `db/index.ts:1-2,31-32`, `db/rls.ts:44-54`, `scripts/apply-migrations.ts` |
| **Schéma net-new** (T-9/T-10/T-11) | `tasks.md` LOT 2 (DDL inline) ; REQ-10/13/14 | `db/schema/*`, `tenant-settings.ts:431` |
| **Taxonomie/signaux** (T-14/T-18/T-19) | DÉP-1/DÉP-2 ; `signals-world-class` report | `record-signal.ts:38-45,61,86,94`, `triggers.ts:27`, `freshness.ts:31,88,98`, `signal-score-daily.ts:87,95-108`, `priority-score.ts:54-55,70` |
| **Brief / cache** (T-15/T-28) | REQ-12/22 ; `tasks.md` T-28 (contrat A-G) | `build-intelligence-brief.ts:24,26,30,190,227-245`, `types.ts:50-75`, `signal-opener.ts:135,139`, `outbound-methodologies.ts:144,159-208`, `prospect-context.ts:267-279` |
| **Inngest / orchestrateur** (T-16/T-17/T-20) | REQ-15..18 ; pièges #1,#9 | `inngest/client.ts`, `api/inngest/route.ts`, `signal-score-daily.ts:95-108`, `custom-signal-backfill.ts:29`, `upsert.ts:60,108,223`, `identity.ts:67,125`, `precedence.ts:9,53` |
| **Adaptateurs entrée** (T-21..T-27) | REQ-19/20/21 ; `tasks.md` LOT 4 ; `signal-agent-mcp:106` | `import/smart/route.ts:57-101,115,141,256`, `waterfall.ts:77,148,181`, `registry.ts` |
| **Brief MCP / proto** (T-29..T-31) | DÉP-3 ; REQ-24 ; `signal-agent-mcp` report | `api/mcp/route.ts:19,293,917,921,926,953-957,475` |
| **Adaptateurs sortie / export** (T-32..T-35) | REQ-23 ; piège #12 ; `tasks.md` LOT 7 | `send-adapter.ts:19`, `sending-gate.ts:212` |
| **Gates / sécurité d'envoi** (T-36/T-37) | REQ-25/26 ; mémoire `elevay-own-infra-sending` | `sending-gate.ts:212-346` (catch `:339`), `fabrication-gate.ts:173`, `decide-action.ts:80` |
| **Tests** (T-39/T-40) | `tasks.md` LOT 10 ; CLAUDE.md (100% coverage) | les `*.test.ts` voisins des modules REUSE |
| **Env / seed / hero** (T-41/T-42) | REQ-29/12 ; §1 et §2 ci-dessus | `firmographicsHaveSignal:198` |

**Reports research utiles :** `orion-backend-verification` (la bible stack/versions/pièges),
`signals-world-class` (le bug taxonomie), `signal-agent-mcp` (surface MCP + Apollo→hiring),
`signal-outreach-brief` (slice minimal ≈8 j-h + hero), `signal-intelligence-design` /
`signal-deep-tech` (sources Tier 2 / velocity), `orion-differentiation`,
`elevay-convex-migration-roi` (justifie le **non**-Convex).

---

## GAPS — ce qui manque pour une exécution 100 % autonome

Honnête sur les manques. À résoudre par l'opérateur/founder **avant** ou **pendant** le run.

### G1 — Modèle repo : TRANCHÉ (repo Orion séparé + COPIE des modules + DB partagée)
**RÉSOLU (founder, 2026-06-28).** La décision est : **repo `orion/` SÉPARÉ** (sa propre app
Next/pnpm, package **`@orion/web`**, son propre lockfile/CI/`id:"orion"` Inngest) qui pointe sur
la **même `DATABASE_URL`** (DB Supabase `leads` partagée, scope tenant `elevay` via RLS) et dont
les modules métier sont **COPIÉS (vendorés)** depuis la source Elevay (le `file:line` Elevay =
provenance à copier), **pas** importés via un workspace. Conséquences fermes :
- Le code net-new + les modules copiés vivent sous **`src/...`** à la racine du **repo Orion**
  (pas dans `app/apps/web/` d'Elevay, qui n'est plus que la **source à copier**).
- Le schéma Drizzle **copié** dans Orion doit matcher les tables partagées des modules copiés ;
  les tables net-new Orion (`ingest_jobs/items`, `export_jobs`, `outbound_destinations`,
  `integration_credentials`, `signal_snapshots`) sont **additives** sur la DB partagée.
- **Pas** de renommage de la table de migrations : la DB partagée impose le **même** ledger
  `__elevay_migrations` (numérotation continue à partir de 0106) et le **même** runner copié.
- CI filtre **`@orion/web`** ; `id:"orion"` Inngest distinct.
**Reste opérationnel :** scaffolder le repo Orion (T-1/T-2), copier les modules + leur schéma,
copier le runner de migration (T-13/T-16). `orion/app` n'existe **pas encore** sur disque.

### G2 — Tenant `elevay` : existence non vérifiée
Impossible de vérifier depuis cette session (pas d'accès DB). **Action opérateur :** lancer le SELECT
de §1.2 sur l'instance de démo. Si absent → procédure de création §1.2. **Sans le tenant + sa clé
`mcp_*`, aucun appel MCP ne fonctionne.**

### G3 — Clés API non fournies (à rassembler avant la démo)
- **Fournies à l'opérateur, à poser en env :** `ANTHROPIC_API_KEY` (+ `/v1`), `OPENAI_API_KEY`,
  `INNGEST_*`, `APOLLO_API_KEY`, `AUTH_SECRET`, `DATABASE_URL`, `DATABASE_URL_OWNER`.
  **État : NON fournies dans cette session** — à obtenir.
- **Per-tenant en DB (`integration_credentials`), pas en env :** Instantly (clé V2),
  Orange Slice, (Lopus) pour l export. Fiber AI (`x-api-key`) = cle d ENTREE (reveal + Tracker), PAS un sink. **État : non fournies.** Sans elles, l'export réel
  est impossible — mais la démo peut tourner en **`dryRun:true`** (plan sans POST tiers), ce qui
  suffit au climax « gaté ». **Instantly réel** requiert au minimum la clé V2.
- **Endpoints non vérifiés :** Orange Slice (endpoints « À CONFIRMER avec clé »), **Lopus exclu en
  dur** (API non vérifiée). `fiberSignalIngestor` normalise tout payload entrant en filet.

### G4 — GRANT du rôle `elevay_app` sur les tables net-new
Chaque nouvelle table (`integration_credentials`, `ingest_*`, `export_*`, `outbound_destinations`,
`signal_snapshots`) doit recevoir les **GRANT** + **policies RLS** pour `elevay_app`, sinon le
runtime (rôle restreint) ne peut ni lire ni écrire. **Non scripté à ce jour.** Action : ajouter les
`GRANT`/`CREATE POLICY` additifs dans la migration de chaque table (rôle owner one-shot).

### G5 — Flags démo à positionner explicitement
`TARGETING_GATE_ENABLED=on` est **indispensable** pour que le compte-piège produise le skip
`not_targeted` (le climax). `ORION_INGEST_ENABLED` / `ORION_EXPORT_ENABLED` sont **net-new à créer**
(pas encore dans le code Elevay). **À décider/poser avant la démo.**

### G6 — Sources Tier 2 + velocity = P1, pas dans le slice démo
SEC/BODACC/ATS/OSS/tech-churn/crt.sh (T-25) et `signal_snapshots`/`velocity-snapshot` (T-20) sont
**différables P1**. **Mais** la vélocité est l'EDGE et « le retard est irrattrapable
rétroactivement » → si le moat velocity compte pour la démo, **démarrer `signal_snapshots` dès le
lancement** (sinon aucune dérivée à J0). **Décision ouverte :** inclure ou non dans le run initial.

### G7 — `find_prospects` / `get_signals` / `explain_priority` / `enroll` = P1
Le slice MVP s'arrête à `ingest_csv → get_outreach_brief → export_to_outbound` (T-30 P1). Si la démo
exige `find_prospects` (lister les prospects scorés), c'est **+3,0 j-h P1** à cadencer.

### G8 — `DATABASE_URL` (dev) vs instance de démo
Build sur `leadsens-localdev`, démo sur l'instance du tenant `elevay`. **Deux** `DATABASE_URL`
distincts à gérer ; ne pas migrer prod depuis une branche non mergée sans validation (mémoire
`always-apply-migrations`). **Action opérateur :** confirmer quelle instance porte `elevay`.
