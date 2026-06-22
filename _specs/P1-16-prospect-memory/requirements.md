# P1-16 — Prospect Memory (mémoire accumulée par prospect, dédupliquée et citée)

## Note importante (vérité du code post-P0)

L'audit initial proposait de « créer `lib/memory/prospect-memory.ts` : pipeline LLM
style Mem0 (extraction → dédup → store {fact, source, capturedAt, contactId/companyId})
+ une nouvelle table Drizzle ». **C'est en grande partie déjà construit.** Re-spécifier
ce pipeline serait un bug. Vérité du code live :

- **Le graphe bi-temporel existe et EST le store Mem0.** `app/apps/web/src/lib/ai/context-graph.ts`
  implémente exactement le pipeline proposé :
  - extraction faits+entités par LLM (`extractEntitiesAndFacts` :46-158, Claude `claude-sonnet-4-6`),
  - dédup d'entités par nom exact + fuzzy + similarité embedding > 0.85 (`resolveEntity` :162-242),
  - dédup/invalidation d'arêtes (insert/contradiction→invalidate/duplicate→discard,
    `resolveEdge` :246-327, `detectContradiction` :329-371),
  - provenance portée par arête : `sourceType`, `sourceId`, `tValid/tInvalid/tCreated/tExpired`,
    `confidence` (schéma `contextGraphEdges` `db/schema/intelligence.ts` :242-270).
- **Le store vectoriel existe : pgvector + HNSW.** Table `embeddings vector(1536)`
  créée en SQL brut (`db/ensure-vector-index.ts` :17-28, index HNSW :52-58) ; colonnes
  `embedding vector` aussi sur `context_graph_nodes`/`_edges` (référencées en SQL brut
  `context-graph.ts` :195-203, 475-510). **Décision pgvector vs store externe : déjà tranchée
  en faveur de pgvector (Postgres existant). Ne pas rouvrir.** `[LOCKED]`
- **L'ingestion accumulative est déjà branchée sur 6 canaux de capture** (≠ brief TTL écrasé) :
  email sync (`api/email/sync/route.ts` :277 + `api/cron/email-sync/route.ts` :77),
  meeting Recall webhook (`api/webhooks/recall/route.ts` :367), transcript
  (`api/meetings/process-transcript/route.ts` :282 + `lib/meetings/apply-transcript.ts` :234),
  notes (`api/notes/route.ts` :118 + `lib/chat/tools/create.ts` :240), cold call
  (`inngest/calls-post-process.ts` :385), capture email générique (`lib/capture/email-capture.ts` :426).
  Tous via `ingestEpisode(tenantId, content, sourceType, sourceId)`.
- **Le retrieval NL cité existe** : `searchContextGraph(query, tenantId, limit)` (`context-graph.ts` :461-644)
  fait vector (nodes+edges) + traversée 2-hop + keyword, et renvoie chaque fait avec
  `relationType`, `confidence`, fenêtre temporelle (`validFrom→validTo`), `sourceType`.
- **L'intelligence de thread email est aussi déjà extraite** (`lib/emails/email-intelligence.ts` :107-183,
  signaux/objections/sentiment/next-steps avec evidence) et persistée en metadata d'activité
  + déclenchée par Inngest (`inngest/thread-intelligence.ts`).
- **Le brief reste un cache TTL écrasé** : `BRIEF_TTL_DAYS = 14`
  (`lib/campaign-engine/build-intelligence-brief.ts` :17 — l'audit disait 16, c'est 14),
  upsert `onConflictDoUpdate` :102. C'est correct : le brief est de la recherche externe
  périssable, **pas** la mémoire d'interaction. Les deux coexistent.

**Le vrai GAP n'est donc PAS le pipeline — c'est le branchement et deux bugs de correction
qui rendent la mémoire par contact invisible à la génération de séquence et à « Why this draft ».**

GAPS réels (tous `[NEW]`, périmètre étroit et boilable) :

1. **`[NEW]` Les nœuds extraits ne portent pas leur `entityId` CRM.** `resolveEntity`
   (`context-graph.ts` :162-242) ne renseigne jamais `contextGraphNodes.entityId` — les
   nœuds issus de `ingestEpisode` sont orphelins du contact/company CRM. Conséquence :
   le retrieval par contact (ci-dessous) ne peut pas les rattacher.
2. **`[NEW]` Bug SQL : la lecture par contact ne renvoie jamais rien.**
   `loadGraphFacts` (`lib/context/enriched-prospect-context.ts` :223) filtre avec
   `eq(contextGraphEdges.tExpired, null as unknown as Date)` → traduit en `t_expired = NULL`,
   toujours faux en SQL → **0 arête renvoyée systématiquement**. Doit être `isNull(tExpired)`.
3. **`[NEW]` La mémoire n'atteint pas `generateSequence`.** `generateSequence`
   (`lib/agents/sequence-generator.ts` :68) consomme un `ProspectContext`
   (firmographie + brief), formaté par `formatContextForPrompt`
   (`lib/context/prospect-context.ts` :310). Il existe bien `buildEnrichedContext` +
   `formatEnrichedContextForPrompt` (`enriched-prospect-context.ts` :57, :287) qui ajoutent
   `graphFacts`, mais **aucun chemin de génération de séquence ne les appelle** (seul
   `lib/chat/tools/briefing.ts` les utilise). La séquence ignore donc objections, next-steps,
   faits relationnels accumulés.
4. **`[NEW]` « Why this draft » n'affiche pas la mémoire citée.** La route
   `api/sequences/drafts/[id]/context/route.ts` renvoie contact/account/deal +
   5 dernières activités + `personalizationSources` (:169) — mais **aucun fait mémoire
   cité** (fact + source + date). L'audit demande des faits requêtables/citables ; ils ne
   sont pas exposés au panneau d'approbation.

OCEAN à flaguer (hors MVP) : un **module de retrieval NL générique « interroge la mémoire
d'un prospect en langage naturel »** côté produit (au-delà du chat existant), un **scoring
de pertinence/recence pondéré par embedding pour le ranking des faits injectés**, et la
**réconciliation rétroactive** des milliers de nœuds déjà orphelins (`entityId = null`).
Voir Hors scope.

## Scope

MVP boilable, 4 fixes additifs, zéro nouvelle table :

- **Rattacher** les nœuds extraits au CRM (`entityId`) à l'ingestion, par résolution
  contact/company.
- **Corriger** le bug `tExpired` pour que la lecture par contact renvoie les faits valides.
- **Injecter** la mémoire (graphFacts + signaux extraits) dans la génération de séquence
  via le `EnrichedProspectContext` déjà existant.
- **Exposer** les faits mémoire cités (fact + relation + source + date + confidence) dans
  la route « Why this draft ».

Aucune migration de schéma (les tables `context_graph_nodes/_edges`, `embeddings` existent
déjà). Backfill de données optionnel (re-link rétroactif) flaggé en déploiement.

## Exigences (EARS)

### R1 — Rattachement entité CRM à l'ingestion (`[NEW]`)

- **R1.1** — WHEN `ingestEpisode` résout une entité extraite de type `person` ou `company`
  dont le nom correspond (exact ou similarité ≥ 0.85) à un contact/company CRM du même
  tenant, THE SYSTEM SHALL renseigner `contextGraphNodes.entityId` avec l'id CRM correspondant
  (`context-graph.ts` `resolveEntity` :162-242, aujourd'hui jamais renseigné).
- **R1.2** — WHERE aucune correspondance CRM n'est trouvée, THE SYSTEM SHALL créer/maj le
  nœud avec `entityId = null` (comportement actuel inchangé), sans échouer l'ingestion.
- **R1.3** — IF la résolution CRM échoue (DB error, timeout), THEN THE SYSTEM SHALL continuer
  l'ingestion avec `entityId = null` (fail-open ; l'ingestion ne doit jamais bloquer une
  capture — cohérent avec les `.catch()` non-bloquants des 6 call-sites).
- **R1.4** — THE SYSTEM SHALL résoudre le contact CRM par email exact d'abord, puis par nom
  normalisé (insensible à la casse, trim), tenant-scopé, avant tout fallback embedding.

### R2 — Correction de la lecture par contact (`[NEW]`)

- **R2.1** — WHEN `loadGraphFacts(contactId, tenantId, dealId?)` filtre les arêtes encore
  valides, THE SYSTEM SHALL utiliser `isNull(contextGraphEdges.tExpired)` au lieu de
  `eq(tExpired, null)` (`enriched-prospect-context.ts` :223 — bug actuel : 0 ligne).
- **R2.2** — THE SYSTEM SHALL ne retenir que les arêtes non invalidées (`tInvalid IS NULL`)
  ET non expirées (`tExpired IS NULL`) pour refléter l'état courant de la mémoire bi-temporelle.
- **R2.3** — WHEN aucun nœud n'est rattaché au contact (`entityId = contactId`), THE SYSTEM
  SHALL retourner un tableau vide sans erreur (dégradation gracieuse, déjà :202).

### R3 — Injection mémoire dans la génération de séquence (`[NEW]`)

- **R3.1** — WHEN une séquence est générée pour un contact, THE SYSTEM SHALL construire le
  contexte via `buildEnrichedContext(contactId, tenantId)` (qui étend `buildProspectContext`)
  de sorte que `graphFacts` et `extractedSignals` soient disponibles au prompt.
- **R3.2** — THE SYSTEM SHALL injecter dans le prompt de génération les faits mémoire de
  confiance ≥ 0.6 (objections connues, next-steps en attente, faits `OBJECTED_TO/REQUESTED/
  DISCUSSED/COMPETES_WITH`) via `formatEnrichedContextForPrompt` (`enriched-prospect-context.ts` :287).
- **R3.3** — WHERE le contact n'a aucune mémoire accumulée, THE SYSTEM SHALL produire la même
  séquence qu'aujourd'hui (le bloc mémoire est omis si vide — déjà géré par les gardes
  `if (...length > 0)` du formateur), sans régression.
- **R3.4** — THE SYSTEM SHALL préserver le gate qualité P0-3 existant
  (`gradeSequenceQuality` via la boucle évaluateur-optimiseur, `sequence-generator.ts` :104-118) :
  l'injection mémoire ne contourne ni ne modifie le seuil de passage.
- **R3.5** — IF `buildEnrichedContext` échoue ou time-out, THEN THE SYSTEM SHALL retomber sur
  le `ProspectContext` de base (fail-open), la génération ne devant jamais échouer sur une
  dépendance mémoire optionnelle.

### R4 — Mémoire citée dans « Why this draft » (`[NEW]`)

- **R4.1** — WHEN le panneau « Why this draft » charge le contexte d'un brouillon
  (`api/sequences/drafts/[id]/context/route.ts`), THE SYSTEM SHALL inclure un champ
  `memoryFacts: Array<{ fact, relation, date, confidence, sourceType }>` tiré du graphe
  pour le contact du brouillon, tenant-scopé.
- **R4.2** — THE SYSTEM SHALL trier `memoryFacts` par confiance décroissante puis date
  décroissante et plafonner à 8 entrées (budget UI).
- **R4.3** — THE SYSTEM SHALL ne renvoyer que des faits valides (`tInvalid IS NULL` ET
  `tExpired IS NULL`) — un fait invalidé/contredit ne doit jamais être présenté comme
  justification active.
- **R4.4** — IF le contact n'a aucun fait mémoire, THEN THE SYSTEM SHALL renvoyer
  `memoryFacts: []` (le panneau retombe sur signaux + activités récentes, déjà présents).
- **R4.5** — THE SYSTEM SHALL conserver tous les champs existants de la réponse
  (`draft`, `contact`, `account`, `deal`, `recentInteractions`, `signalsAtTriggerTime`) — additif uniquement.

### R5 — Garde-fous transverses

- **R5.1** — THE SYSTEM SHALL tenant-scoper toute lecture/écriture de mémoire (filtre
  `tenantId` obligatoire sur `context_graph_nodes/_edges` et `embeddings`).
- **R5.2** — THE SYSTEM SHALL borner le coût LLM : l'extraction d'épisode reste sur le
  modèle déjà câblé (`claude-sonnet-4-6`, `context-graph.ts` :135) et n'est PAS appelée
  en synchrone dans le chemin de génération (R3 lit la mémoire déjà ingérée, n'extrait pas).
- **R5.3** — THE SYSTEM SHALL NOT créer de nouvelle table, de nouveau provider d'embedding,
  ni de store vectoriel externe (`[LOCKED]` pgvector).
- **R5.4** — THE SYSTEM SHALL NOT modifier le pipeline d'extraction/dédup/invalidation
  existant (`extractEntitiesAndFacts`, `resolveEdge`, `detectContradiction`) au-delà du
  renseignement de `entityId` (R1).
- **R5.5** — THE SYSTEM SHALL NOT introduire une mémoire schema-less ad hoc parallèle au
  graphe (le graphe EST la mémoire schema-less requêtable).

## Critères d'acceptation

- **AC1** (R1.1/R1.4) — GIVEN un tenant avec un contact CRM « Marc Dupont » (email
  marc@datasync.io) et un email mentionnant Marc Dupont, WHEN `ingestEpisode` traite l'email,
  THEN le nœud `person` « Marc Dupont » a `entityId = <contact.id>`.
  *État actuel : `entityId` reste null (`context-graph.ts` :225-230 n'écrit pas `entityId`).*
- **AC2** (R2.1) — GIVEN un contact avec ≥ 1 arête valide (`tInvalid` null, `tExpired` null),
  WHEN `loadGraphFacts(contactId, tenantId)` est appelé, THEN il renvoie ≥ 1 `GraphFact`.
  *État actuel : renvoie toujours `[]` à cause de `eq(tExpired, null)` (`enriched-prospect-context.ts` :223).*
- **AC3** (R2.2) — GIVEN une arête invalidée par contradiction (`tInvalid` non null) et une
  arête courante valide, WHEN `loadGraphFacts` est appelé, THEN seule l'arête courante est
  renvoyée.
- **AC4** (R3.1/R3.2) — GIVEN un contact avec une objection budget connue en mémoire, WHEN
  une séquence est générée, THEN le prompt de génération contient la section
  « KNOWN OBJECTIONS » / « KNOWLEDGE GRAPH FACTS » (vérifiable via le bloc
  `formatEnrichedContextForPrompt` — **DÉJÀ IMPLÉMENTÉ dans `enriched-prospect-context.ts` :292-332**,
  reste à brancher).
- **AC5** (R3.3) — GIVEN un contact sans mémoire, WHEN une séquence est générée, THEN la
  séquence et son score qualité sont identiques au comportement pré-P1-16 (test de non-régression).
- **AC6** (R3.4) — GIVEN l'injection mémoire active, WHEN une séquence est gradée, THEN le
  gate `gradeSequenceQuality` (**DÉJÀ IMPLÉMENTÉ dans `lib/evals/sequence-quality.ts` :68-97**)
  s'exécute inchangé et `sequenceQuality.passed` reflète le même seuil.
- **AC7** (R4.1/R4.3) — GIVEN un brouillon de séquence sur un contact ayant 2 faits valides
  et 1 fait invalidé, WHEN `GET /api/sequences/drafts/[id]/context` est appelé, THEN
  `memoryFacts` contient exactement les 2 faits valides, triés par confiance.
- **AC8** (R4.5) — GIVEN la route de contexte, WHEN elle répond, THEN tous les champs
  pré-existants restent présents (`signalsAtTriggerTime`, `recentInteractions`, etc.).
- **AC9** (R5.1) — GIVEN deux tenants A et B avec des contacts homonymes, WHEN A lit la
  mémoire de son contact, THEN aucun fait de B n'apparaît (filtre `tenantId`).

## Edge cases exhaustifs

1. **Nœud déjà existant sans `entityId` (orphelin historique)** — R1.1 met à jour
   `entityId` lors de la prochaine résolution (exact match) ; les orphelins jamais
   re-rencontrés restent null jusqu'au backfill (flaggé déploiement, hors MVP).
2. **Collision de noms inter-contacts** (deux « John Smith » dans le même tenant) — R1.4
   privilégie l'email exact ; à défaut d'email dans l'épisode, prendre le contact le plus
   récemment actif et **ne pas** écraser un `entityId` déjà posé (idempotence).
3. **`entityId` déjà renseigné mais pointant un contact supprimé** (`deletedAt`) — la lecture
   (`loadGraphFacts`) ne joint pas `contacts`, donc le fait reste lisible ; « Why this draft »
   et `buildProspectContext` filtrent déjà `isNull(deletedAt)` côté contact → pas de fuite.
4. **Arête sans `tValid`** (null) — `loadGraphFacts` mappe la date à `"unknown"` (déjà :232) ;
   tri par date doit traiter `"unknown"`/null comme le plus ancien.
5. **Fait de très faible confiance** (< 0.6) — exclu du prompt de séquence (R3.2) mais
   peut apparaître dans « Why this draft » (transparence) ; documenter l'écart de seuil.
6. **Contradiction non détectée** (LLM `detectContradiction` renvoie « no » à tort) — deux
   faits opposés tous deux valides peuvent être injectés ; acceptable en MVP (le gate qualité
   + la revue humaine attrapent l'incohérence). Pas de sur-ingénierie.
7. **OPENAI_API_KEY absent** — `resolveEntity` saute la similarité embedding (déjà gardé
   :189, :221) ; R1 fonctionne quand même sur exact/fuzzy nom + email CRM (pas d'embedding requis).
8. **Très gros graphe par contact** (centaines d'arêtes) — `loadGraphFacts` borne à 30 (déjà
   :227) ; « Why this draft » re-borne à 8 (R4.2) ; séquence n'injecte que ≥ 0.6.
9. **Épisode purement firmographique** (aucune entité personne) — `ingestEpisode` retourne
   `{0,0}` (déjà :395) ; R1 sans objet, pas d'erreur.
10. **Timeout de `buildEnrichedContext` dans la génération** — R3.5 fail-open vers
    `ProspectContext` de base ; envelopper l'appel mémoire dans `withTimeout`
    (`lib/utils/with-timeout.ts`, fail-open → null) pour ne jamais bloquer la génération.
11. **Brouillon sans `contactId` valide** — la route renvoie déjà 404 si le draft est absent ;
    si le contact est introuvable, `memoryFacts: []` (R4.4).
12. **Re-génération après rejet (P0-6)** — l'injection mémoire coexiste avec
    `rejectionInsight` (`sequence-generator.ts` :70, :80) ; les deux blocs cohabitent dans le
    prompt sans se masquer (mémoire dans le contexte, rejet en préfixe).

## Hors scope

- **`[HORS SCOPE]`** Backfill rétroactif des nœuds orphelins existants (`entityId = null`)
  → script de re-link séparé, flaggé déploiement (R1 ne corrige que le flux à venir).
- **`[HORS SCOPE]`** Module produit « interroge la mémoire d'un prospect en NL » dédié hors
  chat — `searchContextGraph` couvre déjà le chat (`chat/route.ts` :475) ; un panneau dédié
  par contact est un suivi UI.
- **`[HORS SCOPE]`** Ranking pondéré recence×confiance×similarité pour l'injection (MVP = filtre
  ≥ 0.6 + tri date) ; un re-ranker RRF par contact est l'ocean.
- **`[LOCKED]`** Store vectoriel externe (Pinecone/Weaviate) — pgvector tranché.
- **`[LOCKED]`** Refonte du modèle de graphe (nouvelles tables, schema-less alterne) — le
  bi-temporel existant est la cible.
- **`[HORS SCOPE]`** Extraction temps-réel synchrone dans le chemin de génération (R5.2 :
  on lit la mémoire déjà ingérée par les jobs Inngest, on n'extrait pas en synchrone).