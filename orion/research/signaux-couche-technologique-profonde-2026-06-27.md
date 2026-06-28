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
| **Kernel log-odds + sigmoïde** (`logOdds += llr; sigmoid`) + Naive Bayes Laplace | `lib/scoring/predictive-scorer.ts:234-261`, `:141-175` | La fusion bayésienne correcte — étendue par la logistique pénalisée (§5), pas réécrite. |
| **Récursif-CTE traversal** (depth-cap 4, cycle-guard, ∏confidence × depth-penalty × recency) | `lib/ai/graph-reasoning.ts:85-193` | Le kernel degré-k du warm-path (§6). SOTA-pour-Postgres déjà. |
| **Graphe bi-temporel** `context_graph_edges` (`relation_type`, `confidence`, `t_valid/t_invalid`) + fusion multi-canal | `db/schema/intelligence.ts:242-270`, `lib/context/relationship-graph.ts:400/414/111` | Data plane des arêtes `KNOWS` (§6) ; le *pattern* de fusion log-odds réutilisé pour `SAME_AS` (§2). |
| **Snapshot+diff** `metric_rollup_snapshot` + `regression_alert` (dédup scope-jour) | `db/schema/outbound.ts:519-534/542-554` | Patron à généraliser en `entity_metric_snapshot` (§4) — même forme, même dédup idempotente. |
| **Cron par-tenant + flush CASE chunké 500** | `inngest/signal-score-daily.ts:95-273` | Squelette cloné pour tous les jobs batch des moteurs (§2,§4,§5,§6). |
| **Boucle agentique research + ToolSet fail-soft + crawler SSRF-hardened** | `lib/campaign-engine/research-agent.ts:104`, `research-agent-tools.ts:54`, `sources/browse-page.ts:67/41` | Squelette Claygent du moteur de recherche (§7). |
| **Anti-fabrication gate** (`decideFabricationGate`, `judgeFabrication`, `extractHardSpecifics`) | `lib/evals/fabrication-gate.ts:138/173/91` | Le critic grounded-only, réutilisé pour le grounding d'extraction (§3) et la vérif de citations (§7). |
| **Cost-tracker + pricing single-source + budget cap** | `lib/billing/cost-tracker.ts:22`, `lib/ai/model-pricing.ts:57/86`, `lib/billing/llm-budget.ts:135` | L'économie (§9) : mesure via `agent_traces.estimated_cost`, JAMAIS `llm_calls`. |
| **Routeur Haiku/Sonnet/embedding + kill-switch + circuit-breaker** | `lib/ai/ai-provider.ts:227/186/223/251` | Routage cost-aware de tous les moteurs à étage LLM (§3,§5,§7). |
| **Point d'écriture signal unique** `recordCompanySignal` → `properties.signals[]` | `lib/signals/record-signal.ts:86`, `SignalEntry:38`, `SignalPerson:29` | Le sink commun : tout moteur écrit ici, le scoring lit sans changement. |
| **Scoring signal-dominant** `signal × fit_mod × access_mod` (floors bornés) | `lib/scoring/priority-score.ts:54-76` | Le consommateur final ; on y ajoute des termes bornés (velocity §4, warm §6) sans casser la bande. |
| **Freshness / TTL par type (18 types)** | `lib/signals/freshness.ts:31/91` | TTL réutilisés comme demi-vies du decay continu (§4). |
| **Multiplicateurs appris + priors + outcomes** `SIGNAL_PRIORS`, `signal_outcomes` | `lib/scoring/signal-outcomes.ts:59/97`, `db/schema/intelligence.ts:222-240` | Table de labels + prior L2 du moteur de propension (§5). |
| **Pooling anonymisé k-anon ≥10** | `lib/scoring/anonymized-signals.ts:56-212` | La couche prior global→tenant (§5). |
| **Runner migration custom** (journal figé idx 12) + `customType bytea` | `scripts/apply-migrations.ts`, `db/schema/proposals.ts:17-21` | Voie du DDL que Drizzle ne génère pas (PARTITION BY, EXCLUDE, tstzrange — §4). |

**Conséquence directe** : le travail net est l'assemblage sous un *modèle de données unifié* (§8) et un *contrat de coût* (§9), pas la construction from-scratch d'une plateforme ML.

---

## 2. Moteur — Résolution d'identité probabiliste (le graphe d'identité)

### Le problème dur + pourquoi moat
Transformer chaque observation brute multi-source (org GitHub, CIK SEC, SIREN SIRENE, profil LinkedIn, visiteur pixel, inbound d'un inconnu) en un **sujet résolu unique** (`company`|`person`), score calibré, explicable, réversible — alors que ~30 % des lignes n'ont **aucune clé registre** et que les près-doublons cross-clé sont aujourd'hui détectés en **O(n²)** sans jamais fusionner (`lib/dedup/group.ts:29-30`). Moat : tout l'aval (scoring, signaux, warm-graph, autopilot) **exige** un `companyId`/`contactId` déjà résolu — `recordCompanySignal(tenantId, companyId, entry)` (`record-signal.ts:86`) ne prend qu'un sujet. Sans graphe d'identité, un funding sur « ACME SAS » et un job-posting sur « acme.io » restent sur deux lignes → le score se dilue. Le concurrent qui résout le mieux accumule un flywheel de données propres incopiable sans le même corpus.

### Techno SOTA retenue + trade-off
**Fellegi-Sunter** (log-odds par champ, m/u calibrés) pour le scoring de paires, **blocking multi-canal** (déterministe + trigram + phonétique + sémantique) pour tuer le O(n²), **union-find** pour le clustering en composantes connexes, **agent LLM gray-zone** pour l'adjudication. Trade-off assumé : **calibration des poids m/u offline** (Splink/DuckDB sur un dump, hand-tune au démarrage) car Splink est Python — **jamais en runtime serverless** ; le scoring runtime est 100 % SQL/TS. On préfère union-find TS au CTE récursif pour le batch (pas de garde de cycle native), CTE réservé au voisinage on-demand 1-nœud.

### Design concret
**Extensions pg (toutes natives Neon/Supabase)** : `vector` (déjà là), `pg_trgm` (NET-NEW, GIN trigram), `fuzzystrmatch` (NET-NEW, `daitch_mokotoff`/`levenshtein`).

**3 tables NET-NEW** (`db/schema/identity-graph.ts`, additif, ne touche pas `companies`/`contacts`) :
- `identity_node` : observation normalisée. Colonnes pour blocking indexé (`name_norm`, `domain`, `siren`, `cik`, `github_login`, `linkedin_path`, `email`…), `deterministic_key`, `embedding vector(1536)`, `cluster_id` (null tant que non résolu), `subject_id` (FK companies/contacts une fois canonicalisé). Index : `(tenant,kind)`, `(tenant,cluster)`, **uniqueIndex `(tenant,source,source_ref)`** (idempotence d'ingestion), `(tenant,domain)`, `(tenant,det_key)`.
- `identity_edge` : `SAME_AS` pondéré. `match_weight` (Σ log2 BF), `match_probability` (BF/(1+BF)), `decision` (`auto_merge`|`review`|`reject`), `decided_by` (`deterministic`|`fs`|`llm`|`human`), `evidence jsonb` (poids par champ), **`must_not_link bool`** (split déterministe sur id registre divergent). uniqueIndex `(tenant,nodeA,nodeB)` avec convention `nodeA<nodeB`.
- `identity_fs_weights` : m/u calibrés versionnés par `(subject_kind, field, level, version)`.

**3 index SQL bruts NET-NEW** (appliqués hors chemin chaud comme `ensure-vector-index.ts`) : GIN trigram `name_norm gin_trgm_ops`, GIN `daitch_mokotoff(name_norm)`, HNSW `embedding vector_cosine_ops`.

**Signatures clés** (`lib/identity-graph/`) : `ingestObservation` (idempotent par `(tenant,source,source_ref)`), `candidatePairs(tenant,nodeId,k=50)` (remplace le O(n²) → O(n·k)), `fsMatchWeight(a,b,w)` (FS pur, réutilise `similarity.ts`), `connectedComponents(edges)` (union-find pur, testable), `resolveSubject(o)` (orchestration ingest→block→score→decide→cluster→subjectId).

**Algorithme** : (0) déterministe d'abord — `accountMatchPlan`/`contactMatchPlan` (`identity.ts:67/125`) → arête poids ∞ sans probabiliste ; (1) blocking = union indexée scopée `tenant_id` (déterministe ∪ trigram `%` ∪ phonétique `&&` ∪ HNSW `<=>` LIMIT 50) ; piège : GIN `gin_trgm_ops` accélère `%`, **pas** `ORDER BY similarity()` → filtrer par `%` puis trier ; (2) FS log-odds `total = log2(λ/(1−λ)) + Σ log2(m_i/u_i ou (1−m_i)/(1−u_i))`, `p = BF/(1+BF)` ; (3) décision 2-seuils `p≥0.95 auto_merge` / `0.55-0.95 gray-zone→LLM` / `<0.55 reject` ; (4) clustering = composantes connexes union-find sur arêtes `auto_merge ∧ ¬must_not_link`, **garde anti-sur-fusion** : seuiller avant la CC, plafonner la taille de cluster, gros cluster → review ; (5) adjudication LLM gray-zone seulement (Haiku par défaut, Sonnet pour les paires serrées/conflit, prompt-caching du préfixe rubrique).

### Où ça se branche (R2)
Chaque source appelle `ingestObservation` au lieu d'écrire `companies` directement. Le bus n'appelle `recordCompanySignal` (`record-signal.ts:86`) **qu'avec le `subjectId` rendu par `resolveSubject`** — invariant fondateur : *aucun signal n'est écrit sur un sujet non résolu*. `clusterId`→`subjectId`→`companies.priorityScore` (`core.ts:92`). `SAME_AS` (table dédiée) **ne se mélange jamais** au `KNOWS` (sinon casse `findWarmPathsToCompanies`).

### REUTILISE vs NET-NEW
REUTILISE : `identity.ts:44/67/92/103/125`, `precedence.ts:9/53`, `similarity.ts:6/24`, `group.ts:9/25`, `companies/identity.ts:27`, `core.ts:111-113/123-125`, `ensure-vector-index.ts:18/52-57`, `intelligence.ts:242/249/251/253-254`, `relationship-graph.ts:400/414`, `record-signal.ts:86`. NET-NEW : `db/schema/identity-graph.ts` (3 tables), `db/ensure-identity-graph-indexes.ts`, `lib/identity-graph/{ingest,blocking,fs-score,cluster,resolve}.ts`, `inngest/resolve-identity-batch.ts`.

### Effort : **≈ 11,5 j-h** (cœur in-Postgres+TS ~8 ; agent+calibration +3,5).

---

## 3. Moteur — Extraction sémantique de signaux (embeddings + LLM, au-delà du regex)

### Le problème dur + pourquoi moat
Classer un *pain-trigger* (« ils embauchent pour scaler », « ils remplacent un concurrent », « contrainte de conformité ») depuis du texte non-structuré — job description, filing, README, news — en gérant **négation et composition** (« *gel* des embauches », « *backfill* », « *pas* de SOC2 »), avec **preuve verbatim ancrée** et confiance calibrée — là où les détecteurs actuels comptent des mots-clés (`tam-stream/signals/hiring-intent.ts:19` = `count>0`) ou des seuils headcount (`skills/signals/job-posting-intent/handler.ts:56` = `growthRate>0.1`, `:75` = `>50 employés`). Moat : (a) meilleur ranking (le bon trigger, pas le bruit headcount), (b) **la citation réutilisée telle quelle dans le draft cité** — ferme la boucle research→copy que la fabrication-gate protège, (c) le *flywheel de calibration* : chaque outcome `won/lost` ré-étalonne les seuils par trigger et par tenant (`signal-outcomes.ts:59`), donnée qu'un concurrent regex n'accumule pas.

### Techno SOTA retenue + trade-off
Pipeline **retrieve → extract → gate → synthesize**, 2 étages LLM, **pré-filtre embeddings gratuit** (kNN vs exemplaires étiquetés, `margin` = confiance discriminative). Trade-off : **pas de `confidence` brute du LLM** (sur-confiant, mal calibré ; Claude n'expose pas de logprobs) → fusion `min(normalize(margin), self-consistency-agreement)` puis **calibration isotonic** sur outcomes. La parade négation = un champ **`polarity` explicite** (`present`|`absent`|`negated`) + seed obligatoire d'exemplaires niés. Embedding = **canal de blocking uniquement**, jamais preuve seule (sur-matching mono-mot).

### Design concret
**Extensions** : `vector` (présent) ; `pg_trgm` optionnel (grounding fuzzy fait en TS sinon). **Aucune autre.**

**Docs-signaux** : RÉUTILISE la table `embeddings` (reste `vector(1536)`), convention `entity_type='signal_doc:jobpost|filing|readme|news'`, `entity_id='<companyId>:<docHash>:<chunkIdx>'`, chunk ≤400 char via `chunkDoc` (généralise `chunk-transcript.ts:53`, pas la troncature destructrice de `embedEntity:34`). Zéro DDL.

**4 tables NET-NEW** (migrations 0096-0099) : `signal_trigger_exemplars` (texte + `polarity` + `embedding` + HNSW ; seed 50-200/trigger dont negated) ; `signal_trigger_centroid` (cache moyenne L2, rafraîchi par job) ; `signal_extractions` (audit durable + **frontière R2** : `evidence_quote`, `conf_margin`, `conf_agreement`, `conf_calibrated`, `grounded`, `source_url`) ; `signal_calibration` (params isotonic/Platt par `(tenant,trigger)`).

**Signatures** (`lib/signals/semantic/`) : `chunkDoc`, `embedSignalDocs` (`embedMany` AI SDK v6, upsert idempotent ON CONFLICT), `prefilterTriggers` (kNN `<=>` + vote + `margin`), `extractSignals` (`tracedGenerateObject` Haiku, schema Zod avec `polarity`, fail-open), `groundQuote` (token-overlap Jaccard ≥0.9, réutilise `fabrication-gate.ts:91`), `fuseConfidence`+`calibrate`+`toStrength`, `synthesizeAngle` (Sonnet, garde ≥1 grounded), `runSemanticSignals` (orchestrateur).

**Algorithme** : Stage 0 kNN (≈coût embedding, élimine ~90 % du texte à coût LLM nul) → Stage 1 Haiku `generateObject` avec `polarity` → Stage 1.5 gate d'ancrage (drop si non-grounded, self-consistency=3 optionnel) → Stage 2 Sonnet rare (≥1 `present` ancré) → fusion `min(margin, agreement)` calibrée isotonic (cold-start = identité + plafond `medium`, sûr) → `recordCompanySignal`.

### Où ça se branche (R2)
Remplace `detectHiringIntent` (`hiring-intent.ts:19`) par un détecteur sémantique de **même interface** `SignalDetector` ; supprime les seuils de `job-posting-intent/handler.ts:56-101`. **Scoring inchangé** : écrit dans `properties.signals[]`, lu par `bestMultiplierForCompany` (`signal-score-daily.ts:72-93`). Ajouter les nouveaux triggers à `SIGNAL_TTL_DAYS` (`freshness.ts:31`) et `SIGNAL_PRIORS` (`signal-outcomes.ts:59`). L'`evidenceQuote` ancré devient une `publicContent[].quote` → passe `decideFabricationGate` sans la déclencher. `signal_extractions` = l'event durable que le signal-bus R2 lira sans refactor.

### REUTILISE vs NET-NEW
REUTILISE : `embeddings.ts:23/64/236/162`, `ensure-vector-index.ts:17/52`, `ai-provider.ts:227/186/223/251`, `traced-ai.ts:152/160`, `fabrication-gate.ts:138/173/91/111`, `personalization-judge.ts:16`, `chunk-transcript.ts:53/234`, `record-signal.ts:86`, `freshness.ts:31`, `signal-outcomes.ts:59`. NET-NEW : 4 tables + 9 modules TS + 2 fonctions Inngest. **Zéro ML auto-hébergé.**

### Effort : **≈ 62 j-h (~8 j-dev)**.

---

## 4. Moteur — Temporel / velocity event-source

### Le problème dur + pourquoi moat
Le stockage des signaux est un cache *sans état temporel* — chaque signal écrasé par type (`upsertSignalEntry`, `record-signal.ts:73-79`) ou poussé sans dédup (`signal-monitor.ts:240-251`), fraîcheur = booléen (`isSignalFresh`, `freshness.ts:91-104`). On ne sait jamais si une métrique **accélère ou décélère**. Moat : **aucune source ne vend la dérivée**. La velocity (+18 employés MoM en accélération, releases ×2 sur 60j, embauche linéaire→exponentielle) n'existe que si **on historise le niveau à chaque poll puis on différencie**. Le premier qui historise sur 6-12 mois possède une intelligence non-achetable rétroactivement. Le freshness binaire jette précisément la donnée qui rend la dérivée calculable.

### Techno SOTA retenue + trade-off
**Event-log append-only bitemporel léger** (transaction-time `observed_at` + valid-time `effective_at`) comme source de vérité, `properties.signals[]` devenant un **cache projeté**. **Decay continu** (exponentiel memoryless) remplace le booléen. **Vélocité = pente OLS** sur fenêtre glissante (robuste au bruit) + accélération = Δ2. Trade-off : on **évite l'océan** A3 (bitemporel complet `EXCLUDE USING gist` sur le log haut-débit sérialiserait les writes) — réservé à `entity_state` faible-write si jamais. **Zéro LLM** dans ce moteur (formules SQL/TS pures, 100 % testable). Partitions pilotées par **Inngest, pas pg_partman/pg_cron** (workers non fiables sous scale-to-zero).

### Design concret
**Extensions** : `btree_gist` seulement si option A3 ; sinon **aucune** (partition déclarative + range types + window functions natifs PG14-18).

**Migration `0107_signal_event.sql`** (runner custom — Drizzle ne génère pas PARTITION BY) : `signal_event` (`entity_type/id`, `type`, `strength`, `metric`+`metric_value` pour les niveaux, `effective_at`, `observed_at`, `dedup_hash`, PK `(id, observed_at)`) **PARTITION BY RANGE (observed_at)** ; index B-tree `(tenant,entity,type,effective_at DESC)` (PAS d'EXCLUDE GiST sur le log) ; uniqueIndex `(dedup_hash, observed_at)` anti-jitter ; partitions mensuelles pré-créées par Inngest.

**Migration `0108_metric_snapshot_velocity.sql`** : `entity_metric_snapshot` (généralise `metric_rollup_snapshot`, `outbound.ts:519-534` ; uniqueIndex `(tenant,entity,metric,bucket_day)` dédup idempotente) + `entity_velocity` (cache dérivé queryable : `level`, `velocity`, `acceleration`, `rel_rate=velocity/level`, `window_days`).

**Signatures** : `recordSignalEvent` (INSERT-only + projette le cache ; `recordCompanySignal` devient une projection du dernier event), `decayWeight(type,observedAt)` = `exp(-ln2·age/halfLife[type])` avec `SIGNAL_HALF_LIFE_DAYS=SIGNAL_TTL_DAYS` (rétro-compat : w=0.5 au seuil TTL actuel ; null TTL → 1), `deriveVelocity(series)` (OLS pure), `velocityModulator(relRate)` = `clamp(1+2.0·rel, 0.7, 1.6)`.

**Algorithme** : snapshot sur grille-jour `ON CONFLICT DO NOTHING` (re-poll = no-op) ; velocity = pente OLS via `LAG() OVER (PARTITION BY entity,metric ORDER BY bucket_day)` ; `rel_rate = velocity/NULLIF(level,0)` (comparable boîte de 20 vs 2000) ; <2 buckets → null → modulateur 1.0. Decay upgradable par-type post-backtest (Weibull `k≠1` — jamais shippé non tuné). Cron `velocity-derive-daily` clone de `signal-score-daily` + step `partition-maintenance` (création N mois d'avance + `DROP TABLE` rétention).

### Où ça se branche (R2)
`per-company.ts:386-405` persiste déjà niveaux → ajout `recordSignalEvent({metric:"headcount",...})` (1ʳᵉ photo dès l'insertion TAM). Les 3 write points (`record-signal.ts:101`, `signal-monitor.ts:240`, `per-company.ts:392`) appellent aussi `recordSignalEvent` (outbox applicatif, pas de logical replication Neon — referme aussi la race `signal-monitor.ts:250`). Scoring : `if(!isSignalFresh) continue` (`signal-score-daily.ts:88`) → `mult *= decayWeight(...)` ; `computePriorityScore` reçoit `relRate` depuis `entity_velocity`. Kairos : `decideAcceleration` (`priority-score.ts:164`) gagne une condition `acceleration > seuil`.

### REUTILISE vs NET-NEW
REUTILISE : `outbound.ts:519-554`, `signal-score-daily.ts:72-93/95-273`, `priority-score.ts:54-76/164-184`, `freshness.ts:31-71`, `record-signal.ts:86-111`, `per-company.ts:446-459`, `proposals.ts:17-21`, `scripts/apply-migrations.ts`. NET-NEW : `db/schema/signals-temporal.ts`, migrations 0107/0108, `lib/signals/{event-log,decay,velocity}.ts`, `lib/scoring` velocityModulator, `inngest/velocity-derive-daily.ts`.

### Effort : **≈ 7,5-10,5 j-h** (A1 sans Weibull/A3). Weibull tuné +2-3 ; A3 bitemporel +3-4 (océan, à flaguer).

---

## 5. Moteur — Fusion probabiliste + propension-to-buy calibrée

### Le problème dur + pourquoi moat
Transformer une nuée de signaux faibles, **corrélés**, hétérogènes en UNE probabilité de win **calibrée** (« 23 % », pas « score 1.8× »), apprise par tenant mais robuste à n<10 deals, sans pipeline ML hors-stack — puis trier par **uplift** (qui contacter change l'issue) et **timing** (quand). Moat : (a) boucle outcome→poids fermée dans le produit (`signal_outcomes` existe, `intelligence.ts:222`) réentraîne chaque nuit ; (b) pooling cross-tenant anonymisé (k-anon ≥10) → un tenant neuf hérite du prior réseau dès J0 ; (c) une vraie proba autorise un *seuil absolu* (« n'enrôle pas sous 8 % »), un budget par espérance de gain, une UI « 1 chance sur 4 » — impossible avec le score ordinal actuel (`priority-score.ts:28-29` : « used only for SORTING »).

### Techno SOTA retenue + trade-off
**Régression logistique pénalisée (IRLS + L2 ancré sur le prior)** — le poids appris EST le Weight-of-Evidence, deux signaux corrélés **partagent** le poids au lieu de le compter 2× (ce que ni le multiply de risques relatifs `signal-outcomes.ts:173` ni la somme `buyer-intent.ts:603` ne font). **Calibration Platt/beta** (pas isotonic sous ~200 positifs). **Pooling hiérarchique** global→tenant via `priorCoef`. Trade-off décisif : **aucune extension** — PostgresML/MADlib exigent superuser, indisponibles sur Neon serverless → entraînement TS pur (≤40 features, matrice 40×40, Gauss-Jordan trivial, <100 ms). GBM/ONNX reste optionnel phase 4 via `onnxruntime-web` WASM.

### Design concret
**Migration `0107_propensity_engine.sql`** + `db/schema/propensity.ts` NET-NEW : `scoring_models` (`coefficients jsonb`, `calibrator`, `featureSpec` gelé anti-skew, `metrics` {auc,brier,ece,logloss}, `tenantId NULL = global`), `feature_snapshots` (**feature store offline PIT** : `as_of` garantit zéro fuite, `treated` pour uplift), `entity_features` (online O(1)). Colonnes NET-NEW sur `companies` : `propensity real`, `propensity_uplift`, `propensity_computed_at` + index. `signal_outcomes` **devient le training set** (zéro nouvelle table de labels).

**Signatures** (`lib/scoring/propensity/`) : `encodeFeatures` (encodage UNIQUE train+serve, signaux one-hot bruts non pré-sommés), `trainPenalizedLogit(rows, {l2, priorCoef=log(SIGNAL_PRIORS), classWeight})`, `predictLogit`, `fitCalibrator`+`applyCalibrator`, `scorePropensity` (→ p + topFactors), `propensityToMultiplier(p, base)` = `clamp(odds(p)/odds(base), 0.5, 2.5)` (pont rétro-compat), `sgdUpdate` (online event-driven).

**Algorithme IRLS** : `β←priorCoef` (démarrage informé) ; itérer `β←(XᵀWX+λI)⁻¹XᵀWz + λ·priorCoef` (ridge **vers le prior**, pas vers 0) ; `λ=λ0·MIN_SAMPLE_SIZE/(MIN_SAMPLE_SIZE+nPos)` (lissage continu conjoint = le `MIN_SAMPLE_SIZE=10` actuel). Calibration : split temporel disjoint (`as_of` croissant, pas de fuite). Phases : P2 timing = hasard à temps discret (réutilise `trainPenalizedLogit` sur person-period, branche `priority-score.ts:174`) ; P3 uplift = T-learner (holdout `treated=0`, CATE, éval Qini/AUUC, ≥30+30 positifs).

### Où ça se branche (R2)
Dans `signal-score-daily.ts:198`, remplacer `bestMultiplierForCompany` par : charger `scoring_model` actif → `encodeFeatures` → `scorePropensity` → persister `propensity=p` **et** `signalMultiplier=propensityToMultiplier(p,base)` pour garder `computePriorityScore:202` **intact** (signatures inchangées, zéro régression — fallback `getSignalMultipliers` si modèle absent). Entraînement : `inngest/propensity-train-nightly.ts` (cron `30 5 * * *`, global d'abord puis tenant régularisé vers lui). Snapshot PIT à chaque enrôlement (`outbound.ts:101`), label backfillé par `recordDealOutcome` (`signal-outcomes.ts:97`).

### REUTILISE vs NET-NEW
REUTILISE : `predictive-scorer.ts:234-261/141-175`, `company-model-trainer.ts:49-60`, `signal_outcomes`+`signal-outcomes.ts:59-83/97-156`, `signal-detectors.ts:144-158`, `freshness.ts:91`, `anonymized-signals.ts:56-212`, `priority-score.ts:70-76/164-184`, `signal-score-daily.ts:72-273`, `agent_traces.estimated_cost`. NET-NEW : `db/schema/propensity.ts`, migration 0107, `lib/scoring/propensity/{features,logit,calibrate,score,online}.ts`, `inngest/propensity-train-nightly.ts`.

### Effort : MVP (P1a+P1b+P1c, vraie proba calibrée) **≈ 7,5 j-h** ; complet hors GBM **≈ 15 j-h**.

---

## 6. Moteur — Graphe warm-path

### Le problème dur + pourquoi moat
Calculer, pour **chaque** compte d'un TAM froid (10²-10⁵), le **chemin d'intro le plus fort à degré borné** depuis l'équipe founder, **plus quel connecteur fera réellement l'intro** (influence personnalisée), assez cheap pour s'afficher sur chaque ligne ET nourrir le scoring quotidien. Moat : le graphe est **propriétaire et compounding** — construit de la fréquence email/meeting du tenant (`buildKnowsFromActivities`, `relationship-graph.ts:131`) + son réseau LinkedIn 1er degré (`syncLinkedInRelations`, `graph-sync.ts:105`), données qu'aucune liste achetée n'a. Les warm intros convertissent en multiples du cold ; le moteur rend cet avantage *systématique* (chaque compte scoré par reachability), pas anecdotique.

### Techno SOTA retenue + trade-off
**Récursif-CTE multi-source borné degré-k** (étend le kernel `graph-reasoning.ts:85`) + **table matérialisée `warm_paths`** + **forward-push Personalized PageRank** (Andersen-Chung-Lang, local — coût ∝ voisinage de l'équipe, pas le graphe entier). Trade-off décisif dicté par l'infra (Supabase Supavisor transaction-pooler 6543) : **Apache AGE écarté** (non installable + `LOAD 'age'` incompatible pooling transaction-mode) ; **pgRouting différé derrière un flag** (jusqu'à >10⁵ arêtes/tenant). Le core **ne requiert aucune extension** (CTE natif). Heavy precompute sur le port session 5432 (`DATABASE_URL_OWNER`).

### Design concret
**2 tables NET-NEW** (ajoutées à `intelligence.ts`) : `warm_paths` (`target_company_id`, `target_contact_id`, `via_user_id`, `connector_contact_id`, `degree 1..3`, `path_strength` ∏confidence, `connector_influence` PPR, `last_interaction_at`, `path_node_ids jsonb` ; index `(tenant,company,strength)` hot read + uniqueIndex anti-fuite) + `node_influence` (`ppr` par node, PK `(tenant,node)`). **2 index partiels NET-NEW** sur `context_graph_edges` : `cge_knows_src_idx`/`cge_knows_tgt_idx WHERE relation_type='KNOWS' AND t_invalid IS NULL`.

**Signatures** : `findWarmPathsKHop({tenantId, companyIds, maxDegree=3, maxFanout=500})` (remplace le 1-hop `relationship-graph.ts:263` et le BFS naïf `campaign-engine/warm-path.ts` — un seul round-trip), `forwardPushPPR(edges, seeds, {alpha:0.2, eps:1e-4})`, `refreshWarmGraph(tenantId)`.

**Algorithme** : (a) CTE base-case = **tous** les nodes équipe en une query, colonnes `min hop` + `∏ confidence`, filtre `KNOWS ∧ t_invalid IS NULL`, **dédup par-frontière `DISTINCT ON (next.id) ORDER BY prod_strength DESC` + degré-guard `out-degree>maxFanout` + cap depth≤3** (défense hub-fanout, le mode d'échec 47s/335k-nœuds) ; (b) fusion d'arête REUTILISE `fuseKnowsConfidence` (`relationship-graph.ts:400`, strongest+0.05/canal, cap 0.95), path strength = max-product ; (c) decay temporel `strength *= exp(-Δdays/τ)`, τ≈120d, au moment de la matérialisation (une relation lapsée auto-démote) ; (d) PPR forward-push ~30 lignes en mémoire dans le step Inngest ; (e) precompute event-driven dans le cron nightly (`relationship-graph-builder.ts:17`) + event `relationship-graph/rebuild`.

**Le multiplicateur warm (changement de formule, flaggé)** : `access_mod` borné `[FLOOR,1]` ne peut exprimer le 3-5× voulu → **terme dédié capé** `warmModulator(strength, degree)` = `1+(2.0-1)·strength·degreeDamp` (degré-1=1.0, 2=0.6, 3=0.35), `∈[1,2.0]`. La bande passe de `~[0,2.5]` à `~[0,5.0]` — **changement documenté** dans le header `priority-score.ts` + `score-scale.test.ts` (rien ne keye sur la magnitude absolue, `priority-score.ts:29` = sort-only).

### Où ça se branche (R2)
`per-company.ts:308` pointe vers `findWarmPathsKHop` (degré-3) ; un degré-1/2 émet `recordCompanySignal({type:"warm_connection",...,person:{contactId:connector}})` (généralise `graph-sync.ts:90` au-delà du degré-1). `signal-score-daily.ts:191-208` joint `warm_paths` → `warmPathStrength`/`warmPathDegree` → l'autopilot enrôle les comptes chauds d'abord **sans changement** (`candidates.ts:140`). `connectorInfluence` (PPR) brise les égalités → le `SignalPerson` hint qui route le draft. **LLM quasi nul** : l'explication de chemin = templating (`buildPathExplanation`, `graph-reasoning.ts:473`), seul l'intro-request draft touche Haiku prompt-caché.

### REUTILISE vs NET-NEW
REUTILISE : `intelligence.ts:129-147/242-270`, `graph-reasoning.ts:85-193/473`, `relationship-graph.ts:111/263-344/400-414`, `campaign-engine/warm-path.ts:50-119`, `graph-sync.ts:76-229`, `relationship-graph-builder.ts:17/57-62`, `priority-score.ts:70-76/105-113`, `signal-score-daily.ts:191-208`, `candidates.ts:135-198`, `per-company.ts:308-331`, `record-signal.ts:86`, `db/index.ts:31`. NET-NEW : `warm_paths`+`node_influence` (+migration owner), 2 index partiels, `lib/context/warm-graph.ts`, warmModulator. **Consolider les 2 pools dupliqués** (`graph-reasoning.ts:25`, `context-graph.ts:20`) sur `db/index.ts`, `prepare:false` pour Supavisor.

### Effort : **≈ 32-45 h (4-6 j)**. pgRouting si jamais : +10-14 h (isolé).

---

## 7. Moteur — Agent de recherche autonome cost-aware (Claygent-equivalent)

### Le problème dur + pourquoi moat
Produire, à la demande et à **coût borné**, un dossier prospect **dont chaque fait spécifique est sourcé sur une URL vérifiée ET dont le contenu de la source contient réellement la citation** — au lieu d'un LLM qui boucle sans garde-fou, hallucine 11-57 % de ses citations, et brûle le budget tenant en quelques prospects. Moat : le grounding **vérifié-au-contenu** est ce qui sépare un GPT-Researcher d'un wrapper, et il est **composé** : research vérifié → `intelligence_briefs` → `fabrication-gate` → copy → `recordCompanySignal` → `priority_score`. Chaque maillon existe séparément ; le moteur les chaîne **sous un budget durable**. La barrière n'est pas un modèle, c'est l'intégration cost-aware + anti-hallucination + durable.

### Techno SOTA retenue + trade-off
**Boucle agentique tiérée par budget** (le « budget pattern » Anthropic) + **routage par step** (Sonnet planning/synthèse, Haiku extraction) + **prompt caching** system/tool-defs + **vérification à 3 niveaux** (URL-alive HEAD → content-match GET body → critic LLM grounded-only). Trade-off : **rester sur Inngest** (`step.run` = replay durable, zéro nouvelle facture) plutôt que WDK+Queues (2ᵉ brique durable beta sans gain net). Réseau modèle-piloté confiné à `browsePage` (SSRF-hardened) — **pas** de `fetchUrl` libre. Versions vérifiées : `ai@6.0.199`, `@ai-sdk/anthropic@3.0.82` → `experimental_output`, pas `output` (v7).

### Design concret
**Aucune extension pg.** `gen_random_uuid()` (pgcrypto présent) ou `crypto.randomUUID()` côté Drizzle. **1 table NET-NEW `research_runs`** (durabilité + observabilité distincte du brief) : `tier` (`shallow`|`standard`|`deep`), `status`, **budget ledger** (`budget_usd`, `spent_usd`, `max_steps`, `max_subagents`, `steps_used`, `tool_calls_used`), **token economics séparant le cache** (`input/output/cache_write/cache_read_tokens` — sinon gain invisible), **résultat de vérif** (`claims_total/verified/dropped` = l'observabilité du moat), `brief_id`. **Zéro changement** sur `intelligence_briefs` ni `agent_traces`.

**Signatures** : `RunBudget` + `decideTier({priorityScore, briefAgeDays, override})` (shallow 3 steps/$0.02 · standard 8/$0.08 · deep 14/$0.40) + `budgetExhausted` ; `runResearchAgent` gagne `budget?` + `stopWhen` composite `[stepCountIs(maxSteps), ({steps})=>stepUsd≥maxUsd]` ; `verifyCitations(rootDomain, items)` (N1 HEAD `verify-source.ts:26` + N2 re-fetch body content-match) ; `criticGroundDossier({tenantId, dossier, ledger})` (wrap `judgeFabrication`, `fabrication-gate.ts:173`).

**Algorithme** : (1) `decideTier` ∝ valeur prospect (`priority≥1.8` ou override → deep ; brief frais <14j → shallow) ; (2) routage par step — **forcer Sonnet sur le DERNIER step** (output step), piège connu `research-agent.ts:95` (Haiku casse la synthèse) ; (3) coupure budget composite + contrôle inter-step Inngest (`stopWhen` ne coupe pas en milieu de step) ; (4) **prompt caching** breakpoint `ephemeral` sur `RESEARCH_SYSTEM`+tool-defs (1h avant 5min, bloc <1024 tok non caché ; piège : le flywheel system de `traced-ai.ts:96` peut casser le breakpoint → poser `cacheControl` après résolution) ; (5) **comptabilité cache NET-NEW** dans `model-pricing.ts` (`cacheRead≈0.10×input`, `cacheWrite≈1.25×`) + `traced-ai.ts:113` lit `cacheCreationInputTokens`/`cacheReadInputTokens` ; (6) vérif N1→N2→N3 (content-match = le delta qui attrape l'URL vivante mais attribution fausse, via `normNum` tolérance numérique) ; (7) fan-out `deep` ≤4 sous-agents `Promise.all` borné, jamais défaut.

### Où ça se branche (R2)
`prepare.ts:38 prepareProspect` (autopilot) et le chemin `RESEARCH_AGENT_ENABLED` de `build-intelligence-brief.ts:78` appellent le moteur. Sortie bus : un fait daté+vérifié → `SignalEntry` via `recordCompanySignal:86` (`type:"hiring_intent"`, `source:"research-agent"`, `person`). Sortie scoring : ce signal **domine** `computePriorityScore:70` et peut déclencher `decideAcceleration:164`. Le `Source.verified` du contrat TAM (`events.ts:41`) est désormais honoré end-to-end (pas juste au HEAD). `fabrication-gate` reste **aussi** en aval (défense en profondeur).

### REUTILISE vs NET-NEW
REUTILISE : `research-agent.ts:104/98/116-118`, `research-agent-tools.ts:26/54/86`, `browse-page.ts:35-88`, `verify-source.ts:26`, `traced-ai.ts:78/91/113`, `llm-budget.ts:135/36`, `model-pricing.ts:57/86`, `cost-tracker.ts:22/86`, `ai-provider.ts:126/227/223`, `fabrication-gate.ts:138/173/91`, `build-intelligence-brief.ts:78-148`, `inngest/research-agent.ts:42`, `record-signal.ts:86`, `freshness.ts:31/91`. NET-NEW : `research_runs` + migration, `lib/campaign-engine/{research-budget,citation-verify,research-critic}.ts`, `db/schema/research-runs.ts`, MODIFY `model-pricing.ts`+`traced-ai.ts` (tokens cache).

### Effort : **≈ 13,5 j-h** (~12 sans fan-out).

---

## 8. Le modèle de données unifié

Les 6 moteurs ne sont pas 6 silos : ils partagent **4 stores**, chacun déjà partiellement présent, ce qui est précisément ce qui rend l'ensemble cohérent (et copiable seulement en bloc).

**(A) Identity graph — la colonne vertébrale des sujets.** `identity_node`/`identity_edge`/`identity_fs_weights` (§2) produisent le `subject_id` que **tous** les autres moteurs consomment. Invariant : aucun event/signal/feature n'est écrit sur un sujet non résolu. `subject_id` → FK `companies.id`/`contacts.id` (`core.ts`), donc le reste du schéma existant ne bouge pas — l'identity graph est une couche *en amont*, additive.

**(B) Event log bitemporel des signaux — la source de vérité temporelle.** `signal_event` (§4, append-only, `observed_at`/`effective_at`) devient la vérité ; `companies.properties.signals[]` (`record-signal.ts:86`) devient un **cache projeté reconstructible**. Les moteurs §3 (extraction), §7 (research) et §6 (warm) **émettent** dans ce log via `recordSignalEvent`/`recordCompanySignal` ; les moteurs §4 (velocity) et §5 (propension) le **consomment** (dérivée + features). C'est ici que se branche la **table `signals` de R2** : `signal_extractions` (§3) et `signal_event` (§4) sont les events durables que le signal-bus R2 lira — le moteur ne refactore pas quand la surface R2 atterrit.

**(C) Feature store — offline PIT + online.** `feature_snapshots` (PIT, `as_of`, anti-fuite) + `entity_features` (online O(1)) (§5). Il agrège : signaux extraits (§3), dérivées velocity (`entity_velocity`, §4), warm-path strength (`warm_paths`, §6), firmographics. `encodeFeatures` est un **dict ouvert** : chaque nouveau moteur ajoute une source de features sans toucher au trainer.

**(D) Vector store — un seul, partagé.** La table `embeddings vector(1536)` + HNSW (`ensure-vector-index.ts`) sert simultanément : blocking sémantique d'identité (§2), chunks `signal_doc` d'extraction (§3), tie-break d'influence warm (§6). **Une seule dimension figée (1536, text-embedding-3-small)** — contrainte partagée : changer de modèle d'embedding casse les 3 usages, donc migration = colonne dédiée versionnée, jamais in-place.

**Schéma d'ensemble (flux) :**
```
  sources brutes
       │ ingestObservation
       ▼
 [A] IDENTITY GRAPH ── subject_id (invariant) ──────────────┐
       │                                                     │
       ▼ (sujet résolu)                                      │
 [B] SIGNAL EVENT LOG (bitemporel)  ◄── §3 extraction        │
       │  ▲                          ◄── §7 research         │
       │  └── §6 warm_connection                             │
       ├──► cache projeté: properties.signals[] ── §R2 bus   │
       ▼                                                     ▼
 [C] FEATURE STORE (PIT + online) ◄── velocity §4, warm §6, firmo
       │
       ▼
 [§5] PROPENSITY (logit calibré) ──► companies.propensity / priority_score
                                          ▲
 [D] VECTOR STORE (embeddings 1536) ──────┘ (blocking §2, docs §3, influence §6)
```
**Comment ça étend la table `signals` de R2 (sect. 4)** : R2 définit la *taxonomy* et le *bus* (le quoi/où d'un signal en surface). Cette couche fournit le *comment profond* — l'identity graph garantit que le `subject_id` du signal est correct, l'event log donne sa **dérivée** et son **decay**, le feature store le rend **apprenable**, le vector store le rend **sémantique**. La table `signals` R2 reste le contrat de surface ; `signal_event`/`signal_extractions` sont sa source de vérité historisée.

---

## 9. L'économie

**Principe de mesure** (mémoire `anthropic-cost-audit`) : coût mesuré via `agent_traces.estimated_cost` (`cost-tracker.ts:22`, `intelligence.ts:392`), **JAMAIS** via `llm_calls` (<5 % de couverture). Pricing single-source `model-pricing.ts:57/86` (`resolveModelPrice`/`computeCallCostUsd`), à étendre des lignes `cacheWrite`/`cacheRead` (§7.3).

**Les 4 leviers, chiffrés :**

1. **Routage Haiku/Sonnet par tier** (`ai-provider.ts:227/186`). Haiku (`claude-haiku-4-5`) absorbe ~99 % du volume (extraction, classification, gray-zone d'identité, steps de research non-output) ; Sonnet (`claude-sonnet-4-6`) réservé aux paires d'identité serrées, à la synthèse research (output step), aux angles `present` ancrés. Sonnet $3/$15 vs Haiku ~$1/$5 par MTok.

2. **Prompt caching** (§7.2). Lecture cache = **0,10× input** (−90 %), écriture 1,25× (5min)/2,0× (1h). Sur la boucle research 8 steps rejouant ~2k tok system + tool-defs (~90 % du prompt répété) → **−50 à −80 % d'input réel**. Même levier sur le préfixe rubrique de l'agent d'identité gray-zone (§2.6) et l'intro-draft warm (§6).

3. **Embeddings** = quasi-nul. `text-embedding-3-small` ~$0,02/1M tok ; un job-post ≈ $0,0001. Le Stage 0 kNN (§3) élimine ~90 % du texte **à coût LLM nul** avant tout appel Haiku — c'est le principal contrôle de coût de l'extraction.

4. **Fan-out borné par budget** (§7.5). `RunBudget` (`research-budget.ts` NET-NEW) cape steps/tool-calls/USD par tier ; `stopWhen` composite coupe sur le coût réel + contrôle inter-step Inngest. Le fan-out `deep` (~15× chat) est **strictement gardé** par tier + `maxUsd` — jamais le défaut. Cap mensuel par tenant en dernier rempart (`llm-budget.ts:135 enforceLlmBudget`).

**Coût d'1 company analysée à fond vs 1000.**
- *Shallow* (rafraîchir signaux, brief frais) : embeddings + 1-2 Haiku ≈ **$0,005-0,02**.
- *Standard* (8 steps, Sonnet plan+output, Haiku milieu, caching) : **≈ $0,05-0,08** (le cap `maxUsd` du tier).
- *Deep* (14 steps + fan-out ≤4) : cap **$0,40**.
- Identité : 1 résolution = blocking SQL (gratuit) + FS TS (gratuit) ; seule la gray-zone touche Haiku batché → **<$0,002/sujet amorti**.
- Velocity + propension : **$0 LLM** (formules SQL/TS pures, <100 ms par tenant en cron nightly).

**1000 companies** : si 80 % shallow / 18 % standard / 2 % deep → `800×$0,01 + 180×$0,07 + 20×$0,40 = $8 + $12,6 + $8 ≈ $29` pour le batch research, **plus** ~$0,10 d'identité + ~$0 velocity/propension/warm (batch SQL). L'ordre de grandeur : **un TAM de 1000 comptes analysé à fond pour ~$30**, dominé par le tier deep — donc piloté par `decideTier` ∝ `priority_score`, pas uniforme. C'est ce que le budget tiering rend soutenable vs un wrapper qui lance Sonnet plein-prompt sur chaque ligne (~$0,30+/company = $300+/1000, 10× plus).

---

## 10. Séquençage + le moat

| # | Moteur | Effort j-h | Prérequis | Ce qu'il débloque |
|---|---|---|---|---|
| 2 | Résolution d'identité | ~11,5 | `vector`+`pg_trgm`+`fuzzystrmatch` ; identity.ts/precedence.ts | `subject_id` propre → **tout** l'aval cesse de se diluer. Fondation. |
| 3 | Extraction sémantique | ~62 (~8 j-dev) | `vector` ; embeddings.ts/fabrication-gate.ts | Triggers niés/composés + citations ancrées → meilleur ranking + copy citée. |
| 4 | Temporel/velocity | ~7,5-10,5 | runner migration custom ; outbound.ts snapshot pattern | La **dérivée** (accélération) — le seul actif non-achetable rétroactivement. Démarre froid, compound en semaines. |
| 5 | Fusion + propension | ~7,5 (MVP) | `signal_outcomes` ; predictive-scorer.ts/anonymized-signals.ts | Vraie **proba calibrée** → seuil absolu, budget par espérance, uplift/timing. |
| 6 | Warm-path graphe | ~32-45 h (4-6 j) | CTE natif ; graph-reasoning.ts/relationship-graph.ts | Chemin chaud degré-k scoré sur chaque compte → autopilot enrôle chaud d'abord. |
| 7 | Research agent cost-aware | ~13,5 | Inngest ; research-agent.ts/fabrication-gate.ts | Dossier **vérifié-au-contenu** sous budget → ferme research→copy→signal→score. |

**Le MINIMUM qui crée déjà un moat** : **§2 (identité) + §4 (velocity) + §7 (research vérifié)**, soit **≈ 32-35 j-h (~4-5 j-dev cumulés sur le câblage, plus le seed d'identité)**. Raison : §2 garantit que tout signal porte sur le bon sujet (sans quoi tout le reste est bruit) ; §4 commence à **historiser dès J0** la donnée propriétaire que personne ne peut acheter plus tard ; §7 produit des faits **sourcés-vérifiés** que la copy peut citer sans fabrication. Ces trois-là tournent **sans modèle ML entraîné** (pas de cold-start outcome) — ils créent l'actif pendant que §5 (propension) accumule les labels nécessaires à sa calibration. §3, §5, §6 sont des amplificateurs qui exploitent la fondation.

**Pourquoi ce stack profond est défendable.** (1) **Donnée historisée propriétaire** : la dérivée de velocity (§4) n'existe que si on a snapshotté soi-même sur des mois — un concurrent qui démarre aujourd'hui est en retard de tout l'historique, irrattrapable. (2) **Identité résolue** : le graphe de sujets (§2) est construit du corpus d'observations du tenant — sans ce corpus, le même algo Fellegi-Sunter rend des clusters vides. (3) **Fusion calibrée sur outcomes réels** : la propension (§5) apprend des `won/lost` du tenant + pool réseau anonymisé — données qu'aucune liste ni API ne contient. (4) **Jugement LLM grounded** : la vérif content-match + critic (§7) est une couche d'intégration composée, pas un prompt. (5) **Le warm-graph** (§6) est tissé du réseau email/LinkedIn propre du tenant — par définition non-achetable. Un concurrent peut copier chaque algorithme en un week-end ; il ne peut pas copier **l'historique snapshotté, le corpus d'identité, les outcomes calibrés et le graphe relationnel** — et c'est exactement sur ces 4 actifs accumulatifs que reposent les 6 moteurs. Le moat n'est pas le code ; c'est le flywheel que le code alimente.
