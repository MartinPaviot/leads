# Orion — BRIEF DE LOT · pack7 « demo-integration » (`feat/orion-pack7`)

> **Brief auto-suffisant.** Cette session n'a QUE ce fichier + les docs pointés. Tout ce qu'il
> faut pour EXÉCUTER pack7 sans rien redériver est ici. Les `file:line` sont **réels et vérifiés**
> (les `file:line` désignent la **SOURCE Elevay à COPIER** sous `C:/Users/ombel/leads/app/apps/web/src/`
> — la provenance à vendorer, PAS un import ; TOUT le code Orion vit dans un **repo Orion SÉPARÉ**
> (`@orion/web`), ses fichiers sous `src/`). pack7 est le **fan-in** : il
> recolle les 5 packs parallèles, prouve « REUSE intact », seede le tenant `elevay`, et arme le
> parcours démo 2 min.
>
> **Lire (dans l'ordre, seulement ces passages) :**
> 1. `orion/spec/00-ARCHITECTURE.md` — D1 (DB partagée), D2 (tenant `elevay` + RLS), D5 (migrations),
>    D6 (build dev / démo sur instance `elevay`, **création tenant si absent**), D8 (gate avant export),
>    §3 règles d'or 1-11, §6 pré-requis d'amorçage.
> 2. `orion/spec/00-EXECUTION-GUIDE.md` — §1 pack7, §3.1 ownership (pack7 = `src/__tests__/*`,
>    `e2e/`, `.env.example`, `scripts/seed-demo.ts`, **édition finale des registres append-only**),
>    §3.2 registres, §4 invariants/CI, §5 protocole multi-session.
> 3. `orion/spec/00-PREREQUISITES.md` — **§1.2** (créer le tenant `elevay` + clé `mcp_*`), §1.3
>    (rôle `elevay_app` + GRANT), **§2** (seed insert-then-score + hero + critères VERIFY T-42),
>    §3 pièges (tous), §4 les 4 dép. dures, **GAPS G1..G8** (les blocages honnêtes).
> 4. `orion/research/signal-agent-prd-2026-06-27.md` — **§5** (DEMO 2 MIN : table seconde-par-seconde
>    l.83-93, pré-seed obligatoire P1-P7 l.67-78, transport HTTPS l.79, Plan B par beat l.104-111),
>    §9.1 SCOPE IN (A→H l.293-296), §11 DoD démo + dép. dures l.379-399.
> 5. `orion/spec/tasks.md` T-38..T-42 (l.727-818) + CHEMIN CRITIQUE (l.822-861) — la carte REUSE,
>    les VERIFY/TEST de chaque tâche, les 3 conditions dures du slice ≈8 j-h.
> 6. Briefs des packs amont (déjà écrits, à lire si une intégration coince) :
>    `orion/spec/packages/pack0-foundation.md`, `pack2-ingestion.md`, `pack3-brief-mcp.md`,
>    `pack4-output-gates.md` (pack1 & pack6 : lire leur §3 ownership dans `00-EXECUTION-GUIDE §3.1`).
> 7. **`orion/spec/demo-hero-FROZEN.md` — le hero de démo FIGÉ (2026-06-28).** Signal
>    `leadership_change.vp_eng` ; seed **10 won / 7 lost** (tables l.22-45) ; sources de ré-acquisition
>    Fiber Tracker + Unipile/LinkedIn + BODACC ; restitution 90s **mot pour mot** (l.54-59) ; le
>    confounder à défaire = `investor_overlap` (s'effondre à 0 sur le stratum froid `deal_source=outbound`).
>    **C'est ce hero précis que §4bis charge + démontre** — il prime sur le hero générique de l'Étape 2.

---

## 1. OBJECTIF + PÉRIMÈTRE

**Objectif.** Recoller les 6 packs amont en un produit démontrable, **sur la DB Elevay partagée,
scope tenant `elevay`** : (a) prouver « REUSE intact » (les seams Elevay ne sont touchés qu'en
additif/wrapper) ; (b) la **suite Vitest cœur** (dédup, idempotence, précédence, gates fail-closed,
flatten Instantly, citableFacts/doNotClaim) + les tripwires transverses ; (c) l'**e2e MVP**
(CSV → brief → export gaté, le `unreviewed` est skip `not_targeted`) ; (d) l'**inventaire env**
(`.env.example` + tripwire env-shape) ; (e) le **seed du tenant `elevay`** insert-then-score
(targeting flags + hero metric/provenance/signal frais + brief pré-construit) ; (f) la **création
one-shot du tenant `elevay` + clé `mcp_*`** s'il est absent (D6/§1.2) ; (g) le **câblage final des
registres append-only** (MCP/Inngest/schéma) si des packs ont délégué leur branchement ; (h) le
**hardening** : checklist des dépendances bloquantes (`TARGETING_GATE_ENABLED`, transport MCP HTTPS,
`generateOpener` non-vide) vérifiées **live** ; (i) **le wedge day-one** (§4bis) : charger le **hero
FIGÉ** `leadership_change.vp_eng` (10 won / 7 lost) insert-then-score avec **événements datés**, faire
tourner l'**offline-discovery point-in-time à froid sur l'historique uploadé**, et jouer la
**restitution 90s** (preuve + confiance honnête + reveal confounder + action + 1 confirmation) jusqu'à
l'**acquisition à froid** d'un prospect via le signal — la boucle complète du produit.

**Mapping tâches :** T-38 (preuve REUSE intact), T-39 (suite Vitest cœur), T-40 (e2e MVP),
T-41 (env inventory + env-shape), T-42 (seed hero + brief pré-construit). **T-42b** = §4bis (seed hero
FIGÉ + offline-discovery + restitution + cold-acquire). Effort total **≈ 4,0 j-h** (+ **≈ 2,0 j-h** pour
T-42b).

### IN (ce lot POSSÈDE — voir §3)
La suite cœur `src/__tests__/*` + tripwires transverses ; l'e2e `e2e/mvp-flow.spec.ts` ;
`.env.example` ; `scripts/seed-demo.ts` + `scripts/ensure-elevay-tenant.ts` (création tenant one-shot) ;
le **câblage final** des zones append-only des 3 registres (si un pack a délégué) ; la checklist de
hardening **exécutée** (logs/captures à disque).

### OUT (possédé par un AUTRE lot — NE PAS créer/éditer, seulement IMPORTER/APPELER)
- **pack0** : `src/app/api/mcp/route.ts` (squelette + dispatch), `src/lib/mcp/{registry,types}.ts`,
  `src/inngest/{client,registry}.ts`, `src/app/api/inngest/route.ts`, `src/db/{index,rls}.ts`,
  `scripts/apply-migrations.ts`, `src/lib/ai/*`, `src/auth.ts`, `src/middleware.ts`, `globals.css`.
  pack7 **n'ajoute QUE** des lignes dans les **balises** `<<< ORION:* >>>` (registre) si délégué.
- **pack1** : tables (`db/schema/{tenants,integrations,ingest,outbound,snapshots}.ts`), contrats
  (`lib/ingest/types.ts`, `lib/outbound/types.ts`, `lib/mcp/contracts/outreach-brief.schema.ts`),
  taxonomie (`lib/signals/taxonomy.ts`), wrappers REUSE (`lib/guardrails/orion-send-gate.ts`,
  `lib/campaign-engine/brief.ts`). pack7 **appelle**, ne crée pas.
- **pack2** : ingestion (`lib/ingest/csv-parse.ts`, `score-touched.ts`, `mcp-handlers.ts`,
  `sources/{csv,apollo}-source.ts`, `inngest/ingest-run.ts`, `signal-score-daily.ts`, hookpoints
  `functions.ts:~220` / `agentic-executor.ts:~240`). Le seed pack7 **réutilise** ce pipeline.
- **pack3** : `get_outreach_brief` (`lib/mcp/outreach-brief.ts`), `evaluate_send`, bump proto.
- **pack4** : export gaté (`lib/mcp/export-to-outbound.ts`, `inngest/export-to-outbound.ts`,
  `lib/outbound/destinations/*`, `instantly-map.ts`, `credentials.ts`).
- **pack5** `[P1]` : sources Tier 2 + `velocity-snapshot` (hors slice MVP).
- **pack6** : les 4 écrans UI + `@orion/ui`. L'e2e pack7 **pilote** l'UI/MCP, ne l'édite pas.

**Modules Elevay REUSE — COPIÉS tels quels (vendorés) depuis Elevay, JAMAIS modifiés vs la source** (tripwire T-38 le garde) :
`db/canonical/*`, `lib/guardrails/*`, `lib/scoring/*`, `lib/ai/*`, `lib/signals/record-signal.ts`,
`lib/campaign-engine/build-intelligence-brief.ts`, `lib/providers/company-enrichment/*`,
`lib/providers/instantly/send-adapter.ts`, `app/api/mcp/route.ts` (copie de la route Elevay), `auth.ts`. Les seules
modifs des modules copiés autorisées sont les **hookpoints additifs de pack2** (déjà
possédés par pack2) — pack7 **ne les retouche pas**, il **vérifie** qu'ils sont additifs.

**RÈGLE D'OR :** pack7 n'édite QUE ses fichiers (§3) + au plus **une ligne par balise** dans les 3
registres si un pack amont a délégué son câblage. Tout le reste = import/appel.

---

## 2. PRÉREQUIS

**Lots à finir avant (durs) — pack7 est bloqué par TOUS :** pack0, pack1, pack2, pack3, pack4
mergés sur `main` (pack5/pack6 = `[P1]`, non bloquants pour le slice MVP démo ; si pack6 absent,
l'e2e pilote la **surface MCP** via `POST /api/mcp` au lieu de l'UI — cf. §4 Étape 3, Plan B).

**Démarrage de session :**
```sh
git fetch origin && git checkout main && git pull
git checkout -b feat/orion-pack7
git rebase origin/main          # récupérer pack0..pack4 (contrats + modules à jour)
cd app && pnpm install --frozen-lockfile && pnpm --filter @orion/web tsc   # DOIT être vert
```
Si `tsc` rouge à ce stade → un pack amont n'est pas mergé/cassé : **ne pas coder par-dessus**,
identifier le pack manquant (le rebase l'aurait ramené) et attendre/escalader. « Pre-existing »
exige une preuve : reproduire sur `main`.

**Cartes nécessaires de 00-PREREQUISITES (résumé exécutable) :**

- **§1.2 — Le tenant `elevay` DOIT exister, sinon le créer (one-shot, rôle owner).** Sans une ligne
  `tenants` `elevay` + ≥1 `users` + une clé `mcp_*`, **tout appel MCP → 401** et le seed n'a pas de
  tenant. Procédure : `INSERT tenants (id=gen_random_uuid(), name='elevay', settings='{"mcpApiKeys":[]}')`
  → noter l'`id` = `elevayTenantId` ; créer un `users` admin rattaché ; générer `mcp_<random>`, en
  stocker le **hash bcrypt (cost 10)** dans `tenants.settings.mcpApiKeys[]` au format `McpApiKeyEntry`
  (`lib/config/tenant-settings.ts:431` : `{id, name, keyHash, keyPrefix, createdAt, keyOwnerId?}`) —
  **PAS sha256** : `authenticateMcpRequest` (`route.ts:230`) fait `bcryptjs.compare(token, keyHash)`,
  une clé sha256 ne matche jamais (401) ; recette `SETUP-RUNBOOK §4.2` ;
  **conserver la clé en clair UNE fois** (opérateur). Vérifier : `curl -H "Authorization: Bearer
  mcp_…" .../api/mcp` (méthode `initialize`) → 200, `tenantId` résolu = `elevayTenantId`.
- **§1.3 / G4 — GRANT `elevay_app` sur les tables net-new.** Après chaque `db:push`/migration, les
  tables `integration_credentials`, `ingest_*`, `export_*`, `outbound_destinations`, `signal_snapshots`
  doivent avoir GRANT + policies RLS pour le rôle runtime `elevay_app`, sinon le seed (qui passe par
  `withTenantTx`, rôle app) ne peut ni lire ni écrire. Si non scripté côté pack1 → l'ajouter en
  migration additive owner one-shot (pack7 le vérifie et le complète si besoin).
- **§2 — Le seed est INSERT-THEN-SCORE.** Insérer puis faire passer par résolution → signal → score.
  **Ne JAMAIS écrire un `priorityScore` à la main** (P2 PRD : `priorityScore` est `NULL`
  `lib/icp/fit-recompute-core.ts` tant qu'un run de scoring n'a pas tourné → `find_prospects` vide).
  Le seed DOIT exécuter `computePriorityScore` (`lib/scoring/priority-score.ts:70`) + poser
  `priorityScoreComputedAt`.
- **§4 dép. dures :** DÉP-1 `taxonomy.ts` (sinon multipliers plancher 1.0×), DÉP-2 hookpoints
  provenance/signal (sinon CSV→brief sans why-now), DÉP-3 `structuredContent`/proto (sinon brief
  inexploitable), DÉP-4 hero (metric+provenance+signal frais). pack7 **consomme** ces 4 ; si l'une
  manque, le pack amont responsable n'est pas fini → bloquer.
- **Pièges :** #1 Inngest 2-arg, #5 runner custom `db:migrate→exit 1` (seul `db:migrate:apply`
  applique), #11 export nommé sur `page.tsx`/`layout.tsx` casse `next build` (l'e2e doit lancer un
  vrai `next build`/`next dev`, pas seulement tsc), #13 `node_modules` junctionné passe tsc local
  mais échoue CI → valider sur install `--frozen-lockfile` propre.
- **Démo flags (G5, P1) :** `TARGETING_GATE_ENABLED=on` **+** `safeModeEnabled=true` sur le tenant
  `elevay` — **indispensable** pour que le compte-piège `unreviewed` produise `{send:false,
  not_targeted}` (`lib/guardrails/sending-gate.ts:301`/`:305`). Sur un tenant neuf sans flag la
  branche est **sautée → `{send:true}`** et le climax n'arrive jamais.
- **Transport (GAP-3 / dép. dure #2) :** Claude Desktop exige HTTPS ; le serveur est POST JSON-RPC
  **sans SSE** (`route.ts:938`). Tunnel HTTPS (ngrok / Vercel preview) à valider AVANT la démo
  (`initialize` + `tools/list` round-trip). pack7 documente la commande, mais le tunnel réel +
  l'OAuth/Bearer sont **opérateur-only** (cf. §7 hardening).
- **Clés sink JAMAIS en env** (D7) : Instantly/Orange Slice/Lopus + le secret HMAC webhook = per-tenant
  chiffrées dans `integration_credentials`. **Fiber n'est PAS un sink** : c'est une source d'ENTRÉE
  (catalogue d'acquisition), donc `FIBER_API_KEY` en env est autorisée pour la démo (comme `APOLLO_API_KEY`).
  La démo tourne en **`dryRun:true`** (plan sans POST tiers) si aucune clé réelle (GAP-3) — suffisant pour
  le climax gaté.

---

## 3. FICHIERS POSSÉDÉS PAR pack7 (création + édition exclusives)

> Tous dans le repo Orion séparé, sous le package `@orion/web` (préfixe `src/` = `app/apps/web/src/`, sauf `e2e/` et `scripts/`).
> **Dossier e2e : aligné sur `testDir: "./e2e"` + `globalSetup: "./e2e/global-setup.ts"`** (posés par
> pack0, CONFIG-TOOLING §1-2 / pack0-foundation.md:162-165). Les specs pack7 vivent en `e2e/*.spec.ts`
> et l'auth-fixture en `e2e/global-setup.ts` — **JAMAIS `tests/e2e/`** (l'ancien `testDir` Elevay).
> **NET-NEW** sauf mention. Zéro chevauchement (vérifié contre 00-EXECUTION-GUIDE §3.1 : pack7 = la
> suite cœur `src/__tests__/*`, l'e2e, `.env.example`, `scripts/seed-demo.ts`, **édition finale des
> zones append des registres**). Les tests **co-localisés** d'un pack (`lib/*/__tests__/`)
> appartiennent à CE pack — pack7 ne les touche pas ; pack7 possède la suite **transverse**
> `src/__tests__/*`.

| Fichier | Type | Rôle |
|---|---|---|
| `src/__tests__/reuse-untouched.test.ts` | NET-NEW | T-38. Tripwire : les modules REUSE (carte §4 Étape 1) sont touchés en **additif/wrapper uniquement** (diff vs `main`/baseline = aucune suppression/réécriture de la logique métier). |
| `src/__tests__/core-invariants.test.ts` | NET-NEW | T-39. Méta-suite cœur : agrège dédup 3 niveaux, idempotence runner, précédence multi-source, gates fail-closed, flatten Instantly, citableFacts/doNotClaim — assert que chaque invariant a ≥1 test vert (importe/relance les suites co-localisées). |
| `src/__tests__/gate-uncircumventable.test.ts` | NET-NEW | T-36/T-37 transverse. Tripwire : **aucun** chemin d'export ne POST avant `evaluateSend` ; `evaluate_send`/`export_to_outbound` exposés en JSON-RPC ne court-circuitent pas le gate ; `interactive:false` garde la targeting active. |
| `src/__tests__/env-shape.test.ts` | NET-NEW | T-41. `grep DATABASE_URL_OWNER` dans `src/` → **0** ; aucune clé sink (`INSTANTLY/ORANGE/LOPUS/WEBHOOK_SECRET`) lue depuis `process.env` ; boot minimal = `DATABASE_URL`+`AUTH_SECRET`+`ANTHROPIC_API_KEY`. |
| `src/__tests__/no-tenant-arg.test.ts` | NET-NEW | Invariant #1 transverse. Aucun `inputSchema` d'outil MCP Orion ne déclare `tenantId` (le tenant vient TOUJOURS du Bearer). Itère `MCP_MODULES`. |
| `src/__tests__/seed-demo.test.ts` | NET-NEW | T-42. Le hero satisfait les 3 conditions : ≥1 `publicContent.type:"metric"`, firmo+provenance non vides (`firmographicsHaveSignal` `lib/campaign-engine/build-intelligence-brief.ts:199`), ≥1 signal **frais** (`isSignalFresh` `lib/signals/freshness.ts:98`) ; brief hero `citableFacts` non vide + `exportable:true` ; compte-piège `unreviewed` → skip `not_targeted`. |
| `e2e/mvp-flow.spec.ts` | NET-NEW | T-40. Parcours MVP bout-en-bout : `ingest_csv` → `get_outreach_brief` (0 prose) → `export_to_outbound` Instantly **dryRun** (le `unreviewed` est skip `not_targeted`). |
| `scripts/seed-demo.ts` | NET-NEW | T-42. Seed insert-then-score du tenant `elevay` (CSV via pipeline pack2 → résolution → signal → score) + targeting flags + hero + **brief pré-construit** (`buildIntelligenceBrief`, cache 14 j). Idempotent. |
| `scripts/seed-hero-frozen.ts` | NET-NEW | **T-42b / §4bis.** Charge le **hero FIGÉ** `demo-hero-FROZEN.md` dans `elevay` : 10 won / 7 lost (`deals`, `properties.dealSource`, J=close→`createdAt`), **événements datés** matérialisés en `properties.signals[]` + `signal_snapshots` pour que `[J−90→J]` FIRE point-in-time, `recordDealOutcome` par deal (`signal-outcomes.ts:151`), `getSignalMultipliers` à froid (`:245`), `TARGETING_GATE_ENABLED=on` + `safeModeEnabled`, **1 compte-piège `unreviewed`**. Insert-then-score, idempotent. |
| `scripts/offline-discovery.ts` | NET-NEW | **T-42b. THIN CALLER — ne réimplémente PAS le moteur 6-maillons.** Il **DÉLÈGUE** à `runOfflineDiscovery` (`lib/discovery/discover.ts`) / l'outil MCP `discover_from_history` **PRODUITS PAR pack2** : ce sont ces primitives pack2 qui enchaînent enrichir won+lost → reconstruire les événements datés → lift (dénom = LOST) → filtre non-évidence × acquérabilité-à-froid → prior cross-tenant `getAnonymizedBenchmark` (`anonymized-signals.ts:225`) → stratification confounder par `deal_source`. Ce script ne fait QUE charger l'historique, **appeler** `runOfflineDiscovery`/`discover_from_history`, et écrire le **rapport de discovery** consommé par la restitution. Aucune ré-implémentation du lift/prior ni du point-in-time (REUSE total via pack2). |
| `e2e/offline-discovery-demo.spec.ts` | NET-NEW | **T-42b.** Parcours wedge day-one : upload CSV closed-won/lost (identité+label+J **seulement**) → offline-discovery tourne → assert les 5 beats de la restitution 90s (preuve 6/10 vs 1/7 ; confiance honnête ≈3,5× postérieur k=14 ; **reveal confounder `investor_overlap` → 0 sur le froid** ; action « je le guette via Fiber/LinkedIn/BODACC » ; 1 confirmation) → **cold-acquire** un prospect jamais touché via `leadership_change.vp_eng`. |
| `src/__tests__/offline-discovery.test.ts` | NET-NEW | **T-42b.** Tripwire du moteur : (1) point-in-time — un événement hors `[J−90→J]` n'est PAS compté ; un état permanent (firmo) est rejeté ; (2) lift dénom = LOST (6/10 vs 1/7 ≈ 4,2×) ; (3) filtre : reformulation firmo « plus gros » pénalisée, signal non-ré-acquérable jeté ; (4) prior cross-tenant clamp `[0.5,2.5]` (`signal-outcomes.ts:39-40`), k≥10 (`:33`) → postérieur ≈3,5× ; (5) **modes d'échec** : confounder sourcing stratifié (`investor_overlap` s'effondre sur `deal_source=outbound`), pas-de-lost → confiance affichée baissée, signal non-ré-acquérable jeté. |
| `scripts/ensure-elevay-tenant.ts` | NET-NEW | D6/§1.2. Crée la ligne `tenants` `elevay` + user admin + clé `mcp_*` (hash **bcrypt cost 10**, shape `McpApiKeyEntry {id,name,keyHash,keyPrefix,createdAt}` — **PAS sha256**, le vérif fait `bcryptjs.compare`; cf. `SETUP-RUNBOOK §4.2`) si absente. **Owner one-shot, hors-bande** (lit `DATABASE_URL_OWNER`, jamais importé par le runtime). Imprime la clé en clair UNE fois. |
| `.env.example` | NET-NEW | T-41. Inventaire env pertinent (voir §4 Étape 5). Clés sink **absentes** (per-tenant en DB). |
| `_reports/orion-demo-hardening-<date>.md` | NET-NEW | §7 checklist hardening **exécutée** (logs/captures des 3 dép. bloquantes vérifiées live). |

**Édition d'AU PLUS une ligne par balise (zone append-only — §3.2 du guide), SEULEMENT si un pack
amont a délégué son câblage :**
- `src/lib/mcp/registry.ts` : import + entrée pour `ingestTools` (pack2), `briefTools` (pack3),
  `outboundTools` (pack4) — dans `<<< ORION:MCP-MODULES >>>` / `MCP_MODULES[]`.
- `src/inngest/registry.ts` : `ingestRun`, `signalScoreDaily` (pack2), `exportToOutbound` (pack4),
  `velocitySnapshot` (pack5) — dans `<<< ORION:INNGEST-FNS >>>` / `INNGEST_FUNCTIONS[]`.
- `src/db/schema.ts` : réexports pack1 — dans `<<< ORION:SCHEMA >>>`.
> Normalement chaque pack câble SES lignes ; pack7 **ne fait que combler** ce qui manque (additif,
> garder toutes les lignes). Conflit sur ligne adjacente = trivial (garder les deux).

**Migrations :** pack7 réserve la plage **`0108+`** (`NNNN_pack7_<desc>.sql`) pour seed/backfill/GRANT
complémentaires. dev = `db:push` ; prod = `db:migrate:apply` + `DATABASE_URL_OWNER` (one-shot,
idempotent `IF NOT EXISTS`) **après merge** (jamais migrer prod depuis une branche non mergée).

---

## 4. ÉTAPES ORDONNÉES

> Avant CHAQUE commit : `git rev-parse --abbrev-ref HEAD` == `feat/orion-pack7` ; `git add` **scopé**
> (jamais `-A`/`.`) ; un changement logique par commit ; trailer obligatoire (§6). Per tâche :
> code → TEST écrit → VERIFY exécuté **soi-même** (preuve : log/capture à disque) → commit.

### Étape 0 — Recoller : registres câblés + boot vert
**Action.** Vérifier que les 3 registres (§3 balises) contiennent bien les modules des packs mergés ;
combler toute ligne manquante (additif, dans les balises). Confirmer que `MCP_MODULES`,
`INNGEST_FUNCTIONS` et le barrel `schema.ts` exportent l'ensemble attendu.
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `grep -n "ingestTools\|briefTools\|outboundTools"
src/lib/mcp/registry.ts` = 3 hits ; `grep -n "ingestRun\|exportToOutbound" src/inngest/registry.ts`.
Lancer `next build` (ou `next dev`) → **0 erreur** (attrape le piège #11 export nommé sur page/layout).
**TEST.** — (couvert par `core-invariants` + e2e).

### Étape 1 — T-38 · `reuse-untouched.test.ts` (preuve REUSE intact)
**Action.** Tripwire prouvant que les seams Elevay sont **additif/wrapper uniquement**. Carte des
fichiers REUSE à surveiller (file:line réels, **ne doivent pas voir leur logique réécrite**) :

| Couture (REUSE) | file:line Elevay |
|---|---|
| Gate d'envoi | `lib/guardrails/sending-gate.ts:212-346` (catch `:339`, targeting `:301`/`:305`) |
| Anti-fabrication | `lib/evals/fabrication-gate.ts:173` |
| Brief | `lib/campaign-engine/build-intelligence-brief.ts:26,199,238`, `types.ts:50` |
| Signaux | `lib/signals/record-signal.ts:94` |
| Freshness | `lib/signals/freshness.ts:98` |
| Identité/précédence | `db/canonical/upsert.ts:108`, `identity.ts:67`, `precedence.ts:53` |
| Waterfall | `lib/providers/company-enrichment/waterfall.ts:148`, `registry.ts` |
| Scoring | `lib/scoring/priority-score.ts:70`, `signal-opener.ts:162` (`fillTemplate:146`) |
| Instantly adapter | `lib/providers/instantly/send-adapter.ts:19` |
| MCP route (Elevay) | `app/api/mcp/route.ts` |
| Auth | `auth.ts:198` (`db as any`), `:80-196` |

Le test asserte : ces fichiers ne sont **pas** réécrits par Orion (les seuls diffs autorisés vs
baseline sont les hookpoints additifs de pack2 dans `functions.ts:~220` et `agentic-executor.ts:~240`,
qui restent des **ajouts**, pas des réécritures). Implémentation pragmatique : lister les chemins REUSE
et vérifier qu'aucun module Orion net-new ne **réexporte en les masquant** / qu'un grep des marqueurs
de logique clé (`evaluateSend`, signatures de gate) est présent intact ; documenter la baseline.
**VERIFY (soi-même).** `git diff main -- lib/guardrails lib/scoring db/canonical lib/ai
lib/signals/record-signal.ts lib/campaign-engine/build-intelligence-brief.ts lib/providers/company-enrichment
lib/providers/instantly/send-adapter.ts app/api/mcp/route.ts` → **uniquement additif** (les 2 hookpoints
pack2). Logguer la sortie.
**TEST.** `reuse-untouched.test.ts` vert.

### Étape 2 — T-42 · `scripts/seed-demo.ts` + `ensure-elevay-tenant.ts` (insert-then-score + hero)
**Action.** `ensure-elevay-tenant.ts` (owner one-shot) : créer `tenants` `elevay` + user admin + clé
`mcp_*` si absent (§1.2). Puis `seed-demo.ts` (rôle app, `withTenantTx(elevayTenantId)`), **idempotent** :
1. **CSV de seed ≤30 lignes**, domaines réels résolvables (firmo déjà en base), passé par le pipeline
   **réel** de pack2 (`lib/ingest/sources/csv-source.ts` → résolution `upsertAccount upsert.ts:108` /
   `identity.ts:67` → précédence `precedence.ts:53` → `recordCompanySignal record-signal.ts:94` →
   score). **Pas** de `priorityScore` plaqué.
2. **`computePriorityScore`** (`lib/scoring/priority-score.ts:70`) exécuté sur tous les comptes de
   démo + poser `priorityScoreComputedAt` (sinon `find_prospects` vide — P2).
3. **Targeting :** `targeting_status='targeted'` sur tous **SAUF un compte-piège** laissé
   `unreviewed` (c'est lui qui prouve le skip `not_targeted` à l'export — le climax). + lawful-basis OK.
4. **Sujet HERO** avec : ≥1 `publicContent.type:"metric"` (sinon `citableFacts` vide → brief plat) ;
   firmo + provenance non vides (`firmographicsHaveSignal` `build-intelligence-brief.ts:199`) ;
   ≥1 signal **FRAIS** (`isSignalFresh` `freshness.ts:98` — un signal périmé est PIRE qu'aucun) ;
   **convergence 2+ sources** (anti-bruit).
5. **Brief pré-construit la veille** : `buildIntelligenceBrief` (`build-intelligence-brief.ts:26`,
   cache `intelligenceBriefs` 14 j) sur le hero → `get_outreach_brief` est **0-LLM** et instantané
   pendant la démo.
6. Pré-seeder `product`/contexte pour que `generateOpener` (`signal-opener.ts:162`, `fillTemplate:146`)
   lise ses fallbacks → **jamais de body vide** (P3/R1).
**Code clé (squelette) :**
```ts
// scripts/seed-demo.ts (exécuter via tsx, hors-bande ; rôle app pour le seed data)
await withTenantTx(elevayTenantId, async (tx) => {
  await ingestCsvThroughPipeline(tx, DEMO_CSV);          // pack2 : résolution→signal→score
  for (const c of demoCompanies)                          // P2 : insert-then-score
    await computePriorityScoreAndPersist(tx, c.id);       // priority-score.ts:70 + computedAt
  await setTargeting(tx, demoCompanies, "targeted");
  await setTargeting(tx, [trapCompany], "unreviewed");    // le compte-piège
  await buildIntelligenceBrief({ tx, companyId: hero.id });// cache 14 j → 0-LLM en démo
});
```
**VERIFY (soi-même, critères T-42 §2.2 PREREQ).**
- `get_outreach_brief(hero)` → `citableFacts` **non vide** (`verified:true`),
  `whyNow.topSignal.fresh:true`, `meta.gate.exportable:true`.
- `export_to_outbound({prospectIds:[hero], dryRun:true})` → **exporté** (pas skip).
- `export_to_outbound({prospectIds:[trap], dryRun:true})` → **skip `code:"not_targeted"`** +
  `export_items.gate_code` renseigné.
- Re-run du seed → **idempotent** (pas de doublons, mêmes ids).
Logguer chaque JSON à disque.
**TEST.** `seed-demo.test.ts` : le hero satisfait les 3 conditions (metric, provenance, signal frais) ;
le trap produit `not_targeted` ; le brief est `exportable`.

### Étape 3 — T-40 · `e2e/mvp-flow.spec.ts` (parcours MVP bout-en-bout)
**Action.** Playwright. Parcours : (1) `ingest_csv` (sync inline OU job+poll selon ce que pack2 expose)
→ comptes peuplés ; (2) `get_outreach_brief(hero)` → sortie **structurée, 0 prose** (assert : aucun
`subject`/`body` ; présence `citableFacts[]`/`doNotClaim[]`/`whyNow`) ; (3) `export_to_outbound`
Instantly **`dryRun:true`** → hero **exporté (plan)**, compte-piège **skip `not_targeted`**.
**Driver :** si pack6 (UI) mergé → piloter les écrans `(orion)/...` ; **sinon Plan B** → piloter la
**surface MCP** directement (`POST /api/mcp`, JSON-RPC `tools/call`, Bearer `mcp_*` du seed) via
`request` Playwright — le parcours reste prouvé sans dépendre de l'UI.
**ONE browser at a time** (règle dure) : ne pas lancer d'agent Playwright concurrent.
**VERIFY (soi-même).** Le spec passe ; capturer 001-ingest, 002-brief, 003-export-skip ; logguer les
réponses JSON-RPC à disque.
**TEST.** `e2e/mvp-flow.spec.ts` (c'est le test ; sous `testDir: ./e2e`, authentifié par
`e2e/global-setup.ts` de pack0 — **pas `tests/e2e/`**). `pnpm --filter @orion/web e2e` vert
(`e2e:install` au premier run).

### Étape 4 — T-39 + tripwires transverses · suite Vitest cœur
**Action.** Écrire la méta-suite + les tripwires transverses :
- `core-invariants.test.ts` : assert que dédup 3 niveaux (pack2), idempotence runner (pack0/T-13),
  précédence multi-source (pack2/REUSE), gates fail-closed (pack1/T-36), flatten Instantly (pack4/T-33),
  citableFacts/doNotClaim (pack3/T-28) ont chacun une suite verte (importer + relancer, ou assertion
  de présence + exécution). Cible **100 % des chemins de gate**.
- `gate-uncircumventable.test.ts` : (a) `export_to_outbound` appelle `evaluateSend` **par prospect**,
  AVANT tout POST ; (b) un `unreviewed` + `interactive:false` → `send:false code:"not_targeted"`
  (`sending-gate.ts:305`) ; (c) le gate vit DANS le wrapper/job, pas dans un outil JSON-RPC esquivable ;
  (d) `catch` final → `{send:false}` (`:339`, zéro fail-open).
- `no-tenant-arg.test.ts` : itère `MCP_MODULES` → **aucun** `inputSchema` ne contient `tenantId`.
**VERIFY.** `pnpm --filter @orion/web test` vert ; `pnpm eval:run` vert (si configuré côté pack0).
**TEST.** (ce sont les tests).

### Étape 5 — T-41 · `.env.example` + `env-shape.test.ts`
**Action.** `.env.example` = sous-ensemble pertinent (T-41) : **Core** (`APP_BASE_URL`, `CRON_SECRET`,
`ORION_APP_SECRET`), **DB** (`DATABASE_URL` ; `DATABASE_URL_OWNER` **commenté « opérateur-only, hors
code »**), **Auth** (`AUTH_SECRET`, `AUTH_URL`, `GOOGLE_*`, `MICROSOFT_*`, `BETA_SIGNUP_CODE`,
`SELF_SERVE_SIGNUP_ENABLED`), **LLM** (`ANTHROPIC_API_KEY`, `ANTHROPIC_API_BASE` **avec `/v1`**,
`ANTHROPIC_REGION`, `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `LLM_PROVIDER`, `AI_DISABLED`), **Inngest**
(`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`), **Sources Tier 0/1** (`APOLLO_API_KEY`, `PAPPERS_API_KEY`,
`ZEFIX_API_USER/PASSWORD`, `FIBER_API_KEY` — source d'ENTRÉE, clé en env OK pour la démo comme `APOLLO_API_KEY` ; Sirene/reste Tier 2 keyless), **GDPR** (`GDPR_REGION`, `LAWFUL_BASIS_GATE`,
`DSAR_ERASE_ENABLED`), **Flags** (`TARGETING_GATE_ENABLED=on`, `RESEARCH_AGENT_ENABLED=1`,
`ORION_INGEST_ENABLED`, `ORION_EXPORT_ENABLED`), **Observability** (`SENTRY_DSN`, `POSTHOG_*`).
**Clés sink (Instantly/Orange Slice/Lopus + secret HMAC webhook) ABSENTES** (per-tenant en DB `integration_credentials`). `FIBER_API_KEY` est une clé de **source d'entrée** (présente, OK).
DROP voice/Twilio/Stripe/Recall/BullMQ/`@neondatabase/serverless`.
**VERIFY.** Boot avec `DATABASE_URL`+`AUTH_SECRET`+`ANTHROPIC_API_KEY` seuls ; `grep -rn
DATABASE_URL_OWNER src` → **0** ; aucun `*_API_KEY` sink lu depuis `process.env` (`grep -rn
"process.env.*INSTANTLY\|process.env.*ORANGE\|process.env.*LOPUS\|WEBHOOK_SECRET" src` → 0).
**TEST.** `env-shape.test.ts` : `DATABASE_URL_OWNER` dans `src` → 0 ; pas de lecture env de clé sink.

### Étape 6 — §7 Hardening : 3 dépendances bloquantes vérifiées LIVE
**Action.** Exécuter la checklist §7 et écrire les preuves dans
`_reports/orion-demo-hardening-<date>.md` :
1. **`TARGETING_GATE_ENABLED=on` + `safeModeEnabled` actifs** → `evaluate_send(<unreviewed>)` renvoie
   bien `{send:false, code:"not_targeted"}` **en live** (pas en théorie). Sans ça le climax est muet.
2. **Transport MCP HTTPS** → `initialize` + `tools/list` round-trip via le tunnel (ngrok/Vercel
   preview) depuis un client externe (Claude Desktop si dispo) — **étape opérateur** ; pack7 fournit
   la commande `curl` et le statut attendu.
3. **`generateOpener` non-vide** → un `draft_outreach`/brief sur le hero produit un body non vide
   (`fillTemplate:146` fallback). Vérifier AVANT la démo.
**VERIFY.** Le rapport contient les 3 preuves (JSON/log/capture). C'est le « voilà la vérification ».
**TEST.** — (vérification live, pas unitaire).

### Étape 7 — Pack-level green + PR
**Action.** Suite complète verte ; registres câblés ; `git diff --stat` scopé pack7.
**VERIFY.** `pnpm --filter @orion/web tsc` + `test` + `e2e` verts sur install `--frozen-lockfile`
**propre** ; `next build` vert. PR `feat/orion-pack7`, CI pleine verte → `/evaluate` PASS → merge.

---

## 4bis. OFFLINE DISCOVERY — LE WEDGE DAY-ONE (hero FIGÉ `leadership_change.vp_eng`)

> **C'est la raison d'être du produit.** À l'upload d'un CSV closed-won/lost **qui ne donne QUE**
> identité + label won/lost + date de close **J**, Orion **découvre tout seul** quel signal sépare les
> gagnés des perdus, le **rejoue à froid**, et le **guette en prospection**. Le hero FIGÉ est
> `demo-hero-FROZEN.md` (signal `leadership_change.vp_eng`, 10 won / 7 lost). Cette section prime sur le
> hero générique de l'Étape 2 : c'est CE seed et CE parcours qu'on filme. Tout est **REUSE** des
> primitives Elevay déjà construites — on **n'invente pas** le lift ni le prior.
>
> **Primitives REUSE (réelles, vérifiées) — appelées, jamais réécrites :**
> - Point-in-time : `detectActiveSignals(props, asOf)` (**définie** `lib/scoring/signal-detectors.ts:144`
>   ; `signal-outcomes.ts:179` n'est qu'un **site d'appel**) ne compte un signal que s'il est actif **à la
>   date `asOf`** ; freshness jugée **à la création du deal** (`isFreshAt` `signal-detectors.ts:155`,
>   fonction `:144-158`) — c'est le moteur `[J−90→J]`, J matérialisé en `deals.createdAt`.
> - Lift dénom = LOST : `computeMultiplier({wonWithSignal, lostWithSignal, baselineWinRate})`
>   (`signal-outcomes.ts:217`, clamp `:228`) ; `recordDealOutcome({tenantId,dealId,outcome})` (`:151`)
>   attribue par deal ; `getSignalMultipliers(tenantId)` (`:245`) agrège won/lost par signal.
> - Prior cross-tenant : `getAnonymizedBenchmark(industry, size)` (`lib/scoring/anonymized-signals.ts:225`),
>   k-anonymité **≥10 tenants** (`:11`,`:26`) ; lift Bayes-lissé, multiplier **clampé `[0.5,2.5]`**
>   (`signal-outcomes.ts:39-40`), `MIN_SAMPLE_SIZE=10` (`:33`) → en dessous, repli sur `SIGNAL_PRIORS`
>   (`:59`) / `priorMultiplier` (`:95`), jamais 1.0 plat.
> - Taxonomie/alias : `leadership_change.vp_eng → leadership_change` via `taxonomy.ts` (pack1) +
>   `SIGNAL_CANONICAL_ALIAS` (`signal-outcomes.ts:119`) — sinon multipliers plancher (DÉP-1).
>
> **Driver :** si pack6 (UI Discovery) mergé → piloter l'écran d'upload + le panneau de restitution ;
> **sinon Plan B** → piloter la surface MCP (`POST /api/mcp`, Bearer `mcp_*` du seed) : `ingest_csv` →
> l'outil de discovery → `find_prospects`/`get_outreach_brief`. **ONE browser at a time**.

### Étape D0 — Charger le seed hero FIGÉ (`scripts/seed-hero-frozen.ts`) — insert-then-score
**Action.** Owner crée le tenant si absent (`ensure-elevay-tenant.ts`, §1.2). Puis, en rôle app
`withTenantTx(elevayTenantId)`, **idempotent** :
1. Insérer les **17 deals** du FROZEN (10 won `demo-hero-FROZEN.md:22-34`, 7 lost `:36-45`) :
   `name`/`companyId` résolus via le pipeline pack2 (résolution `upsert.ts:108`/`identity.ts:67`) ;
   `stage` = won/lost ; **J = `close_date` → `deals.createdAt`** (c'est l'as-of de l'attribution
   point-in-time `detectActiveSignals` `signal-detectors.ts:144`) ; `deal_source` → `properties.dealSource` (`intro fonds Atlas/Borealis` |
   `outbound`) — colonne réelle absente, vit dans `properties` (`core.ts:269`).
2. **Matérialiser les événements DATÉS** (pas un état permanent) en `properties.signals[]` via
   `recordCompanySignal` (`lib/signals/record-signal.ts:94`) **+** `signal_snapshots` (table datée pack1/pack5) :
   le `vp_eng_date` de chaque ligne (`:23-45`) + les autres vecteurs datés (funding, hiring,
   tech_stack_change, **investor_overlap**, GitHub-velocity) de `demo-hero-offers.md §1.2`. Chaque event
   porte sa **date** pour que `detectActiveSignals(props, J)` le compte **ssi `eventDate ∈ [J−90→J]`**.
   Un `vp_eng_date` hors fenêtre (ex. Pinnacle Yard lost `2024-10-22` vs close `2024-12-17` = 56 j → IN)
   ou absent (`—`) → **non compté**. C'est ça le point-in-time : 6 won ont un `vp_eng` IN, 1 lost en a un.
3. **`recordDealOutcome`** (`signal-outcomes.ts:151`) sur les 17 → table `signal_outcomes` peuplée ;
   puis `computePriorityScore` (`priority-score.ts:70`) + `priorityScoreComputedAt` sur les comptes (P2).
4. **Targeting :** `targeted` sur tous **sauf 1 compte-piège `unreviewed`** (climax export) ; lawful-basis OK.
5. **Flags démo :** `TARGETING_GATE_ENABLED=on` **+** `safeModeEnabled=true` (sinon climax muet, §7 #1).
6. **Brief hero pré-construit** la veille : `buildIntelligenceBrief` (`build-intelligence-brief.ts:26`,
   cache 14 j) → restitution **0-LLM** en démo.
**VERIFY (soi-même).** `getSignalMultipliers(elevayTenantId)` → `leadership_change` ≈ **4,2×** brut
(6/10 won vs 1/7 lost) ; un re-run = mêmes ids (idempotent) ; `curl initialize` Bearer → 200. Logger les JSON.
**TEST.** Couvert par `seed-demo.test.ts` (hero exportable + trap `not_targeted`) + `offline-discovery.test.ts`.

### Étape D1 — L'offline-discovery à l'upload (`scripts/offline-discovery.ts` = THIN CALLER → pack2)
**Action.** Au moment de l'upload du CSV (identité + label + J **seulement**), `scripts/offline-discovery.ts`
est un **thin caller** : il charge l'historique et **DÉLÈGUE** à `runOfflineDiscovery`
(`lib/discovery/discover.ts`) / l'outil MCP `discover_from_history` **produits par pack2** — il **ne
réimplémente PAS** le moteur. Ce sont ces primitives pack2 qui exécutent — **à froid sur l'historique
uploadé** — exactement les 6 mécanismes ci-dessous (documentés ici pour la VERIFY ; le code vit dans pack2) :
1. **Enrichir CHAQUE won ET lost** d'un vecteur de signaux candidats (waterfall REUSE
   `providers/company-enrichment/*`).
2. **POINT-IN-TIME** : `detectActiveSignals(props, J)` par deal — un signal n'est compté que si son
   **event DATE ∈ `[J−90→J]`**, reconstruit depuis les sources **horodatées** (levée, job-change,
   leadership_change, commits GitHub, Form D SEC, BODACC) — **jamais** un état permanent.
3. **DISCRIMINER** : `computeMultiplier` — lift = `P(signal|won)` vs `P(signal|lost)`, **dénominateur =
   les LOST** (`signal-outcomes.ts:217`).
4. **FILTRER** : (a) **non-évidence** — pénaliser toute reformulation firmo (« ils sont plus gros »,
   taille/CA permanent), elle n'est pas un événement ; (b) **acquérabilité-à-froid** — le signal doit
   être **re-cherchable sur un compte JAMAIS touché via le catalogue** (Fiber / Unipile / BODACC /
   Sirene…) ; **sinon JETER** (un signal non-ré-acquérable est inutilisable en prospection).
5. **PRIOR cross-tenant** pour sauver le petit N : `getAnonymizedBenchmark` (k≥10), `getSignalMultipliers`
   clamp `[0.5,2.5]` → tourné **À FROID** sur l'historique uploadé → `leadership_change` 4,2× brut →
   **≈3,5× postérieur** (k=14).
6. **RESTITUER** (sortie du moteur, consommée par D2) : preuve concrète + **confiance HONNÊTE
   (hypothèse, pas loi)** + action (« je le guette à froid via X ») + **UNE** confirmation.

**Modes d'échec CODÉS (pas seulement documentés) :**
- **Confounder de sourcing** → **stratifier sur `deal_source`/réseau** : recalculer le lift **par
  stratum**. `investor_overlap` est à 4,2× brut MAIS **s'effondre à ~0 sur `deal_source=outbound`**
  (le froid) → c'était le **canal d'intro**, pas un signal de marché → **déclassé**. Le moteur DOIT le
  détecter et le sortir comme « reveal ».
- **Survivorship / data-sale** : **0 lost** dans le CSV → **baisser la confiance affichée** (on ne peut
  pas discriminer sans dénominateur) ; ne jamais présenter un lift comme certain.
- **Signal non-ré-acquérable** : impossible à re-chercher à froid via le catalogue → **jeté** (filtre 4b).
**VERIFY (soi-même).** Sur le seed FROZEN : `leadership_change.vp_eng` survit aux 4 filtres + au prior
(≈3,5×) ; `investor_overlap` **chute sur le stratum outbound** ; un signal firmo « plus gros » est
pénalisé ; un événement hors `[J−90→J]` ne compte pas. Logger le rapport de discovery JSON à disque.
**TEST.** `offline-discovery.test.ts` (les 5 assertions ci-dessus + les 3 modes d'échec).

### Étape D2 — La restitution 90s (jouer le rapport, mot pour mot)
**Action.** Rendre le rapport de D1 sous la forme **exacte** de `demo-hero-FROZEN.md:54-59` — 5 beats,
aucun qui ment (repli honnête §7 #13 si un beat casse live) :
1. **[preuve]** « 6 de tes 10 gagnés ont changé de VP Eng dans les 90 j avant de signer. Perdus : 1/7. »
2. **[confiance honnête]** « 10 contre 7, c'est petit — **hypothèse, pas certitude**. Sur 14 boîtes
   anonymisées du même profil, le motif tient. » (≈3,5× postérieur, k=14 — pas une loi).
3. **[reveal confounder]** « Un autre signal sortait aussi fort — "même investisseur". Mais sur tes
   deals **froids** il tombe à zéro : c'était ton **canal d'intro**, pas un signal de marché. »
4. **[action]** « Je sais le guetter à froid : nouveau VP Eng dans une boîte de ton ICP → je le vois
   (**Fiber + LinkedIn ; BODACC pour les FR**) et je te le remonte dans sa fenêtre de 90 j. »
5. **[UNE confirmation]** « Ça te parle ? »
**VERIFY (soi-même).** L'e2e assert la présence des 5 beats + les chiffres (6/10, 1/7, ≈3,5×, k=14, 0
sur le froid) issus du rapport (pas codés en dur dans l'UI). Capturer `004-discovery-restitution.png`.
**TEST.** `e2e/offline-discovery-demo.spec.ts` (beats + chiffres).

### Étape D3 — Acquisition à froid via `leadership_change.vp_eng` (fermer la boucle)
**Action.** Prouver l'**action** promise au beat 4 : sur un prospect **jamais touché** de l'ICP,
ré-acquérir le signal à froid via le catalogue — **Fiber Tracker** (job-change, primaire) + **Unipile/
LinkedIn** (changed-jobs) + **BODACC** (modification dirigeant, cibles FR) — vérifier que son
`vp_eng role_start_date` tombe dans **`[aujourd'hui−90 → aujourd'hui]`** (point-in-time côté prospection),
puis `find_prospects`/`get_outreach_brief` le remonte avec `whyNow.topSignal = leadership_change`,
**frais** (`freshness.ts:98`), `citableFacts` non vide, `exportable:true`. `dryRun:true` si pas de clé
réelle (GAP-3) — la **boucle découverte→guet→brief** est prouvée sans POST tiers.
**VERIFY (soi-même).** Un compte de l'ICP avec un `vp_eng` récent (seedé en « jamais touché »,
`targeting_status` distinct du trap) est trouvé par `find_prospects`, son brief cite le VP Eng + la
fenêtre 90 j, et passe le gate `exportable`. Capturer `005-cold-acquire.png` + logger le JSON.
**TEST.** Couvert par `offline-discovery-demo.spec.ts` (dernier acte) ; le re-acquérabilité-à-froid est
aussi asserté unitairement dans `offline-discovery.test.ts` (filtre 4b).

---

## 5. CRITÈRES D'ACCEPTATION (testables)

1. **REUSE intact.** `git diff main` sur les modules REUSE (carte Étape 1) = **additif/wrapper
   uniquement** (les seuls diffs = les 2 hookpoints pack2). `reuse-untouched.test.ts` vert.
2. **Tenant `elevay` opérationnel.** Ligne `tenants` `elevay` + user + clé `mcp_*` présents ; `curl
   initialize` Bearer → 200, `tenantId` = `elevayTenantId`. (créé par `ensure-elevay-tenant.ts` si absent).
3. **Seed insert-then-score.** Tous les comptes de démo ont `priorityScore` **non-NULL** +
   `priorityScoreComputedAt` posé ; aucun score n'est plaqué à la main ; le seed est **idempotent**.
4. **Hero exportable.** `get_outreach_brief(hero)` → `citableFacts` non vide (`verified:true`),
   `whyNow.topSignal.fresh:true`, `meta.gate.exportable:true` ; `export_to_outbound(hero, dryRun)` →
   **exporté**.
5. **Climax gaté.** Le compte-piège `unreviewed` + `interactive:false` → `export_to_outbound(trap,
   dryRun)` = **skip `code:"not_targeted"`** + `export_items.gate_code` renseigné.
6. **e2e MVP vert.** `mvp-flow.spec.ts` : CSV → brief (0 prose, `citableFacts[]`/`doNotClaim[]`,
   aucun `subject`/`body`) → export dryRun (hero exporté, trap skip).
7. **Gate non-contournable.** `gate-uncircumventable.test.ts` : `evaluateSend` appelé par prospect
   AVANT tout POST, dans le wrapper, fail-closed (`catch→{send:false}`).
8. **`tenantId` jamais argument.** `no-tenant-arg.test.ts` : aucun `inputSchema` MCP Orion ne déclare
   `tenantId`.
9. **Env propre.** `env-shape.test.ts` : `DATABASE_URL_OWNER` dans `src` → 0 ; aucune clé sink en
   `process.env` ; boot minimal = 3 vars.
10. **3 dép. bloquantes vérifiées live** (rapport hardening) : `TARGETING_GATE_ENABLED=on` produit le
    refus, transport HTTPS round-trip OK, `generateOpener` non-vide.
11. **CI pleine verte** (gitleaks + tsc/vitest + Vercel `next build`) sur install propre ;
    `pnpm eval:run` vert.

**Wedge day-one (§4bis, hero FIGÉ) :**

12. **Seed hero FIGÉ chargé insert-then-score.** Les 17 deals (10 won / 7 lost) du FROZEN sont en base,
    `J=close_date→createdAt`, `deal_source` en `properties`, événements **datés** en `properties.signals[]`
    + `signal_snapshots` ; `getSignalMultipliers(elevay)` rend `leadership_change` ≈ **4,2×** brut
    (6/10 vs 1/7) ; seed idempotent ; 1 compte-piège `unreviewed`.
13. **Point-in-time correct.** `offline-discovery.test.ts` : un événement hors `[J−90→J]` n'est **pas**
    compté ; un état firmo permanent est **rejeté** ; les 6 won `vp_eng`-IN et le 1 lost `vp_eng`-IN sont
    exactement ceux du FROZEN.
14. **Lift dénom = LOST + prior.** Lift calculé via `computeMultiplier` (dénom LOST), clamp `[0.5,2.5]`,
    k≥10 → **≈3,5× postérieur** affiché ; **0 lost → confiance affichée baissée**.
15. **Filtres appliqués.** Reformulation firmo « plus gros » **pénalisée** ; signal non-ré-acquérable à
    froid **jeté** (filtre acquérabilité).
16. **Reveal confounder.** Stratifié par `deal_source` : `investor_overlap` (4,2× brut) **s'effondre à ~0
    sur `deal_source=outbound`** et est sorti comme reveal. Asserté unitaire **et** e2e.
17. **Restitution 90s.** `offline-discovery-demo.spec.ts` : les 5 beats présents avec les chiffres issus
    du rapport (6/10, 1/7, ≈3,5×, k=14, 0 sur le froid) — pas codés en dur.
18. **Boucle fermée (cold-acquire).** Un prospect ICP **jamais touché** avec un `vp_eng` dans
    `[J−90→aujourd'hui]` est ré-acquis à froid (Fiber/LinkedIn/BODACC), remonté par `find_prospects`,
    brief `whyNow.topSignal=leadership_change` frais + `exportable:true` (`dryRun`).

---

## 6. DEFINITION OF DONE

- Tous les fichiers de §3 créés ; registres câblés (lignes manquantes comblées dans les balises).
- `pnpm --filter @orion/web tsc` + `test` + `e2e` **verts** localement (install
  `--frozen-lockfile` **propre**, pas un `node_modules` junctionné) ; `next build` vert.
- Les critères §5 (1-11) chacun couvert par ≥1 test/preuve ; tripwires transverses verts.
- `scripts/seed-demo.ts` exécuté sur l'instance de démo, **idempotent**, hero exportable + trap skip
  prouvés (logs à disque).
- Rapport `_reports/orion-demo-hardening-<date>.md` écrit avec les 3 dép. bloquantes vérifiées **live**.
- Aucun module Elevay REUSE édité (additif/wrapper only ; preuve `git diff main`).
- `git diff --stat` **scopé pack7** (aucun fichier hors ownership §3, hors lignes de registre balisées).
- Commits atomiques, un changement logique chacun, trailer :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: <URL de ta propre session Claude Code>
  ```
- PR `feat/orion-pack7` ouverte ; CI pleine verte (gitleaks + tsc/vitest + Vercel) ; `/evaluate`
  PASS ; merge squash + delete-branch ; surveiller le push CI de `main`.
- **Re-vérifier branche + HEAD juste avant chaque commit/push** (tree partagé, sessions parallèles).
- **Migrations prod (`0108+`, GRANT/seed) appliquées via `db:migrate:apply` + `DATABASE_URL_OWNER`
  APRÈS merge** (one-shot, idempotent) — jamais depuis la branche.

---

## 7. PIÈGES SPÉCIFIQUES À CE LOT

1. **Le climax est muet sans le flag.** `TARGETING_GATE_ENABLED=on` **+** `safeModeEnabled=true` sur
   le tenant `elevay` est **obligatoire** : sinon la branche targeting (`sending-gate.ts:301`) est
   sautée → `{send:true}` et le compte-piège **n'est jamais refusé**. **Vérifier live AVANT de filmer**
   (P1, dép. dure #1). C'est le hardening n°1.
2. **`interactive:false` obligatoire** sur l'`evaluateSend` du chemin export — `interactive:true`
   esquive le gate 7 (targeting SAFE_MODE) et laisserait passer l'`unreviewed`. L'e2e/tripwire doit
   asserter `interactive:false`.
3. **Seed = insert-then-score, JAMAIS un `priorityScore` plaqué.** `priorityScore` est `NULL`
   (`fit-recompute-core.ts`) tant que `computePriorityScore` (`priority-score.ts:70`) n'a pas tourné →
   `find_prospects`/`get_outreach_brief` vides. Faire passer par le pipeline réel.
4. **Un signal périmé est PIRE qu'aucun.** Le hero doit avoir ≥1 signal **frais** (`freshness.ts:98`)
   ET convergence 2+ sources. Un seed avec une date périmée casse le why-now silencieusement.
5. **Body vide.** Ne JAMAIS câbler la copie sur `generate-message.ts`/`copy_asset_block` (vide
   platform-wide, `gradeEmail` 0.57 ne l'attrape pas). Le chemin est `generateOpener`
   (`signal-opener.ts:162`, `fillTemplate:146`) — déterministe, jamais vide. Pré-seeder `product`/contexte.
6. **`next build` ≠ `tsc`.** Un export nommé sur `page.tsx`/`layout.tsx` passe tsc + CI mais casse
   `next build` Vercel (piège #11). L'e2e/Étape 0 doit lancer un **vrai build** (ou `next dev`).
7. **Clés sink JAMAIS en env** (D7). `.env.example` ne contient AUCUNE clé Instantly/Orange Slice/Lopus
   (ni secret HMAC webhook) ; `env-shape.test.ts` le garde. **Fiber est une source d'entrée**, donc
   `FIBER_API_KEY` en env est OK pour la démo (comme `APOLLO_API_KEY`). Démo en `dryRun:true` si pas de
   clé réelle (GAP-3) — suffit au climax.
8. **`DATABASE_URL_OWNER` opérateur-only.** `ensure-elevay-tenant.ts` le lit mais **n'est jamais
   importé par le runtime** ; `grep DATABASE_URL_OWNER src` → 0. Le seed **data** passe par le rôle
   app (`withTenantTx`), seul le **DDL/création tenant** utilise owner, hors-bande.
9. **GRANT `elevay_app` sur les tables net-new** (G4) — sans GRANT + policy RLS, le seed (rôle app)
   échoue en 42501. Vérifier après `db:push`/migration ; compléter en migration owner si manquant.
10. **`set_config(...,true)` transaction-local** (Supavisor 6543) — tout accès DB du seed passe par
    `withTenantTx(elevayTenantId, …)`, jamais le `db` global, **jamais** `set_config(...,false)`.
11. **ONE browser at a time.** L'e2e Playwright pilote UN navigateur ; ne JAMAIS lancer d'agent
    background touchant Playwright pendant. Screenshots séquentiels (`001-…png`), preuve avant/après.
12. **Deux `DATABASE_URL`** (G8) : build sur `leadsens-localdev`, démo sur l'instance qui porte le
    tenant `elevay`. Confirmer **quelle** instance porte `elevay` avant de seeder ; ne pas migrer prod
    depuis une branche non mergée.
13. **Repli démo honnête** (PRD §5) : si le beat ingestion casse live, présenter le tenant comme
    « déjà ingéré » (le seed EST le résultat) et démarrer à `find_prospects` — **aucun beat ne ment**.
    Vidéo de secours 1080p prête (règle dure).
14. **pack5/pack6 sont `[P1]`** — ne PAS bloquer pack7 dessus. Si pack6 (UI) absent, l'e2e pilote la
    surface MCP. Si pack5 absent, pas de vélocité (hors slice MVP).
15. **Tripwire REUSE = baseline, pas checksum naïf.** Les hookpoints pack2 (`functions.ts:~220`,
    `agentic-executor.ts:~240`) SONT des diffs **additifs** légitimes — le test doit les autoriser
    (additif) tout en interdisant la réécriture de la logique de gate/identité/brief/scoring.
16. **Point-in-time ≠ état permanent (§4bis #2).** Le piège central du wedge : compter un signal sur
    l'**état actuel** de la boîte (elle a un VP Eng) au lieu de l'**événement daté dans `[J−90→J]`**
    invente du lift et ment. `J` DOIT être matérialisé en `deals.createdAt` (as-of de `detectActiveSignals`
    `signal-detectors.ts:144`) et chaque event DOIT porter sa date (`vp_eng_date`, funding date, …) en `properties.signals[]`
    / `signal_snapshots`. Un event sans date = inexploitable → ne pas le compter.
17. **Ne JAMAIS plaquer le lift (REUSE le moteur).** Le lift/prior se calcule via `recordDealOutcome` +
    `getSignalMultipliers` + `getAnonymizedBenchmark` (clamp `[0.5,2.5]`, k≥10) — **pas** une formule
    réécrite dans `offline-discovery.ts`. Écrire un `4.2`/`3.5` en dur casserait la preuve « tourné à
    froid sur l'historique ». La restitution lit le **rapport**, pas des constantes UI.
18. **Le reveal confounder est le cœur de la démo — il doit ÉMERGER du calcul.** `investor_overlap` ne
    doit pas être « scripté » : le moteur stratifie par `deal_source` et **constate** sa chute sur le
    stratum `outbound`. Sans stratification, on vendrait au founder son propre canal d'intro comme signal
    de marché — exactement l'erreur que le wedge corrige. Tester les deux strates séparément.
19. **Survivorship / pas-de-lost.** Si un CSV client n'a **aucun lost**, le dénominateur manque → la
    confiance affichée DOIT chuter (pas de « 4,2× » triomphant). Le moteur ne fabrique pas de certitude
    sur de la survivorship ; il le dit. (Mode d'échec codé, pas seulement documenté.)
