# Orion — 00-ARCHITECTURE.md · document AUTORITAIRE

> **Statut : FINAL et AUTORITAIRE.** Ce document **prime sur tout langage antérieur** —
> en particulier sur toute mention de « DB séparée » ou « Convex ». Là où `design.md`
> et ce fichier divergent, **ce fichier gagne**. `design.md` reste valable pour tout le
> reste (DDL net-new, signatures d'adaptateurs, traps, j-h, contrat brief).
>
> **Décisions tranchées par le founder (2026-06-28).** Elles ne sont plus ouvertes.
> **Orion = repo SÉPARÉ** (sa propre app Next/pnpm, package `@orion/web`) **+ COPIE
> (vendoré) des modules** métier depuis Elevay. La **DB reste partagée** (tenant `elevay`).
>
> Convention de chemins : tout `file:line` non préfixé désigne la **SOURCE Elevay à
> COPIER**, relative à **`C:/Users/ombel/leads/app/apps/web/src/`** (le monorepo Elevay
> vérifié — la provenance, pas une cible d'import). Dans le repo Orion séparé, ces fichiers
> copiés vivent sous **`src/...`**.

---

## 1. LES DÉCISIONS TRANCHÉES (avec le trade-off de chacune)

### D1 — La base de données est CELLE d'Elevay, PARTAGÉE. Pas de DB séparée, pas de Convex.

Orion **n'a pas sa propre base**. Il se connecte à **la base Postgres Supabase du repo
`leads` (Elevay)**, via le **même `DATABASE_URL`**. Même cluster, même schéma Drizzle, mêmes
tables (`companies`, `contacts`, `*_field_source`, `tenants`, signaux, briefs, suppression…).

- **Convex : CLOS.** On ne migre rien vers Convex. La réactivité temps-réel dont un produit
  agent-natif a besoin est déjà fournie par **Supabase Realtime** sur le Postgres existant —
  pas besoin d'un second runtime, d'un second modèle de données, ni d'une seconde facture.
  L'analyse `research/elevay-convex-migration-roi-2026-06-27.md` est archivée comme
  « décidé contre ».
- **DB séparée : CLOSE.** L'idée `design.md` D1/D3 d'un `pg_dump` → nouvelle instance →
  produit autonome est abandonnée. Orion est une **couche** au-dessus du backend Elevay,
  pas un fork.

**Trade-off accepté.** La DB partagée signifie qu'Orion ne peut pas tourner sans le backend
de données d'Elevay (même cluster, même schéma) et qu'on renonce au cloisonnement physique
des données. **En échange :** zéro drift de schéma DB, zéro coût de synchronisation des
données, et le **même** backend éprouvé en prod — le delta entre « démo qui marche » et
« marche pour de vrai » disparaît. Le **repo**, lui, est **séparé** (`@orion/web`) et les
modules métier sont **COPIÉS (vendorés)** dans Orion (cf. D3) : le repo gagne son autonomie
de build/CI/déploiement, au prix d'une re-synchronisation manuelle des modules copiés.

### D2 — Scope = le tenant `elevay` UNIQUEMENT. Isolation par RLS.

Orion n'opère que sur **un seul tenant** : `elevay`. Tout son trafic runtime est cloisonné
par la **même primitive RLS qu'Elevay** :

- Le runtime se connecte en **rôle Postgres restreint `elevay_app`** (non-owner), jamais en
  owner (vérifié : le header de `db/rls.ts` documente le passage au rôle `elevay_app` le
  2026-06-10).
- Toute lecture/écriture passe par **`withTenantTx(elevayTenantId, fn)`** (`db/rls.ts`,
  `withTenantTx` aux lignes ~56-66) qui lie `app.tenant_id` en **SET LOCAL** via
  `set_config('app.tenant_id', …, true)`.

**PIÈGE structurel (non négociable).** Le driver est **postgres-js** derrière **Supavisor en
mode transaction (port 6543)**. Dans ce mode, des statements consécutifs hors transaction
atterrissent sur des backends poolés différents :

- `set_config(…, true)` = **TRANSACTION-LOCAL** → seule forme correcte. C'est ce que fait
  `withTenantTx`.
- `set_config(…, false)` = **session-scoped** → **INTERDIT**. Il n'a pas d'effet fiable ET
  **empoisonne** durablement le backend poolé (incident vérifié `_audit/2026-06-10-rls-session-poison.md` :
  les nouveaux sign-ups cassaient avec 42501). Un test tripwire (`rls.test.ts`) greppe l'arbre
  pour l'interdire à jamais. **À respecter tel quel.**

**Trade-off accepté.** On hérite de la contrainte « toute requête doit passer par `tx`, pas
par le `db` global ». En échange, on a une isolation prouvée en prod et on ne réinvente rien.

### D3 — Les modules Elevay sont COPIÉS (vendorés) dans le repo Orion, pas importés.

Orion est un **repo séparé** (sa propre app Next/pnpm, package `@orion/web`) : il ne peut donc
**pas** importer les modules métier d'Elevay via un workspace. Les ~6 modules ci-dessous (et
leurs dépendances de schéma) sont **COPIÉS (vendorés)** dans `src/` du repo Orion **depuis la
source Elevay**. Le `file:line` Elevay donne la **provenance — la source à copier**, jamais une
cible d'import. Comme c'est la **même DB et le même schéma** (D1), le schéma Drizzle copié dans
Orion **doit matcher** les tables partagées qu'utilisent les modules copiés :

| Module à COPIER depuis Elevay | `file:line` Elevay (provenance, à copier) | Rôle dans Orion |
|---|---|---|
| `evaluateSend` (oracle d'éligibilité) | `lib/guardrails/sending-gate.ts:212` | gate fail-closed AVANT tout export |
| `IntelligenceBrief` (type) | `lib/campaign-engine/types.ts:50` | la forme du brief |
| `buildIntelligenceBrief` | `lib/campaign-engine/build-intelligence-brief.ts:26` | construit l'intelligence groundée |
| `recordCompanySignal` | `lib/signals/record-signal.ts:86` | écrit `properties.signals[]` |
| waterfall d'enrichissement | `lib/providers/company-enrichment/*` (registry + precedence + `waterfall.ts`) | compose la firmo |
| identité canonique | `db/canonical/identity.ts:67` (`accountMatchPlan`), `db/canonical/upsert.ts:108` (`upsertAccount`) | résolution/dédup |
| RLS | `db/rls.ts` (`withTenantTx`) | cloisonnement tenant |
| serveur MCP | `app/api/mcp/route.ts` | transport JSON-RPC + auth Bearer `mcp_*` |

**Trade-off accepté.** Copie = divergence possible : un refactor d'un seam Elevay doit être
**re-porté manuellement** dans Orion (risque de drift). En échange : le repo Orion est
**autonome** (build/CI/déploiement indépendants), sans dépendance workspace sur Elevay, et
sans shadow de package. Les tests Vitest voisins de chaque module sont **copiés avec** et
restent le filet.

**`pack1` PRODUIT et POSSÈDE les contrats partagés (sinon pack2/3/4/5/6 ne `tsc`ent pas).**
Les fichiers ci-dessous sont net-new (ou des **wrappers de réexport** des seams Elevay copiés)
et **doivent exister sur disque, possédés par `pack1`** — ils sont importés par les 5 packs
parallèles, qui ne doivent importer QUE des fichiers produits par `pack0`+`pack1` :

| Fichier (sous `lib/` ou `db/`) | Contenu | Qui l'importe |
|---|---|---|
| `lib/signals/taxonomy.ts` | **9 types de signaux canoniques** (`triggers.ts:27`) + **ALIAS map** + `toCanonicalSignal()` ; couvre les alias dérivés pack5 (`hiring_velocity`/`adoption_accel`/`tech_churn`/`product_launch`/`job_change` → canonique) | pack2, pack5 (DEP-1) |
| `lib/ingest/types.ts` | `IngestItem` / `IngestSource` | pack2, pack5 |
| `lib/ingest/jobs.ts` | `openIngestJob` / `getJob` (**ownership pack1**, pas pack2/4/5) | pack2 |
| `lib/outbound/types.ts` | `OutboundDestination` / `ExportResult` | pack4 |
| `lib/mcp/contracts/outreach-brief.schema.ts` | **zod** du brief (sections A–G, `citableFacts[]` / `doNotClaim[]`) | pack3, pack4 |
| `lib/campaign-engine/brief.ts` | wrapper `buildIntelligenceBrief` + cache `intelligence_briefs` | pack3 |
| `src/lib/guardrails/sending-gate.ts` (`evaluateSend`) | **copié depuis Elevay `lib/guardrails/sending-gate.ts:212`** (réexport optionnel `orion-send-gate.ts` ; le fichier copié DOIT exister sous `src/` dans le repo Orion) | pack3, pack4 |

Critère de validation : **pack2/3/4/5/6 `tsc`ent en n'important QUE des fichiers produits par
`pack0`+`pack1`.**

### D4 — Tables net-new ajoutées EN ADDITIF au schéma partagé.

Orion n'altère **aucune** table Elevay existante. Il **ajoute** ses tables au même schéma
Drizzle (`additif`, `IF NOT EXISTS`, toutes `tenant_id`-scopées et soumises au même RLS) :

- `integration_credentials` — clés partenaires per-tenant **chiffrées** (entrée ET sortie).
- `ingest_jobs` / `ingest_items` — orchestration + ledger d'ingestion (dédup 3 niveaux).
- `export_jobs` / `outbound_destinations` — push gaté vers l'outbound + registre des cibles.
- `signal_snapshots` — historique pour la **vélocité** (la dérivée non-copiable, l'EDGE).

(DDL exact : `design.md §2.6`.)

**Trade-off accepté.** Les migrations Orion vivent dans le même répertoire que celles
d'Elevay → discipline de nommage requise. En échange, additif = zéro risque de régression sur
le schéma Elevay.

### D5 — Migrations : dev `db:push`, prod runner custom + rôle owner one-shot.

- **dev** (`leadsens-localdev`) : `pnpm db:push` (drizzle-kit), itératif.
- **prod** (l'instance portant le tenant `elevay`) : **runner custom**
  (`scripts/apply-migrations.ts:52`, table **`__elevay_migrations`** — PAS
  `__drizzle_migrations`, PAS `__orion_migrations` ; c'est le ledger Elevay existant et
  partagé —, sha256, 1 tx/fichier, idempotent), exécuté **hors-bande** avec le rôle
  **owner** via `DATABASE_URL_OWNER`.
- `db:migrate` (drizzle-kit standard) est **câblé à `exit 1`** — le journal n'est pas la
  source de vérité (calque le pattern Elevay).
- **Le rôle owner ne sert QU'aux migrations additives one-shot.** **JAMAIS d'écriture via le
  rôle owner au runtime** (0 hit de `DATABASE_URL_OWNER` dans le code applicatif).

**Trade-off accepté.** Deux mécanismes de migration (dev vs prod). En échange : `IF NOT
EXISTS` rend les ré-applications sûres et le split owner/app garde le runtime fail-safe.

### D6 — Build sur DEV, démo sur l'instance du tenant `elevay`.

- **Build** : instance **`leadsens-localdev`**.
- **Démo / live** : l'instance Supabase qui **porte le tenant `elevay`**.
- **Pré-requis dur :** la ligne `tenants` du tenant `elevay` **doit exister**. Sinon, la créer
  one-shot (rôle owner) : insérer `tenants` (tenant `elevay`) + un `users` admin + une clé
  `mcp_*` (stockée **hashée** `sha256` dans `tenants.settings.mcpApiKeys[]`, jamais en clair).

### D7 — Clés partenaires per-tenant, chiffrées en DB, jamais en env.

Toutes les clés (entrée : Apollo/Hunter/Pappers/**Fiber** — Fiber est une source d'ENTRÉE,
cf. D8 ; sortie : Instantly/OrangeSlice/Lopus/webhook générique) sont stockées
**chiffrées per-tenant** (`{iv, ciphertext,
tag}`) dans `integration_credentials` (ou `tenants.settings`), **jamais en variable
d'environnement** — exactement le pattern Instantly d'Elevay. Les sources souveraines/gratuites
(SEC EDGAR, BODACC, Sirene, crt.sh, npm/PyPI, ATS publics) n'ont **pas** de clé.

### D8 — Brief ZÉRO prose ; toute sortie passe par `evaluateSend` avant export.

Orion **ne rédige pas** de mail. Il émet un **brief structuré** : `citableFacts[]` /
`doNotClaim[]`, why-now daté et sourcé, et le **verdict gate comme donnée** — **zéro `subject`,
zéro `body`**. `draft_outreach` est supprimé ; remplacé par `get_outreach_brief`.

Les destinations de SORTIE RÉELLES — **Instantly** (natif, `custom_variables` map scalaire
plate, `send-adapter.ts:19`), **Orange Slice** (webhook par colonne `POST
api.orangeslice.ai/webhook/{sheet}/{col}`, JSON plat, secret convenu côté colonne), **Lopus**
(AUCUNE API → **webhook générique**) et le **webhook générique HMAC** (enveloppe
`{lead, brief, meta}`) — **consomment** le brief. **PAS de `FiberAdapter`/`LopusAdapter` REST :
Fiber est une source d'ENTRÉE (reveal waterfall + signaux Tracker), pas une destination
(OpenAPI v1.40.0 : zéro endpoint d'envoi) ; Lopus n'a aucune API publique.** Mapping
brief→champs par destination : `research/partner-apis-2026-06-27.md §6`. **Chaque prospect
passe par `evaluateSend` (oracle d'éligibilité) AVANT export.** Le gate tourne **dans** le
wrapper d'export, donc **inatteignable depuis le JSON-RPC** : un agent externe **ne peut pas le
contourner**. `send:false` → SKIP + `export_items.gate_code` ; **jamais** poussé au partenaire.

---

## 2. SCHÉMA D'ENSEMBLE — entrée → compose → brief → export (DB partagée, tenant `elevay`)

```
                         TENANT = elevay (UNIQUEMENT)
                 rôle runtime = elevay_app · TOUT sous withTenantTx(elevayTenantId)
                 set_config('app.tenant_id', elevayTenantId, true)  ← TRANSACTION-LOCAL
   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │                  Supabase Postgres du repo `leads`  (DATABASE_URL partagé)         │
   │            postgres-js → Supavisor :6543 (transaction-mode) · PAS de neon-http     │
   └──────────────────────────────────────────────────────────────────────────────────┘
        ▲ copie (D3)            ▲ additif (D4)                    ▲ copie (D3)
        │ modules Elevay copiés  │ tables net-new Orion            │ evaluateSend (D8)

  ENTRÉE                    COMPOSE                  BRIEF                    EXPORT (gaté)
  ──────                    ───────                  ─────                    ────────────
  CSV / inbound      ┐                      buildIntelligenceBrief     export/run (Inngest)
  Apollo people/orgs ┤                      types.ts:50                      │
  Sirene / BODACC    ┤  IngestItem  ──►  identity:                          ▼  pour CHAQUE prospect :
  SEC EDGAR          ┤  (forme         accountMatchPlan(identity.ts:67)   ┌──────────────────────────┐
  ATS publics  [snap]┤   unifiée)      upsertAccount(upsert.ts:108)       │ get_outreach_brief        │
  npm/PyPI/GH  [snap]┤      │              │ dédup 3 niveaux               │   → citableFacts[]        │
  tech-churn   [snap]┤      ▼              ▼                               │   → doNotClaim[]          │
  crt.sh       [snap]┤  ingest_jobs   waterfall enrichment                │   → why-now daté/sourcé   │
  Fiber (input)      ┤  ingest_items  (company-enrichment/*)              │   ZÉRO subject/body       │
  champion/investor  ┘  (additif)     + precedence pickWinner            └────────────┬─────────────┘
       │                  │                │                                          │
       │                  │                ▼                                          ▼
       │                  │           recordCompanySignal              ╔═══════════════════════════╗
       │                  │           (record-signal.ts:86)            ║ evaluateSend (ORACLE)     ║
       │                  │           → properties.signals[]           ║ sending-gate.ts:212       ║
       │                  │                │                           ║ 8 gates fail-closed       ║
       │                  │                ▼                           ║ DANS le wrapper →         ║
       │                  │           signal_snapshots [snap]          ║ non-contournable JSON-RPC ║
       │                  │           → vélocité (la dérivée)          ╚═════════════╦═════════════╝
       │                  │                                                          │
       │                  │                                          send:false ─────┤───► SKIP
       │                  │                                          (gate_code)     │     export_items
       │                  │                                                          │
       │                  │                                          send:true ──────┘
       │                  │                                                          ▼
       │                  │                                        OutboundDestination.push()
       │                  │                                        Instantly · Orange Slice ·
       │                  │                                        Lopus(webhook) · webhook HMAC
       │                  │                                        (Fiber = ENTRÉE, pas sortie)
       │                  │                                        (clés per-tenant CHIFFRÉES, D7)
       │                  ▼                                                          │
       │           Inngest: ingest/run, signal-score-daily,                         ▼
       │           velocity-snapshot, export/run (id:"orion")                  export_jobs (additif)
       │
       └── auth : Bearer mcp_* (sha256 → tenants.settings.mcpApiKeys) → tenantId = elevay TOUJOURS
                  serveur MCP app/api/mcp/route.ts · tenantId JAMAIS un argument
```

---

## 3. RÈGLES D'OR (CHAQUE session DOIT les respecter)

1. **Rôle runtime = `elevay_app`, jamais owner.** Le runtime se connecte en `elevay_app`
   (restreint, RLS). Le rôle owner (`DATABASE_URL_OWNER`) ne sert **qu'aux migrations
   additives one-shot**, hors-bande. **Zéro `DATABASE_URL_OWNER` dans le code applicatif.**

2. **Tout passe par `withTenantTx(elevayTenantId, fn)`** avec `set_config(…, true)`
   (TRANSACTION-LOCAL). **JAMAIS** `set_config(…, false)` (session-scoped) — il empoisonne le
   pool Supavisor (incident 2026-06-10). Les requêtes vont par `tx`, **pas** par le `db` global.

3. **Jamais d'écriture via le rôle owner au runtime.** Aucune exception. Owner = migrations.

4. **Jamais toucher un autre tenant.** Scope = `elevay` uniquement. `tenantId` est **dérivé
   serveur** (Bearer `mcp_*` → `tenants.settings.mcpApiKeys` ; JWT ; `event.data` Inngest) —
   **jamais** accepté comme argument d'outil.

5. **Tables additives uniquement.** On **n'altère pas** les tables Elevay. Net-new en
   `IF NOT EXISTS`, `tenant_id`-scopé, soumis au même RLS. dev `db:push` ; prod runner custom.

6. **Modules Elevay : COPIE (vendoré), pas import.** Orion est un repo séparé : copier dans
   `src/` les seams listés en §1/D3 **depuis la source Elevay** (`file:line` = provenance),
   tests voisins inclus. Ne JAMAIS réécrire un module from scratch — copier le code éprouvé.
   Re-porter manuellement tout correctif Elevay pertinent (le drift est le coût assumé de D3).

7. **Brief ZÉRO prose.** `get_outreach_brief` émet `citableFacts[]` / `doNotClaim[]` + why-now
   daté/sourcé + verdict gate. **Aucun `subject`, aucun `body`.** Orion ne rédige pas.

8. **Le gate AVANT export, non-contournable.** Chaque prospect passe par `evaluateSend`
   (`sending-gate.ts:212`) **dans le wrapper d'export**, avec `interactive:false` (garde
   SAFE_MODE targeting actif). `send:false` → SKIP + `gate_code`, jamais poussé. Le gate ne doit
   **jamais** être atteignable directement depuis le JSON-RPC.

9. **UI sans emoji.** Aucun emoji dans l'UI ni les libellés produit (directive Elevay).

10. **Tokens de design Elevay.** Toute UI Orion utilise le design system Elevay (Tailwind 4
    config-less, `@theme` dans `globals.css`, une seule encre à opacité, frosted glass, accent
    **`#2C6BED`** (l'accent applicatif Elevay), 12px, tracking serré). Pas de divergence
    visuelle. **NB : `#3D99F5` n'est PAS l'accent app** — c'est la valeur *scoped* à
    l'inbox upstream (re-bind local `.inbox-shell` ; cf. mémoire « upstream design DNA »).
    Ne pas l'employer comme accent global.

11. **Écrire sur disque dans les 30s.** Chaque décision/observation/résultat → un fichier. Le
    contexte se compacte ; la mémoire est un passif.

---

## 4. CE QUI CHANGE vs `design.md` (encart de réconciliation)

| Sujet | `design.md` (antérieur) | **CE DOCUMENT (autoritaire)** |
|---|---|---|
| **Base de données** | DB **séparée** (`pg_dump` → nouvelle instance Supabase), produit autonome (D1/D3) | **DB PARTAGÉE** : celle du repo `leads` (Postgres Supabase d'Elevay), même `DATABASE_URL`, même schéma |
| **Convex** | déjà écarté, mais via une analyse ROI ouverte | **CLOS définitivement** : réactivité via **Supabase Realtime** sur le Postgres existant |
| **Repo / couplage** | `orion/` **repo séparé**, **découplé**, n'appelle pas Elevay (D2/D3) | **repo Orion séparé** (`@orion/web`) sur la **même DB partagée** (tenant `elevay`) ; couplé par la DB et les modules copiés, pas par un workspace |
| **Modules métier** | **COPIE** des seams (D3) | **COPIE (vendorée)** des seams dans le repo Orion (provenance = `file:line` Elevay ; re-sync manuelle assumée) — **idem `design.md`** |
| **Scope tenant** | multi-tenant générique (Orion a « son propre tenant store ») | **tenant `elevay` UNIQUEMENT** ; `elevay_app` + `withTenantTx(elevayTenantId)` |
| **`@neondatabase/serverless`** | DROP (inutilisé) | **inchangé : DROP** — driver = `postgres-js` (`postgres ^3.4.9`) |

Inchangé vs `design.md` : le contrat brief (zéro prose, `citableFacts[]`/`doNotClaim[]`), le
gate `evaluateSend` comme oracle non-contournable, l'identité/dédup 3 niveaux, les adaptateurs
entrée/sortie, le runner de migration custom, Inngest (`id:"orion"`, `createFunction` 2-arg,
concurrency array, `maxDuration 300`), les traps Supavisor/RLS, et les j-h des tâches T-1..42.

---

## 5. STACK (versions exactes à épingler)

| Catégorie | Paquet | Version |
|---|---|---|
| Toolchain | pnpm | **10.15.1** (`packageManager` + CI) |
| | Node | **22** (`.nvmrc`, `@types/node ^22`) |
| | Turbo | **^2.9.17** |
| Web | next | **^15.5.15** (App Router, Turbopack) |
| | react / react-dom | **^19.2.7** |
| | typescript | **^5.9.3** |
| | tailwindcss / @tailwindcss/postcss | **^4.3.0** — **config-less**, `@theme` dans `globals.css`, **PAS** de `tailwind.config.ts` |
| Data | drizzle-orm | **^0.45.2** — `pnpm.overrides` tree-wide + **`db as any`** au DrizzleAdapter (dual-resolve) |
| | drizzle-kit | **^0.31.10** |
| | postgres | **^3.4.9** — driver `postgres-js`. **DROP `@neondatabase/serverless`** |
| Auth | next-auth | **5.0.0-beta.30** |
| | @auth/drizzle-adapter | **^1.11.2** |
| Jobs | inngest | **^4.5.1** — `createFunction` **2-arg** (triggers dans le config), concurrency **array**, `maxDuration 300` |
| AI | ai (AI SDK) | **^6.0.199** |
| | @ai-sdk/anthropic | **^3.0.82** |
| | @anthropic-ai/sdk | **^0.104.1** |
| Validation | zod | **^4.4.3** (Zod **4**, pas 3) |
| Tests | vitest | **^4.1.8** |
| | @playwright/test | **^1.60.0** |

**AI provider.** `baseURL` **DOIT inclure `/v1`** (allowlist EU/US), routing
`chat → sonnet` / `light → haiku`, tout passe par **`tracedGenerateText/Object` +
`enforceLlmBudget`** (budget + trace per-tenant).

**Migration.** Runner custom (`scripts/apply-migrations.ts:52`), table
**`__elevay_migrations`** (le ledger Elevay partagé — PAS `__drizzle_migrations`, PAS
`__orion_migrations`) ; `db:migrate` (drizzle-kit) → **`exit 1`**. Numérotation : `drizzle/`
réel va **0001→0106** → prochaine migration additive Orion = **0107** (pack1) ; pack7 = **0108+**.
dev `db:push` ; prod runner + rôle owner one-shot.

**CI.** Filtre **`@orion/web`** ; pnpm 10.15.1 + Node 22 ; `tsc` + `vitest` + gitleaks ;
attendre full-CI (gitleaks + tsc/vitest + Vercel) avant merge.

---

## 6. PRÉ-REQUIS D'AMORÇAGE (checklist)

1. Confirmer que la ligne `tenants` du tenant **`elevay`** existe sur l'instance de démo. Sinon
   créer one-shot (owner) : `tenants` (`elevay`) + `users` admin + clé `mcp_*` (hash `sha256`
   dans `tenants.settings.mcpApiKeys[]`).
2. Confirmer le rôle runtime **`elevay_app`** (non-owner) et `DATABASE_URL` pointant Supavisor
   `:6543` (transaction-mode).
3. Appliquer les migrations additives (`integration_credentials`, `ingest_*`, `export_*`,
   `signal_snapshots`) : `db:push` en dev, runner + owner en prod.
4. Vérifier que **chaque** chemin d'export passe par `evaluateSend` **avant** push (test du gate
   non-contournable depuis le JSON-RPC).
