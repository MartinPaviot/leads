# Mapping d'unification ICP — UI → stockage → consommateurs → scoring, avec verdicts de viabilité backend

Date : 2026-06-11 · Suite de `_audit/2026-06-11-icp-settings-redundancy.md` · Chaque verdict est appuyé sur une lecture du code réel (file:line).

---

## A. Architecture cible en une image

```
ÉDITEUR (uiState = source de vérité des widgets)
   │  save (une transaction, PATCH /api/icps/[id])
   ├─→ icps.metadata.uiState          ← ce que l'utilisateur a saisi, sans perte
   ├─→ icp_criteria                   ← dérivés déterministes de uiState (scoring + sourcing)
   ├─→ icps.metadata.sourcingFilters  ← exclude-geos, funding recency (jamais scorés)
   └─→ tenants.settings.target*       ← write-through SI profil priorité 0 (miroir legacy)
                                          └─→ les ~25 consommateurs existants, INCHANGÉS
   puis: event icp/recompute-tenant → matrice → companies.score (0-100) → diff affiché
```

Trois principes :
1. **`uiState` est la vérité de l'éditeur** — pas de dérivation inverse criteria→widgets (lossy). Les criteria sont régénérés depuis `uiState` à chaque save ; les criteria "Advanced" (ajoutés au rule-builder) sont conservés tels quels à côté.
2. **Les flats deviennent un miroir en lecture seule** écrit uniquement par le save du profil priorité 0 (et l'onboarding). Aucun consommateur à modifier.
3. **Une seule échelle de score : 0-100** partout où la colonne `companies.score` est lue.

## B. Mapping éditeur : widget → uiState → criteria → usages

| Section / widget | `metadata.uiState` | Criteria émis | Sourcing | Scoring |
|---|---|---|---|---|
| Industries (multi-select Apollo) | `industries: string[]` | `industry in [...]` w=2 | `q_organization_industries` (via apolloParam) | oui |
| Company size (chips de tranches) | `companySizes: string[]` (labels exacts) | `employee_count between {envelope}` w=2 | **labels exacts** via `sizesToApolloRanges(uiState)` — pas l'enveloppe | oui (enveloppe, approximation documentée) |
| Geographies (multi-select) | `geographies: string[]` | `geography in [...]` (Must-have par défaut → `isRequired`) | `organization_locations` | oui |
| Exclude geographies | `sourcingFilters.excludeGeographies` | — aucun | `organization_not_locations` | non (le moteur n'a pas de négation) |
| Annual revenue (min/max) | `revenueMin/Max` | `revenue between` w=1 | `revenue_range` | oui |
| Technologies (chips) | `technologies: string[]` | `technologies in [...]` w=2 | `currently_using_any_of_technology_uids` | oui (si enrichi) |
| Keywords (chips) | `keywords: string[]` | `keywords in [...]` w=1 | `q_organization_keyword_tags` | oui (si enrichi) |
| Recently funded (select relatif) | `sourcingFilters.fundingRecencyDays` | — aucun | `latest_funding_date_range` calculé live | non (relatif → gèlerait) |
| Total raised (min/max) | `totalFundingMin/Max` | `total_funding between` w=1 | `total_funding_range` | oui (si enrichi) |
| Hiring (min jobs + titres) | `minJobOpenings`, `hiringTitles[]` | `num_open_jobs gte`, `hiring_job_titles in` w=1 | `organization_num_jobs_range`, `q_organization_job_titles` | num_open_jobs oui (si enrichi) ; hiring_titles **non** (absent du contexte) |
| Who to talk to (seniorities + titres) | `seniorities[]`, `personTitles[]` | `person_seniorities in`, `person_titles in` | people-search post-filter (déjà géré, `to-apollo-params.ts:168-177`) | **non** — jamais dans le contexte company, étiquette "finds contacts, doesn't score companies" |
| Importance (3 états par section) | `importance: {industry: "important", ...}` | Nice=w1, Important=w3, Must-have=`isRequired:true` | — | pondération |
| `+ Advanced criteria` | — (pas dans uiState) | criteria bruts conservés tels quels (`origin:"advanced"` en metadata du criterion via `value` ou champ dédié) | selon catalogue | selon catalogue |

Le scoring n'a **pas besoin d'un flag `scoring:false`** : en passant le recompute sur la sémantique de `computeIcpFitLevels` (champ absent du contexte → exclu du dénominateur, `criteria-engine.ts:294`), `person_*`/`hiring_job_titles`/champs non enrichis sortent structurellement du fit. L'étiquette "sourcing only" de l'UI est une métadonnée statique de `field-catalog.ts` (présentation, pas du matching).

## C. Préservation des features : les ~28 consommateurs, avant → après

**Inchangés (lisent les flats, ré-alimentés par le write-through du profil priorité 0)** : scripts d'appel (`tenant-script.ts:146-159`), contexte chat (`api/chat/route.ts:232-244`), outils skills (`chat/tools/schema.ts:125-131`), scoring contacts (`contact-scoring.ts:170-197`), warm leads (`deals/warm-leads.ts:68-71`), agent reactor (`context-loader.ts:44-47`), agent memory seed, knowledge seed, voice playbook, dossier builder, benchmarks, campaign/sequence generation, job-posting-intent, suggested/extract/find-contacts (`deriveTargetRoles`), tam/estimate, reply agent + email intelligence + proposals fill (champs Product & Voice, mêmes clés settings), dashboard summary, fallback de `/api/icps/infer`.

**Modifiés (7 chantiers bornés)** :

| Consommateur | Avant | Après | Taille |
|---|---|---|---|
| `inngest/icp-fit-recompute.ts` | `computeIcpFit` pénalisant, miroir 0-1, 1 step | Levels + coverage, miroir **×100**, steps par batch, diff résumé | M |
| `inngest/signal-score-daily.ts` | suppose fit 0-1 (`priority-score.ts:11-12`) | `fit = companies.score / 100` | XS |
| Build TAM Accounts (`accounts/page.tsx:387`) | sans `icpId` → planner legacy | picker de profil (défaut priorité 0) → `icpId` ; route déjà compatible (`tam/build/route.ts:262,344`) | S |
| `/api/icp/apply` (persona search NL) | écrit les flats (`apply/route.ts:32-45`) | upsert le profil priorité 0 (uiState+criteria) → write-through recrée les flats | S |
| `/api/score` (rescore manuel) | `calculateFitScore` sur flats (`score/route.ts:180`) | base fit = matrice (×100) + composantes engagement/signaux inchangées | S |
| `api/onboarding/save` | écrit les flats seulement | + crée le profil "Default" (`legacySettingsToCriteria` existe, `flat-to-criteria.ts:105`) | S |
| Pages settings | 2 pages | 1 page ICP (route `/settings/icp`, `-profiles` redirige) + page Product & Voice | M |

**Supprimés** : PUT `/api/settings/icp` (la page meurt ; GET conservé un temps pour compat), le champ `targetDepartments` (consommateur unique : `deriveTargetRoles`), le bug targetRoles-avalé disparaît avec le champ.

## D. Pipeline de scoring cible

- **Formule** (remplace le `computeIcpFit` pénalisant) : required = hard gates inchangés ; soft : `fitEvaluable = Σ(w·matched) / Σ(w·évaluable)` (champ absent → hors dénominateur) ; **`score100 = round(100 · fitEvaluable · (0.6 + 0.4·coverage))`** où coverage = part du poids soft évaluable. Exemples : société registre (secteur+géo+taille matchent, coverage 0.5) → 80 = A ; même société enrichie avec tech qui ne matche pas (fit 0.75, coverage 1) → 75 = B ; non-enrichie qui matche ce qu'on sait → plus jamais 0.
- **Écritures** : matrice `company_icp_fit.fitScore` reste 0-1 (le `fit_score >= 0.5` de `api/icps/route.ts:41` inchangé) ; le miroir `companies.score` passe en 0-100 ; `matched_criteria` gagne `{identityFit, signalFit, coverage}` pour l'explicabilité.
- **Writers réconciliés** : insert Apollo (`per-company.ts:163-198`, 0-100) = estimation initiale, l'autorité devient le recompute ; `pilae-sic-heuristic` = script one-off (`scripts/apply-apollo-import.ts`, pas un cron) → backfill ; `/api/score` re-pointé matrice.
- **Recompute chunké** : un `step.run` par batch de 100 sociétés (pattern multi-step déjà utilisé par `icpFitRecomputeDaily`), upserts groupés ; à la fin, écrit `tenants.settings.lastIcpRecompute = {at, regraded, up, down, unowned}` pour le diff-after-save.
- **Backfill one-off** : ×100 sur les scores ≤ 1, purge des 96 "Default" vides actifs, recompute complet des tenants à profils.

## E. Verdicts de viabilité backend (testés contre le code le 2026-06-11)

| # | Claim du mapping | Évidence | Verdict |
|---|---|---|---|
| 1 | PATCH remplace les criteria wholesale en transaction → régénération depuis uiState triviale | `api/icps/[id]/route.ts:75-94` | VIABLE |
| 2 | `uiState`/`sourcingFilters` sans migration | `icps.metadata` jsonb existe (`db/schema/icp.ts:47`) | VIABLE |
| 3 | Pas de flag scoring en DB : exclusion structurelle des champs absents | `computeIcpFitLevels` déjà écrit, `criteria-engine.ts:281-316` ; contexte borné `company-context.ts:80-165` | VIABLE |
| 4 | Échelle 0-100 sans casse : aucun lecteur produit ne compare `companies.score` à du 0.x | grep `score (>=|>|<) 0.x` → uniquement evals/orchestrateur ; `GRADE_RANGES` 0-100 (`list-filters.ts:47-54`) ; `calls/campaign` fait déjà `/100` | VIABLE — 2 points d'adaptation : recompute ×100, `signal-score-daily` ÷100 (`priority-score.ts:11-12,34`) |
| 5 | Inventaire exhaustif des writers de flats | `updateTenantSettings` grep : settings/icp PUT, icp/apply, onboarding/save ×3, onboarding/chat — rien d'autre n'écrit `target*` | VIABLE, borné |
| 6 | Write-through sans dérivation inverse : flats écrits depuis uiState | uiState porte les valeurs widget exactes (labels de taille incl.) | VIABLE, lossless |
| 7 | Picker ICP sur Build TAM Accounts | `tam/build/route.ts:262` (icpId) + `:344` (apolloOverrides) coexistent ; `use-tam-stream.start(opts)` passe le body tel quel | VIABLE (param-only) |
| 8 | Diff-after-save par polling | précédent : `TAMRevealNotification` polle `/api/tam` toutes les 3 s ; résumé dans `tenants.settings.lastIcpRecompute` via `updateTenantSettings` | VIABLE |
| 9 | Recompute chunké | `icpFitRecomputeDaily` boucle déjà des `step.run` ; même pattern par batch | VIABLE |
| 10 | Enrollment ICP-scopé préservé | `sequences.icpId` + index shippés (`outbound.ts:53,61`) ; `signal-to-sequence.ts:161` | VIABLE (rien à faire) |
| 11 | Fidélité des tranches d'effectif au sourcing | enveloppe pour le scoring ; labels exacts `uiState` → `sizesToApolloRanges` (helper existant, `icp-constants.ts`) dans `icpToStrategy` | VIABLE (petit changement `icp-to-tam.ts`) |
| 12 | person_* au sourcing contacts | post-filter déjà implémenté `to-apollo-params.ts:168-177` | VIABLE (rien à faire) |
| 13 | Onboarding crée le profil | `legacySettingsToCriteria` pur (`flat-to-criteria.ts:105`) ; point d'insertion `onboarding/save/route.ts:143` | VIABLE |
| 14 | Brancher l'inférence IA | `/api/icps/infer` complet, validation partagée (`validation.ts:7-9`) ; manque uniquement le bouton | VIABLE |
| 15 | Validation extensible à metadata | `validateIcpInput` typé, ajout additif `IcpInput.metadata` | VIABLE |
| 16 | Heuristique pilae = pas de writer vivant | unique occurrence : `scripts/apply-apollo-import.ts` (script manuel) | VIABLE (backfill suffit) |

**Risques résiduels / décisions à figer dans la spec** :
- La formule `0.6 + 0.4·coverage` est un choix produit (pénalité bornée vs confiance affichée séparément) — figée en design avec exemples chiffrés, ajustable par constante.
- Le recompute synchrone du diff n'est pas tenté (timeout) : le diff est asynchrone (~5-15 s, polling), l'UI l'affiche en toast/bandeau quand il atteste.
- `metadata.uiState` et criteria peuvent théoriquement dériver si un client tiers PATCH des criteria sans uiState — convention : uiState absent ⇒ l'éditeur affiche tout en mode Advanced (dégradation propre).
- Permissions : ouvrir POST/PATCH aux membres (parité décision legacy, `settings/icp/route.ts:51-54`) en gardant DELETE admin — à valider avec Martin (défaut proposé : oui).
