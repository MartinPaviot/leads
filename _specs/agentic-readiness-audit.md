# Audit critique — Specs agentic vs Lightfield réel

*2026-05-01 — Self-challenge before implementation*

---

## SPEC 1: Custom Skills Builder — VERDICT: 4/10

### Ce que Lightfield fait VRAIMENT
- Un Skill = tâche + étapes NL + contraintes + paramètres + format de sortie
- L'utilisateur fork un skill système et le customise ("Meeting Prep mais avec MES questions de discovery")
- Les skills sont invocables depuis le chat, les workflows, les crons, et les événements CRM
- Les skills composent avec Knowledge (le contexte business est injecté automatiquement)
- Les skills tournent sur des entités multiples ("Run this on all my stalled deals")
- Les résultats persistent sur l'entité (le score de qualification est sauvé sur le contact)

### Ce que ma spec rate
1. **Modèle d'exécution flou** — "build a prompt and call the chat agent" est un placeholder, pas un design. Il faut définir: comment le skill-specific system prompt est construit, quels tools sont autorisés par step, comment le progress est reporté, comment l'output est validé.

2. **Pas de fork de skill système** — Lightfield permet de partir d'un skill existant et de le customiser. Notre spec crée seulement des skills from scratch. Or l'onramp est: "pick a pre-built, customize it."

3. **Pas d'exécution bulk** — "Qualify all my inbound leads from this week" = le skill tourne sur N entités. Ma spec assume une entité à la fois.

4. **Pas de persistance de résultats** — Quand un skill qualifie un lead, le score doit être sauvé sur `contact.properties.skillResults`. Ma spec retourne le résultat en chat et c'est tout.

5. **Pas d'intégration workflow** — Les skills devraient être triggerable comme action dans un workflow (`ai_action` existe déjà mais ne supporte pas les custom skills).

6. **Pas d'intégration événement** — `skill-events.ts` hardcode enrich+qualify sur contact/created. Les custom skills devraient pouvoir s'enregistrer sur n'importe quel événement CRM.

7. **L'orchestrator est ignoré** — Comment l'orchestrator route-t-il vers un custom skill? Les intent patterns sont regex hardcodés dans `orchestrator.ts`. Faut un mécanisme dynamique.

8. **Pas de cost tracking** — Chaque skill a un `costEstimate` mais on ne tracked pas le coût réel.

---

## SPEC 2: Knowledge Layer — VERDICT: 3/10

### Ce que Lightfield fait VRAIMENT
- Knowledge = contexte business structuré qui INFORME chaque interaction agent
- Catégories: ICP, Competitors, Objections, Product, Process, Context
- "If you've given the same instructions to a new hire three times, that's a Skill. If you keep re-explaining the same context, that's Knowledge."
- Knowledge est TOUJOURS consultée — pas optionnellement

### Ce que ma spec rate
1. **L'injection actuelle est criminelle** — 5 entries × 300 chars = 1500 chars de contexte business. Pour un CRM qui prétend comprendre ton business, c'est ridicule. Le chat prompt tronque les entries à 300 chars et en prend max 5. Un ICP definition de 2 pages est réduit à une phrase.

2. **Pas de retrieval intelligent** — Ma spec dit "embedding search" mais ne définit pas QUAND et COMMENT. La bonne approche: pour chaque message chat, embed le message, cosine similarity contre les knowledge entries, injecter les top-K pertinentes EN ENTIER (pas tronquées).

3. **Overlap avec le context graph non résolu** — Le context graph stocke déjà des faits business extraits des emails/meetings. Knowledge stocke des règles user-defined. Faut délimiter clairement:
   - Context Graph = faits objectifs auto-extraits (Alice works at Acme)
   - Knowledge = règles subjectives user-defined (notre ICP = Series A SaaS)
   - Knowledge a priorité (c'est la ground truth du user)

4. **Pas d'indexation dans le context graph** — Les knowledge entries devraient être des nodes "topic" dans le graph. Comme ça, quand le graph fait BFS depuis "Acme", il trouve aussi "ICP criteria" si pertinent.

5. **Pas de file upload** — PDF, Google Docs, pitch decks. Parse → knowledge entries. Lightfield supporte ça.

6. **Pas d'auto-suggestion** — L'agent devrait dire "Tu mentionnes souvent ces critères ICP, je les sauvegarde en Knowledge?"

7. **La migration depuis tenant settings est insuffisante** — Il faut migrer ET enrichir: générer les embeddings, attribuer des catégories, indexer dans le graph.

---

## SPEC 3: Agentic Import — VERDICT: 5/10

### Ce que Lightfield fait VRAIMENT
- Upload dans le chat, l'agent fait TOUT
- 90K records/heure (25/sec) — batch INSERT, pas row-by-row
- Dedup fuzzy (pas juste email exact — "Acme Corp" = "Acme Corporation")
- Multi-file stitching automatique (companies.csv + contacts.csv → relations câblées)
- Retry-safe (hash par row, skip déjà traités)
- Propose la création de custom fields pour les colonnes non mappées
- Post-import: enrichissement + ingestion context graph
- Reconnaît les exports HubSpot/Salesforce/Pipedrive

### Ce que ma spec rate
1. **Le dedup est trop simpliste** — Match email exact seulement. Le context graph a DÉJÀ un entity resolver avec fuzzy matching (embedding similarity > 0.85). On devrait le réutiliser!

2. **Pas de création de custom fields** — Si le CSV a une colonne "ARR" non mappée, l'agent devrait proposer de créer un custom field. L'API data-model existe déjà pour ça.

3. **Pas de reconnaissance de format CRM** — Les exports HubSpot/Salesforce ont des formats connus. L'agent devrait détecter "This looks like a HubSpot export" et auto-mapper.

4. **Le relationship wiring est trop vague** — L'import actuel (`import/route.ts`) crée des companies inline si `companyName` existe. Mais le smart import (`import/smart/`) ne fait PAS de relationship wiring du tout. Faut un algorithme précis:
   - Contact avec company_name → find company by name/domain → associate
   - Multi-file: detect shared identifiers (company_name in contacts.csv = name in companies.csv)

5. **Pas d'ingestion context graph** — Les records importés doivent être indexés dans le context graph immédiatement pour être queryable en RAG.

6. **Performance non addressée** — Batch INSERT (pas row-by-row). L'import actuel fait `db.insert()` dans une boucle. Pour 90K records, il faut `db.insert().values([...batch])`.

7. **Pas de rollback** — Si l'import est mauvais, on ne peut pas undo. Faut taguer chaque record avec `importJobId` pour permettre un bulk delete.

---

## SPEC 4: Code Execution Sandbox — VERDICT: 4/10

### Ce que Lightfield fait VRAIMENT
- Python sandbox (10x perf sur upgraded sandbox)
- Agent plan → write → execute → evaluate → iterate (5 loops)
- Sub-agent composition (dispatch sub-agents par account)
- Output: structured reports, visualizations, scorecards, dashboards
- Board-ready artifacts

### Ce que ma spec rate
1. **`isolated-vm` async problem** — Le problème #1 que j'ai ignoré: les V8 isolates dans `isolated-vm` ne supportent PAS async/await nativement dans le sandbox. Mon CRM bridge utilise `async` mais le code dans l'isolate ne peut pas faire `await`. Il faut soit:
   - Pre-fetch toutes les données AVANT d'exécuter le code (inject as JSON)
   - Utiliser `ivm.Reference.applySync` avec un thread worker pattern
   - Ou abandonner `isolated-vm` pour une solution plus simple

2. **Meilleure alternative: pre-fetch + Function()** — Pour un CRM, le pattern optimal est:
   - Agent décrit quelle data il faut (deals won in last 6 months)
   - Le host fetch la data via les queries CRM normales
   - Les data sont injectées comme JSON dans le sandbox
   - Le code ne fait que traiter/analyser (pas de calls async)
   - Plus simple, plus rapide, plus sécurisé

3. **Pas de visualisation** — Lightfield génère des charts/dashboards. Faut intégrer un renderer de charts (vega-lite specs → SVG/PNG côté serveur, ou Chart.js/Recharts specs → render côté client).

4. **Pas d'artifacts** — Les résultats devraient être sauvegardables comme rapports partageables. "Save this analysis as a report" → accès depuis le dashboard.

5. **Pas de sub-agent composition** — Lightfield dispatch des sub-agents par account pour des analyses granulaires. Notre spec fait tout en un seul script.

6. **Pas de utility libraries** — Le sandbox devrait inclure lodash, date-fns préchargés.

7. **Le write mode est bien conçu mais manque de détail UX** — Comment le user voit la preview? Un diff table? Un résumé?

---

## SPEC 5: Long-Running Tasks — VERDICT: 5/10

### Ce que Lightfield fait VRAIMENT
- "Significant upgrades to chat infrastructure to allow the agent to work on long-running tasks, log its progress, and resume when able"
- Progress indicators in real-time
- Notifications quand user input nécessaire ou opération complète
- Status pour tâches en cours

### Ce que ma spec rate
1. **Polling 5s est mauvais** — SSE (Server-Sent Events) est bien supporté par Next.js et donne du vrai real-time sans la complexité WebSocket. Un endpoint `/api/tasks/[id]/stream` qui émet des events.

2. **Pas de task dependencies** — Import companies → import contacts → import deals = 3 tâches dépendantes. Faut un DAG simple.

3. **Pas d'intégration chat native** — Le chat utilise `TextStreamChatTransport` (Vercel AI SDK). Les task progress updates devraient s'intégrer dans le chat stream via un `part` de type `task-progress`, pas via un composant séparé qui poll.

4. **Le checkpoint model est vague** — Qu'est-ce qui est checkpointé exactement? Un numéro de row? Un offset? Un partial result? Faut être spécifique par type de tâche.

5. **Pas de queue visualization** — "3 tasks running, 2 queued" n'est pas dans le spec.

6. **L'Inngest pattern de retry est bon mais la propagation de cancellation pas définie** — Comment la fonction Inngest sait qu'elle est cancelled? Elle doit checker en DB à chaque batch. Faut le définir.

---

## PLAN RÉVISÉ

### Ordre d'implémentation (inchangé, mais profondeur accrue):

1. **Long-Running Tasks** — Foundation. SSE endpoint + agent_tasks table + Inngest wrapper + chat progress part.
2. **Knowledge Layer** — RAG-grade retrieval, context graph indexation, full content injection, file upload.
3. **Custom Skills Builder** — Fork system skills, bulk execution, result persistence, workflow/event triggers.
4. **Agentic Import** — Chat integration, fuzzy dedup via entity resolver, relationship wiring, custom field creation, context graph ingestion.
5. **Code Execution Sandbox** — Pre-fetch data pattern, chart specs output, artifact system.

### Critère de succès par spec:
- **Long-Running Tasks**: Un import de 10K records montre un progress bar real-time en chat qui se met à jour chaque seconde, est cancellable, et resume après crash.
- **Knowledge Layer**: "Does Acme fit our ICP?" en chat retourne une réponse qui cite verbatim l'ICP definition complète, pas une version tronquée.
- **Custom Skills Builder**: Un user crée "Qualify with My Framework" en forking "Qualify Lead", customise 2 steps, l'exécute sur 50 leads via "Qualify all my new leads from this week", résultats sauvés sur chaque contact.
- **Agentic Import**: Upload contacts.csv + companies.csv en chat → l'agent les stitch, déduplique "Acme Corp"/"ACME", wire les contacts aux companies, propose de créer un champ custom "ARR", tout ça avec un progress bar.
- **Code Execution**: "Show me win rate by company size" → l'agent fetch les deals, écrit du JS d'analyse, produit un tableau + un chart spec, le tout en 15 secondes.
