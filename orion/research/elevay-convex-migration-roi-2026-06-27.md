# Elevay -> Convex : le ROI d'une re-plateformation (chiffre)

## 0. Verdict en 5 lignes

Migrer tout le backend Elevay vers Convex coute **~200 a 410 dev-jours (10-20 dev-mois, 6-9 mois calendaires), soit ~80 k a 300 k EUR**, pour un benefice annuel recurrent de **~55 a 135 k EUR/an**. Break-even median **~20 mois**, pessimiste **>5 ans**. Le cout ne vient pas des 135 tables (portage trivial) mais de 6 briques Postgres sans equivalent Convex : RLS multi-tenant (261 sites), RRF hybride BM25+vecteur, WITH RECURSIVE du graphe, couche canonical, analytique multi-table, et la contrainte mono-region US (bloquante pour Pilae/RGPD). **Recommandation : NE PAS re-plateformer.** Tester d'abord la reactivite via SSE/LISTEN-NOTIFY sur Postgres (~12-30 j-h) ; si ca suffit, le ROI de Convex s'effondre. Detail backend dans `_reports/orion-backend-verification-2026-06-27.md`.

## 1. La surface a migrer (mesuree)

Chiffres issus de `grep`/`find`/`wc` sur `app/apps/web/src` (hors `node_modules`, hors tests sauf mention). FAIT-VERIFIE sauf marquage.

| Mesure | Chiffre | Note |
|---|---|---|
| Tables Drizzle (`pgTable`) | **135** | exact, 24 fichiers `src/db/schema/*` |
| Fonctions Inngest (`createFunction`) | **133** (~130 net) | exact ; ~119-212 enregistrees dans `serve()` (mix unitaires + spreads) |
| Migrations SQL | **32 actives** | + 81 archivees + 1 manual = 114 total |
| LOC backend (code, hors tests) | **~42 800** | `lib/` 17 357 · `db/` 6 611 · `inngest/`+route 18 881 |
| LOC backend avec tests | **~49 485** (lib seul) | ~65 % testee -> double la surface si les tests suivent |

Concentration tables : `intelligence.ts` 27, `outbound.ts` 20, `core.ts` 14, `agent.ts` 13, `auth.ts` 10, `voice.ts` 9.

Features Postgres-specifiques (volume + portabilite) :

| Feature PG | Volume | file:line cle | Portage |
|---|---|---|---|
| WITH RECURSIVE (CTE) | 2 requetes (7 mentions) | `lib/ai/graph-reasoning.ts:86` et `:317` | aucun equivalent |
| pgvector `vector(1536)` / HNSW | 179 refs code, 16 index HNSW | `lib/ai/embeddings.ts` | degrade (256 res. max) |
| FTS to_tsvector/tsquery/ts_rank | 14, 6 index GIN | `lib/ai/embeddings.ts` (BM25) | partiel, pas de BM25 |
| RLS / withTenantTx / set_config | **261 mentions** | `db/rls.ts:50`, `lib/auth/auth-utils.ts:82` | aucun equivalent DB |
| Raw `` sql`...` `` | **222** | `lib/` + `db/` | a reecrire un par un |
| jsonb / `->>` / `@>` | 307 | `lib/` + `db/` | a repenser (index) |
| Triggers / plpgsql | 4 | `drizzle/*.sql` | aucun trigger DB |
| Transactions multi-statements | 14 | `db/rls.ts`, `db/canonical/*` | porte (mutations ACID) |

Joyaux durs (par difficulte) : 1) graph recursif `graph-reasoning.ts:86,317` ; 2) RLS `db/rls.ts:50` + 261 sites ; 3) RRF hybride `embeddings.ts:110-234` ; 4) canonical identity `db/canonical/*` (7 modules) ; 5) precedence/waterfall `db/canonical/precedence.ts` ; 6) longue traine des 222 raw SQL.

## 2. Matrice de portage Postgres -> Convex

| Capacite Elevay | Equivalent Convex | Dispo | Maturite | Effort reecriture |
|---|---|---|---|---|
| Schema 135 tables, CRUD | `defineSchema` | OUI | mure | ~12-25 j |
| Transactions multi-statement | mutations ACID (OCC) | OUI | mure | inclus fonctions |
| ~133 fns Inngest event-driven | crons + Workflow component | PARTIEL | correcte, pas 1:1 | ~0,5-2 j/fn -> 40-80 j |
| jsonb (307) | objets JS natifs | OUI | mure | inclus, mais index a repenser |
| Vecteur HNSW tunable (1536) | vector search (256 res. max, 4 idx/table, action-only) | PARTIEL | limitee | degradation, ~5-10 j |
| FTS to_tsvector/GIN | search index (pas de BM25, 1024 res.) | PARTIEL | basique | ~5-10 j |
| **RRF hybride BM25+vecteur** | **aucun** (2 moteurs asymetriques 256 vs 1024) | **NON** | absente | **reecriture moteur, 10-20 j** |
| **WITH RECURSIVE / graphe** | **aucun** (boucle app, plafond 32k docs/1 s) | **NON** | absente | **reecriture + risque plafond, 10-20 j** |
| **RLS owner/restricted + withTenantTx** | **aucun** (autorisation code-side) | **NON** | absente | **261 sites + audit secu, 20-40 j** |
| Canonical precedence/waterfall (SQL) | pas de JOIN, agregats = component | NON | absente | reecriture app, 10-20 j |
| Analytique multi-table / dashboards | budget 32k docs / 1 s par query | NON a l'echelle | inadaptee | reecriture + @convex-dev/aggregate |
| COUNT/SUM/GROUP BY | component aggregate (O(log n)) | PARTIEL | tierce | inclus analytique |
| next-auth v5 + DrizzleAdapter | Convex Auth ou IdP externe | NON (adaptateur) | correcte | reecriture auth, 10-20 j |
| Triggers plpgsql (4) | mutations/scheduled | NON | n/a | logique deplacee |
| Residence donnees EU (Pilae/RGPD) | US-only, mono-region | **NON** | **bloquant** | **non resoluble par dev** |
| Reactivite UI temps-reel | natif (push) | OUI | mure | gain net |

Sans equivalent (le plus cher) : RLS, RRF hybride, recursif/graphe, canonical, analytique, residence EU.

## 3. Cout de migration (chiffre)

Decomposition en dev-jours (j-h), calibrage du cadre economique applique a la surface mesuree :

| Lot | Effort j-h | Base |
|---|---|---|
| C_schema (135 tables, mais majorite triviale) | 12-25 | defineSchema + index tenant-first |
| C_fonctions (133 Inngest + queries/mutations) | 40-90 | 0,25-1,5 j/fn ; crons en haut de fourchette |
| **C_nonportable (6 joyaux)** | **40-80** | RLS 20-40 + RRF + graphe + canonical + analytique |
| C_auth (next-auth -> Convex Auth/IdP) | 10-20 | flows + schema users/sessions + callbacks JWT |
| C_donnees (dump/import, <quelques Go) | 5-10 | transfert trivial, remappage types |
| C_tests (30-50 % de schema+fonctions ; cible 100 %) | 30-60 | suite a reecrire en parallele |
| C_doublerun (strangler, infra x2, reconciliation) | 15-30 | jobs de reconciliation = source de bugs |
| **Sous-total** | **140-295** | |
| **x R_risque 1,4** (produit live a revenu) | **~200-410 j-h** | Gartner : 83 % des migrations depassent (+30 % cout, +41 % delai) |

Calendrier : **6-9 mois** a 2-3 devs. Cout EUR : **~80 k (optimiste, interne) a ~300 k (pessimiste, presta)**.

Risque sur produit live : le RLS code-side fait perdre la garantie DB "refus cross-tenant meme si le code a un bug" -> chaque fonction devient un point de fuite tenant potentiel ; le dual-run/dual-write menace l'integrite ; le mono-region US est un risque RGPD non couvrable par du code.

## 4. Benefice annuel (chiffre)

| Levier | Fourchette/an | FAIT vs SUPPOSE |
|---|---|---|
| B_velocite (boilerplate data-layer reduit, types end-to-end) | 45-90 k EUR | SUPPOSE : gain 15-30 % sur le temps backend (2 devs x 150 k charg, 50 % backend) |
| B_bugs sync/stale supprimes | 10-40 k EUR | SUPPOSE : classe de bugs (freshness inbox, re-trigger signal, dual-taxonomie) x ~1-5 k/incident PME |
| B_infra (Postgres+realtime -> Convex Pro 25 $/dev/mois) | ~0 a 5 k EUR, parfois **negatif** | FAIT (pricing) : overage 0,20 $/Go I/O, 0,12 $/Go egress ; modele push -> N re-executions facturees a fort trafic |
| B_reactivite_business (time-to-market) | non chiffre | SUPPOSE, le plus mou et potentiellement le plus gros si le temps-reel est un besoin structurel |

Total recurrent realiste : **~55-135 k EUR/an** hors valeur business du time-to-market. Le poste infra peut etre negatif a l'echelle (function calls + DB I/O, pas le stockage, sont les drivers de cout).

## 5. ROI & break-even

`Break-even (mois) = COUT / (BENEFICE_an / 12)`

| Scenario | Cout | Benefice/an | Break-even | ROI 3 ans |
|---|---|---|---|---|
| Optimiste | 80 k | 135 k | ~7 mois | +406 % |
| Median | 150 k | 90 k | **~20 mois** | +80 % |
| Pessimiste | 300 k | 55 k | ~65 mois | -45 % |

Conditions de rentabilite : le median (~20 mois) ne tient que si (a) C_nonportable reste contenu (or les 6 joyaux + 261 sites RLS le poussent vers le haut), et (b) B_velocite/B_bugs sont reellement captes. Pour un produit live a revenu, le facteur risque 1,4x et C_nonportable dominent -> scenario median-pessimiste le plus probable, **break-even >18 mois**, souvent au-dela de l'horizon de decision d'une startup. Ca ne se justifie que si le temps-reel est un besoin produit central non satisfait, pas un confort.

## 6. L'alternative incrementale

Capter ~80 % du benefice (reactivite percue, moins de bugs de sync) en gardant Postgres/Drizzle/next-auth/Inngest intacts.

Pattern : **Postgres `LISTEN/NOTIFY` -> backend -> SSE** (`EventSource` natif). SSE suffit (serveur->client unidirectionnel) ; payload NOTIFY limite a 8 Ko -> ne diffuser que l'ID, le client re-fetch. Supabase Realtime est deja dans la stack et offre la meme chose sans trigger custom pour les tables couvertes.

| Poste | Effort |
|---|---|
| Socle SSE (endpoint + connexions/heartbeat + hook front) | 3-8 j |
| Par table temps-reel (trigger NOTIFY + handler) x 3-6 tables | 0,5-1 j chacune |
| Adaptation front (remplacer le polling, ex. inbox sync-on-open 30 s) | 3-6 j |
| (Optionnel) Redis pub/sub si >quelques milliers d'auditeurs | +3-5 j |
| **Total** | **~12-30 j-h (~0,5-1,5 mois)** |

**5 a 15x moins cher** que la re-plateformation, additif, reversible, risque quasi nul sur le produit live. On ne capte pas B_velocite/B_bugs au meme degre (le boilerplate Postgres et les bugs de sync applicatifs restent) mais on obtient la reactivite percue, qui est le benefice n°1 invoque pour Convex.

## 7. Verdict & recommandation

**Pour Elevay (prod, revenu, Postgres-lourd, multi-tenant EU) : ne pas re-plateformer.** Convex n'est pas un drop-in de Postgres ici. Son plafond reel n'est pas le stockage mais (a) les budgets durs par transaction (32k docs / 1 s) qui cassent l'analytique et le graphe, (b) l'absence native de RLS, JOIN, hybride BM25+vecteur et recursif, (c) le mono-region US incompatible avec la residence EU de Pilae. Le cout (80-300 k, 6-9 mois) et le risque (RLS code-side = surface de fuite tenant, Gartner 83 % d'echec/depassement) ne sont pas couverts par un break-even median de 20 mois sur un produit a revenu.

**Trade-off nomme :** on echange une reactivite native + moins de glue (gain reel mais captable autrement) contre la perte de capacites dures (RLS DB, RRF, graphe SQL, analytique) et un lock-in proprietaire mono-region. Le seul cas ou Convex gagne est un produit reactif plus simple, multi-collaboratif, sans le coeur SQL-lourd d'Elevay : ce n'est pas Elevay aujourd'hui.

**Pour Orion (green-field / nouveau perimetre) :** la le calcul change. Sans 261 sites RLS ni 222 raw SQL ni canonical a porter, C_nonportable s'effondre et Convex peut etre le bon choix de depart si le besoin est reactif et que l'analytique lourde et la residence EU ne sont pas centrales. A instruire separement avec les formules du §3, pas par extrapolation depuis Elevay.

**Sequencement recommande :** 1) livrer l'alternative SSE/LISTEN-NOTIFY (12-30 j-h) et mesurer si elle resout le besoin reactivite ; si oui, dossier Convex clos pour Elevay. 2) Si insuffisant ET temps-reel structurel avere, n'envisager que le strangler fig (jamais big-bang ni dual-write), module par module, en commencant par une zone sans RLS/graphe/analytique. 3) Reserver Convex aux nouveaux services Orion green-field.