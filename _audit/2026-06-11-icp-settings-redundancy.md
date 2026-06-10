# Audit — Settings « ICP & Product » vs « ICP Profiles » : utilité, redite, et plan de fusion

Date : 2026-06-11 · Auteur : Claude (session audit) · Méthode : lecture exhaustive du code (2 pages, 2 API, lib/icp/*, moteur de scoring, 25+ consommateurs tracés) + requêtes SQL lecture seule sur la base prod.

---

## 1. Ce que chaque page est réellement

### 1.1 `/settings/icp` — « ICP & Product » (legacy, mono-ICP)

- **UI** : `app/(dashboard)/settings/icp/page.tsx` — formulaire plat unique, 18 champs.
- **Stockage** : clés plates dans `tenants.settings` (jsonb), via GET/PUT `/api/settings/icp`.
- **Permissions** : tout membre peut sauvegarder (le `requireAdmin` a été retiré exprès, cf. commentaire route.ts:51-54).
- **Deux familles de champs qui n'ont rien à voir entre elles** :

| Famille | Champs | Nature |
|---|---|---|
| Contexte produit / voix | `productDescription`, `salesMotion`, `primaryChallenge`, `aiTone` | Ce qu'ON vend et comment on parle. **Ce n'est pas de l'ICP.** |
| Ciblage (surface Apollo) | `targetIndustries`, `targetCompanySizes`, `targetRoles` (+`targetSeniorities`/`targetDepartments` posés par l'onboarding), `targetGeographies`, `targetKeywords`, `targetRevenueMin/Max`, `targetTechnologies`, `excludeGeographies`, `fundingRecencyDays`, `totalFundingMin/Max`, `minJobOpenings`, `hiringTitles` | Qui on cible. Doublonne conceptuellement les criteria des ICP Profiles. |

### 1.2 `/settings/icp-profiles` — « ICP Profiles » (multi-ICP, spec `_specs/multi-icp`)

- **UI** : liste d'ICPs + rule-builder (champ → opérateur → valeur, weight, required), statut draft/active/archived, priorité, archive/restore, bouton « Build TAM » par ICP (stream NDJSON, 200 sociétés).
- **Stockage** : tables `icps`, `icp_criteria`, `company_icp_fit` (matrice), `icp_field_catalog` (vocabulaire Apollo-mirroré + champs custom).
- **Permissions** : création/édition **admin only** (`requireAdmin` sur POST/PATCH `/api/icps`). Incohérent avec la page legacy.
- **Effets** : save → event Inngest `icp/recompute-tenant` (matrice + miroir `companies.score`) ; ICP actif → `icp/source-tenant` (propositions de comptes en approval queue).

### 1.3 Constat de spec drift

La spec `_specs/multi-icp` R7.5 disait : « render the ICP management UI under settings, **replacing** the single-form page […] the route stays `/settings/icp` ». En réalité la nouvelle page a été ajoutée À CÔTÉ (`/settings/icp-profiles`), la legacy conservée. R7.4 (bouton d'inférence IA dans le builder) n'a jamais été branché : **`POST /api/icps/infer` existe et n'a zéro consommateur UI**. R5.4 (recompute incrémental) est resté un full-pass batché.

---

## 2. Utilité réelle, niveau par niveau (trace exhaustive des consommateurs)

### 2.1 Famille « contexte produit » (page legacy) — massivement utile, et indépendante de l'ICP

`productDescription` (~21 fichiers), `salesMotion` (~13), `primaryChallenge` (~8), `aiTone` (~17) alimentent : prompt système du chat (`api/chat/route.ts:232-236`), scripts cold-call (`lib/call-mode/tenant-script.ts:150-159`), génération de séquences (`lib/agents/sequence-generator.ts`), reply agent/handler, warm-leads drafts, email-intelligence, proposals fill (`lib/proposals/fill.ts:114`), knowledge seed, agent memory, voice playbook (banc d'objections), TAM strategy planning, dossier de recherche. **Aucun de ces lecteurs ne lit les ICP profiles.**

### 2.2 Famille « ciblage plat » (page legacy) — encore le moteur réel de presque tout

| Consommateur | Champs lus | Fichier |
|---|---|---|
| Build TAM du bouton **Accounts** + onboarding wizard | tous (planner LLM + hard filters) | `api/tam/build` legacy mode — `accounts/page.tsx:387` n'envoie **pas** d'`icpId` |
| Scoring contacts (+5 industrie, +5 rôle) | `targetIndustries`, rôles dérivés | `lib/scoring/contact-scoring.ts:170-189` |
| Warm leads | industries, seniorities | `lib/deals/warm-leads.ts:68-71` |
| Scripts d'appel (secteur, géo, rôles, persona, tech remplacée) | industries, sizes, geos, roles, technologies | `lib/call-mode/tenant-script.ts:146-159` |
| Contexte chat + outils skills | industries, sizes, roles, geos | `api/chat/route.ts:237-244`, `lib/chat/tools/schema.ts:125-131` |
| Agent reactor / daily sweep | industries, sizes, roles, geos | `lib/agent-reactor/context-loader.ts:44-47` |
| Suggested contacts / extract-contacts / find-contacts | `deriveTargetRoles()` | `api/accounts/[id]/suggested-contacts`, etc. |
| Persona search, parse-NL, benchmarks, job-posting-intent, knowledge seed, dossier builder | divers | — |

**Aucun champ plat n'est mort** (seul `targetDepartments` est quasi inerte : il ne sert qu'à `deriveTargetRoles`).

### 2.3 ICP Profiles — utile sur 3 chemins seulement, dont 1 cassé

1. **Matrice → miroir `companies.score` + `properties.primaryIcpId`** (`inngest/icp-fit-recompute.ts`) — cassé en prod, voir §4.
2. **Enrollment routing** : une séquence liée à un ICP n'enrôle que les sociétés dont c'est le primary ICP (`lib/icp/enrollment-routing.ts`, appelé par `signal-to-sequence.ts:161`).
3. **Sourcing** : « Build TAM » par ICP (page settings uniquement) + `icp/source-tenant` → approval queue (SIRENE/Pappers/Zefix via `to-*-params.ts`).

**Personne d'autre ne lit la matrice** : ni la liste Accounts (pas de colonne par-ICP), ni Call Mode, ni Home/Up-Next, ni le chat, ni le scoring contacts. La promesse R5.7 (« expose the full vector so the UI can show which ICPs a company matches ») n'a pas de surface UI.

---

## 3. La redite vue par l'utilisateur (le problème que Martin sent)

- Sidebar Workspace : **deux entrées adjacentes, même icône `Target`** — « ICP & Product » puis « ICP Profiles » (`settings-sidebar.tsx:65-66`). Aucun des deux libellés ne dit lequel fait foi.
- Les deux pages permettent de définir industries / tailles / géos / technologies / keywords / funding / hiring / seniorities. L'une en formulaire guidé (taxonomies Apollo, multi-selects, chips), l'autre en rule-builder générique (selects bruts, valeurs « comma, separated », poids `w`, case `required`) — plus puissant mais beaucoup plus aride.
- **Les CTAs du produit pointent tous vers la legacy** : l'empty-state d'Accounts (`accounts/page.tsx:824`) et la notification TAM (`TAMRevealNotification.tsx:121`) envoient vers `/settings/icp`. `/settings/icp-profiles` n'est référencé nulle part sauf la sidebar. L'onboarding écrit les champs plats (`api/onboarding/save`).
- Et surtout : **les deux pages ne pilotent pas les mêmes features, sans aucune synchronisation** (§4). La redite n'est pas cosmétique, c'est un split-brain.

## 4. Split-brain : qui lit quoi (et les bugs grounded en prod)

### 4.1 Carte des sources de vérité par feature

| Feature | Source réelle aujourd'hui |
|---|---|
| Build TAM (bouton Accounts, onboarding) | **Flats** (planner LLM + `flatFiltersToHardApollo`) |
| Build TAM (page ICP Profiles) | **Criteria** (`icpToStrategy`) |
| Sourcing approval queue (`icp/source-tenant`) | **Criteria** |
| `companies.score` (grades, tri, filtres, call campaign) | **Criteria** via recompute… en compétition avec 2 autres writers (§4.2) |
| Enrollment séquences ICP-scopées | **Criteria** (primaryIcpId) |
| Scripts d'appel, chat, coaching, séquences, warm leads, scoring contacts, agent | **Flats** uniquement |

Conséquence : éditer ICP Profiles ne change **ni** les scripts, **ni** le chat, **ni** le sourcing du bouton principal. Éditer ICP & Product ne change **ni** le score, **ni** l'enrollment. La migration one-shot du 2026-06-01 (`scripts/seed-icp-catalog-and-defaults.ts`) devait créer un pont « Default ICP » ; en prod elle a produit **96 Default ICPs actifs à 0 critère** (coquilles vides, neutralisées par le guard `hasAnyCriteria` du recompute), le tenant 47dca783 n'a pas de Default du tout, et c52732be a 37 industries en flats + un Default vide. **Le pont rétro-compat n'a jamais réellement porté de critères.**

### 4.2 P0 — `companies.score` : deux échelles, quatre writers (vérifié en prod)

Contrat des lecteurs : **0-100** (`GRADE_RANGES` A+=90+ / F=[0,20) `lib/accounts/list-filters.ts:47-54`, `displayScore`/`formatScore`, smart-filter « high fit → 70 », `api/calls/campaign` fait `score/100`). Sauf `priority_score` (`signal-score-daily`) qui suppose fit ∈ [0,1] — le code lui-même est partagé sur l'échelle.

Writers en compétition :
1. `lib/tam-stream/per-company.ts:163-198` (insert Apollo) → **0-100** + `properties.score_grade`.
2. `inngest/icp-fit-recompute.ts:152` (event + cron 05:00) → **0-1** (`primary.fitScore`, 0 si « unowned »).
3. Heuristique « pilae-sic-heuristic » (batch cleanup du 5 juin) → **0-1** dans la colonne, mais `properties.score_fit = "85"` (0-100) sur les mêmes lignes.
4. `/api/score` (re-score manuel) → 0-100.

État live du tenant 47dca783 (990 sociétés actives, requêtes du 2026-06-10) :
- min 0.00 / max **0.85** / avg 0.32 ; 489 sociétés à score **0** ; plus aucune > 1.
- Apollo-sourcées : **236/237 à zéro** (elles ne fittent pas ≥0.5 les 2 ICPs actifs « Scale-up Tech / SaaS B2B » et « Finance suisse tech-native »). Leurs `score_grade` d'origine (A, B…) sont contredits par la colonne.
- **Toute ligne enrichie s'affiche grade F** (`round(0.85)=1` → bande [0,20)) ; les 751 non enrichies affichent « Not scored ». Le filtre « high fit » est vide. `intentScore` de la call campaign ≈ 0.0085 max → priorisation aplatie.
- CLINIQUE LA PRAIRIE : score 0.85, `score_source: pilae-sic-heuristic`, **0 cellule dans la matrice**, pas de clé `primaryIcpId` → jamais vue par le recompute.

### 4.3 P1 — recompute partiel et non scalable

`recomputeTenant` = un seul `step.run` Inngest pour ~990 sociétés × 2 ICPs, écritures séquentielles await-par-await (~3 000 requêtes). En prod : `primaryIcpId` présent sur **637/990** lignes seulement ; le batch 0.85/0.80 du 5 juin (66 lignes, `updated_at` 17:53) n'a pas été retouché par le run du 10 juin 05:07 → la passe s'interrompt en route (timeout). 393 lignes ont score > 0.5 mais seulement 148 ont un `primaryIcpId` non nul.

### 4.4 P1 — critères structurellement inertes dans le scoring

`buildCompanyContext` (`lib/icp/company-context.ts`) n'expose jamais `person_seniorities`, `person_titles`, `hiring_job_titles` (une société n'a pas ces attributs). Or les 2 ICPs actifs portent `person_seniorities` + `person_titles` (poids 1+1 sur 12) → **fit maximum atteignable ≈ 0.83**, et une société non enrichie (registre SIRENE/Zefix : secteur+géo+taille seulement) plafonne à ~5/12 = 0.42 < seuil 0.5 → « unowned » → score 0. C'est la mécanique exacte des 489 zéros. Le correctif existe déjà dans le code : `computeIcpFitLevels` (identity/signal + coverage, « not enriched → don't penalise », `criteria-engine.ts:281-316`) — **écrit mais jamais branché sur le recompute**.

### 4.5 P2 — divers

- **`targetRoles` avalé** : la page legacy PUT `targetRoles`, mais `deriveTargetRoles` (`tenant-settings.ts:562-570`) ignore la valeur dès que `targetSeniorities`/`targetDepartments` existent (posés par l'onboarding — c'est le cas du tenant prod, sen=6). L'édition du champ « Decision-maker roles » est silencieusement sans effet.
- **Permissions incohérentes** : legacy ouverte à tous, profiles admin-only.
- **`/api/icps/infer` orphelin** (inférence IA spec'ée v1, jamais câblée dans l'UI).
- **`lib/icp/naics-to-apollo-industry.ts`** : zéro consommateur.
- 3 champs plats **inexprimables** en criteria aujourd'hui : `excludeGeographies` (pas d'opérateur de négation dans le moteur), `fundingRecencyDays` (relatif, gèlerait), `targetDepartments` (pas de champ Apollo org-search) — raison structurelle pour laquelle la page legacy ne peut pas mourir « telle quelle » côté sourcing.

---

## 5. Recommandation — fusion sans perte de qualité

Principe directeur : **une seule notion d'ICP (les profils), et le « produit » n'est pas de l'ICP**. La complexité perçue vient de deux pages qui prétendent couvrir le même concept ; la qualité chirurgicale vient de la matrice — à condition de la réparer.

### Options évaluées (completeness scoring)

- **A. Cacher « ICP Profiles » (beta) et garder la legacy** — 3/10. Perpétue le split, abandonne la matrice, le score reste cassé.
- **B. Fusion avec write-through + split « Product & Voice » + hotfix scoring** — **9/10, recommandée.** Une page ICP unique (les profils), compat lecture garantie pour les 25+ consommateurs des flats, scoring réparé. Manque résiduel : la négation (exclude) reste sourcing-only.
- **C. Migrer les 25+ consommateurs vers les criteria et supprimer les flats** — océan (réécrit prompts, scoring contacts, warm leads, agent…). À flagger, pas à entreprendre d'un bloc.

### Phase 0 — réparer le score (P0, indépendant de la fusion, à faire d'abord)

1. **Une échelle : 0-100.** ~20 lecteurs l'attendent contre 1 (priority-score) pour 0-1 → le recompute écrit `round(primary.fitScore*100)` ; `priority-score` divise par 100 à la lecture ; backfill des 990 lignes (×100 quand score ≤ 1).
2. **Brancher `computeIcpFitLevels`** dans le recompute (coverage-aware) : un champ sans donnée sort du dénominateur ; persister `identityFit`/`signalFit`/`coverage` dans `matched_criteria` pour l'explicabilité.
3. **Sortir `person_titles`/`person_seniorities`/`hiring_job_titles` du fit company** (flag catalogue `scoring: false`, ils restent des filtres de sourcing/people-search).
4. **Chunker le recompute** (un `step.run` par batch de ~100 sociétés) pour qu'il termine ; réconcilier les writers : l'insert Apollo garde son score 0-100 initial, le recompute reste l'autorité ensuite ; l'heuristique pilae ne doit plus écrire la colonne.

### Phase 1 — fusion UX

1. **« Product & Voice »** : nouvelle page settings avec les 4 champs produit (`productDescription`, `salesMotion`, `primaryChallenge`, `aiTone`). Rien d'autre. (Consommateurs inchangés — ce sont des clés `tenants.settings`.)
2. **« ICP » unique** (route `/settings/icp`, l'URL `-profiles` redirige — l'inverse du statu quo, conforme à R7.5) : liste des profils + éditeur où le rule-builder est **habillé avec les widgets de la page legacy** (multi-select industries Apollo, chips tailles, recherche géos, ranges revenue/funding) au lieu des selects bruts ; champs avancés (weight/required/opérateur) repliés derrière « Advanced » — conforme à « customizable but very simple ».
3. **Champs sourcing-only sur le profil** : `excludeGeographies` + `fundingRecencyDays` déménagent dans un bloc « Sourcing filters » stocké sur la ligne `icps` (jsonb dédié), appliqué par `to-apollo-params`/`icp-to-tam` — résout proprement leur inexprimabilité en criteria.
4. **Compat lecture (le cœur du non-régression)** : au save d'un profil **priority 0**, write-through vers les flats (`targetIndustries`, sizes, geos, seniorities, technologies, keywords, revenue, funding, hiring) — 1 writer ajouté, **0 lecteur à modifier** ; scripts d'appel, chat, scoring contacts, warm leads, agent continuent de fonctionner à l'identique, désormais alimentés par le profil n°1. Migration des lecteurs vers le primary ICP ensuite, un par un.
5. **Onboarding** : `api/onboarding/save` crée aussi le profil « Default » via `legacySettingsToCriteria` (le chaînon manquant — aujourd'hui un nouveau tenant n'a aucun ICP row) → modèle mental unique dès le jour 1.
6. **Build TAM d'Accounts** : picker d'ICP (défaut = priority 0) au lieu du planner legacy sans `icpId`.
7. **Brancher « Infer with AI »** sur `/api/icps/infer` dans l'éditeur (l'endpoint est prêt, candidats en draft → revue humaine, conforme R6.4).
8. **Permissions** : aligner (ICP = admin ou tout membre, mais pareil partout ; le retrait du gate sur la legacy avait une bonne raison UX — au minimum, désactiver les contrôles avec un message clair plutôt qu'un 403 silencieux).

### Phase 2 — dette

- Purger les 96 « Default » vides actifs (ou les remplir réellement depuis les flats des tenants concernés).
- Supprimer `naics-to-apollo-industry.ts` ou le brancher sur la voie registre.
- Corriger `deriveTargetRoles` (disparaît de fait : les rôles viendront du profil).
- Surfacer la matrice là où elle crée de la valeur (badge « fits: Scale-up 78% » sur la fiche compte / Call Mode) — c'est ce qui rend le multi-ICP *visible* et justifie son existence aux yeux de l'utilisateur.

---

## 6. Annexe — état prod constaté (2026-06-10, lecture seule)

- `icps` : 100 rows, dont 96 « Default » actifs à 0 critère ; 47dca783 = 2 actifs (8 criteria chacun, dont person_* inertes) ; tenant dev `pilae` = mêmes 2 actifs + 4 verticales archivées + Default archivé.
- `company_icp_fit` : 4 310 cellules (47dca783 uniquement), 473 ≥ 0.5, avg 0.133, dernier run 2026-06-10 05:07 (cron).
- `companies` (47dca783, 990 actives) : 489 à score 0 ; 0 au-dessus de 1 ; max 0.85 (`pilae-sic-heuristic`, sans cellule matrice) ; `primaryIcpId` présent sur 637, non nul sur 148 ; 239 enrichies (= affichées grade F), 751 « Not scored ».
- `tenants.settings` 47dca783 : 37 industries, 3 tailles, 12 géos, 6 seniorities, `targetRoles` 48 chars (avalé), produit/motion/tone remplis.
