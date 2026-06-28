# Orion — 00-EXECUTION-GUIDE (parallélisation multi-sessions)

> Comment exécuter les **42 tâches** de `tasks.md` sur **plusieurs sessions Claude en
> parallèle** sans collision. Dérive 1:1 de `tasks.md` (T-1..T-42), `design.md` (§0-10),
> `ui-spec.md`. **À lire AVANT de coder.** Ce guide ne réécrit pas les tâches — il les
> **regroupe en 8 lots parallélisables**, fige le **graphe de dépendances**, l'**ownership
> de fichiers** (zéro collision), les **conventions** et le **protocole multi-session**.

---

## 0. DÉCISIONS DB — FINALISÉES (priment sur tout langage antérieur)

Le founder a tranché. **Ces décisions priment sur tout langage antérieur parlant de
"DB séparée" ou "Convex".** Modèle repo : **Orion = repo SÉPARÉ** (sa propre app Next/pnpm,
package `@orion/web`), **PAS** un sous-projet du monorepo Elevay. Les modules métier Elevay
sont **COPIÉS (vendorés)** dans `src/` du repo Orion **depuis la source Elevay** — là où une
tâche dit "REUSE / réutiliser", lire **"copier le module depuis Elevay (`file:line` =
provenance)"**. La **DB reste partagée** (tenant `elevay`).

| # | Décision finale | Conséquence opérationnelle |
|---|---|---|
| **DB1** | **DB = la base du repo `leads`** (Supabase Postgres d'Elevay), **PARTAGÉE** via `DATABASE_URL`. **PAS** de DB séparée, **PAS** Convex (réactivité = Supabase Realtime). | Un seul `DATABASE_URL`. Le schéma Orion est **additif** au schéma Elevay existant. |
| **DB2** | **SCOPE = tenant `elevay` UNIQUEMENT.** Isolation par **RLS** : runtime connecté en rôle restreint **`elevay_app`** + **`withTenantTx(elevayTenantId)`** sur chaque requête. | Tout accès data passe par `withTenantTx`. Aucune requête runtime hors transaction tenant-scopée. |
| **DB3** | **PIÈGE Supavisor** : `postgres-js` + Supavisor (6543, transaction-mode) → `set_config(..., true)` = **TRANSACTION-LOCAL** (`db/rls.ts`). **JAMAIS** `set_config(..., false)` (session-scoped → empoisonne les backends poolés). | Tripwire grep (T-12) interdit `set_config(..., false)`. |
| **DB4** | **JAMAIS d'écriture via le rôle owner au runtime.** Owner (`DATABASE_URL_OWNER`, role `postgres`) **réservé** aux migrations additives one-shot, hors-bande. `grep DATABASE_URL_OWNER src` → **0**. | T-41 `env-shape.test.ts` garde ça. |
| **DB5** | **Modules Elevay COPIÉS (vendorés)** dans `src/` du repo Orion **depuis la source Elevay** (même schéma, même DB), **PAS réécrits from scratch**. Sources à copier : `evaluateSend` (`lib/guardrails/sending-gate.ts:212`), `IntelligenceBrief`+`buildIntelligenceBrief` (`lib/campaign-engine/types.ts:50`, `build-intelligence-brief.ts:26`), `recordCompanySignal` (`lib/signals/record-signal.ts:94`), waterfall (`lib/providers/company-enrichment/*`), identité (`db/canonical/identity.ts:67`, `upsert.ts:108`), serveur MCP (`app/api/mcp/route.ts`). | "REUSE" dans `tasks.md` = **copie (vendoré) du module Elevay depuis la source** (`file:line` = provenance à copier), pas une réécriture. Le schéma Drizzle copié doit matcher les tables partagées. Le NET-NEW Orion s'**assemble au-dessus** des modules copiés. |
| **DB6** | **Tables net-new ajoutées EN ADDITIF** au schéma partagé : `integration_credentials` (clés partenaires per-tenant chiffrées), `ingest_jobs`/`ingest_items`, `export_jobs`/`outbound_destinations`/`export_items`, `signal_snapshots`. **dev** : `db:push` ; **prod** : runner custom (`scripts/apply-migrations.ts:52`), table **`__elevay_migrations`** (ledger Elevay partagé — PAS `__drizzle_migrations`/`__orion_migrations`) + role owner one-shot. | Pas de DROP/ALTER destructif. `IF NOT EXISTS` partout. Numérotation : `drizzle/` réel 0001→0106 → prochaine = **0107** (pack1), pack7 = **0108+**. |
| **DB7** | **Build sur l'instance DEV** (`leadsens-localdev`) ; **démo sur l'instance portant le tenant `elevay`**. Le tenant `elevay` **doit exister** (sinon créer ligne `tenants` + `user` + clé `mcp_*`). | T-42 seed vérifie l'existence du tenant `elevay` + clé MCP. |
| **DB8** | **Brief ZÉRO prose** (`citableFacts[]` / `doNotClaim[]`). Sorties RÉELLES → **Instantly** (natif) + **Orange Slice** (webhook colonne) + **Lopus** (webhook générique) + **webhook générique HMAC**, **TOUTES** passées par `evaluateSend` (oracle d'éligibilité) **avant** export. **Fiber = ENTRÉE** (reveal + signaux Tracker), PAS une destination — **pas de `FiberAdapter`/`LopusAdapter` REST**. Gate **non-contournable** depuis JSON-RPC (dans le wrapper). Mapping brief→champs : `research/partner-apis-2026-06-27.md §6`. | T-36/T-37 tripwires. Aucun POST sink avant `evaluateSend`. |

> **Note repo :** Orion est un **repo SÉPARÉ** (sa propre app Next/pnpm, package `@orion/web`),
> **PAS** un sous-projet du monorepo Elevay. Le code Orion vit sous **`src/...`** à la racine du
> repo Orion. Les chemins `file:line` préfixés `C:/Users/ombel/leads/app/apps/web/src/` (ou
> `orion/app/...`) désignent la **SOURCE Elevay à COPIER** (provenance vérifiée), **pas** un
> emplacement dans le repo Orion : le fichier copié atterrit sous `src/...`. Le CI filtre
> **`@orion/web`** (le package du repo Orion). Les `file:line` REUSE pointent la source Elevay à
> copier → exacts comme provenance.

---

## 1. LES 8 LOTS (packs)

> Effort en **j-h**. `[P1]` = différable post-démo. Mapping vers les T-* de `tasks.md`.
> **Relocations vs `tasks.md`** (pour la parallélisation) explicitées : la **gate** (T-36) et
> les **contrats partagés** (T-21 `IngestItem`, `OutreachBrief`, `OutboundDestination`) montent
> dans **pack1** car ≥2 packs parallèles les importent ; la table `signal_snapshots` (DDL de T-20)
> monte dans **pack1** (schéma centralisé), son cron reste pack5.

### pack0 — Foundation (`feat/orion-pack0`) — ~6,75 j-h — **racine**
**Objectif.** Coquille bootable + infra transverse que tous les autres packs importent : scaffold,
deps épinglées, CI, Tailwind4/tsconfig, provider AI tracé, client DB postgres-js, RLS, runner de
migration, client+route Inngest (skeleton registry), auth humaine + auth MCP Bearer, **squelette de
route MCP avec registre d'outils**.
**T-* :** T-1, T-2, T-3, T-4, T-5, T-8, T-12, T-13, T-16, T-7, T-6.
**Dépendances :** — (racine).

### pack1 — Schema & contrats partagés (`feat/orion-pack1`) — ~5,75 j-h
**Objectif.** Toutes les tables additives + taxonomie/sink signaux + cache briefs + l'**oracle
`evaluateSend`** (importé) + les **contrats TS/zod** (`IngestItem`, `IngestSource`, `OutreachBrief`,
`OutboundDestination`/`ExportResult`) contre lesquels les 5 packs parallèles codent (et mockent).
**T-* :** T-9, T-10, T-11, T-14, T-15, T-36, + contrats de T-21 (interfaces) / T-28 (zod `OutreachBrief`) / T-32 (interface `OutboundDestination`) + DDL `signal_snapshots` (de T-20).
**Dépendances :** pack0.

### pack2 — Ingestion (`feat/orion-pack2`) — ~7,25 j-h
**Objectif.** Orchestrateur durable d'ingestion (résolution identité → composition par précédence →
acquisition signaux → score ciblé), sources MVP (CSV, Apollo), recompute quotidien, + 3 outils MCP
d'ingestion. **Fiber = source d'ENTRÉE** ici : reveal waterfall (`POST /v1/contact-details/single`)
pour matérialiser `warm_path` (les signaux Tracker Fiber = pack5).
**T-* :** T-17, T-18, T-19, T-22, T-23, T-27 (implémentation de T-21 ; contrat importé de pack1).
**Dépendances :** pack1 (schéma + contrats), pack0 (Inngest, AI, MCP registry).

### pack3 — Brief + MCP (`feat/orion-pack3`) — ~3,5 j-h
**Objectif.** `get_outreach_brief` (A–G, **zéro prose**, `citableFacts[]`/`doNotClaim[]`) ;
durcissement protocole MCP (`structuredContent` **P0** + `outputSchema` + annotations + bump
`2025-06-18`) ; `evaluate_send` (dry-run) ; resources `[P1]`.
**T-* :** T-28, T-29, T-31, T-30 `[P1]`.
**Dépendances :** pack1 (briefs T-15, gate T-36, contrat `OutreachBrief`), pack0 (MCP auth T-7 + registry).

### pack4 — Output + Gates (`feat/orion-pack4`) — ~5,75 j-h
**Objectif.** Orchestrateur d'export gaté (`export_to_outbound` MCP + job Inngest durable), flatten
scalaire Instantly, **destinations RÉELLES** : **Instantly** (natif, `custom_variables` map plate),
**Orange Slice** (webhook colonne `POST api.orangeslice.ai/webhook/{sheet}/{col}`, JSON plat),
**Lopus** (aucune API → **webhook générique**), **webhook générique HMAC** (`{lead, brief, meta}`)
`[P1]`. **PAS de `FiberAdapter`/`LopusAdapter` REST** (Fiber = ENTRÉE, cf. pack2/pack5 ; Lopus = pas
d'API). Mapping brief→destination : `research/partner-apis-2026-06-27.md §6`. Tripwire "jamais de
cold via infra cliente". **Le gate (T-36, dans pack1) tourne DANS le wrapper → inatteignable depuis
JSON-RPC.**
**T-* :** T-32, T-33, T-35, T-37, T-34 `[P1]`.
**Dépendances :** pack1 (gate T-36, schéma export, contrat `OutboundDestination`) ; pack3 pour
`get_outreach_brief` **au runtime** (soft : coder contre le contrat `OutreachBrief` de pack1, intégrer en pack7).

### pack5 — Tier2-signals · l'EDGE (`feat/orion-pack5`) — ~5,5 j-h — **`[P1]`**
**Objectif.** Le moat non-copiable : sources Tier 2 (SEC/BODACC/ATS/OSS/tech-churn/crt.sh),
waterfall+Sirene, Fiber-as-input, cron `velocity-snapshot` (dérivée = vélocité, snapshot+diff).
**T-* :** T-24, T-25, T-26, T-20 (tous `[P1]`).
**Dépendances :** pack1 (taxonomie T-14, table `signal_snapshots`, contrat `IngestSource`), pack0
(Inngest). Se branche sur l'orchestrateur pack2 **via l'interface `IngestSource`** (additif, parallèle).

### pack6 — UI (`feat/orion-pack6`) — ~7,0 j-h
**Objectif.** 4 écrans en langage Elevay (Sources, Prospects, Brief view, Outbound) sur composants
Elevay **réutilisés** ; extraction du paquet de tokens partagé `@orion/ui` (Option B `ui-spec §1`) ;
QA light/dark + founder demi-écran. **Zéro nouveau système visuel.**
**Sous-tâches (U1–U6) :** U1 tokens/`@orion/ui` (extraction `@theme`+`:root`+`.dark`+`.inbox-shell`)
(1,0) ; U2 Sources/Ingestion (`ui-spec §4a`) (1,0) ; U3 Prospects ranké + signal-chip/confidence
(`§4b`) (1,5) ; U4 Brief view `.inbox-shell` (why-now/citableFacts/doNotClaim/angle/citations)
(`§4c`) (1,5) ; U5 Outbound + verdict gate (`§4d`) (1,0) ; U6 responsive single-pane <lg + dark + QA
`/design-review` (`§5`) (1,0).
**Dépendances :** pack0 (chrome/globals.css). Lit les API de pack2/3/4 **au runtime** → coder contre
fixtures/contrats, intégrer en pack7.

### pack7 — Demo + Integration (`feat/orion-pack7`) — ~4,0 j-h
**Objectif.** Recoller les packs : preuve "REUSE intact" (additif/wrappers only), suite Vitest cœur,
e2e MVP (CSV→brief→export gaté), inventaire env, **hero de démo** pré-seedé (metric + provenance +
signal frais), création du tenant `elevay` + clé `mcp_*` si absent (DB7).
**T-* :** T-38, T-39, T-40, T-41, T-42.
**Dépendances :** **TOUS** les packs (intégration finale).

---

## 2. GRAPHE DE DÉPENDANCES

```
                              pack0  (Foundation — racine)
                                │
                                ▼
                              pack1  (Schema & contrats partagés)
                                │
        ┌──────────┬───────────┼───────────┬───────────┐
        ▼          ▼           ▼           ▼           ▼
      pack2      pack3       pack4       pack5       pack6      ← EN PARALLÈLE
    (Ingest)   (Brief+MCP)  (Output)   (Tier2 P1)   (UI)
        │          │           │           │           │
        └──────────┴───────────┴───────────┴───────────┘
                                │
                                ▼
                              pack7  (Demo + Integration)  ← a besoin de TOUS
```

**Qui bloque qui (dur) :**
- **pack0 bloque tout.** Rien ne démarre avant que la coquille boote (`pnpm install --frozen-lockfile`
  + `pnpm tsc` verts, registres MCP/Inngest/barrel schéma en place).
- **pack1 bloque pack2/3/4/5/6.** Les tables, la taxonomie, le cache briefs, la gate et **les contrats
  partagés** doivent exister avant que les packs parallèles codent contre eux.
- **pack7 est bloqué par tous.**

**Ce qui tourne en parallèle (après pack1) : pack2, pack3, pack4, pack5, pack6** — 5 sessions simultanées.

**Arêtes molles (soft deps — ne bloquent PAS le démarrage parallèle, résolues en intégration pack7) :**
- **pack4 → pack3** : `export_to_outbound` consomme `get_outreach_brief` au runtime. pack4 code contre
  le **contrat `OutreachBrief` (pack1)** + un mock ; câblage réel en pack7.
- **pack5 → pack2** : les sources Tier 2 se branchent sur l'orchestrateur via l'**interface
  `IngestSource` (pack1)** ; additif, parallèle.
- **pack6 → pack2/3/4** : l'UI lit les API ; bâtie sur fixtures/contrats, branchée en pack7.

**Conséquence d'ordonnancement :** lancer pack0 seul → puis pack1 seul → puis **fan-out 5 sessions**
(pack2–pack6) → **fan-in** sur pack7. Le chemin critique démo (`tasks.md §CHEMIN CRITIQUE`,
≈25 j-h, compressible ≈8 j-h pré-seedé) traverse pack0 → pack1 → pack2 → pack3 → pack4 → pack7
(pack5/pack6 hors chemin critique MVP).

---

## 3. OWNERSHIP DES FICHIERS (zéro collision)

**Règle d'or : chaque pack possède des dossiers/fichiers DISJOINTS.** Un pack n'édite **jamais** un
fichier d'un autre pack. Les rares fichiers **structurellement partagés** (route MCP, route Inngest,
barrel schéma, `globals.css`) utilisent le **pattern registre append-only** (§3.2).

### 3.1 Fichiers/dossiers propres par pack (chemins relatifs à la **racine du repo Orion** ; le code vit sous `src/`)

| Pack | Possède (création + édition exclusives) |
|---|---|
| **pack0** | `package.json` (déclare `@orion/web`), `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.github/workflows/ci.yml`, `.gitleaks.toml`, `.mcp.json`, `.claude/settings.local.json`, `tsconfig.json`, `postcss.config.mjs`, `next.config.ts`, `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `e2e/global-setup.ts`, `vercel.json`, `drizzle.config.ts` ; `src/app/globals.css` (base) ; `src/db/index.ts`, `src/db/rls.ts` ; `scripts/apply-migrations.ts` ; `src/auth.ts`, `src/middleware.ts`, `src/db/schema/auth.ts` ; `src/inngest/client.ts`, `src/inngest/registry.ts`, `src/app/api/inngest/route.ts` ; `src/lib/ai/*`, `src/lib/region-config.ts` ; **squelette** `src/app/api/mcp/route.ts` + `src/lib/mcp/registry.ts` + `src/lib/mcp/types.ts` |
| **pack1** | `src/db/schema/{tenants,integrations,ingest,outbound,snapshots}.ts` ; `src/db/schema.ts` (barrel — zone append) ; `src/lib/signals/taxonomy.ts` (**9 types canoniques** `triggers.ts:27` + **ALIAS map** + `toCanonicalSignal()` ; **DOIT couvrir les alias dérivés pack5** `hiring_velocity`/`adoption_accel`/`tech_churn`/`product_launch`/`job_change` → canonique — **DEP-1**) ; `src/lib/ingest/types.ts` (contrat `IngestItem`/`IngestSource`) ; `src/lib/outbound/types.ts` (contrat `OutboundDestination`/`ExportResult`) ; `src/lib/mcp/contracts/outreach-brief.schema.ts` (zod `OutreachBrief` — sections A–G, `citableFacts[]`/`doNotClaim[]`) ; `src/lib/ingest/jobs.ts` (`openIngestJob`/`getJob` — **ownership pack1**, PAS pack2/4/5) ; **wrapper** `src/lib/campaign-engine/brief.ts` (réexport `buildIntelligenceBrief` **copié** + cache `intelligence_briefs`) + `src/lib/guardrails/sending-gate.ts` (`evaluateSend` **copié depuis Elevay `sending-gate.ts:212`** ; ce fichier copié DOIT exister sous `src/` ; réexport optionnel `orion-send-gate.ts`) |
| **pack2** | `src/inngest/ingest-run.ts`, `src/inngest/signal-score-daily.ts` ; `src/lib/ingest/csv-parse.ts`, `src/lib/ingest/score-touched.ts`, `src/lib/ingest/mcp-handlers.ts` ; `src/lib/ingest/sources/{csv,apollo}-source.ts` ; **MODIF coordonnée** `src/app/api/import/smart/route.ts` (producteur d'event — fichier Elevay, voir §3.3) |
| **pack3** | `src/lib/mcp/outreach-brief.ts`, `src/lib/mcp/evaluate-send.ts`, `src/lib/mcp/brief-tools.ts` (module registre) ; `src/lib/mcp/resources.ts` `[P1]` |
| **pack4** | `src/lib/outbound/instantly-map.ts` ; `src/lib/outbound/destinations/{instantly,orange-slice,webhook-generic}.ts` (**destinations RÉELLES seulement** — PAS de `fiber.ts`/`lopus.ts` REST ; Lopus = via `webhook-generic`) ; `src/lib/mcp/export-to-outbound.ts`, `src/lib/mcp/outbound-tools.ts` (module registre) ; `src/inngest/export-to-outbound.ts` |
| **pack5** | `src/lib/ingest/sources/{sirene,waterfall,sec,bodacc,ats,oss,techchurn,crtsh,fiber}-source.ts` ; `src/inngest/velocity-snapshot.ts` |
| **pack6** | `packages/ui/*` (`@orion/ui` extrait) ; `src/app/(orion)/sources/*`, `.../prospects/*`, `.../briefs/*`, `.../outbound/*` ; composants `src/components/orion/*` (badges statut/source) |
| **pack7** | `src/__tests__/` **par FICHIERS NOMMÉS** (PAS un glob `*` — pack0/1/3/5 y écrivent aussi des fichiers nommés distincts, cf. ci-dessous) : `reuse-untouched.test.ts` (T-38), `env-shape.test.ts` (T-41), `core-suite.test.ts` + `mvp-integration.test.ts` (T-39) ; `e2e/mvp-flow.spec.ts` ; `.env.example` ; `scripts/seed-demo.ts` (T-42) ; **édition finale** des zones append des registres (§3.2) |

> **`src/__tests__/` n'appartient PAS en bloc à pack7.** C'est un dossier partagé peuplé par
> **FICHIERS NOMMÉS** : chaque pack possède SES fichiers de test nommés et n'en touche aucun
> autre. Répartition (chacun écrit ses tripwires/tests « code→test » dans des fichiers nommés
> distincts) : **pack0** `rls.test.ts`, `tailwind-config-less.test.ts`, `migrate-exit1.test.ts` ;
> **pack1** `taxonomy.test.ts`, `schema-contracts.test.ts`, `gate-wrapper.test.ts` ; **pack2**
> co-localisés sous `src/lib/ingest/**` ; **pack3** `outreach-brief.test.ts`,
> `mcp-structured-content.test.ts` ; **pack4** co-localisés sous `src/lib/outbound/**` +
> `mcp/export-to-outbound.test.ts` ; **pack5** `velocity-snapshot.test.ts`,
> `signal-sources.test.ts` ; **pack7** uniquement les fichiers nommés listés ci-dessus
> (`reuse-untouched`/`env-shape`/`core-suite`/`mvp-integration`). **Aucun glob `src/__tests__/*`
> assigné à un seul pack.**

### 3.2 Pattern anti-collision pour les fichiers partagés (registre append-only)

Quatre fichiers sont touchés par plusieurs packs. **pack0 les crée comme des agrégateurs avec une zone
d'ajout balisée ; chaque pack livre SON fichier handler, puis ajoute exactement UNE ligne d'import +
UNE entrée dans l'array.** Les conflits sur des lignes append-only adjacentes sont triviaux.

**(a) Route MCP — `src/lib/mcp/registry.ts`** (pack0 crée)
```ts
import type { McpToolModule } from "./types";          // { tools: ToolDef[]; handlers: Record<string,Handler> }
// <<< ORION:MCP-MODULES (append-only — une ligne par pack) >>>
import { ingestTools }   from "@/lib/ingest/mcp-handlers";   // pack2
import { briefTools }    from "@/lib/mcp/brief-tools";        // pack3
import { outboundTools } from "@/lib/mcp/outbound-tools";     // pack4
// <<< /ORION:MCP-MODULES >>>
export const MCP_MODULES: McpToolModule[] = [
  ingestTools, briefTools, outboundTools,                     // append-only
];
```
`src/app/api/mcp/route.ts` est le **serveur MCP Elevay COPIÉ** (vendoré depuis la source
Elevay `app/api/mcp/route.ts`, cf. D3) — pas un fichier réécrit. La frontière entre pack0 et
pack3 dessus est **explicite et AUTORISÉE** (patch additif coordonné du fichier copié,
**séquentielle pack0 → pack3** ; ce n'est PAS une violation de `reuse-untouched.test.ts` T-38,
qui vérifie que les *modules métier* copiés matchent leur source Elevay, pas la route de
transport) :

- **pack0** pose les **balises `<<< ORION:* >>>`** (`ORION:MCP-MODULES`, `ORION:MCP-INIT`) +
  un **fallback `tools/call`** qui itère `MCP_MODULES` (registre §3.2a) pour les outils Orion,
  sans toucher le dispatch Elevay existant (auth Bearer `mcp_*` T-7 réutilisée telle quelle).
- **pack3** patche **LÉGITIMEMENT l'envelope Elevay** : `structuredContent` dans la réponse
  `tools/call` (**route.ts ~953-957**, T-29) + bump du protocole dans `initialize`
  (**`2025-06-18`**). Patch **dans les balises** `// <<< ORION:MCP-INIT >>>` (séquentiel, après
  pack0). **Aucun autre pack ne touche `route.ts`.**

**(b) Route Inngest — `src/inngest/registry.ts`** (pack0 crée) : même schéma.
```ts
// <<< ORION:INNGEST-FNS (append-only) >>>
import { ingestRun, signalScoreDaily } from "./ingest-run";        // pack2
import { discoveryRun }                from "./discovery-run";      // pack2
import { exportToOutbound }            from "./export-to-outbound"; // pack4
import { velocitySnapshot }            from "./velocity-snapshot";  // pack5
// <<< /ORION:INNGEST-FNS >>>
export const INNGEST_FUNCTIONS = [ingestRun, signalScoreDaily, discoveryRun, exportToOutbound, velocitySnapshot];
```
`app/api/inngest/route.ts` (pack0) : `serve({ client: inngest, functions: INNGEST_FUNCTIONS })` + `export const maxDuration = 300`.

**(c) Barrel schéma — `src/db/schema.ts`** (pack0 crée) : réexports append-only.
```ts
export * from "./schema/auth";          // pack0
// <<< ORION:SCHEMA (append-only) >>>
export * from "./schema/tenants";       // pack1
export * from "./schema/integrations";  // pack1
export * from "./schema/ingest";        // pack1
export * from "./schema/outbound";      // pack1
export * from "./schema/snapshots";     // pack1
// <<< /ORION:SCHEMA >>>
```

**(d) `globals.css` / `@orion/ui`** : pack0 pose la base ; pack6 **extrait** vers `packages/ui` puis
réimporte (Option B `ui-spec §1`). pack6 est le seul à toucher l'UI → pas de collision concurrente.

**Migrations `drizzle/*.sql`** : le répertoire `drizzle/` vit dans le **repo Orion séparé**,
**mais la DB et son ledger `__elevay_migrations` sont PARTAGÉS** avec Elevay (DB partagée, schéma
additif). Comme le ledger de la DB partagée a **déjà** appliqué `0001` → `0106`, la numérotation
Orion **doit continuer à partir de cet état** pour ne pas entrer en collision. Le **plan de plages
« repo séparé from scratch » (`0001–0009` / `0010–0029` / `0090+`) est FAUX et SUPPRIMÉ** : ces
numéros sont déjà pris dans le ledger partagé. Donc la **prochaine** migration additive Orion =
**`0107`** (pack1, ses tables core + `signal_snapshots`) ; **pack7 = `0108+`** (seed/backfill).
**pack5** n'ajoute **aucune** migration (réutilise `signal_snapshots` de pack1). Nommage
`NNNN_<pack>_<desc>.sql` (le runner trie lexicalement), table ledger **`__elevay_migrations`**.
Avant d'allouer un numéro, **re-vérifier l'état du ledger partagé / `drizzle/`** (un pack
concurrent a pu prendre le suivant) et incrémenter.

### 3.3 Fichiers Elevay copiés puis modifiés (REUSE → copie, pas réécriture)

`design.md`/`tasks.md` "MODIF" sur des fichiers copiés depuis Elevay : **diff additif/wrapper
uniquement** par rapport à la source copiée (invariant T-38 `reuse-untouched.test.ts` = le copié
matche la source Elevay, hors hookpoints additifs documentés). Coordination :
- `src/app/api/import/smart/route.ts` (copié depuis Elevay `app/api/import/smart/route.ts`,
  T-22, pack2) : transformer l'insert en `openIngestJob` + `inngest.send("ingest/run")`,
  rétro-compat `sync=true` <50 lignes. **Un seul pack y touche (pack2).**
- `src/app/api/mcp/route.ts` (serveur MCP COPIÉ depuis Elevay) : **jamais réécrit, mais patché de
  façon additive et AUTORISÉE dans les balises** (§3.2a) — **pack0** pose les balises
  `<<< ORION:* >>>` + le fallback `tools/call` (registre) ; **pack3** patche l'envelope
  `structuredContent` (**~953-957**, T-29) + le bump `initialize` `2025-06-18`. Édition
  **séquentielle pack0 → pack3**, **hors champ** de `reuse-untouched.test.ts` (qui ne vérifie que
  les modules métier, pas la route de transport). **Un seul autre fichier copié est touché :
  `import/smart/route.ts` (pack2, ci-dessus).**
- Modules métier copiés (`db/canonical/*`, `lib/guardrails/*`, `lib/scoring/*`, `lib/ai/*`,
  `lib/signals/record-signal.ts`, `lib/campaign-engine/*`, `providers/company-enrichment/*`) :
  **copiés tels quels depuis la source Elevay**, **jamais réécrits**. Les 2 hookpoints du gap #455
  (T-18 : provenance `functions.ts:~220`, signal post-import `agentic-executor.ts:~240`) sont des
  **ajouts additifs** ciblés sur la copie, possédés par **pack2 uniquement**.

---

## 4. CONVENTIONS PARTAGÉES

**Versions — épinglées (ne PAS dévier ; `tasks.md` T-2/T-3 fait foi) :**
`pnpm 10.15.1` · `Node 22` · `Turbo ^2.9.17` · `next ^15.5.15` · `react ^19.2.7` ·
`typescript ^5.9.3` · `tailwindcss ^4.3.0` (**config-less**, `@theme` dans `globals.css`) ·
`drizzle-orm ^0.45.2` (**`pnpm.overrides`** + **`db as any`** à l'adapter) · `drizzle-kit ^0.31.10` ·
`next-auth 5.0.0-beta.30` · `@auth/drizzle-adapter ^1.11.2` ·
`inngest ^4.5.1` (**`createFunction` 2-arg**, triggers DANS la config, `concurrency` = **array**,
`maxDuration 300`) · `ai ^6.0.199` · `@ai-sdk/anthropic ^3.0.82` · `@anthropic-ai/sdk ^0.104.1` ·
`postgres ^3.4.9` (**DROP `@neondatabase/serverless`**) · `zod ^4.4.3` · `vitest ^4.1.8` ·
`@playwright/test ^1.60.0`.

**Invariants transverses (tripwires — jamais violés) :**
1. `tenantId` ← Bearer `mcp_*` / JWT / `event.data` — **jamais** un argument client (ici toujours le
   tenant `elevay`).
2. Aucun chemin d'export ne contourne `evaluateSend` (gate DANS le wrapper).
3. Orion **n'envoie jamais** de cold via une infra cliente (Instantly = outil DU client).
4. Clés partenaires **per-tenant en DB chiffrées** (`integration_credentials`), jamais en env.
5. baseURL Anthropic **inclut `/v1`** ; routing `chat→sonnet` / `light→haiku` ; `tracedGenerateText/Object`
   → `enforceLlmBudget(tenantId)` **avant** dispatch + `recordTrace` (coût via `agent_traces.estimated_cost`).
6. `set_config(..., true)` **transaction-local** ; **jamais** `..., false` (Supavisor).
7. Tailwind config-less ; pas de `tailwind.config.*`.
8. `db:migrate` → **exit 1** (runner custom `scripts/apply-migrations.ts:52`, table `__elevay_migrations` seule ; numérotation réelle `drizzle/` 0001→0106 → prochaine 0107 pack1, pack7 0108+).
9. Export nommé interdit sur `page.tsx`/`layout.tsx` (Next build gap) → siblings `_`.

**AI provider :** singleton lazy derrière `Proxy` (env au call-time), allowlist baseURL EU/US **avec
`/v1`**, circuit-breaker → OpenAI, **pas** de Vercel AI Gateway.

**CI :** filtre **`@orion/web`** (le package du repo Orion séparé), `pnpm/action-setup@v6
version:10.15.1` + `setup-node@v5 node:22`, `NODE_OPTIONS=--max-old-space-size=6144`,
`pnpm --filter @orion/web tsc && test`, + **gitleaks**. Vert sur install `--frozen-lockfile`
**propre** (pas un `node_modules` junctionné — divergence CI connue).

**Branche par lot :** `feat/orion-pack0` … `feat/orion-pack7`. Merge vers `main` **uniquement sur
PASS** (eval hostile), CI pleine verte (gitleaks + tsc+vitest + Vercel), puis surveiller le push CI de `main`.

**Comment une session DÉMARRE :**
```sh
git fetch origin && git checkout main && git pull
# pack0/pack1 doivent être mergés avant un pack parallèle :
git checkout -b feat/orion-packN            # ou: git checkout feat/orion-packN
git rebase origin/main                       # récupérer pack0/pack1
pnpm install --frozen-lockfile && pnpm --filter @orion/web tsc   # à la racine du repo Orion
```
Puis : lire `tasks.md` des T-* du lot + ce guide §3 (ownership). Coder **uniquement** ses fichiers.

**Comment une session FINIT (Definition of Done par tâche, puis par pack) :**
- **Par tâche :** code → **TEST** écrit (Vitest) → **VERIFY** runtime exécuté soi-même (preuve : log/
  screenshot) → commit unique, logique isolée.
- **Par pack :** `pnpm --filter @orion/web tsc` + `test` verts ; tripwires du pack verts ; tous les T-* du
  lot avec test+verify ; aucun fichier hors ownership modifié (`git diff --stat` scopé) ; PR ouverte,
  CI pleine verte → eval `/evaluate` → merge squash + delete-branch.

**Règle de commit :** un changement logique par commit (split renommage/refactor/tests/comportement).
Trailer obligatoire :
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017cpMyY7RNVYTQmqzYp8Qz4
```

---

## 5. PROTOCOLE MULTI-SESSION (l'arbre bouge sous toi)

Plusieurs sessions partagent le **même working tree** et peuvent déplacer branche/HEAD en cours de tour.

1. **Une branche par session = un pack.** `feat/orion-packN`. Ne jamais committer sur la branche d'un
   autre pack.
2. **Re-vérifier branche + HEAD JUSTE AVANT chaque commit/push :**
   ```sh
   git rev-parse --abbrev-ref HEAD     # doit == feat/orion-packN
   git rev-parse HEAD
   ```
   Si la branche a bougé (session concurrente) → ne pas committer ; re-checkout sa branche d'abord.
3. **Pathspecs scopés — JAMAIS `git add -A` / `git add .`.** N'ajouter que les fichiers du pack :
   ```sh
   git add src/lib/ingest src/inngest/ingest-run.ts   # ex. pack2 (chemins relatifs racine repo Orion)
   git commit -m "..."
   ```
   Cela évite d'aspirer le travail non-committé d'une session voisine dans le tree partagé.
4. **Registres append-only (§3.2) :** un pack ajoute SES lignes dans les balises `<<< ORION:* >>>`.
   Si deux packs ajoutent en même temps et entrent en conflit → résolution = **garder les deux
   lignes** (additif). Si une session préfère zéro contention, déléguer le câblage du registre à
   **pack7** (le module handler du pack est livré ; son branchement dans l'array se fait en intégration).
5. **Worktrees (recommandé pour le fan-out) :** pour isoler les 5 sessions parallèles, utiliser un
   `git worktree` par pack (évite le hazard du tree partagé). Attention CI : un `node_modules`
   junctionné peut passer tsc local mais échouer en CI → toujours valider sur un install propre.
6. **"Pre-existing" exige une preuve :** avant de blâmer du code existant, le reproduire sur `main`.
7. **Rebase discipline :** un pack parallèle rebase sur `origin/main` dès que pack0/pack1 (ou un autre
   pack dont il dépend en soft) y est mergé, pour récupérer les contrats à jour.
8. **Ne jamais migrer prod depuis une branche non mergée.** Appliquer les migrations additives sur le
   **dev** (`leadsens-localdev`) via `db:push` ; prod via `db:migrate:apply` + `DATABASE_URL_OWNER`
   **après** merge (one-shot, idempotent `IF NOT EXISTS`).

---

## 6. RÉCAP — LOTS & DÉPENDANCES (la réponse en bref)

| Pack | T-* | j-h | Dépend de | Parallèle avec |
|---|---|---|---|---|
| **pack0** Foundation | T-1..5, T-6, T-7, T-8, T-12, T-13, T-16 | 6,75 | — | — |
| **pack1** Schema & contrats | T-9, T-10, T-11, T-14, T-15, T-36 (+contrats T-21/28/32, DDL T-20) | 5,75 | pack0 | — |
| **pack2** Ingestion | T-17, T-18, T-19, T-22, T-23, T-27 | 7,25 | pack1 | pack3,4,5,6 |
| **pack3** Brief+MCP | T-28, T-29, T-31, T-30`[P1]` | 3,5 | pack1 | pack2,4,5,6 |
| **pack4** Output+Gates | T-32, T-33, T-35, T-37, T-34`[P1]` | 5,75 | pack1 (+pack3 soft) | pack2,3,5,6 |
| **pack5** Tier2-signals `[P1]` | T-24, T-25, T-26, T-20 | 5,5 | pack1 (+pack2 soft) | pack2,3,4,6 |
| **pack6** UI | U1–U6 (ui-spec) | 7,0 | pack0 (+pack2/3/4 soft) | pack2,3,4,5 |
| **pack7** Demo+Integration | T-38, T-39, T-40, T-41, T-42 | 4,0 | **tous** | — |
| **Total** | T-1..42 + UI | **≈ 45,5** | | |

**Ordre d'exécution :** `pack0` → `pack1` → **fan-out 5 sessions [pack2, pack3, pack4, pack5, pack6]**
→ fan-in `pack7`. MVP démo = chemin pack0→pack1→pack2→pack3→pack4→pack7 (pack5/pack6 hors MVP).

**Rappels post-audit (priment) :**
- **pack1 = schéma + contrats partagés** : il **PRODUIT et POSSÈDE** `taxonomy.ts`,
  `ingest/types.ts`, `ingest/jobs.ts`, `outbound/types.ts`, `outreach-brief.schema.ts`,
  `campaign-engine/brief.ts` et le wrapper `sending-gate.ts`. **Critère :** pack2/3/4/5/6
  `tsc`ent en n'important QUE des fichiers de `pack0`+`pack1` (cf. `00-ARCHITECTURE` D3).
- **pack4 = sorties RÉELLES** : Instantly (natif) · Orange Slice (webhook colonne) ·
  Lopus (webhook générique) · webhook générique HMAC. **PAS de `FiberAdapter`/`LopusAdapter`
  REST.**
- **Fiber = ENTRÉE** : reveal waterfall (**pack2**) + signaux Tracker Svix (**pack5**),
  PAS une destination. Voir `research/partner-apis-2026-06-27.md`.
- **Migrations** : ledger partagé `__elevay_migrations` déjà à 0001→0106 → prochaine **0107**
  (pack1), pack7 **0108+**. Le plan de plages « numérotation from scratch » est SUPPRIMÉ (la DB
  partagée impose de continuer à partir de 0106).
