# Monaco Job Roles → Elevay Product Audit (2026-05-07)

Source : `_research/monaco-bilan-et-classification-2026-05-06.md` Annexe B.
Question Martin : *"Est-ce que tout ce qui est demandé sur les fiches de poste est appréhendé de la même vue métier dans notre produit, ainsi que de la même rigueur qu'une personne de ce métier le ferait ?? Comment le faire parfaitement ??"*

Méthode : pour chaque rôle Monaco, j'audite (a) la vue métier, (b) la rigueur. Les notes sont volontairement sévères — Sam Blond verbatim *"Onboarding is where Monaco wins or loses"* s'applique récursivement à chaque dimension. La colonne **"Pour le faire parfaitement"** est concrète, pas philosophique.

---

## 1. AI Product Designer — *"making unreliable data feel stable"*

**Vue métier requise** : tout AI output est non-déterministe ; le designer rend l'incertitude lisible (confidence labels, états "pense", citations cliquables, undo, fallback states).

**Vue métier dans Elevay** : ✅ couverte structurellement
- Citation chips `[mm:ss]` (MONACO-PARITY-05)
- Badge 4-state confidence (MONACO-PARITY-01)
- Inline alert "Template-only" sur draft où LLM personalisation a échoué
- Tooltip risk avec reasons + glyph ⓘ
- Streaming TAM (les cards apparaissent pendant que la machine pense)

**Rigueur d'un AI Product Designer** : 🟡 **partielle**. Un vrai AI Product Designer aurait :
- Un *design system* dédié AI outputs (un dossier `components/ai-ui/` avec primitives partagées) — pas des fixes ad-hoc par surface
- Des design tokens pour "uncertainty", "AI thinking", "AI fallback" partagés CSS
- Un guide d'usage : quand utiliser confidence chip vs warning banner vs inline asterisk

Aujourd'hui chez nous chaque surface réinvente sa solution. `<SignalConfidenceBadge>` existe pour les signaux mais le pattern n'est pas généralisé aux deal risks, aux recommandations chat, aux suggestions auto-fill.

**Pour le faire parfaitement** :
1. Créer `apps/web/src/components/ai-ui/` avec primitives :
   - `<ConfidenceChip>` (4-state, déjà partiellement fait → généraliser)
   - `<AIThinking>` (skeleton + "AI is reasoning…" + cancel button)
   - `<UndoToast>` (5s window après chaque action AI auto)
   - `<CitedClaim>` (la prose avec auto-citations parsées)
   - `<HallucinationFallback>` (état explicite quand LLM dit "no evidence")
   - `<SourceLink>` (chip qui ouvre la source dans un slide-over)
2. Documenter dans `apps/web/src/components/ai-ui/README.md` : quand utiliser quoi
3. Migrer les surfaces existantes (review queue, opportunities risk badge, deal autofill) vers ces primitives — un PR par surface
4. Audit a11y : aria-live pour tout output streaming, contrast 4.5:1 minimum sur les état-chips

**Effort** : M (1-2 sem). Highest visible polish ROI ratio.

---

## 2. AI Engineer — RAG + agentic + prompts + structured outputs + memory + retries

**Vue métier requise** : orchestration LLM. Tool calls, retries, fallbacks, prompt versioning, eval harness, cost/latency tracking, embedding pipelines, agent memory.

**Vue métier dans Elevay** : ✅ couverte mais hétérogène
- RAG transcript chunks (pgvector HNSW + cosine threshold 0.30)
- Embeddings text-embedding-3-small avec tenant isolation (HNSW m=16 ef=64)
- Chat tools registry (`buildCoachingTools`, `searchTranscripts`, etc.)
- Structured outputs Zod partout (skill schemas, deal-briefing, churn-risk)
- Memory via context-graph + Rippletide MCP
- Multi-step agent `stepCountIs(10)` (parité Monaco)
- Personnalisation fail logging structuré + retry queue

**Rigueur d'un AI Engineer** : 🟡 **incomplète**. Vrais gaps :

(a) **Pas de wrapper central pour les calls LLM**. Chaque appel `generateText`/`generateObject` se ré-invente : retry policy, fallback model, timeout, cost log, prompt-id tracking. Conséquence : impossible de mesurer "quel prompt coûte combien ce mois-ci" ou "quel call a un taux d'erreur > 5%".

(b) **Prompt versioning partiel**. `lib/prompts/chat-system-prompt.ts` est centralisé mais les skills et inngest functions ont des prompts inline. Pas de notion de "prompt v3 a 12% better win rate vs v2".

(c) **Eval harness manquant**. Aucune surface AI n'a un golden set qui tourne en CI. Les tests existants sont fonctionnels (le code marche), pas qualitatifs (le LLM répond bien).

(d) **Observability LLM**. On a `tracedGenerateText` mais pas un dashboard "cost per tenant per surface per day".

**Pour le faire parfaitement** :
1. **`lib/ai/llm-call.ts`** — wrapper unique :
   ```ts
   await llmCall({
     promptId: "deal-briefing-v3",
     model: "claude-sonnet-4-6",
     fallback: "gpt-4o-mini",
     retries: 2,
     timeoutMs: 30000,
     trace: { tenantId, agentId, surfaceId },
   }, ...args);
   ```
   Loggue automatiquement coût (tokens × $/M tokens), latence p50/p95, erreurs, fallback_triggered.
2. **Prompt registry** : `lib/prompts/registry/{prompt-id}.v{n}.ts` un fichier par prompt versionné. Le wrapper lit `process.env.PROMPT_VERSIONS_OVERRIDE` pour A/B test.
3. **Eval harness** : `lib/evals/{surface}.eval.ts` — fixtures (input, expected_output_predicate). Cron hebdo runs sur 50 cas par surface, écrit `eval_runs` table avec accuracy/latency. Dashboard `/admin/llm-evals` montre la dérive.
4. **Cost dashboard** : `_admin/llm-cost` agrège par tenant × surface × jour. Cap par tenant configurable.
5. **Prompt change governance** : tout edit dans `lib/prompts/registry/` requiert un eval-run dans la PR.

**Effort** : L (3-4 sem). Le ratio 80/20 le plus important pour la qualité produit perçue.

---

## 3. Backend Product Engineer — full features end-to-end + API ergonomics + AI-augmented dev

**Vue métier requise** : ship complete features. API contracts cohérents, error handling typé, observabilité, tests, refactor pour maintenir vélocité.

**Vue métier dans Elevay** : ✅ couverte
- Drizzle ORM type-safe
- 1847 tests passent
- Sentry intégré
- Routes API consistantes auth/validation/error
- Migration discipline (38+ migrations versionnées)

**Rigueur** : 🟡 **deux gaps notables**

(a) **API response shapes incohérents**. Certaines routes : `{ok: true, data: {...}}`. D'autres : `{...}` directement. D'autres : `{error: "...", issues: [...]}`. Un client doit deviner.

(b) **Fichiers monolithiques**. `app/(dashboard)/opportunities/page.tsx` ≈ 1300 lignes, `app/(dashboard)/home/page.tsx` ≈ 1100 lignes. Un nouveau dev met une semaine pour comprendre. Backend Product Engineer rigoureux ferait des PRs de découpage.

(c) **Pas de schéma OpenAPI exposé**. Les Zod schemas existent partout mais ne sont pas surfacés en `/api/openapi.json` pour les intégrateurs / les tests.

**Pour le faire parfaitement** :
1. **API conventions RFC** dans `apps/web/docs/api-conventions.md` : shape standard `{ok, data, error?}`. Convertir les routes une par une.
2. **Lint rule** sur taille fichier : ESLint plugin custom ou simple CI check `wc -l > 600 → fail`. Refactor les coupables.
3. **OpenAPI generator** : `pnpm openapi:gen` lit les Zod via `zod-to-openapi`, écrit `apps/web/openapi.json`. Sert sur `/api/openapi.json` (admin-only).
4. **Architecture Decision Records** dans `apps/web/docs/adr/` — chaque choix structurel a un ADR de 1 page (problème, options, décision, conséquences).

**Effort** : M (2-3 sem). Compounding returns — chaque dev futur va plus vite.

---

## 4. Frontend Engineer — Chat UI + copilots + streaming + partial state + dynamic UI

**Vue métier requise** : agent-driven UI. Streaming SSE/NDJSON, optimistic updates, partial render, dynamic component injection, a11y.

**Vue métier dans Elevay** : ✅ partiellement couverte
- Chat surface multi-step (`stepCountIs(10)`)
- TAM streaming NDJSON
- Optimistic updates (sequences Approve/Reject, opportunities drag-drop, hot-inbounds widget)
- AgentFeed real-time
- Citation chips dynamiques

**Rigueur** : 🟡 **gap principal : la majorité des pages restent CRUD-classique**

Un Frontend Engineer Monaco-style penserait :
- Chaque surface principale a un slot "ask the AI" inline qui répond contextuellement sans quitter la page
- Le copilote *injecte* des composants UI dynamiques dans la conversation (preview de séquence, draft d'email cliquable, mini-card account)
- L'a11y est testé par défaut (axe-core dans CI sur chaque PR)

Aujourd'hui chez nous : le chat est une page séparée, pas embedded. Le scoped-chat existe pour quelques surfaces (meetings) mais pas systématique.

**Pour le faire parfaitement** :
1. **Inline AI panel** : composant `<ScopedAIPanel scope={...}>` injecté en sidebar de chaque page entité (account, contact, deal). Le scope filtre les tools dispo et seed le contexte avec l'entité.
2. **Dynamic component injection** : permettre au LLM de retourner un payload `{kind: "preview-sequence", sequenceId: "..."}` que le renderer chat transforme en mini-card cliquable. Pattern Vercel AI SDK `tool(uiBlock())`.
3. **a11y CI** : `@axe-core/playwright` sur les e2e — fail si accessibility violations.
4. **A11y audit existing** : tab order sur le wizard 7-phase, skip-link visibility, contrast sur tous les status badges.

**Effort** : M (2-3 sem) pour le panel inline + dynamic injection + a11y CI.

---

## 5. Senior Platform Engineer — Event-driven + ML infra + observability ML/data

**Vue métier requise** : data plane. Event pipelines (Kafka/Inngest), ML training infra, distributed systems, ML observability (drift, recall, precision), embedding feature pipelines.

**Vue métier dans Elevay** : 🟡 **largement couverte mais peu profonde**
- Event-driven via Inngest (97 fonctions enregistrées)
- Embeddings pipeline pgvector
- Some structured logging + Sentry

**Rigueur** : 🔴 **gap majeur**. Un Senior Platform ferait :

(a) **Data warehouse séparé**. Monaco utilise Databricks. Nous : Postgres = OLTP + analytics confondus. Conséquences : analytics queries lourdes ralentissent le runtime.

(b) **ML observability vide**. On embed et retrieve mais on ne mesure ni recall@k ni MRR ni embedding drift. Si demain text-embedding-3-small change subtilement, on ne le verra pas.

(c) **Feature store inexistant**. Chaque ML inférence reconstruit les features depuis zéro (denormalize de Postgres).

(d) **Pas de canary deployment** sur les changements LLM/ML. Chaque update va à 100% du trafic immédiatement.

**Pour le faire parfaitement** (par ordre de priorité) :
1. **ML eval harness en prod** : weekly cron exécute golden queries sur le RAG transcript, écrit recall/precision dans `eval_runs`. Alert Slack si recall@8 < 0.85.
2. **Embedding drift monitor** : enregistre cosine moyen entre embeddings d'un même text à 7j d'intervalle. Alert si > 0.05 (model drift ou config change).
3. **Read replica pour analytics** : en prod, créer une replica Postgres dédiée aux dashboards/insights. `lib/db/replica.ts` route les queries READ_ONLY là.
4. **Feature store léger** : `feature_snapshots` table (entity_type, entity_id, feature_name, value, computed_at) — populée par crons, lue par tous les ML calls. Évite recompute.
5. **Canary releases** : utiliser le `tenant_settings.scoringMode` pattern (déjà utilisé pour l'A/B heuristique vs ML) pour rollouts progressifs des prompt changes (1% → 10% → 50% → 100%).

**Effort** : XL (4-8 sem). Le moins urgent visuellement mais le plus structurant.

---

## 6. Client Operations — Onboarding playbooks + speed-to-value + customer feedback loop

**Vue métier requise** : *"Onboarding is where Monaco wins or loses"* (Sam Blond verbatim). Écrit les playbooks, coache les AE, ferme la boucle feedback → product.

**Vue métier dans Elevay** : ✅ couverte structurellement (MONACO-PARITY-03 vient de shipper)
- Wizard 7-phase avec 9 hard gates
- Telemetry funnel PostHog (per-phase entry/exit/duration)
- Premium $299 founder-led upsell
- Banner de discoverability sur /home

**Rigueur** : 🟡 **gap : pas de playbooks vertical-spécifiques**. Un Client Ops vrai aurait :

(a) **Bibliothèque de playbooks indexée par vertical** : "Devtools playbook", "Healthtech playbook", "Fintech playbook". Chacun = (TAM seed queries, signal templates, séquence templates, pipeline stages spécifiques, common objections).

(b) **Suggestion contextuelle** au phase 4 (Signals) : si Phase 1 ICP industry = "devtools", propose les 5 signaux devtools standards. Aujourd'hui : champ libre.

(c) **Customer feedback loop** : pas de bouton "💬 Cette étape me manque quelque chose ?" qui ferait route vers une `customer_requests` table tagged par tenant + verbatim + product roadmap.

(d) **Health scoring du onboarding lui-même** : on a la telemetry mais pas un dashboard `/admin/onboarding-health` qui montre per-phase drop-off rate, cohort completion rate, time-to-first-value.

**Pour le faire parfaitement** :
1. **`_research/playbooks/{vertical}.md`** — 5-10 fichiers (devtools, healthtech, fintech, e-commerce, b2b-saas-ops, dev-tools-OSS, agentic-ai, security, hr-tech, devrel-led).
2. **Playbook injection** au phase 4 : lookup `phase1.icp.industry` → match playbook → pre-fill 5 signal suggestions + 3 sequence templates.
3. **In-product feedback widget** : `<FeedbackButton step="phase-4">` ouvre micro-form, post `/api/customer-requests` qui écrit `{tenantId, surface, verbatim, createdAt}`. Hebdo cron exporte vers Linear/Notion.
4. **Onboarding health dashboard** : `/admin/onboarding-health` → cohort table (week-of-signup, % phase 1 done, % phase 2, … % completed, median time per phase).

**Effort** : M (2-3 sem). Le plus directement traduit en revenue (réduction churn week-1).

---

## 7. Forward-Deployed AE — Sales execution full-cycle + onboarding kickoff + voice-of-customer to product

**Vue métier requise** : AE qui vit chez le client. Vend, onboard, apprend, rapporte au product.

**Vue métier dans Elevay** : 🟡 **partiellement couverte**

Ce que le produit fait *à la place* d'un FDAE :
- Wizard 7-phase capture tout ce qu'un FDAE alignerait au kickoff (ICP, signals, voice, sequences, pipeline)
- Premium $299 = Martin EST le FDAE pour les premiers 100 tenants
- Coaching from transcripts (MONACO-PARITY-05) = ce qu'un FDAE ferait après chaque demo

Ce qui manque (rigueur d'un vrai FDAE) :

(a) **Voice-of-customer continu**. Un FDAE a 3-5 conversations par semaine où le client dit "j'aimerais que ça fasse X". Aujourd'hui : aucun mécanisme produit pour capturer ça.

(b) **Roadmap visibility**. Un FDAE dit "on a entendu cette demande, on la livre Q2". Nous : pas de surface "ce qu'on construit pour vous".

(c) **Account expansion playbook**. Un FDAE Monaco identifie les opportunities d'expansion (parent org, sister teams). Nous : aucun signal ni surface pour ça.

**Pour le faire parfaitement** :
1. **Customer requests capture** : extension du chat — quand l'AI détecte un pattern "I wish you would…", classifier comme feature_request, écrire `customer_requests` avec `{verbatim, classified_as, tenantId, ARR_weighted_reach}`.
2. **`/settings/roadmap` page** — surface en lecture seule du backlog public, marqué par status (idea, planned, in-progress, shipped). Sourcé depuis Linear/Notion via API.
3. **Expansion signal scanner** (skill existante) → enhance pour détecter les "parent org" via Apollo (organization → parent_organization_id) et écrire `expansion_opportunities` rows.
4. **Quarterly Customer Council**: cron qui agrège top-20 requests pondérés ARR, génère brief markdown, post Slack #customer-council.

**Effort** : M (2-3 sem). High-leverage : transforme chaque conversation client en feature signal sans intervention manuelle.

---

## 8. Founding Customer Success — *"revenue and strategy, not relationship management"*

**Vue métier requise** : CS qui drive expansion + retention. Health scoring, account planning, outbound success advisory ongoing.

**Vue métier dans Elevay** : 🟡 **squelette présent, profondeur manquante**
- Skills `churn-risk-detector` + `expansion-signal-scanner` existent
- Deal briefing avec stallReason
- Activity timeline par account

**Rigueur** : 🔴 **gap conséquent**. Un Founding CS Monaco-style aurait :

(a) **Daily-priority queue dédié CS** : `/cs/today` — accounts ranked by (risk_score × ARR × close_velocity_delta). Pas une dashboard générique : un agenda précis "ces 7 accounts demandent action aujourd'hui".

(b) **Health score composite par account** : combine usage, sentiment trend, engagement frequency, deal velocity, support ticket count. Un nombre 0-100 + breakdown.

(c) **Suggested next-action AVEC citation** : pas "ce deal stagne" mais "Sarah Chen a dit le 12 mars 'we're stuck on security review' — relance Mike (their CISO) avec le whitepaper SOC2".

(d) **Expansion advisory continu** : pas seulement à l'expansion event — Mensuel cron review chaque account "would they expand if you proposed X?" → rapport.

(e) **Retention forecast par cohort** : "tenants signed in March 2026 have 85% projected M3 retention based on current engagement". Surface graph.

**Pour le faire parfaitement** :
1. **`/cs/today` page** :
   ```
   Today's priority — 7 accounts requiring action
   1. Acme Inc — health 42/100 ⬇ — last contact 18d ago — propose: re-engage email
   2. Beta Corp — deal stalled in Proposal — propose: address security objection
   ...
   ```
2. **`lib/cs/health-score.ts`** : function `computeHealthScore(accountId, tenantId) → {score: 0-100, components: {usage, sentiment, engagement, velocity, support}}`. Cron quotidien populant `account_health_snapshots`.
3. **Next-action with citation engine** : `lib/cs/suggest-next-action.ts` — appelle `retrieveTranscriptChunks` + `searchActivityBodies` pour grounder la recommandation. Format `{action, rationale, citation: {source, quote, link}}`.
4. **Expansion scanner mensuel** : cron qui examine chaque tenant — détecte parent org via Apollo, met `expansion_opportunities` row, alerte CS team.
5. **Cohort retention dashboard** : `/admin/cohorts` — heatmap M0/M1/M2/M3 retention par cohort signup-month.

**Effort** : L (3-4 sem). Le levier le plus direct sur ARR — réduit churn ET drive expansion.

---

## Synthèse — Note globale par dimension

| Rôle Monaco | Vue métier | Rigueur | Action #1 prioritaire |
|---|---|---|---|
| AI Product Designer | ✅ 90% | 🟡 60% | Design system `components/ai-ui/` |
| AI Engineer | ✅ 95% | 🟡 70% | `lib/ai/llm-call.ts` wrapper central |
| Backend Product Eng. | ✅ 90% | 🟡 70% | API conventions RFC + OpenAPI gen |
| Frontend Eng. | ✅ 80% | 🟡 65% | `<ScopedAIPanel>` inline sur entités |
| Senior Platform | 🟡 70% | 🔴 50% | ML eval harness en prod |
| Client Operations | ✅ 85% | 🟡 75% | Playbooks vertical-spécifiques |
| Forward-Deployed AE | 🟡 70% | 🟡 65% | Customer requests capture |
| Founding CS | 🟡 65% | 🔴 50% | `/cs/today` priority queue |

**Moyennes** : Vue métier ~83%, Rigueur ~63%.

## Gap analysis : où la rigueur fait défaut

Trois gaps systémiques qui touchent plusieurs rôles :

1. **Pas de design system pour AI outputs** → AI Product Designer + Frontend Engineer (touchent 6/8 rôles indirectement)
2. **Pas de wrapper central LLM ni eval harness** → AI Engineer + Senior Platform (la dette qui s'accumule chaque semaine)
3. **Pas de surface dédiée CS** → Founding CS + Client Ops + FDAE (le moteur de retention/expansion ne tourne pas)

## Plan d'attaque — 3 sprints pour atteindre 95% rigueur Monaco-équivalente

**Sprint 1 (semaine 1-2)** — Foundation rigueur
- `lib/ai/llm-call.ts` wrapper central (cost + latency + retry + prompt-id)
- `lib/evals/{surface}.eval.ts` golden sets pour 5 surfaces principales
- Cron eval-harness hebdo + `/admin/llm-evals` dashboard
- Effort : L

**Sprint 2 (semaine 3-4)** — Design system AI + CS surface
- `components/ai-ui/` design system (8 primitives)
- Migration des 5 surfaces majeures vers les primitives
- `/cs/today` page + `health-score.ts` + cron quotidien
- Effort : L

**Sprint 3 (semaine 5-6)** — Voice of customer + playbooks + observability
- `customer_requests` capture via chat
- `_research/playbooks/{vertical}.md` × 5 verticals
- ML eval harness + embedding drift monitor
- API conventions RFC + OpenAPI gen
- Effort : L

À la fin du sprint 3 : Vue métier ≥95%, Rigueur ≥90%, ce qui place Elevay au niveau de profondeur d'une équipe Monaco-équivalente sans recruter (Martin reste forward-deployed AE à $299/session).

---

## Réponse directe à Martin

> *"Est-ce que tout ce qui est demandé sur les fiches de poste est appréhendé de la même vue métier dans notre produit ?"*

**Oui à ~83%**. Les 8 rôles Monaco ont chacun leur incarnation dans le produit. Les gaps sont essentiellement sur Senior Platform et Founding CS (les deux rôles "data plane + revenue" qui demandent le plus d'infrastructure).

> *"Avec la même rigueur qu'une personne de ce métier le ferait ?"*

**Non, à ~63%**. La fonctionnalité est là, le métier est compris, mais la **rigueur professionnelle** manque sur 3 axes :
1. AI design system (chaque surface réinvente)
2. AI engineering observability (pas de eval harness ni de cost tracking)
3. CS surface dédiée (pas de daily queue, pas de health score composite, pas d'expansion playbook)

> *"Comment le faire parfaitement ?"*

3 sprints (6 semaines) selon le plan d'attaque ci-dessus. Le sprint 1 (LLM wrapper + eval harness) est le plus important — il dépasse 80% du levier qualité produit.
