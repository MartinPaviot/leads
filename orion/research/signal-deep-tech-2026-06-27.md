# Signaux — la couche technologique profonde (le moat)

> Document deep-tech. Il prolonge la couche produit-intégrée déjà conçue (R2 : `_reports/signals-world-class-2026-06-27.md` et `_reports/signal-intelligence-design-2026-06-27.md` — la *surface* signal-bus / table `signals` / `taxonomy.ts`, à venir dans l'arbre). Ici on descend d'un cran : les 6 moteurs qui constituent la couche défendable. Chaque affirmation est ancrée à un `file:line` réel sous `app/apps/web/src/...` ou marquée **NET-NEW**. Pas de marketing — des schémas, des signatures, des chiffres.
>
> Note de cadrage vérifiée : les deux rapports R2 cités **ne sont pas encore sur disque** (`_reports/` ne les contient pas au 2026-06-27). Les points de jonction « bus / table signals » ci-dessous sont donc ancrés sur le contrat réellement présent aujourd'hui — `companies.properties.signals[]` via `recordCompanySignal` (`lib/signals/record-signal.ts:86`) — que la surface R2 remplacera sans refactor des moteurs.

---

## 0. Résumé exécutif

**La thèse moat, en 4 lignes.** Un wrapper d'APIs revend un *niveau* (250 employés, funding round X, 3 offres ouvertes) que tout le monde achète au même prix. Ces 6 moteurs produisent ce qu'aucune source ne vend : (1) un *sujet résolu* unique malgré 30 % de lignes sans clé registre, (2) le *sens* d'un texte (pain-trigger nié/composé, pas un compte de mots-clés), (3) la *dérivée* d'un signal (accélération, pas niveau) — calculable seulement si on historise soi-même, (4) une *probabilité calibrée* de win apprise par tenant et poolée cross-réseau, (5) le *chemin chaud* degré-k vers chaque compte d'un TAM froid, (6) un *dossier sourcé vérifié-au-contenu* sous budget borné. Le défendable n'est aucun modèle isolé — c'est le *flywheel de données propriétaires historisées + identité résolue + outcomes calibrés* que personne ne reconstitue en un week-end parce qu'il n'a pas le corpus.

**La surprise.** ~70-80 % de cette techno est **déjà dans le stack**, dispersée et non câblée. Le kernel log-odds de fusion bayésienne existe (`lib/scoring/predictive-scorer.ts:234-261`). pgvector + HNSW tournent en prod (`db/ensure-vector-index.ts:52-57`). Le RRF hybride BM25+vecteur est codé (`lib/ai/embeddings.ts:236`). La dédup déterministe registry-first existe (`db/canonical/identity.ts:44/103`). Le récursif-CTE de traversée de graphe existe (`lib/ai/graph-reasoning.ts:85-193`). La boucle agentique research + anti-fabrication-gate existent (`lib/campaign-engine/research-agent.ts:104`, `lib/evals/fabrication-gate.ts:138`). Le cost-tracker par `agent_traces.estimated_cost` existe (`lib/billing/cost-tracker.ts:22`). Les 6 moteurs sont donc majoritairement du **câblage** de briques prod sous un contrat unifié — pas une réécriture. NET-NEW total ≈ 13 tables + ~30 modules TS + ~8 fonctions Inngest. **Aucun service ML auto-hébergé, aucune extension Postgres non disponible sur Neon/Supabase.**

---

## 1. Ce qui est déjà dans le stack (la fondation réutilisable)

| Capacité | Module existant (file:line) | Ce qu'on en fait pour les signaux |
|---|---|---|
| **pgvector + HNSW cosine** (table `embeddings vector(1536)`, `UNIQUE(tenant,type,id)`, HNSW m=16/ef=64) | `db/ensure-vector-index.ts:17-26`, `:52-57` | Canal de blocking sémantique (identité, §2) ; store des chunks `signal_doc` (extraction, §3) ; tie-break d'influence (warm-path, §6). Zéro DDL pour le vecteur. |
| **RRF hybride BM25 + vecteur** (k=60) + FTS `to_tsvector` GIN | `lib/ai/embeddings.ts:236/244/162/202`, `drizzle/_archive/0029_fulltext_index.sql:2` | Le retrieve hybride du pré-filtre d'extraction (§3) — rien à écrire. |
| **Dédup déterministe registry-first** `fr:/ch:/d:/n:` + match plans ordonnés | `db/canonical/identity.ts:44/67/103/125` | Étape 0 de la résolution d'identité (§2) : clé registre = arête `SAME_AS` à poids ∞, jamais probabilisée. |
| **Normalisation nom/domaine/path** | `lib/companies/identity.ts:27`, `db/canonical/identity.ts:11/92` | `name_norm`/`domain` partout — *même* normalizer (sinon split d'identité). |
| **Précédence multi-source** `PROVIDER_RANK` + `pickWinner` | `db/canonical/precedence.ts:9/53` | Résout les champs du sujet fusionné une fois le cluster formé (§2). |
| **Similarité Levenshtein pure** (bucketable) | `lib/dedup/similarity.ts:6/24` | Buckets de champ FS (§2) et grounding fuzzy (§3). |
| **Group-by-key + review O(n²)** (boucle i,j) | `lib/dedup/group.ts:9/25/29-30` | Le goulot à remplacer par blocking (§2). |
| **Kernel log-odds + sigmoïde** + Naive Bayes Laplace | `lib/scoring/predictive-scorer.ts:234-261`, `:141-175` | La fusion bayésienne correcte — étendue par la logistique pénalisée (§5), pas réécrite. |
| **Récursif-CTE traversal** (depth-cap 4, cycle-guard, ∏confidence × depth-penalty × recency) | `lib/ai/graph-reasoning.ts:85-193` | Le kernel degré-k du warm-path (§6). SOTA-pour-Postgres déjà. |
| **Graphe bi-temporel** `context_graph_edges` + fusion multi-canal | `db/schema/intelligence.ts:242-270`, `lib/context/relationship-graph.ts:400/414/111` | Data plane des arêtes `KNOWS` (§6) ; le *pattern* de fusion log-odds réutilisé pour `SAME_AS` (§2). |
| **Snapshot+diff** `metric_rollup_snapshot` + `regression_alert` | `db/schema/outbound.ts:519-534/542-554` | Patron à généraliser en `entity_metric_snapshot` (§4). |
| **Cron par-tenant + flush CASE chunké 500** | `inngest/signal-score-daily.ts:95-273` | Squelette cloné pour tous les jobs batch (§2,§4,§5,§6). |
| **Boucle agentique research + ToolSet fail-soft + crawler SSRF-hardened** | `lib/campaign-engine/research-agent.ts:104`, `research-agent-tools.ts:54`, `sources/browse-page.ts:67/41` | Squelette Claygent (§7). |
| **Anti-fabrication gate** | `lib/evals/fabrication-gate.ts:138/173/91` | Critic grounded-only, réutilisé pour grounding d'extraction (§3) et vérif citations (§7). |
| **Cost-tracker + pricing single-source + budget cap** | `lib/billing/cost-tracker.ts:22`, `lib/ai/model-pricing.ts:57/86`, `lib/billing/llm-budget.ts:135` | L'économie (§9) : mesure via `agent_traces.estimated_cost`, JAMAIS `llm_calls`. |
| **Routeur Haiku/Sonnet/embedding + kill-switch + circuit-breaker** | `lib/ai/ai-provider.ts:227/186/223/251` | Routage cost-aware (§3,§5,§7). |
| **Point d'écriture signal unique** `recordCompanySignal` → `properties.signals[]` | `lib/signals/record-signal.ts:86`, `SignalEntry:38`, `SignalPerson:29` | Le sink commun : tout moteur écrit ici, le scoring lit sans changement. |
| **Scoring signal-dominant** `signal × fit_mod × access_mod` | `lib/scoring/priority-score.ts:54-76` | Consommateur final ; termes bornés ajoutés (velocity §4, warm §6) sans casser la bande. |
| **Freshness / TTL par type** | `lib/signals/freshness.ts:31/91` | TTL réutilisés comme demi-vies du decay continu (§4). |
| **Multiplicateurs appris + priors + outcomes** `SIGNAL_PRIORS`, `signal_outcomes` | `lib/scoring/signal-outcomes.ts:59/97`, `db/schema/intelligence.ts:222-240` | Table de labels + prior L2 (§5). |
| **Pooling anonymisé k-anon ≥10** | `lib/scoring/anonymized-signals.ts:56-212` | Couche prior global→tenant (§5). |
| **Runner migration custom** + `customType bytea` | `scripts/apply-migrations.ts`, `db/schema/proposals.ts:17-21` | Voie du DDL que Drizzle ne génère pas (§4). |

---

## 2. Moteur — Résolution d'identité probabiliste (le graphe d'identité)

### Le problème dur + pourquoi moat
Transformer chaque observation brute multi-source (org GitHub, CIK SEC, SIREN SIRENE, profil LinkedIn, visiteur pixel, inbound d'un inconnu) en un **sujet résolu unique** (`company`|`person`), score calibré, explicable, réversible — alors que ~30 % des lignes n'ont **aucune clé registre** et que les près-doublons cross-clé sont détectés en **O(n²)** sans jamais fusionner (`lib/dedup/group.ts:29-30`). Moat : tout l'aval exige un sujet déjà résolu — `recordCompanySignal(tenantId, companyId, entry)` (`record-signal.ts:86`) ne prend qu'un sujet. Sans graphe d'identité, un funding sur « ACME SAS » et un job-posting sur « acme.io » restent sur deux lignes → le score se dilue.

### Techno SOTA retenue + trade-off
**Fellegi-Sunter** (log-odds par champ, m/u calibrés), **blocking multi-canal** (déterministe + trigram + phonétique + sémantique) pour tuer le O(n²), **union-find** pour les composantes connexes, **agent LLM gray-zone** pour l'adjudication. Trade-off : calibration des poids m/u **offline** (Splink/DuckDB sur dump) car Splink est Python — jamais en runtime serverless ; scoring runtime 100 % SQL/TS. Union-find TS préféré au CTE récursif pour le batch (pas de garde de cycle native).

### Design concret
Extensions natives : `vector` (déjà là), `pg_trgm` (NET-NEW), `fuzzystrmatch` (NET-NEW). **3 tables NET-NEW** (`db/schema/identity-graph.ts`) : `identity_node` (colonnes blocking + `embedding` + `cluster_id` + `subject_id`, uniqueIndex `(tenant,source,source_ref)` idempotence), `identity_edge` (`SAME_AS` pondéré : `match_weight`, `match_probability`, `decision`, `decided_by`, `evidence`, `must_not_link`), `identity_fs_weights` (m/u versionnés). 3 index SQL bruts : GIN trigram, GIN `daitch_mokotoff`, HNSW. Signatures (`lib/identity-graph/`) : `ingestObservation`, `candidatePairs(k=50)` (O(n·k)), `fsMatchWeight`, `connectedComponents` (union-find pur), `resolveSubject`. Algo : (0) déterministe d'abord (poids ∞) ; (1) blocking union indexée scopée tenant ; (2) FS log-odds ; (3) décision 2-seuils (≥0.95 auto / 0.55-0.95 LLM / <0.55 reject) ; (4) composantes connexes avec garde anti-sur-fusion (seuil avant CC, plafond de taille, `must_not_link`) ; (5) adjudication LLM gray-zone Haiku/Sonnet prompt-caché.

### Où ça se branche (R2)
Sources → `ingestObservation` au lieu d'écrire `companies`. Invariant : `recordCompanySignal` (`record-signal.ts:86`) **uniquement** avec le `subjectId` de `resolveSubject`. `SAME_AS` jamais mélangé au `KNOWS` (sinon casse `findWarmPathsToCompanies`).

### Effort : **≈ 11,5 j-h**.

---

## 3. Moteur — Extraction sémantique de signaux (embeddings + LLM)

### Le problème dur + pourquoi moat
Classer un *pain-trigger* depuis du texte non-structuré en gérant **négation et composition** (« gel des embauches », « pas de SOC2 »), avec **preuve verbatim ancrée** — là où les détecteurs actuels comptent des mots-clés (`hiring-intent.ts:19` = `count>0`) ou des seuils headcount (`job-posting-intent/handler.ts:56/75`). Moat : meilleur ranking + citation réutilisée dans le draft cité + flywheel de calibration par outcome (`signal-outcomes.ts:59`).

### Techno SOTA retenue + trade-off
Pipeline **retrieve → extract → gate → synthesize**, pré-filtre embeddings gratuit (kNN vs exemplaires étiquetés, `margin` = confiance discriminative). Trade-off : pas de `confidence` brute du LLM → fusion `min(margin, self-consistency)` + calibration **isotonic**. Parade négation = champ **`polarity` explicite** + seed d'exemplaires niés. Embedding = blocking only.

### Design concret
`vector` présent ; `pg_trgm` optionnel. Docs-signaux RÉUTILISENT la table `embeddings` (convention `entity_type='signal_doc:...'`). **4 tables NET-NEW** (0096-0099) : `signal_trigger_exemplars` (+polarity+HNSW), `signal_trigger_centroid`, `signal_extractions` (frontière R2), `signal_calibration`. Signatures (`lib/signals/semantic/`) : `chunkDoc`, `embedSignalDocs` (`embedMany`), `prefilterTriggers` (kNN+margin), `extractSignals` (Haiku `generateObject` + polarity, fail-open), `groundQuote` (Jaccard ≥0.9), `fuseConfidence`/`calibrate`/`toStrength`, `synthesizeAngle` (Sonnet rare), `runSemanticSignals`. Stage 0 élimine ~90 % à coût LLM nul.

### Où ça se branche (R2)
Remplace `detectHiringIntent` par un détecteur sémantique de même interface ; supprime les seuils de `job-posting-intent/handler.ts`. Scoring **inchangé** (`properties.signals[]` lu par `signal-score-daily.ts:72-93`). Ajouter triggers à `SIGNAL_TTL_DAYS`/`SIGNAL_PRIORS`. `signal_extractions` = event durable du bus R2.

### Effort : **≈ 62 j-h (~8 j-dev)**.

---

## 4. Moteur — Temporel / velocity event-source

### Le problème dur + pourquoi moat
Le stockage est un cache *sans état temporel* (écrasé par type `record-signal.ts:73-79`, fraîcheur = booléen `freshness.ts:91-104`) → on ne sait jamais si une métrique **accélère ou décélère**. Moat : aucune source ne vend la dérivée ; elle n'existe que si **on historise le niveau à chaque poll puis on différencie**. Le premier qui historise sur 6-12 mois possède une intelligence non-achetable rétroactivement.

### Techno SOTA retenue + trade-off
**Event-log append-only bitemporel léger** (source de vérité, `properties.signals[]` = cache projeté). **Decay continu exponentiel** remplace le booléen. **Vélocité = pente OLS** sur fenêtre + accélération = Δ2. Trade-off : éviter l'océan A3 (`EXCLUDE GiST` sur le log sérialiserait les writes). Zéro LLM. Partitions pilotées par **Inngest** (pas pg_partman/pg_cron sous scale-to-zero).

### Design concret
`btree_gist` seulement si A3 ; sinon aucune extension. Migration `0107_signal_event.sql` (`PARTITION BY RANGE(observed_at)`, dédup anti-jitter) + `0108_metric_snapshot_velocity.sql` (`entity_metric_snapshot` généralise `outbound.ts:519-534` ; `entity_velocity` cache dérivé). Signatures : `recordSignalEvent` (INSERT-only + projection), `decayWeight` = `exp(-ln2·age/halfLife)` avec `halfLife=SIGNAL_TTL_DAYS` (rétro-compat w=0.5 au seuil TTL), `deriveVelocity` (OLS pur), `velocityModulator` = `clamp(1+2.0·rel, 0.7, 1.6)`. Snapshot grille-jour `ON CONFLICT DO NOTHING`, `rel_rate = velocity/level` (comparable inter-tailles).

### Où ça se branche (R2)
`per-company.ts:386-405` → `recordSignalEvent({metric:"headcount"})`. Les 3 write points appellent `recordSignalEvent` (outbox, referme la race `signal-monitor.ts:250`). Scoring : `if(!isSignalFresh) continue` (`signal-score-daily.ts:88`) → `mult *= decayWeight(...)`. Kairos `decideAcceleration:164` gagne `acceleration > seuil`.

### Effort : **≈ 7,5-10,5 j-h** (A1). Weibull +2-3 ; A3 +3-4 (océan, à flaguer).

---

## 5. Moteur — Fusion probabiliste + propension-to-buy calibrée

### Le problème dur + pourquoi moat
Transformer une nuée de signaux **corrélés** en UNE probabilité de win **calibrée** (« 23 % », pas « 1.8× »), apprise par tenant, robuste à n<10 deals, sans pipeline ML hors-stack — puis trier par **uplift** et **timing**. Moat : boucle outcome→poids fermée (`signal_outcomes`, `intelligence.ts:222`), pooling cross-tenant k-anon ≥10 (prior réseau dès J0), une vraie proba autorise un seuil absolu — impossible avec le score ordinal (`priority-score.ts:28-29` = sort-only).

### Techno SOTA retenue + trade-off
**Régression logistique pénalisée (IRLS + L2 ancré sur le prior)** : deux signaux corrélés **partagent** le poids (vs le multiply `signal-outcomes.ts:173` ou la somme `buyer-intent.ts:603`). **Calibration Platt/beta** (pas isotonic sous ~200 positifs). **Pooling global→tenant**. Trade-off : aucune extension (PostgresML exige superuser, indispo Neon) → IRLS TS pur (matrice 40×40, <100 ms). GBM/ONNX optionnel phase 4 via `onnxruntime-web`.

### Design concret
Migration `0107_propensity_engine.sql` + `db/schema/propensity.ts` : `scoring_models` (`coefficients`, `calibrator`, `featureSpec` gelé, `metrics` {auc,brier,ece}, `tenantId NULL`=global), `feature_snapshots` (store offline PIT, `as_of` anti-fuite, `treated`), `entity_features` (online). Colonnes `companies.propensity*`. `signal_outcomes` = training set. Signatures (`lib/scoring/propensity/`) : `encodeFeatures` (UNIQUE train+serve), `trainPenalizedLogit({l2, priorCoef=log(SIGNAL_PRIORS)})`, `fitCalibrator`, `scorePropensity`, `propensityToMultiplier` = `clamp(odds(p)/odds(base),0.5,2.5)`. IRLS : `β←priorCoef` puis `β←(XᵀWX+λI)⁻¹XᵀWz + λ·priorCoef`, `λ=λ0·10/(10+nPos)`.

### Où ça se branche (R2)
`signal-score-daily.ts:198` : charger modèle → `encodeFeatures` → `scorePropensity` → persister `propensity` **et** `signalMultiplier=propensityToMultiplier(...)` pour garder `computePriorityScore:202` intact (zéro régression, fallback `getSignalMultipliers`). Entraînement `inngest/propensity-train-nightly.ts` (`30 5 * * *`). Snapshot PIT à l'enrôlement (`outbound.ts:101`), label via `recordDealOutcome`.

### Effort : MVP **≈ 7,5 j-h** ; complet hors GBM **≈ 15 j-h**.

---

## 6. Moteur — Graphe warm-path

### Le problème dur + pourquoi moat
Calculer pour chaque compte d'un TAM froid (10²-10⁵) le **chemin d'intro le plus fort à degré borné** depuis l'équipe + **quel connecteur fera l'intro**, assez cheap pour chaque ligne et le scoring. Moat : graphe propriétaire compounding (`buildKnowsFromActivities`, `relationship-graph.ts:131` ; `syncLinkedInRelations`, `graph-sync.ts:105`) — données qu'aucune liste n'a.

### Techno SOTA retenue + trade-off
**Récursif-CTE multi-source degré-k** (étend `graph-reasoning.ts:85`) + **table matérialisée `warm_paths`** + **forward-push Personalized PageRank** (local). Trade-off dicté par Supavisor 6543 : **Apache AGE écarté** (`LOAD 'age'` incompatible pooling) ; **pgRouting différé derrière flag** (>10⁵ arêtes). Core sans extension. Heavy precompute sur port session 5432.

### Design concret
2 tables NET-NEW (`warm_paths` : degree, path_strength, connector_influence PPR, path_node_ids ; `node_influence`) + 2 index partiels `cge_knows_*_idx WHERE relation_type='KNOWS' AND t_invalid IS NULL`. Signatures : `findWarmPathsKHop({maxDegree=3, maxFanout=500})`, `forwardPushPPR({alpha:0.2, eps:1e-4})`, `refreshWarmGraph`. Algo : CTE base-case = tous nodes équipe en une query, dédup par-frontière `DISTINCT ON` + degré-guard + cap depth≤3 (défense hub-fanout 47s/335k) ; fusion REUTILISE `fuseKnowsConfidence:400` ; decay `strength *= exp(-Δdays/120)` à la matérialisation. **Multiplicateur warm flaggé** : terme dédié capé `warmModulator` ∈[1,2.0] — bande passe de ~[0,2.5] à ~[0,5.0], documenté dans header + `score-scale.test.ts`.

### Où ça se branche (R2)
`per-company.ts:308` → `findWarmPathsKHop` degré-3 ; degré-1/2 émet `recordCompanySignal({type:"warm_connection"})`. `signal-score-daily.ts:191-208` joint `warm_paths` → autopilot enrôle chaud d'abord sans changement. LLM quasi nul (explication = templating `graph-reasoning.ts:473`).

### Effort : **≈ 32-45 h (4-6 j)**.

---

## 7. Moteur — Agent de recherche autonome cost-aware

### Le problème dur + pourquoi moat
Produire à coût **borné** un dossier dont chaque fait est sourcé sur une URL vérifiée **ET dont le contenu contient réellement la citation** — vs un LLM qui hallucine 11-57 % de ses citations et brûle le budget. Moat : le grounding **vérifié-au-contenu** composé (research → briefs → gate → copy → signal → score). La barrière est l'intégration cost-aware + anti-hallucination + durable.

### Techno SOTA retenue + trade-off
**Boucle tiérée par budget** + routage par step (Sonnet plan/synthèse, Haiku extraction) + **prompt caching** + **vérif 3 niveaux** (HEAD → content-match GET → critic grounded-only). Trade-off : rester sur **Inngest** (`step.run` durable, zéro nouvelle facture) vs WDK. Réseau confiné à `browsePage` SSRF-hardened. Versions vérifiées `ai@6.0.199` → `experimental_output`.

### Design concret
Aucune extension pg. 1 table NET-NEW `research_runs` (budget ledger + token economics séparant le cache + `claims_total/verified/dropped`). Zéro changement sur `intelligence_briefs`. Signatures : `decideTier` (shallow $0.02 / standard $0.08 / deep $0.40) + `budgetExhausted` ; `stopWhen` composite ; `verifyCitations` (N1 HEAD + N2 content-match) ; `criticGroundDossier` (wrap `judgeFabrication:173`). Pièges : forcer Sonnet sur l'output step (`research-agent.ts:95`) ; `cacheControl` 1h avant 5min, posé après résolution du flywheel system (`traced-ai.ts:96`) ; comptabilité cache NET-NEW dans `model-pricing.ts` (`cacheRead≈0.10×input`).

### Où ça se branche (R2)
`prepare.ts:38` + `build-intelligence-brief.ts:78` appellent le moteur. Fait vérifié → `SignalEntry` via `recordCompanySignal:86` → domine `computePriorityScore:70`. `Source.verified` (`events.ts:41`) honoré end-to-end.

### Effort : **≈ 13,5 j-h** (~12 sans fan-out).

---

## 8. Le modèle de données unifié

Les 6 moteurs partagent **4 stores**.

**(A) Identity graph** (§2) produit le `subject_id` que tous consomment ; couche en amont, additive (FK vers `companies.id`/`contacts.id`). **(B) Event log bitemporel** (`signal_event`, §4) = source de vérité ; `properties.signals[]` = cache projeté reconstructible ; §3/§7/§6 émettent, §4/§5 consomment ; `signal_extractions` + `signal_event` = events durables que le bus R2 lira. **(C) Feature store** (`feature_snapshots` PIT + `entity_features`, §5) agrège signaux (§3), velocity (§4), warm (§6), firmo ; `encodeFeatures` = dict ouvert. **(D) Vector store** (`embeddings vector(1536)` + HNSW) sert blocking (§2), docs (§3), influence (§6) — **une seule dimension figée**, migration = colonne dédiée versionnée jamais in-place.

```
 sources brutes → [A] IDENTITY GRAPH ── subject_id (invariant) ──┐
        ▼ (sujet résolu)                                          │
 [B] SIGNAL EVENT LOG (bitemporel) ◄ §3 extraction, §7 research, §6 warm
        ├──► cache: properties.signals[] ── §R2 bus              │
        ▼                                                         ▼
 [C] FEATURE STORE (PIT+online) ◄ velocity §4, warm §6, firmo
        ▼
 [§5] PROPENSITY (logit calibré) ──► companies.propensity / priority_score
                                          ▲
 [D] VECTOR STORE (embeddings 1536) ──────┘ (§2 blocking, §3 docs, §6 influence)
```

**Extension de la table `signals` R2 (sect. 4)** : R2 définit la taxonomy/bus (le quoi/où en surface). Cette couche fournit le comment profond — identity garantit le `subject_id`, l'event log donne dérivée + decay, le feature store rend apprenable, le vector store rend sémantique. `signal_event`/`signal_extractions` sont la source de vérité historisée de la table `signals` R2.

---

## 9. L'économie

Mesure via `agent_traces.estimated_cost` (`cost-tracker.ts:22`), **jamais** `llm_calls`. Pricing `model-pricing.ts:57/86`, à étendre `cacheWrite`/`cacheRead`.

**4 leviers** : (1) routage Haiku (~99 % volume) / Sonnet (output step, paires serrées) ; (2) prompt caching = lecture 0.10× input (−90 %), −50 à −80 % sur la boucle research 8 steps ; (3) embeddings quasi-nuls ($0.0001/job-post), Stage 0 kNN élimine ~90 % à coût LLM nul ; (4) fan-out borné par `RunBudget` + `stopWhen` + cap mensuel `enforceLlmBudget`.

**Coût par company** : shallow $0.005-0.02 · standard $0.05-0.08 · deep $0.40 ; identité <$0.002 ; velocity/propension **$0 LLM** (SQL/TS pur). **1000 companies** (80/18/2 %) ≈ **$29** pour le research, +~$0.10 identité, ~$0 le reste — soit **un TAM de 1000 analysé à fond pour ~$30**, vs ~$300+ pour un wrapper Sonnet-plein-prompt uniforme (10×).

---

## 10. Séquençage + le moat

| # | Moteur | Effort j-h | Prérequis | Débloque |
|---|---|---|---|---|
| 2 | Identité | ~11,5 | `vector`+`pg_trgm`+`fuzzystrmatch` | `subject_id` propre → tout l'aval cesse de se diluer. Fondation. |
| 3 | Extraction sémantique | ~62 | `vector` ; embeddings/fabrication-gate | Triggers niés/composés + citations ancrées. |
| 4 | Temporel/velocity | ~7,5-10,5 | runner migration ; outbound.ts | La dérivée — actif non-achetable rétroactivement. |
| 5 | Fusion/propension | ~7,5 (MVP) | `signal_outcomes` ; predictive-scorer | Proba calibrée → seuil absolu, uplift/timing. |
| 6 | Warm-path | ~32-45 h | CTE natif ; graph-reasoning | Chemin chaud scoré sur chaque compte. |
| 7 | Research cost-aware | ~13,5 | Inngest ; research-agent/gate | Dossier vérifié-au-contenu sous budget. |

**MINIMUM qui crée déjà un moat** : **§2 + §4 + §7 (≈ 32-35 j-h)**. §2 garantit le bon sujet (sinon tout est bruit) ; §4 historise dès J0 la donnée propriétaire irrattrapable ; §7 produit des faits sourcés-vérifiés citables. Ces trois tournent **sans modèle ML entraîné** (pas de cold-start outcome) — ils créent l'actif pendant que §5 accumule les labels. §3/§5/§6 amplifient.

**Pourquoi défendable.** (1) Donnée historisée propriétaire (la dérivée §4 n'existe qu'avec l'historique snapshotté — un nouvel entrant est en retard de tout l'historique). (2) Identité résolue construite du corpus du tenant (sans corpus, Fellegi-Sunter rend des clusters vides). (3) Fusion calibrée sur outcomes réels + pool anonymisé (données qu'aucune API ne contient). (4) Jugement LLM grounded = intégration composée, pas un prompt. (5) Warm-graph tissé du réseau propre du tenant, non-achetable. Un concurrent copie chaque algorithme en un week-end ; il ne peut pas copier l'historique snapshotté, le corpus d'identité, les outcomes calibrés et le graphe relationnel — le moat n'est pas le code, c'est le flywheel que le code alimente.

---

Document complet écrit sur disque : `C:\Users\ombel\leads\_reports\signaux-couche-technologique-profonde-2026-06-27.md`. Note : les deux rapports R2 cités (`signals-world-class-2026-06-27.md`, `signal-intelligence-design-2026-06-27.md`) n'existent pas encore dans `_reports/` — référencés comme la couche produit-intégrée à venir, sans répéter leur contenu, et tous les points de jonction « bus/signals » ancrés sur le contrat réel `lib/signals/record-signal.ts:86`.