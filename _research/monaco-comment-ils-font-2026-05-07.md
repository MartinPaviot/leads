# Monaco — Comment ils font, feature par feature
*Analyse d'architecte : la mécanique sous le marketing*

**Date** : 2026-05-07
**Méthode** : Pour chaque sub-feature, je décompose le problème, je propose l'architecture probable basée sur preuves (subprocessors + JD verbatim + UI observée), j'identifie les trade-offs invisibles, et je propose la voie pragmatique pour Elevay (qui n'a ni $35M, ni Databricks, ni 40 ingénieurs).
**Sources d'évidence** :
- Subprocessors confirmés : AWS, Auth0, Databricks, Datadog, GitHub, Google Workspace, Linear, OpenAI, Retool, Slack, Tailscale, Vanta
- 8 fiches de poste 2026-05-06 (verbatim JD)
- 116 frames vidéo + 16 screenshots produit
- Status page : Web App + Public API + Data Processing + Email Open Rate Tracking (4 systèmes monitorés séparément)
- Marketing site network analysis : Next.js + Vercel + CloudFront + Datadog RUM + Snitcher + RB2B + GTM + GA4

---

## PRÉFACE — LE TRAVAIL DE L'ARCHÉOLOGUE

Quand tu n'as pas accès au code source, tu fais comme un archéologue : tu lis les **traces**. Les subprocessors te disent quels outils sont *en production* (pas juste "envisagés"). Les job descriptions te disent quels problèmes sont *non résolus* (sinon ils n'embaucheraient pas). Les screenshots te disent quels résultats sont *sortis de la machine* (pas juste les promesses marketing). Les latences observées (status page) te disent où sont les goulots.

Trois principes guident l'analyse :

1. **Aucune feature LLM n'est "magique"**. Toute fonctionnalité visible = un pattern d'ingénierie connu (RAG, function calling, structured outputs, evaluator-optimizer loop, agent loops) + des prompts + de l'orchestration + de la donnée propre. Si ça paraît magique, c'est qu'on n'a pas encore identifié les couches.

2. **La donnée propre vaut plus que le modèle**. OpenAI/Anthropic sont des commodités. La différence entre "wow" et "mid" tient dans : la qualité de l'enrichissement, la fraîcheur du sync, le citation grounding, le human-in-the-loop sur les données.

3. **Les UX choices révèlent les contraintes back-end**. Si Monaco affiche "Updating..." en live, c'est qu'ils streamient depuis un broker. Si Monaco met 5 secondes à répondre dans Ask Monaco, c'est qu'ils font 3-5 tool calls. Si Monaco a un mode "manual approval" par défaut, c'est que leur eval n'est pas encore à 99%.

Allons-y.

---

# MOUVEMENT 1 — DRIVE DEMAND

## ÉTAPE 1 — BUILD TAM

### 1.1 — *"Pre-built TAM from a world database of billions of data points"*

#### Le problème réel
Construire un TAM "Day 1" = avoir, à l'instant où le client signe, **déjà** indexé toutes les entreprises pertinentes pour son ICP, avec firmographics fraîches et signaux pré-calculés. Le défi n'est pas "trouver des entreprises" (Apollo le fait). Le défi est :
- **Latence ≤ 60 secondes** pour générer un TAM de 500-5000 comptes scorés
- **Couverture** : ne pas rater un compte clé (rappel élevé)
- **Fraîcheur** : firmographics et signaux datant de < 30 jours
- **Coût marginal proche de zéro** par TAM construit (sinon le modèle économique craque)

#### Comment Monaco s'y prend (probablement)

**Architecture en 3 couches** :

1. **Couche d'acquisition continue** (background jobs, tournent 24/7 indépendamment des clients) :
   - Scrapers + APIs : LinkedIn (via partenaires data brokers), job boards (Greenhouse, Lever, Ashby publics), SEC filings, Crunchbase, PitchBook, Press releases
   - Probable acquisition d'un dataset partenaire (style People Data Labs ou Coresignal) — non disclosé en subprocessor car "data partnership" ≠ "data processor"
   - Stockage brut dans **Databricks Delta Lake** (raw layer)

2. **Couche d'enrichissement et déduplication** (Spark/Databricks notebooks) :
   - Entity resolution sur le domaine canonique (`stripe.com` → `Stripe`)
   - Normalisation des industries (free-text → taxonomy GICS-like)
   - Computation des features : employee count buckets, funding stage, funding total, last funding date, hiring velocity, tech stack signals
   - Ces features sont écrites dans une table "silver" (curated)

3. **Couche de service en temps réel** (read-path) :
   - Quand un client signe :
     - Son ICP est traduit en filter set : `industry IN [...] AND employee_count BETWEEN x AND y AND has_signal_X = true`
     - Une query SQL simple sur Databricks (ou un index dérivé en OpenSearch/Pinecone)
     - Top 1000-5000 comptes ranked + scoring → stream NDJSON vers le client
   - Le pré-build n'existe pas vraiment "Day 1" : ce qui est pré-build, c'est **l'index**, pas la liste personnalisée

**Preuves observées** :
- Subprocessor **Databricks** = analytics data warehouse → c'est là où vivent les "billions of data points"
- JD Senior Platform Engineer verbatim : *"Build scalable pipelines and event-driven systems for ingesting, transforming, and serving data"* + *"Support ML workflows: training data, evaluation, embeddings, feature pipelines"*
- Status page liste **"Data Processing"** comme système monitoré séparément (99.59% uptime — le moins fiable des 4, ce qui suggère pipeline lourd)
- Aucun subprocessor data partner disclosed → either internal scraping ou data partnership en NDA

**Choix d'ingénierie clés** :
- **Lakehouse pattern (Databricks)** vs warehouse pur : permet streaming ingestion + batch reprocessing + ML training sur les mêmes tables. Snowflake aurait été équivalent mais Databricks est plus ML-native.
- **Pas d'API externe à la query-time** : si le TAM dépendait d'Apollo en live, ça ne pourrait pas tenir l'SLA. Tout est pré-calculé.
- **Owner du data freshness = pipeline interne** : ils contrôlent le SLA de fraîcheur (vs nous, qui dépendons d'Apollo qui rafraîchit quand il veut).

**Trade-offs invisibles** :
- Coût d'infra significatif (Databricks workload + storage à TB-scale = $5-15K/mois minimum à leur échelle)
- Risque legal : scraping LinkedIn = enjeu, data partnerships = NDA mais coût ($50-200K/an pour People Data Labs ou équivalent)
- Lag d'ingestion = ~24-48h pour les nouveaux signaux (ils ne peuvent pas faire vraiment "real-time" sur les funding rounds)

#### Comment Elevay devrait s'y prendre (pragmatique, sans Databricks)

**Architecture simplifiée** :

1. **Couche d'acquisition opportuniste** :
   - Apollo API (déjà en place) — pour les firmographics et personas
   - Webhook ingestion : Crunchbase Daily, ProductHunt new launches, ATS publics (Greenhouse/Lever job boards)
   - **Cache agressif Postgres** : chaque entreprise rencontrée = stockée localement avec TTL de 30 jours
   - Pas de scraping LinkedIn (risque legal trop élevé sans avocat dédié)

2. **Couche d'enrichissement à la demande + background fill** :
   - Quand un client signe, on génère un TAM "lite" en 30 secondes (Apollo search filters + cache hits)
   - En background, un job Inngest enrichit chaque compte avec : signal scanner, custom signals, scoring ML/heuristic
   - Le TAM s'enrichit progressivement (UX déjà acquise via streaming)

3. **Différentiateur volontaire** :
   - **Self-serve CSV import** comme alternative pour les founders qui ont déjà leur liste cible : Monaco ne propose pas ça, c'est un win immédiat pour les pragmatiques
   - **Enrichment LLM** : si Apollo ne trouve pas, fallback LLM extraction depuis une recherche web pour combler les trous

**Le piège à éviter** :
- Croire qu'on peut construire une "world database" en interne. Non. Notre stratégie : **data orchestration intelligente** (Apollo + Crunchbase + LLM + cache), pas data ownership.
- Sous-estimer le coût d'Apollo à scale : $0.10-0.30 par enrichissement → 1000 comptes par client = $100-300 marginal cost. Le caching shared cross-tenant est critique.

---

### 1.2 — *"Grounded in your ICP, your existing customers, and the accounts already in your email history"*

#### Le problème réel
"Grounded in your ICP" = transformer une description text-libre ("on vend à des CTOs de scale-ups SaaS B2B") en un **vector** ou un **filter set** précis. Et "grounded in email history" = analyser tous les threads pour extraire des patterns d'achat (qui répond, qui ferme, qui fantôme) et **rétro-engineerer** l'ICP réel (vs déclaré).

Trois sous-problèmes distincts :
1. ICP textuel → filter set structuré (industry, size, funding, geo, tech stack)
2. Closed-won examples → ICP appris (clustering ou ML)
3. Email history → ICP corrigé (qui répond positivement vs négativement)

#### Comment Monaco s'y prend

**Pour ICP textuel → filters** (le plus simple) :
- LLM extraction structurée (function calling OpenAI) : `{ industries: [...], employeeRange: {min, max}, fundingStage: [...], geo: [...], techStack: [...] }`
- Mapping vers leur taxonomie interne (GICS-like)
- Validation : si l'utilisateur dit "early-stage SaaS" → assignment à `funding_stage IN ['seed', 'series_a']`

**Pour closed-won grounding** :
- Customer reading from CRM import (HubSpot/Attio/Salesforce via OAuth ou CSV)
- Extraction des features pour chaque closed-won : `{ industry, employees, funding_stage, geo, tech_stack, ... }`
- **Centroid computation** : moyenne pondérée des features → "ICP appris"
- **Outlier detection** : si un closed-won est très différent du centroid (genre un client healthcare alors que tout le reste est SaaS), il est tagué comme "atypical" et exclu du grounding (sinon il pollue)
- Le système peut aussi entraîner un classifier supervisé : closed-won = label 1, churned/never_responded = label 0, et apprendre les features discriminantes

**Pour email history grounding** (le plus subtil) :
- Sync Gmail/Outlook OAuth (probable IMAP fallback)
- Pour chaque thread :
  - Extract sender domain, recipient(s), subject patterns
  - Classify response sentiment (LLM judge ou fine-tuned classifier) : positive_reply / not_interested / no_response / unsubscribe / objection
  - Aggregate par account : `account.response_rate`, `account.positive_response_rate`
- **Réinjection dans le scoring** : un compte qui ressemble (par features) aux comptes qui ont répondu positivement = score plus élevé

**Preuves observées** :
- JD AI Engineer verbatim : *"Build LLM-powered product features using prompt engineering, structured outputs, and tools"* — structured outputs = function calling
- Subprocessor OpenAI = function calling natif
- UI screenshot Step 4 : extraction structurée Budget / Team Size / CRM / Competitors / Point Solutions = même technique que pour ICP grounding

**Choix d'ingénierie clés** :
- **Pas de fine-tuning visible** : ils utilisent le grounding via context injection (RAG) pas du fine-tuning. C'est plus rapide à itérer mais coûte plus en tokens à l'inférence.
- **Features explicites > embeddings opaques** : pour le scoring, ils utilisent des features structurées (industry, size, funding) parce que c'est explicable ("why this account") — un embedding ne peut pas être expliqué.
- **Email history nécessite le sync** : sans le sync (cas où le founder n'a connecté qu'aujourd'hui), le grounding ne marche pas. C'est pourquoi l'onboarding insiste sur la connexion email immédiate.

**Trade-offs invisibles** :
- L'ICP textuel a beaucoup d'ambiguïté : "SaaS B2B" peut être DevTools, Marketing tech, Fintech... Le LLM hallucine ses interprétations si l'input est trop vague. Solution probable : suggestion de clarifications dans l'UI ("Sélectionnez les industries spécifiques").
- Le closed-won grounding nécessite un MINIMUM de closed-wons (3-5) pour être statistiquement utile. Pour un fondateur sans pipeline, fallback sur ICP textuel pur.
- L'email grounding peut être biaisé par le passé (si le founder a only-emailed une niche, l'ICP appris sera étroit).

#### Comment Elevay devrait s'y prendre

**Architecture similaire** :
- ICP textuel → structured extraction LLM (déjà en place via skill `icp-identification`)
- Closed-won → centroid computation simple en PostgreSQL (pas besoin de Databricks pour 5-50 closed-wons)
- Email history → leverage le sync existant + sentiment classification via LLM

**Différentiateur** :
- **Visualisation explicite du grounding** : dire à l'utilisateur "voici les 3 features qui ont le plus pesé dans le scoring de ce compte" (transparency Monaco fait pas)
- **Confidence intervals** : "ICP grounding confidence: 65% (need 5+ closed-won examples for high confidence)"

**Pragmatique** : skill `icp-identification` existe déjà → vérifier qu'il combine vraiment les 3 sources (texte + closed-won + email) ou s'il n'utilise que le texte. Si seul le texte, c'est P1 d'ajouter les 2 autres signaux.

---

### 1.3 — *"Built-in ML scoring using firmographics and signals with clear 'why this account' explanations"*

#### Le problème réel
Deux problèmes distincts mais souvent confondus :
1. **Le scoring** : produire un score continu (0-100) ou ordinal (A/B/C/D) qui prédit la probabilité d'achat
2. **L'explication** : dire POURQUOI un compte a ce score, en termes compréhensibles

Le piège : un score ML (random forest, gradient boosting) est techniquement **non-explicable** au sens strict — on peut sortir des feature importances mais pas un récit. Si tu veux des explications en langage naturel, tu dois soit :
- Utiliser un modèle inherently explicable (linear regression avec coefficients) — moins précis
- Faire du **SHAP** ou **LIME** + LLM pour traduire les contributions en phrases
- Faire du **rule-based explainable scoring** + LLM pour la mise en récit

#### Comment Monaco s'y prend

**L'évidence en faveur d'un système hybride** :
- L'UI montre les scores en **lettres A/B/C/D** (ordinal) + "Burning/Warm/Cool/Cold" (heat). Pas de score numérique 0-100. C'est typiquement le résultat d'un scoring continu **bucketé** en quartiles.
- Les explications observées dans les frames sont **structurées** :
  - "Common investors with Monaco include Founders Fund" (signal binaire)
  - "Hiring RAG engineers" (signal binaire)
  - "Tech stack includes Apollo and Fireflies" (signal binaire)
- Pas d'explications de type "Random forest predicted 0.87 because feature X had SHAP value Y" → ils n'utilisent pas SHAP/LIME en surface

**L'architecture probable** :

1. **Scoring layer (tier 1)** :
   - Modèle gradient boosting (XGBoost ou LightGBM) entraîné sur :
     - Features : industry one-hot, employee_count log, funding_total log, days_since_last_funding, has_signal_X (binary), engagement_history_features...
     - Label : closed_won = 1, never_responded / lost = 0
   - Output : score continu 0-1 → bucketé en A (>0.7) / B (0.4-0.7) / C (0.2-0.4) / D (<0.2)

2. **Heat layer (tier 2)** :
   - Modèle séparé (ou composante) qui prédit "intent timing" : probabilité d'acheter dans les 30 prochains jours
   - Features : signaux temporels (funding round récent, hiring spike, intent signals)
   - Output : Burning / Warm / Cool / Cold

3. **Explanation layer (tier 3)** :
   - Pour chaque compte avec score A/B :
     - Identifier les TOP-3 signaux qui ont contribué (rule-based, pas SHAP)
     - LLM template : "This account scores high because: {signal_1}, {signal_2}, {signal_3}"
     - Pour chaque signal, RAG vers la source (URL article, job posting, funding announcement)
   - C'est du **post-hoc explanation generation**, pas du modèle inherently explainable

**Preuves observées** :
- JD AI Engineer verbatim : *"Build and iterate on RAG systems (chunking, embeddings, retrieval, prompt composition)"* — le RAG est utilisé pour explanation grounding
- JD Senior Platform Engineer : *"Support ML workflows: training data, evaluation, embeddings, feature pipelines"* — confirme un vrai pipeline ML
- L'absence de feature importance numérique dans l'UI = ils ont fait le choix de "explain by example" plutôt que "explain by math"

**Choix d'ingénierie clés** :
- **Letter grade vs numeric** : choix d'UX. Un score 73 vs 74 est invisible et anxiogène. A vs B est immédiatement actionnable.
- **Two-tier (fit + heat)** : sépare la qualité intrinsèque du compte (fit ICP) de l'urgence temporelle (intent). Critique car un compte A/Cool n'a pas besoin d'action immédiate, mais un C/Burning peut être un quick win.
- **Explanation découplée du scoring** : permet d'itérer sur les explications sans re-train le modèle.

**Trade-offs invisibles** :
- **Cold start** : pour un nouveau client sans closed-wons, le modèle ne peut pas être entraîné spécifiquement. Solution probable : pré-entraîné sur l'ensemble des clients Monaco (multi-tenant model) + fine-tuning per-tenant quand assez de data.
- **Bias par client** : si tu apprends sur les closed-wons du client X (SaaS B2B US-based seulement), tu ne sais pas scorer un compte healthcare. La generalization est faible.
- **Ré-entraînement** : à quelle fréquence ? Hebdo ? Mensuel ? Probablement pipeline weekly avec validation set.

#### Comment Elevay devrait s'y prendre

**Phase 1 (court terme, 1-2 sem)** :
- **Rule-based scoring explicit avec poids configurables** :
  ```
  fit_score = w1 * industry_match + w2 * size_match + w3 * funding_stage_match + ...
  heat_score = w4 * has_funding_recent + w5 * has_hiring_intent + ...
  total = (fit_score * 0.6) + (heat_score * 0.4)
  ```
- Bucketing en A/B/C/D
- Explanations templated : "{account_name} is A/Burning because: {top_3_signals}"
- Avantage : 100% explicable, pas besoin de training data

**Phase 2 (moyen terme, 1-2 mois)** :
- Quand un client a 10+ closed-wons, switch vers un modèle gradient boosting per-tenant
- Garder le rule-based en fallback
- A/B test : combien d'accuracy gagne-t-on vs combien de complexité on ajoute ?

**Phase 3 (long terme)** :
- Multi-tenant pre-trained model (anonymisé) + per-tenant fine-tuning
- Mais ce n'est pas P0 si le rule-based marche déjà à 80% de la précision Monaco

**Le piège à éviter** :
- Vouloir faire du "vrai ML" en P0 alors qu'un rule-based bien tuné suffit pour 80% des cas. Monaco l'a peut-être commencé en rule-based aussi (la promesse marketing dit "ML scoring" mais on ne peut pas vérifier).
- Sous-estimer la valeur de l'**explanation layer**. C'est ce qui crée la confiance, pas la précision pure.

---

## ÉTAPE 2 — OVERLAY SIGNALS

### 2.1 — *"AI semantic search: 'Crypto companies', 'B2B companies manufacturing fasteners', 'Companies hiring RAG engineers'"*

#### Le problème réel
Une recherche en langage naturel sur le TAM doit gérer 4 cas d'usage très différents :
1. **Industry filter direct** : "Crypto companies" → `industry = 'Cryptocurrency'`
2. **Industry niche très spécifique** : "B2B companies manufacturing fasteners" → l'industry "Fasteners Manufacturing" n'existe pas dans GICS, il faut chercher dans les descriptions de companies
3. **Signal d'intention** : "Companies hiring RAG engineers" → croiser job posting data avec keyword "RAG"
4. **Combinaisons** : "Series A SaaS companies in Berlin hiring developers" → 4 contraintes

C'est **3 problèmes différents derrière la même UI** : structured filter, semantic search, signal lookup, combinator.

#### Comment Monaco s'y prend

**Architecture en pipeline** :

1. **Query understanding (LLM router)** :
   - Le query NL est passé à un LLM (probable GPT-4 ou similar) avec un prompt qui demande de classifier :
     - Quels filters structurés sont implicites ? (industry, geo, size, funding)
     - Quels signaux à chercher ? (hiring keyword, funding event, tech adoption)
     - Quelle est la combinaison logique ? (AND, OR, NOT)
   - Output : structured query plan

2. **Plan execution** :
   - Les filters structurés → SQL sur Databricks (rapide)
   - Les signaux → lookup dans les feature pipelines (e.g. table `companies_hiring_keywords` indexed sur keyword)
   - La sémantique vague ("manufacturing fasteners") → embedding search sur les company descriptions (vector DB)

3. **Result merging et ranking** :
   - Intersection des sets selon la logique (AND/OR/NOT)
   - Re-ranking par score TAM existant
   - Limit à top N

**Preuves observées** :
- L'UI de NL search existe (Monaco /accounts page screenshot)
- Job AI Engineer verbatim : *"Build LLM-powered product features using prompt engineering, structured outputs, and tools"* + *"Build and iterate on RAG systems"* — RAG = embedding search
- Subprocessor Databricks supporte vector search natif (Mosaic AI Vector Search)

**Choix d'ingénierie clés** :
- **Hybride structured + semantic** : ne pas tout résoudre en embedding (trop imprécis pour les filters numériques) ni tout résoudre en SQL (trop limité pour la sémantique vague).
- **LLM router au début** : laisse le LLM décomposer la query une fois, puis exécute déterministiquement. C'est un pattern "agent for plan, deterministic for execution".
- **Vector store probable** : Databricks Vector Search OU pgvector OU Pinecone. Pas de subprocessor visible donc soit Databricks-native soit auto-hosted.

**Trade-offs invisibles** :
- **Latence** : LLM router + SQL + vector search = 3-5s par query. Probablement masqué par streaming UI.
- **Coût** : chaque query NL = 1 LLM call. À l'échelle, ça compte.
- **Précision sémantique** : "manufacturing fasteners" peut ramener des companies "fastener distribution" ou "industrial supply" qui ne sont pas exactement la cible. Solution probable : feedback loop UX (user marque "not relevant" → re-rank).

#### Comment Elevay devrait s'y prendre

**Architecture similaire mais simplifiée** :

1. **LLM router avec structured output** (function calling OpenAI/Anthropic) :
   ```
   {
     "structured_filters": { "industry": ["Crypto"], "geo": null, "size": null },
     "signal_lookups": [{ "type": "hiring", "keyword": "RAG engineer" }],
     "semantic_query": null,
     "logic": "AND"
   }
   ```

2. **Execution déterministe** sur PostgreSQL :
   - Filters structurés → WHERE clauses
   - Signal lookups → JOIN sur la table de signaux
   - Semantic query → pgvector similarity search sur company description embeddings

3. **Skill existant `parse-nl`** est probablement déjà fait pour ça. Vérifier qu'il :
   - Gère les 4 types de queries
   - A des tests sur des queries réelles
   - Renvoie une explication "I interpreted your query as: ..."

**Le piège à éviter** :
- Vouloir tout faire avec embeddings → impossible de gérer "Series A" qui n'a pas de meaning sémantique mais doit matcher exactement.
- Sur-engineer l'agent loop → un seul LLM call avec function calling structuré suffit pour 95% des queries.

---

### 2.2 — *"Custom signals: common investors, job postings, current tech stack, and anything else you can imagine"*

#### Le problème réel
"Anything else you can imagine" = le user décrit en langage naturel un signal arbitraire ("entreprises qui ont mentionné notre concurrent dans leurs offres d'emploi"), et le système doit :
1. **Comprendre** la définition
2. **Choisir** la bonne source de données (job posting API, news API, social mentions, scraping)
3. **Générer** un détecteur (heuristique + LLM judge)
4. **Backfill** historiquement et **trigger** en continu
5. **Surface** le signal dans l'UI avec citations

C'est probablement la feature **la plus dure** de Monaco. Et la moins fiable.

#### Comment Monaco s'y prend

**Architecture en plusieurs tiers de qualité** (hypothèse forte basée sur design ce qu'on aurait dû faire) :

**Tier 1 — Signaux pré-définis (haute fiabilité)** :
- `common_investor` : query la table investments (Crunchbase) → `INTERSECT(target_account.investors, customer.investors) IS NOT EMPTY`
- `funding_recent` : query funding rounds → `last_funding_date > NOW() - 90 days`
- `hiring_intent` : query ATS public APIs (Greenhouse/Lever/Ashby exposent JSON publics) → match keywords
- `tech_stack` : Monaco a probablement signé avec BuiltWith ou utilise leur free tier

**Tier 2 — Signaux semi-custom (générés par LLM)** :
- L'utilisateur décrit le signal : "companies that recently changed their CMO"
- Le LLM génère un plan de détection :
  - Source : LinkedIn job changes (via partner data) + news mentions
  - Pattern : `role.contains('CMO') AND title_change_date > NOW() - 60 days`
  - Validation method : LLM judge sur LinkedIn announcement text
- Le plan est exécuté en background (Inngest-style worker)

**Tier 3 — Signaux full custom (LLM judge sur web search)** :
- Pour des signaux trop spécifiques, le système fait :
  - Web search (Brave Search API ou similaire) avec query construite
  - LLM judge sur les results pour confirm/deny
  - Coût élevé donc rate-limited

**Preuves observées** :
- Promesse marketing : "anything else you can imagine"
- JD Client Operations verbatim : *"Build and deliver high-quality TAMs, signals, and outbound setups"* — c'est un humain qui aide à configurer ça (Tier 2/3 nécessite de l'expertise)
- Notre propre implementation `lib/custom-signals/detector.ts` (3-tier : keywords → URL HEAD → LLM judge) est probablement très proche de ce que Monaco fait

**Choix d'ingénierie clés** :
- **3-tier d'abstraction** permet de gérer le coût/performance trade-off
- **Human-in-the-loop pour Tier 2/3** : le Client Operations role aide à formuler le signal correctement (sinon "anything you can imagine" est trop vague)
- **Backfill séparé du trigger** : backfill = batch sur 6-12 mois historique. Trigger = real-time check sur nouveaux comptes.

**Trade-offs invisibles** :
- **Faux positifs** : un LLM judge sur "companies hiring RAG engineers" peut tagger un compte qui mentionne "RAG" en tant que client mais ne hire pas. Solution : confidence scoring + UI pour marker "not relevant".
- **Coût LLM** : Tier 3 backfill sur 5000 comptes = 5000 LLM calls = $5-50 selon model. À l'échelle, faut throttler.
- **Maintenance** : un signal "companies running on Postgres" devient stale si une source data n'est plus accessible. Faut monitoring.

#### Comment Elevay devrait s'y prendre

**Architecture déjà similaire** :
- Notre `lib/custom-signals/detector.ts` 3-tier est aligné
- `lib/custom-signals/generator.ts` traduit description NL en plan de détection
- Backfill via Inngest worker

**Améliorations P1** :
- **Confidence scoring** : exposer 4-state (high green / medium green dashed / unverified gray / false strikethrough) au lieu de binary
- **User feedback loop** : permettre de marker "false positive" → ré-entraîner le détecteur avec ces exemples
- **Source preview** : avant de lancer le backfill, montrer 5 exemples avec les sources → user valide

**Le piège à éviter** :
- Promettre "anything you can imagine" sans contraintes. Réalité : 30% des signaux qu'un user imagine sont impossibles à détecter (ex : "companies that secretly use our competitor"). Faut un filtre amont qui dit "I cannot reliably detect this signal because..."

---

### 2.3 — *"Inbound signals: track website visitors, demo requests, and other high signal inputs"*

#### Le problème réel
**Visitor identification** = transformer une IP anonyme + comportement web en `{ company_name, person_name }` deanonymized. C'est un problème legal-tech-data difficile :

- **IP-to-company** (50-70% identification rate) : reverse IP → ASN → company. Marche bien pour les bureaux d'entreprise, échoue pour les freelancers, VPNs, mobiles.
- **Person-level deanonymization** (5-15% rate) : nécessite cookies tiers + data brokers (RB2B, Common Room, Clearbit Reveal) qui matchent l'identifiant browser à un email/LinkedIn via leur graphe.
- **Compliance** : GDPR/CCPA — il faut une legal basis (legitimate interest typiquement) pour stocker.

**Demo request capture** = simple form ingestion mais doit faire :
- Match au TAM existant (deduplication intelligente)
- Speed-to-lead (alertes < 5 min selon Oldroyd MIT 2007 = 21x qualify rate)
- Routing vers le bon AE/founder
- Enrichment automatique

#### Comment Monaco s'y prend

**Visitor ID (probable)** :
- Eux-mêmes utilisent Snitcher + RB2B sur leur propre site (vu en cookies)
- Donc soit ils intègrent ces services pour leurs clients (revente), soit ils ont reconstruit
- **Probable** : ils ont licensed RB2B/Clearbit Reveal pour leurs clients (private label) — pas de subprocessor visible mais c'est probablement un "data partner" non disclosed
- Implementation : pixel JS injecté sur le site du client → events vers Monaco backend → match au TAM → emit signal

**Demo request capture** :
- Webhook ingestion endpoint (chaque client a un unique URL)
- Email parsing si demo request arrive par email (Lambda + LLM extraction)
- Match au TAM existant via fuzzy match sur email domain + person name
- Trigger event `inbound.demo_request` → routes to founder Slack + sequence enrollment

**Preuves observées** :
- Subprocessor Slack : confirme que les alertes inbound passent par Slack channels customer
- JD Forward-Deployed AE : *"primarily inbound today"* — ils dogfoodent leur propre inbound capture
- Marketing site network analysis : Snitcher + RB2B en cookies → ils savent que ces tools marchent (et donc proposent probablement)

**Choix d'ingénierie clés** :
- **Slack-first notification** : les founders sont sur Slack. Email = trop lent.
- **Pixel léger** : doit pas slow down le site du client → minified JS, async load
- **Privacy-respectful** : honor DNT, GDPR cookie consent

**Trade-offs invisibles** :
- **Identification rate faible** : 5-15% person-level reveal = 85-95% des visitors restent anonymes. Faut framer ça correctement à l'utilisateur ("we identified 12 high-intent companies this week" plutôt que "we missed 88%").
- **Faux positifs sur match TAM** : si un employé visite le site depuis sa mobile (IP différente), pas de match. Si un visiteur d'une autre entreprise utilise le même VPN qu'un compte du TAM → faux positif.
- **Coût des data partners** : RB2B/Clearbit = $500-5000/mois selon volume.

#### Comment Elevay devrait s'y prendre

**Phase 1 (P0, 2 semaines)** :
- Intégration **Snitcher** comme premier partenaire (ils ont une API simple)
- Pixel JS à installer sur le site client
- Webhook → API Elevay → match TAM → emit signal `visitor_identified`
- Slack notification (si le client a connecté Slack)

**Phase 2** :
- Ajouter **RB2B** ou **Clearbit Reveal** en option (différents trade-offs prix/qualité)
- Permettre au client de choisir leur provider
- Multi-source dedup

**Demo request capture** :
- Endpoint `/api/inbound/demo-request` configurable per-tenant (URL unique)
- Form embed code generator
- Webhook ingestion + LLM extraction si email-based
- Skill `inbound-lead-enrichment` existe déjà (130 lignes) → vérifier qu'il connecte au TAM

**Le piège à éviter** :
- Vouloir construire notre propre visitor ID en interne. Ne le fais pas. Le data graph de RB2B (basé sur des partnerships LinkedIn etc.) prend des années à construire.
- Sous-estimer le legal : faut un DPA avec le data partner, et la documentation pour le client (privacy policy update).

---

## ÉTAPE 3 — EXECUTE SEQUENCES

### 3.1 — *"Pre-built sequences: opinionated templates you can customize quickly"*

#### Le problème réel
"Opinionated templates" = pas un template generic. Ce sont des **séquences testées sur des centaines de campagnes** qui marchent statistiquement. Le défi :
- **Capturer la methodologie de Sam Blond** (qui a 15 ans d'expérience) et l'encoder
- **Adapter par ICP** (un template pour SaaS founders ≠ un pour CIOs healthcare)
- **Permettre la customisation sans casser l'efficacité** (le user peut éditer mais pas trop)

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Library de templates segmentée par axes** :
   - Buyer persona (Founder, CRO, VP Sales, Head of GTM)
   - ICP industry (SaaS, FinTech, HealthTech, ...)
   - Trigger context (cold, post-funding, post-hire, post-product launch)
   - Stage (initial outreach, follow-up, breakup)
- Probablement 50-200 templates totaux organisés en matrice

2. **Selection logic** :
   - Quand le user crée une sequence, le système propose les 3-5 templates les plus fit selon : ICP du user + persona cible + trigger
   - Pre-fill avec le contexte du user (company name, value prop)

3. **Customisation guard-rails** :
   - Le user peut éditer le copy mais le système highlight les "anti-patterns" (e.g. trop de jargon, trop long, trop générique) en temps réel
   - Skill `sequence-generator.ts` evaluator-optimizer loop = même pattern

**Preuves observées** :
- JD Founding Customer Success verbatim : *"Enable teams on outbound success by advising on sequence copy, strategy, and execution"* — un humain coach les founders sur la copy
- Frame analysis Step 3 : "Fundraise gifting" sequence avec gift Veuve Clicquot = template trigger-based (post-funding)
- Notre propre `outbound-methodologies.ts` (4 frameworks BASHO/Challenger/Problem-Solution/Product-Led) est aligné

**Choix d'ingénierie clés** :
- **Templates curatés humainement, pas generated par LLM** : Sam Blond et l'équipe sales ont écrit les templates. Les LLM personnalisent les variables, pas la structure.
- **Trigger-based templates** : un template post-funding ≠ un cold template. Le trigger détermine le ton.
- **Évolution continue** : les templates sont versioned + A/B testés (on suppose) sur les performance metrics.

**Trade-offs invisibles** :
- **Maintenance** : 50-200 templates × 4 stages = 200-800 emails à maintenir. Quand le marché change (e.g. nouveau modèle économique de pricing), faut tout updater.
- **Localization** : tout en anglais probablement. Un client francophone a un gros gap.

#### Comment Elevay devrait s'y prendre

**Différentiateur volontaire** : générer dynamiquement les templates depuis la voice du founder + ICP, plutôt que de maintenir une library curated.

**Architecture** :
1. Au premier login, capture **voice profile** (5 emails passés ou voice memo 60s)
2. Génère 3-5 sequences personnalisées basées sur :
   - Voice profile (tone, longueur préférée)
   - ICP (persona, industry)
   - 4 frameworks (BASHO/Challenger/Problem-Solution/Product-Led)
3. User edit + approve

**Avantage vs Monaco** :
- Pas de maintenance de library
- Voice 100% authentique au founder
- Localisation native (français, espagnol, etc.)

**Risque** :
- Qualité variable (depend du LLM)
- Pas de "best practices" baked in (un user mal orienté génère du mauvais)

**Solution** : combiner les 2 — frameworks curatés (notre 4 frameworks existants) + LLM qui les adapte à la voice. C'est ce qu'on a déjà.

---

### 3.2 — *"Autopilot: Monaco decides who to enroll, when to start, and how to follow up - without blasting your whole TAM"*

#### Le problème réel
L'autopilot vraiment autonome demande de répondre à 3 questions hard :
1. **Who** : sur quels critères enroller un compte dans une sequence ? (eviter blast, eviter fatigue)
2. **When** : à quel moment exact démarrer ? (kairos — funding round, hiring, intent signal)
3. **How** : si pas de réponse au step 1, escalader vers step 2 ou abandonner ?

Le piège : un autopilot trop aggressif blast tout le TAM = brand burn + email reputation tank. Trop conservateur = aucune valeur.

#### Comment Monaco s'y prend

**Architecture probable (multi-agent)** :

1. **Enrollment agent (decides WHO)** :
   - Daily cron job
   - Pour chaque sequence active : check les comptes du TAM qui matchent les criteres
   - Filter par : not_already_enrolled + score_above_threshold + has_recent_signal + within_send_quota
   - Exemple decision : "Sequence 'Post-Funding Outreach' a 23 comptes du TAM qui ont funding < 30 days. Enroll all."

2. **Scheduling agent (decides WHEN)** :
   - Pour chaque enrolled account, choose start time :
     - Recipient timezone (avoid weekends, off-hours)
     - Sender quota (max 50 emails/day pour préserver reputation)
     - Throttling : max N enrolls par sequence par jour

3. **Follow-up agent (decides HOW)** :
   - Listen to events : `email.opened`, `email.replied`, `meeting.booked`
   - If positive signal : exit sequence, transition to "human handoff"
   - If silent N days : continue to next step
   - If negative reply ("not interested") : exit sequence, mark account as `no_engage_until=NOW+90d`

4. **Quota enforcement** (critical for deliverability) :
   - Hard limits per mailbox : 50 emails/day cold, 100/day warm
   - Domain reputation monitoring (bounces, complaints)

**Preuves observées** :
- Status page : "Email Open Rate Tracking" comme système séparé monitoré → ils ont une infrastructure dédiée pour tracking + reputation
- JD Senior Platform Engineer : *"event-driven systems"* — l'autopilot est event-driven, pas batch
- JD AI Engineer : *"agents, tools, memory, retries, fallbacks"* — agentic pattern

**Choix d'ingénierie clés** :
- **Decoupling enrollment / scheduling / follow-up** : 3 services distincts qui communiquent via events. Permet d'itérer sans casser.
- **Conservative defaults** : Monaco ne blast probablement pas par défaut. Quotas serrés au début, augmentent avec confidence.
- **Observability as feature** : status page dédié à Email Open Rate Tracking suggère qu'ils alertent eux-mêmes si reputation tank.

**Trade-offs invisibles** :
- **Cold start** : sur un nouveau client sans historique, le système ne sait pas quel quota tenir. Solution : commencer très conservateur (5-10 emails/day) + ramp up progressif.
- **Multi-mailbox** : pour scale au-delà de 100/day, faut multiple sender mailboxes (Smartlead/Instantly pattern). Pas vu dans les screenshots.
- **Compliance CAN-SPAM/GDPR** : unsubscribe links obligatoires, postal address. Si ratés = legal exposure.

#### Comment Elevay devrait s'y prendre

**On a déjà la base** :
- `inngest/autonomous-pipeline.ts` (autoPipelineStep cron 9am)
- Skill `cold-email-outreach` (sequence enrollment logic)
- Reply handling intelligent

**Améliorations P1** :
- **Multi-agent split** : enrollment agent + scheduling agent + follow-up agent en services distincts
- **Quota system** : per-mailbox daily/hourly limits enforced
- **Reputation monitoring** : track bounces/complaints rate, alert si > 1%/0.1%
- **Cold start ramp-up** : automatically scale quotas from 5/day → 50/day over 14 days

**Le piège à éviter** :
- Cron 1x/jour = trop lent pour kairos. Si une funding announcement tombe à 14h, réagir le lendemain à 9am = late by 19h. Migrer vers event-driven (webhook signal → immediate enrollment).
- Single mailbox limit ~100 emails/day = bloquant pour scale. Faut early architecture pour multi-mailbox.

---

### 3.3 — *"Contextual relevance: messages that adapt to business context and intent signals"*

#### Le problème réel
"Contextual relevance" en pratique = chaque email envoyé doit référencer **un fait spécifique au prospect** que personne d'autre ne référencerait. Ça nécessite :
1. **Research per-prospect** (LinkedIn, news, podcast, blog, etc.)
2. **Synthesis** en une opener line non-génerique
3. **Validation** que ce n'est pas hallucination

C'est le différentiateur entre un email spammeux et un email "humain".

#### Comment Monaco s'y prend

**Architecture probable (research agent pattern)** :

1. **Research phase** (per-prospect, async, cached) :
   - Tool calls vers : LinkedIn profile fetch, company news (Brave Search ou similaire), recent funding/hiring, podcast appearances
   - Aggregation en context document (~2-5KB par prospect)
   - Cached pour 7-30 jours

2. **Personalization phase** (per-email, sync) :
   - LLM avec context : prospect research + company context + sequence template
   - Prompt : "Write a 2-line opener that references something specific from the research. If no specific hook found, return null and use generic opener."
   - Output : opener + body adaptation

3. **Validation phase** :
   - LLM judge : "Does this opener hallucinate? Does it cite a fact that's actually in the research context?"
   - If hallucination → regenerate
   - If still bad → fallback to generic template (the user is notified)

**Preuves observées** :
- Frame analysis : email "Congrats on the fundraise!" subject (Alex Shan) → context-driven
- JD AI Engineer : *"Build LLM-powered product features using prompt engineering, structured outputs, and tools"* — tools = research API calls

**Choix d'ingénierie clés** :
- **Research separated from generation** : permet caching + reuse cross-emails
- **Validation as separate LLM call** : meta-cognition pattern (LLM check LLM output)
- **Fallback to generic** : pas de personnalisation > mauvaise personnalisation

**Trade-offs invisibles** :
- **Coût** : research per prospect = 5-15 tool calls = $0.05-0.20 per prospect. Pour 1000 prospects = $50-200.
- **Latency** : research peut prendre 10-30s. Faut le faire en background pendant que la sequence est créée, pas à l'envoi.
- **Hallucination silently slip** : si la validation rate les faux positifs subtils (e.g. confondre 2 personnes du même nom), l'email part avec une erreur factuelle = brand burn.

#### Comment Elevay devrait s'y prendre

**Pattern déjà en place** :
- `buildProspectContext()` + LLM rewrite = même architecture
- Reply handling intelligent
- Multi-step orchestration in chat

**Améliorations P1** :
- **Validation pass dédiée** (anti-hallucination judge LLM)
- **Fact citation** : pour chaque "personalized" opener, indiquer la source ("Referenced from: their Series A announcement, June 2025")
- **User preview avant envoi** : le user voit l'email avec les sources highlighted

**Le piège à éviter** :
- Vouloir personnaliser quand pas assez de signal. Mieux vaut un email court generic qu'un email long "personnalisé" avec un fact à côté de la plaque.
- Sous-estimer la latency : faire la research au moment de l'envoi = email pas envoyé.

---

# MOUVEMENT 2 — INCREASE CONVERSION

## ÉTAPE 4 — CAPTURE ACTIVITY

### 4.1 — *"Structured signals: every interaction is captured, summarized, and attached to the right account, contact, and opportunity"*

#### Le problème réel
"Every interaction" = email + meeting + Slack + chat + call. Pour chacun :
1. **Capture** : ingestion fiable (OAuth tokens, webhook reliability, polling fallback)
2. **Parse** : email = MIME parsing, meeting = transcript STT, Slack = API events
3. **Summarize** : LLM extraction structurée
4. **Match** : associer à la bonne account/contact/opportunity (entity resolution)
5. **Persist** : timeline avec versioning

Le défi numéro 1 : **fiabilité du sync**. 99% n'est pas assez. À 99%, sur 1000 emails/jour, 10 sont manqués → invisible mais critique.

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Sync workers (separated by source)** :
   - Gmail/Outlook : OAuth refresh tokens + push notifications (Gmail) ou polling (Outlook every 5 min)
   - Calendar : same OAuth pattern
   - Slack : Events API webhook + Conversations API
   - Recall.ai (or own integration) : webhooks pour bot events
   - Each worker = separate service, separate retries, separate error reporting

2. **Token health monitoring** (Datadog) :
   - Each tenant's OAuth tokens have a last_successful_sync timestamp
   - Alert si > 1h sans sync (ils ont fixé ce bug, on l'a aussi rencontré)
   - User notification dans l'UI ("Email sync disconnected — reconnect")

3. **Entity resolution layer** :
   - Each interaction has `participants: [{ email, name }]`
   - Match against `contacts` table by email (canonical)
   - If unknown participant → auto-create contact + enrich
   - Account match : email domain → account
   - Opportunity match : open opportunity with this account → attach

4. **Structured extraction** (LLM, async) :
   - For each interaction, run extraction pipeline (different prompts for email vs meeting transcript)
   - Output : `{ summary, key_points, budget_mentioned, team_size, current_tools, competitors, next_steps, sentiment }`
   - Persist to interaction record

5. **Cascading updates** :
   - Extracted facts cascade to deal properties (skill `syncSignalsToDeal` chez nous)
   - Conflicts handled : if extraction says "budget = $30K" but deal already has "$50K", which wins ? Probably "most recent" rule

**Preuves observées** :
- Subprocessor Datadog → pour monitoring du sync health
- Status page : "Data Processing" 99.59% uptime (le moins fiable) → confirme la complexité du sync
- Frame analysis Step 4 : "Updating..." live → ils ont du WebSocket/SSE pour pousser les updates

**Choix d'ingénierie clés** :
- **Push > poll where possible** : Gmail push notifications, Slack Events API. Pas de poll inutile.
- **Idempotent ingestion** : chaque interaction a un unique ID externe, pas de doublons
- **Queue-based processing** : ingestion → queue → extraction worker → DB. Permet replay/retry.
- **Optimistic UI** : show "interaction received, processing..." plutôt que d'attendre l'extraction

**Trade-offs invisibles** :
- **Multi-channel meeting recording** : Recall.ai ne supporte pas tous les providers. Phone calls (no link) = pas capturés. Solution probable : not address it (Monaco n'est pas pour phone-heavy ICPs).
- **Email sync rate limits** : Gmail = 250 quota units/sec/user. Pour un user avec 10K threads, sync initial peut prendre des heures. UX : show progress.
- **Large attachments** : Monaco probably doesn't sync attachments (cost + privacy). But losing those = losing context (PDFs of contracts etc.).

#### Comment Elevay devrait s'y prendre

**On a la base** :
- Email sync 15 min cron (Gmail + Outlook)
- Calendar sync
- Recall.ai integration
- Skill `enrichment-email-extract`

**Améliorations P0** :
- **Push notifications Gmail** au lieu de polling (réduit latency de 7.5min average à <30s)
- **Slack integration** comme nouvelle source (les founders communiquent beaucoup en Slack avec leurs prospects)
- **Idempotency keys** sur chaque interaction (eviter doublons sur retry)

**Améliorations P1** :
- **Health dashboard** par tenant : email sync OK ? Calendar sync OK ? Recall configured ? UI traffic light.
- **Backfill UI** : let user import historical emails (last 6 months) on demand
- **Structured extraction QA** : sample 10% des extractions pour validation humaine périodique

**Le piège à éviter** :
- Croire que le sync est "set and forget". Les OAuth tokens expirent, les API rate limits frappent, les webhooks failent. Faut **monitoring proactif** + **user notification** + **easy reconnect**.

---

### 4.2 — *"Auto-enrichment: accounts and contacts stay complete and up to date automatically"*

#### Le problème réel
"Stay complete and up to date" = le profil de chaque account/contact se met à jour quand :
- Nouveau funding round → update funding_stage, funding_total
- Person change job → update title, company (et créer un nouveau lien si elle est devenue prospect ailleurs)
- New hires at the account → update employee_count, add new contacts
- Tech stack change → update tech_stack signal

Le challenge : **détecter les changements** sans tout re-enrichir tout le temps (coût) et sans rater les changements importants.

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Change detection** (background job, weekly per account) :
   - Fetch latest enrichment from Apollo/internal DB
   - Diff with stored version
   - Emit events for significant changes (funding, job change, hires)

2. **Event-driven enrichment** :
   - When ATS public API publishes new job → emit `account.hiring_event`
   - When funding API has new round → emit `account.funding_event`
   - These trigger immediate updates (faster than weekly poll)

3. **Person-level change detection** (job changes) :
   - Subscribe to LinkedIn Sales Navigator data feed (probable partner) or scrape
   - When a contact's company changes → emit `contact.job_change`
   - Create new contact at new company OR link existing
   - This is **gold** for outbound (warm intro path preserved)

**Preuves observées** :
- Skill `champion-tracker` (157 lignes) chez nous fait pareil
- JD Founding CS verbatim : *"Build and refine TAMs as customers expand or alter their ideal customer profiles"* — l'humain refresh quand le client change

**Choix d'ingénierie clés** :
- **Diff-based** : compare snapshots, n'écrit que les changements (pour audit trail)
- **Event emission** : downstream consumers (signal scanner, pipeline updater) react via events
- **Preserve warm paths** : si Sam Blond connait Alex Shan chez X, et Alex change pour Y, le lien Sam→Alex reste actif. Critique pour l'outbound.

**Trade-offs invisibles** :
- **Coût** : re-enrichment hebdo de 5000 comptes = 5000 API calls = $500-1500/mois sur Apollo
- **Faux changes** : Apollo data refresh peut rapporter un "change" qui n'est qu'un correction de typo. Faut threshold + confidence.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- `champion-tracker` skill
- `expansion-signal-spotter`

**Améliorations** :
- **Diff-based enrichment** : ne re-enrich que si > 30 jours OR si event triggered
- **Job change webhook** depuis LinkedIn (via Surfe ou similar partner)
- **Change history UI** : let user see "what changed about this account in the last 30 days"

**Le piège à éviter** :
- Re-enrich trop fréquent = $$$
- Re-enrich trop rare = data stale
- Sweet spot : 14-30 jours + event-triggered

---

### 4.3 — *"Trusted history: what happened, when, who was involved, and what changed — all in one place"*

#### Le problème réel
"Trusted history" = audit trail forensic-grade. Pour chaque entité (account, contact, deal) :
- Chronological timeline of all events
- Versioning of fields (who changed, when, what was old value)
- Cross-references (this email triggered this signal triggered this deal stage change)

Le défi : c'est un **event sourcing pattern** complet. Storage explode (chaque field change = un event).

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Event store** :
   - Toutes les actions (interaction.created, deal.stage_changed, contact.field_updated) émises en events
   - Stored in append-only log (Databricks Delta Lake supporte ça nativement)

2. **Materialized views** :
   - Account detail = projection des events liés à cet account
   - Timeline = chronological replay
   - Field versioning = derived from `entity.field_changed` events

3. **UI rendering** :
   - Timeline groupée par jour, expand/collapse
   - Each entry = clickable to see details + cross-references

**Preuves observées** :
- Frame analysis Step 5 deal overview : "October 27, 2025: Monaco <> Judgment Labs follow-up scheduled..." — exact timestamps + cross-references
- Lakehouse pattern (Databricks) supporte naturellement append-only event logs

**Choix d'ingénierie clés** :
- **Append-only** : pas de UPDATE/DELETE. Toujours INSERT. Permet audit + time-travel queries.
- **Materialized views** : pre-compute les projections les plus utilisées
- **Cross-reference IDs** : chaque event pointe vers les events parents (causality)

**Trade-offs invisibles** :
- **Storage explosion** : chaque petit field change = un event. Pour 100K interactions, ça monte vite.
- **Query latency** : remonter 6 mois d'history sur un account = beaucoup d'events à projeter. Faut materialized views à jour.

#### Comment Elevay devrait s'y prendre

**Pragmatique, pas pure event sourcing** :
- Garder les entities en CRUD normal (Postgres)
- Ajouter une table `audit_log` qui capture les changes critiques (deal stage, contact owner, account properties)
- Timeline UI = aggregation de : interactions + audit_log entries + signal events

**Améliorations P1** :
- Audit log déjà en partie via Inngest events
- Vérifier qu'on a versioning des deal properties (qui a changé quoi quand)
- UI timeline avec filtering par event type

**Le piège à éviter** :
- Event sourcing pur = complexité énorme pour bénéfice marginal à notre scale.
- Sous-estimer l'importance de la timeline UI. C'est ce qui crée la confiance ("I see what happened, when, and why").

---

## ÉTAPE 5 — TRACK PIPELINE

### 5.1 — *"Signal-based stages: meetings, email threads, call momentum, and stakeholder engagement drive pipeline changes"*

#### Le problème réel
Stages CRM traditionnellement = manuel (le rep drag-drops). Monaco veut que les stages reflètent la réalité observable :
- Demo done = stage passe à "Discovery"
- Pricing email envoyé = stage passe à "Proposal"
- Contract signature received = stage passe à "Closed Won"
- 14 days of silence post-proposal = stage passe à "At Risk" (subtag, pas stage)

Le défi : **infer stages depuis events** sans hallucination + sans frustrer le user qui veut le contrôle.

#### Comment Monaco s'y prend

**Architecture probable (rule-based + LLM judge hybrid)** :

1. **Rule layer** (deterministic, fast) :
   - Demo meeting completed → stage = "Discovery" (if currently lower)
   - Email contains "pricing" + "proposal" + sent_by_us → stage = "Proposal"
   - Contract signed (DocuSign webhook) → stage = "Closed Won"

2. **LLM judge layer** (non-deterministic, slower, for ambiguous cases) :
   - For each deal weekly : "Based on the last 5 interactions, what's the most likely current stage?"
   - If LLM judge disagrees with current stage → flag for human review (don't auto-change)

3. **Approval mode** :
   - Default : auto-change for clear-cut cases (rule-based hits)
   - Suggest only for ambiguous cases (LLM judge)
   - User can override anytime

**Preuves observées** :
- Skill `deal-velocity.ts` chez nous + `autoPipelineStep` cron 9am
- JD : *"event-driven systems"* — rule-based triggers sont event-driven

**Choix d'ingénierie clés** :
- **Rule-based for high confidence, LLM for ambiguity** : same pattern as scoring (deterministic + LLM where needed)
- **User control preserved** : auto-change is opt-in (probably). Else founders flip the table.
- **Audit trail** : every stage change logged with reason ("auto-changed because demo meeting completed")

**Trade-offs invisibles** :
- **Reverse moves** : if demo gets canceled, should stage revert? Probably no (no auto-reversion to avoid jitter).
- **Multi-stakeholder confusion** : if 3 people from the prospect company email about different things, stage detection conflicts.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- `autoPipelineStep` cron 9am
- `deal-velocity.ts`
- Skill `pipeline-review`

**Améliorations P0** :
- **Real-time event-driven** au lieu de cron 1x/jour
  - Email sent containing "pricing" → trigger stage assessment immediately
  - Meeting completed → trigger stage assessment
- **Per-deal approval mode** : let user toggle "auto-advance" per deal (some deals founders want manual control)
- **Audit trail visible** : "This deal moved to Proposal on Oct 27 because: pricing email sent + decision-maker engaged"

**Le piège à éviter** :
- Auto-advance trop aggressive = user lose trust ("why is this in Closed Won, I didn't agree to that?")
- Default to "suggest" mode, not "auto"

---

### 5.2 — *"Risk detection: detection before it's obvious. Ghosting, stalls, and weak engagement flagged early with clear reasons"*

#### Le problème réel
Identify deals at risk before the obvious "no response in 30 days" signal. Detect subtle patterns :
- Multi-stakeholder engagement weakening (only 1 person responding now vs 3 before)
- Champion gone silent (the original advocate stopped engaging)
- Email sentiment cooling (replies shorter, more polite, less enthusiastic)
- Meeting cadence slowing (used to be weekly, now monthly)
- Decision delay signals ("we need to talk to X first")

Ce sont des patterns que les sales experts perçoivent intuitivement. Les encoder = le hard part.

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Feature engineering per deal** (background, daily) :
   - `days_since_last_interaction`
   - `interaction_count_last_30d` vs `interaction_count_30d_to_60d` (delta)
   - `unique_stakeholders_engaged_last_30d` vs `prior_period`
   - `champion_silent_days` (the most engaged person, days since they last responded)
   - `sentiment_trend` (LLM scoring of last 5 interactions)
   - `meeting_cadence_change` (frequency delta)

2. **Risk scoring** :
   - Either rule-based ("if days_since_last > 14 AND no positive signal in 14d → at risk")
   - Or ML model (gradient boosting on features → P(close_lost) score)

3. **Reason generation** :
   - For each at-risk deal, identify TOP-3 reasons (highest contributing features)
   - LLM rewrite into natural language : "Risk: ghosting (no reply 21 days). Champion Sarah Chen hasn't responded since Oct 15. Email sentiment cooling: last reply was 'thanks, will discuss'."

**Preuves observées** :
- Marketing claim : "ghosting, stalls, and weak engagement flagged early with clear reasons"
- Skill `churn-risk-detector` (174 lignes) chez nous est aligné
- JD : *"feature pipelines"* — feature engineering pipeline

**Choix d'ingénierie clés** :
- **Multi-feature, not single signal** : "no email 14 days" alone is not enough. Combine.
- **Per-feature contribution explicit** : pour chaque alerte, dire QUEL signal a déclenché
- **Trend detection** : delta vs prior period = key. Stable bad ≠ getting worse.

**Trade-offs invisibles** :
- **Faux positifs** : early stage deals naturally have less activity. Rule "no email 14 days" trips on early deals = noise.
- **Threshold tuning** : depend du sales cycle. 14 days is risk for 2-week cycles, normal for 90-day cycles. Per-tenant tuning.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- `churn-risk-detector` skill
- `deal-velocity.ts`
- Stalled detection in dashboard

**Améliorations P1** :
- **Multi-feature risk model** au lieu de single rule
- **Per-deal threshold based on stage** (early-stage deals tolerate longer silence)
- **Trend detection** : compare current period vs prior 30-day window
- **Weekly digest** : summary of at-risk deals for the user

**Le piège à éviter** :
- Cry wolf : trop d'alertes = user ignore toutes
- Tune for high precision over high recall

---

### 5.3 — *"Auto-filled fields: things like number of calls, stakeholders involved, usage signals, and 'why now' are pulled from real interactions"*

#### Le problème réel
Auto-fill = extract structured data from unstructured interactions and write to deal/account properties. Concretely :
- `deal.number_of_calls` = count meetings on this deal
- `deal.stakeholders_involved` = unique participants across interactions
- `deal.budget_mentioned` = LLM extraction from emails/transcripts
- `deal.timeline` = LLM extraction
- `deal.competitors_mentioned` = LLM extraction
- `deal.why_now` = LLM synthesis of "what triggered this opportunity"

Le challenge : **conflit resolution** quand les sources disent des choses différentes.

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Per-interaction extraction** (already happening at Step 4) :
   - For each meeting/email, LLM extracts structured signals
   - Stored as `interaction.extracted_signals = { budget: ..., team_size: ..., ... }`

2. **Deal-level aggregation** :
   - For each deal, periodically (daily?) aggregate signals from all linked interactions
   - Conflict resolution rules :
     - For "budget" : use most recent mention (latest interaction wins)
     - For "stakeholders" : union of all participants across interactions
     - For "competitors" : union (collect all mentioned)
     - For "why_now" : LLM synthesis from latest 3-5 interactions

3. **Cascade to deal properties** :
   - `syncSignalsToDeal` style worker
   - Update only changed fields (avoid noise in audit log)

4. **Confidence per field** :
   - `deal.budget = $30K (confidence: high, source: meeting Oct 27 — Alex said "our current budget is $30,000")`
   - User can see source of each field

**Preuves observées** :
- Frame analysis Step 4 : exact extracted fields visible (Budget $30K, Team Size 4, Current CRM Hubspot, Point Solutions Apollo+Fireflies)
- Skill `enrichment-email-extract` chez nous + `syncSignalsToDeal`

**Choix d'ingénierie clés** :
- **Field-level lineage** : each field has source attribution
- **Latest-wins for time-sensitive fields** (budget, timeline)
- **Union for accumulating fields** (stakeholders, competitors)
- **LLM synthesis for narrative fields** (why_now, summary)

**Trade-offs invisibles** :
- **Hallucination risk** : LLM might extract "$30K" when the actual mention was "we're looking for around 30 thousand" (currency? per year? per month?). Validation critical.
- **Overwrite issue** : if user manually entered budget = $50K and extraction says $30K, which wins? Default : preserve manual override + flag conflict.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- `enrichment-email-extract`
- `syncSignalsToDeal` cascade

**Améliorations P0** :
- **Test E2E in production** with real data (déjà flagged as P0 dans le bilan précédent)
- **Source attribution UI** : pour chaque field auto-filled, montrer "Source: Meeting on Oct 27"
- **Conflict resolution policy** : explicit rules (latest-wins, union, manual-override)
- **Confidence scoring** per extracted field

**Le piège à éviter** :
- Silent overwrite of user-entered data → user trust crash
- Always preserve manual overrides + signal conflict to user

---

## ÉTAPE 6 — ASK MONACO

### 6.1 — *"Prioritized actions: Monaco tells you the most important actions you can take to close more revenue"*

#### Le problème réel
"Most important actions" implies ranking. Across all open deals + accounts + tasks, which 3-5 actions today have highest expected revenue impact?

Implies :
- **Expected Value calculation per action** : (deal value) × (probability of close) × (urgency factor) × (action impact)
- **Comparing across action types** : "send follow-up to Stalled deal X" vs "respond to inbound demo request" vs "research new account Y"
- **Real-time freshness** : the right action at 9am is different from 5pm (e.g., respond to incoming email faster)

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Action candidates generation** (per user, periodically) :
   - Iterate over open deals → for each, identify possible actions (follow-up, schedule meeting, send proposal, ...)
   - Iterate over inbound signals → respond to demo request, follow up on visitor identified
   - Iterate over high-score TAM accounts → initiate outreach
   - Iterate over tasks due
   - Iterate over at-risk deals → re-engage

2. **Scoring per action** :
   - `expected_value = deal_value × P(close_increase_with_action) × urgency`
   - `urgency` : decays over time (action 1 day late = less impact)

3. **Diversification** :
   - Don't surface 5 follow-ups for the same deal. Mix : 1 follow-up + 1 inbound response + 1 prep meeting + 1 prospect new account

4. **Surface top-N in UI** :
   - Daily dashboard "Your priorities today" section
   - Click → action panel (compose email, schedule meeting, etc.)

**Preuves observées** :
- Frame analysis : daily dashboard "priorities today" with stall detection
- Notre `home/page.tsx` "Your priorities today" section is aligned

**Choix d'ingénierie clés** :
- **Expected value framing** (not just "stalled deals first") : ranks across heterogeneous action types
- **Diversification** : avoid local optima (5 same-deal actions)
- **Time decay** : older actions decay (avoid stale priorities)

**Trade-offs invisibles** :
- **Probability estimation** : "P(close_increase_with_action)" is hard to know. Probably heuristic ("if no contact in 14 days, follow-up has 30% impact").
- **Personalization** : different founders work differently. Some prefer batching. Some prefer mixed days.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- `home/page.tsx` priorities section
- `/api/home/summary` LLM call
- Stall detection

**Améliorations P1** :
- **Explicit scoring** : each priority has visible "$X expected value" breakdown
- **Diversification rules** : enforce mix of action types
- **Time decay** : decay older priorities
- **User feedback loop** : "Was this priority useful?" thumbs up/down → train future rankings

**Le piège à éviter** :
- LLM-only ranking (no math) → unstable
- Too many priorities → analysis paralysis. Limit to 3-5 max.

---

### 6.2 — *"Ask Monaco: chat with Monaco to receive sales feedback and uncover trends across the business"*

#### Le problème réel
The chat is the universal interface. It must :
- **Understand** the user's question (which can range from "what should I do today?" to "show me deals with > $50K closing this quarter")
- **Route** to the right tools/data sources
- **Compose** the answer with citations and actionable next steps
- **Respond fast** (< 5s ideal, < 15s max)

Implementation = full agentic system with multi-step reasoning.

#### Comment Monaco s'y prend

**Architecture probable (multi-step agent loop)** :

1. **Tool registry** : ~30-50 tools (queryDeals, queryContacts, queryAccounts, briefDeal, generateFollowUp, scheduleAnalysis, ...)

2. **System prompt** :
   - Role definition (you are a CRO copilot)
   - Available tools (function definitions)
   - Coaching tone guidelines (brutally honest, specific)
   - Citation requirements (always cite sources)
   - Limit on tool calls (max 10 to avoid runaway)

3. **Per-turn execution** :
   - User asks question
   - LLM picks initial tools to call (often parallel)
   - Tools return data
   - LLM synthesizes or picks next tools
   - Loop until LLM decides to respond
   - Stream response with citations

4. **Quick-action menu** (UI shortcut for common queries) :
   - Pre-defined queries with optimized routing
   - "Overview" → triggers briefDealsSummary tool
   - "Outbound Sequences" → triggers sequencesPerformanceTool

**Preuves observées** :
- Our chat agent : 11 tool groups, 28 skills, 116 tools, multi-step orchestration `stepCountIs(10)`
- Subprocessor OpenAI for chat
- Frame analysis Step 6 : quick-action menu visible

**Choix d'ingénierie clés** :
- **Tool registry as single source of truth** : add/modify tools in one place
- **Streaming response** : start showing partial answer while tools still running
- **Multi-step bounded** : `stepCountIs(10)` prevents runaway
- **Quick-actions as router shortcuts** : common queries don't need full agent loop

**Trade-offs invisibles** :
- **Latency** : 3-5 tool calls = 5-15s. Streaming hides perceived latency.
- **Cost** : multi-step agent = many LLM tokens. $0.05-0.50 per query. At scale, this matters.
- **Tool selection quality** : LLM might pick wrong tool. Eval suite (chat-eval cases) is critical.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- 116 tools, 28 skills, multi-step orchestration
- Eval suite (90 cases + drift detector)

**Améliorations P1** :
- **Cost monitoring per query** : alert if average cost > threshold
- **Cache common queries** : "Brief all deals" doesn't need full agent loop every time
- **Tool selection precision metrics** : track which tools picked, success rate per tool

**Le piège à éviter** :
- Tools adding without curation → LLM gets confused about which to use
- No eval = silent quality drift

---

### 6.3 — *"Proactive insights: Monaco gives you information about your business proactively"*

#### Le problème réel
Don't wait for the user to ask. Surface insights they didn't know they needed :
- "Deal X has been stalled 21 days, 2 days more than your average — likely lost"
- "Industry trend: 3 of your prospects have raised funding in the last 7 days — outreach window is now"
- "Your reply rate dropped 15% this week — your sequences may be flagged"
- "New contact at account Y was promoted to VP — re-engage with new pitch"

Le challenge : **trigger detection** + **insight generation** + **non-spam UX** (don't notify for trivial things).

#### Comment Monaco s'y prend

**Architecture probable** :

1. **Insight generators** (separate workers, each focused on a pattern) :
   - `stalled_deal_insight_generator` : daily check, alerts if deal stalled > tenant_avg
   - `funding_window_insight_generator` : when funding event detected for prospect
   - `sequence_performance_insight_generator` : weekly check on reply rates
   - `contact_promotion_insight_generator` : on job change events
   - ... 10-30 generators total

2. **Insight prioritization** :
   - Each insight has impact score (revenue at risk, opportunity size)
   - Top-N surfaced per user per day

3. **Delivery channels** :
   - In-app notification (badge)
   - Daily email digest
   - Slack notification (if integrated)

4. **De-duplication and decay** :
   - Same insight not surfaced twice within X days
   - Insights decay if not actioned

**Preuves observées** :
- Marketing claim : "proactive insights"
- Subprocessor Slack : confirms Slack notification channel
- Skills `signal-scanner`, `expansion-signal-spotter`, `pipeline-review` chez nous = aligned

**Choix d'ingénierie clés** :
- **Many specialized generators** > one mega-generator (easier to add new patterns)
- **Impact-weighted prioritization** : surface high-revenue-impact insights first
- **Multi-channel delivery** : in-app for low urgency, Slack for high urgency

**Trade-offs invisibles** :
- **Notification fatigue** : if too many, user mutes everything. Faut throttling + opt-out par type.
- **Trust building** : early insights must be obviously valuable. Bad early insights = user disables.

#### Comment Elevay devrait s'y prendre

**On a la base** :
- Multiple signal scanners
- Daily founder coaching brief

**Améliorations P1** :
- **Insight catalog** : unified system for insight generators + prioritization + delivery
- **Slack integration** : send high-urgency insights to Slack
- **User feedback** : thumbs up/down per insight → improve future
- **Throttling** : max 5 insights/day per user

**Le piège à éviter** :
- Generic insights ("you have 3 deals at risk") → user shrugs
- Always have an actionable next step ("Click to draft re-engagement email")

---

# PATTERNS TRANSVERSAUX (les techniques qui se répètent)

Au-delà des features individuelles, **6 patterns d'ingénierie** reviennent constamment chez Monaco et définissent leur architecture :

## Pattern 1 — Hybrid deterministic + LLM

**Où on le voit** :
- Scoring (rule-based + LLM judge for ambiguity)
- Stage transitions (rules for clear cases + LLM for ambiguous)
- Signal detection (3-tier : keywords → URL HEAD → LLM judge)
- NL search (LLM router → deterministic execution)

**Pourquoi ça marche** :
- Coût : LLM appelé seulement quand nécessaire (90% des cas = rule-based)
- Latence : rule-based = ms, LLM = sec
- Explicabilité : rule-based = explicit, LLM = opaque
- Reliability : rule-based = deterministic, LLM = stochastic

**Application Elevay** : pour chaque feature LLM, demander "peut-on faire 80% en rules et 20% en LLM ?"

## Pattern 2 — Streaming UI + Async backend

**Où on le voit** :
- TAM build (rows appear as scored)
- Chat responses (token-by-token)
- Meeting notes ("Updating..." live)
- Sequence generation (template appears progressively)

**Pourquoi ça marche** :
- Perceived latency lower than actual
- User stays engaged (no spinner)
- Can cancel mid-way

**Application Elevay** : déjà en place pour TAM + chat. Étendre à meeting notes + sequence generation.

## Pattern 3 — Event-driven cascade

**Où on le voit** :
- Email received → extraction → signal → deal property update → stage change
- Funding announcement → signal → enrollment in post-funding sequence
- Meeting completed → bot transcript → extraction → follow-up generated

**Pourquoi ça marche** :
- Decoupling : each step independent
- Parallelization : multiple consumers per event
- Replayability : can re-process events

**Application Elevay** : Inngest already provides this. Vérifier que tous les flows sont event-driven (pas cron).

## Pattern 4 — Citation grounding (anti-hallucination)

**Où on le voit** :
- Signal reasoning ("source : Founders Fund article")
- Coaching ("Alex mentioned at minute 14:32 that...")
- Auto-extracted fields ("Source: meeting Oct 27")

**Pourquoi ça marche** :
- Builds trust (user can verify)
- Forces LLM to be grounded (less hallucination)
- Audit trail

**Application Elevay** : ajouter citations partout où LLM génère content destiné à l'utilisateur.

## Pattern 5 — Tier de confiance (4-state badges)

**Où on le voit** :
- Signal chips (high green / medium green dashed / unverified gray / false strikethrough)
- Score grades (A burning / A warm / B cool / C cold)

**Pourquoi ça marche** :
- Honest about uncertainty
- User calibrates trust per item
- Avoids binary "yes/no" overconfidence

**Application Elevay** : étendre 4-state à toutes les outputs LLM (pas juste signaux).

## Pattern 6 — Human-in-the-loop par défaut, autonomy par escalation

**Où on le voit** :
- Sequences : approve mode default, auto mode after 20 reviews
- Stage changes : suggest mode default, auto mode opt-in
- Coaching : surface insights, don't act on them
- Forward-deployed AE : human reviews AI outputs in early days

**Pourquoi ça marche** :
- Builds trust progressively
- Catches AI failures early
- User feels in control

**Application Elevay** : default to suggest/approve, escalate to auto only after proven quality.

---

# LE SYSTÈME NERVEUX (comment les 6 étapes s'interconnectent)

Chaque étape n'est pas isolée. Elles forment un **flywheel** où les outputs de l'une deviennent les inputs de l'autre :

```
Build TAM ───→ Overlay Signals ───→ Execute Sequences
   ↑              ↑                       ↓
   │              │                  Capture Activity
   │              │                       ↓
   │              └──── Track Pipeline ←──┘
   │                       ↓
   └────────── Ask Monaco ─┘ (synthesize feedback)
```

**Boucles critiques** :

1. **Capture Activity → Overlay Signals** : every interaction enriches signals (e.g., email mentioning competitor → add as `competitors_mentioned` signal)

2. **Track Pipeline → Build TAM** : closed-won deals refine the ICP grounding (closed at $50K → adjust scoring weights)

3. **Ask Monaco → Execute Sequences** : coaching insights surface what's not working in current sequences → user adjusts copy

4. **Track Pipeline → Execute Sequences** : risk detection triggers re-engagement sequences automatically

5. **Capture Activity → Ask Monaco** : transcripts feed coaching with citations

**Pourquoi c'est critique** :
Si un maillon est faible, la chaîne entière souffre. Exemple : si le sync email casse silently (Capture Activity faible) → les signaux sont stale (Overlay Signals faible) → les sequences ciblent mal (Execute Sequences faible) → le pipeline fail à reflect reality (Track Pipeline faible) → le coaching base ses insights sur du vent (Ask Monaco faible).

**Application Elevay** : monitoring end-to-end de la chaîne, pas par maillon. Si le sync casse, pas seulement alerter "email sync broken" mais aussi "downstream effects: signals stale, scoring degraded, coaching less reliable".

---

# CONCLUSION OPÉRATIONNELLE

Les 6 étapes Monaco reposent sur **6 patterns** récurrents et **1 système nerveux** intégré. Pour égaler ou dépasser :

**Court terme (1-3 mois)** :
1. Audit nos features sur ces 6 patterns. Lesquelles manquent de citation grounding ? Lesquelles sont LLM-only sans rule-based fallback ?
2. Implementer le **5 P0** identifiés dans le bilan précédent (per-seq approve UI, visitor ID, onboarding wizard, transcript-grounded coaching, auto-fill E2E test).
3. Monitoring end-to-end de la chaîne (pas par maillon).

**Moyen terme (3-6 mois)** :
1. Migrer cron-based vers event-driven là où la latence kairos compte (signals, stage transitions).
2. Add Slack integration as notification channel.
3. Self-serve onboarding wizard 7-phases avec validation gates.

**Long terme (6-12 mois)** :
1. ML scoring per-tenant (quand on a assez de closed-wons).
2. Visitor ID multi-provider (RB2B + Snitcher + Clearbit Reveal).
3. Voice profile capture + sequence generation aligned.

**Le différentiateur fondamental** que Monaco n'aura jamais (par design) :
- **Self-serve depuis le jour 1** (pas de demo gate)
- **Transparent pricing**
- **Localisation native** (français en premier)
- **Voice du founder préservée** (pas de templates pré-écrits)
- **Architecture event-driven moderne** (Inngest > leur in-house)

C'est ce qu'on construit.
