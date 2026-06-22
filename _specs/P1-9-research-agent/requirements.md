# P1-9 — Agent de recherche prospect en boucle (research-agent)

## Note importante (vérité du code post-P0)

Audit live le 2026-06-22. Le pipeline de recherche actuel est **non-agentique** :

| Élément | État réel | file:line |
|---|---|---|
| Orchestration des sources | `Promise.allSettled` sur une liste **FIXE** de 5 scrapers, aucune décision LLM | `build-intelligence-brief.ts:186-235` (`fetchAllSources`), appelé en `:51` |
| Synthèse | **un seul** appel LLM non-itératif (`anthropic.messages.create`, Sonnet, max_tokens 1500) | `brief-synthesizer.ts:69-103` |
| Décision « quoi creuser » | **aucune** — aucune occurrence de `generateText`/`stepCountIs`/`prepareStep` dans `campaign-engine/` | grep = 0 hit dans le dossier |
| Scraper site | `fetch` HTTP simple, `body.text().slice(0,3000)`, ne suit **aucun** lien (`/pricing`, `/about`, `/customers`), SPA → vide | `sources/website.ts:10-62` |
| Scraper jobs | suit une liste fixe de chemins careers + détection ATS, mais isolé (pas piloté par le modèle) | `sources/jobs.ts:13-28` |
| News / tech / linkedin | scrapers déterministes isolés | `sources/news.ts:3`, `sources/tech-stack.ts:43`, `sources/linkedin.ts:9` |

**Acquis P0 (NE PAS re-spécifier — construire DESSUS) :**

- Le cache + le câblage génération sont **DÉJÀ EN PLACE** : `readCachedBrief` (`build-intelligence-brief.ts:141-147`), `toResearchBriefContext` (`:150-162`), `briefIsEmpty` (`:165-173`), et `buildProspectContext` lit le brief caché read-only (`prospect-context.ts:179-193`), injecté dans le prompt via `formatContextForPrompt` (`:332-342`). **Le brief que produit l'agent doit rester le `IntelligenceBrief` (`types.ts:1-23`) pour se brancher sans changement sur ce câblage.**
- Wrapper LLM observabilité : `llmCall` (`lib/ai/llm-call.ts:205-294`, retry/fallback/timeout/coût) et `tracedGenerateText`/`tracedGenerateObject` (`lib/ai/traced-ai.ts:73,145`) qui ajoutent **gate budget** (`enforceLlmBudget`, `:84`), prompt versionné, few-shot flywheel, et `recordTrace`. `tracedGenerateText` spread `...aiParams` (`:76,96`) → il **transmet** `tools`, `stopWhen`, `experimental_output`, `prepareStep` et **retourne le résultat brut** de `generateText` (donc `.experimental_output` survit).
- `withTimeout` fail-open → `null` (`lib/utils/with-timeout.ts:6-16`).
- Provider Claude par défaut + routing modèle : `anthropic("claude-sonnet-4-6")` / `getModelForTask("chat"|"lightweight")` (`lib/ai/ai-provider.ts:126,217`; lightweight = `claude-haiku-4-5-20251001`, `:190`).
- Boucle outil AI SDK v6 **déjà utilisée** dans le repo : `generateText({ tools, stopWhen: stepCountIs(n) })` via `tracedGenerateText` (`lib/inbox/ask-agent.ts:58-65`, `app/api/chat/route.ts:744`). AI SDK = `ai@6.0.199` (`package.json:36`).
- API SDK v6 vérifiée dans les `.d.ts` installés : `generateText({ ..., stopWhen, experimental_output, prepareStep })`, `import { Output, stepCountIs, hasToolCall, tool } from "ai"`, `Output.object({ schema })`, résultat `.experimental_output`, `PrepareStepFunction = ({ steps, stepNumber, model, messages }) => { model?, toolChoice?, activeTools? }`.

**Le GAP réel** = il n'existe aucun composant qui laisse le **modèle** décider quelles pages crawler, quand approfondir, et quand le dossier est complet. C'est le cœur agentique manquant.

## Scope

Créer `lib/campaign-engine/research-agent.ts` : une boucle `generateText` (via `tracedGenerateText`) où le modèle pilote un set d'outils de recherche (`fetchWebsite`, `browsePage` **nouveau**, `fetchJobs`, `fetchNews`, `detectTechStack`, `enrichApollo` câblé en P1-10), `stopWhen: stepCountIs(~8)`, `experimental_output` = schéma du `IntelligenceBrief`. `prepareStep` route le modèle (Sonnet pour raisonner, Haiku pour extraire). Brancher comme **chemin primaire** dans `buildIntelligenceBrief`, en **gardant `fetchAllSources` + `synthesizeBrief` en FALLBACK** déterministe. Même type de sortie, même cache, même câblage P0-2.

**MVP boilable** : la boucle agentique + `browsePage` + le fallback + le budget guard + les tests. **Océan à flaguer** : un crawler headless réel (Playwright/Browserless) pour SPA JS-rendered, et `enrichApollo` (P1-10) — tous deux branchés comme outils optionnels, pas implémentés ici.

## Exigences (EARS)

**R1 — Boucle agentique pilotée par le modèle**

- R1.1 — WHEN `buildIntelligenceBrief` doit produire un brief frais (cache absent/expiré, `:26-29`), THE SYSTEM SHALL invoquer `runResearchAgent` (nouveau, `research-agent.ts`) AVANT de tomber sur `fetchAllSources` (`:186`).
- R1.2 — THE SYSTEM SHALL exécuter la recherche via `generateText` (à travers `tracedGenerateText`, `traced-ai.ts:73`) avec un `ToolSet` exposant `fetchWebsite`, `browsePage`, `fetchJobs`, `fetchNews`, `detectTechStack`, et (si activé) `enrichApollo`.
- R1.3 — THE SYSTEM SHALL borner la boucle par `stopWhen: stepCountIs(maxSteps)` avec `maxSteps` par défaut = 8 (`ai@6.0.199`, `stepCountIs` confirmé exporté).
- R1.4 — WHERE le modèle juge le dossier complet, THE SYSTEM SHALL le laisser arrêter la boucle en n'émettant plus d'appel outil et en produisant la sortie structurée (pas de continuation forcée).
- R1.5 — THE SYSTEM SHALL contraindre la sortie finale via `experimental_output: Output.object({ schema })` où `schema` (zod) correspond aux champs synthétisés du `IntelligenceBrief` (`types.ts:6-20` : `websiteSummary`, `painPoints`, `bestAngle`, `competitorDetected`, `communicationStyle`, `publicContent`, `warmthSignals`, `publicContentDepth`).
- R1.6 — THE SYSTEM SHALL router le modèle par étape via `prepareStep` : étapes de raisonnement/planning → `anthropic("claude-sonnet-4-6")`, étapes d'extraction pure → `getModelForTask("lightweight")` (`claude-haiku-4-5-20251001`, `ai-provider.ts:190`).

**R2 — Outils de recherche**

- R2.1 — THE SYSTEM SHALL fournir `fetchWebsite(domain)` qui réutilise `scrapeCompanyWebsite` (`sources/website.ts:10`) sans le réécrire.
- R2.2 — THE SYSTEM SHALL fournir `browsePage(url)` (**nouveau**, `sources/browse-page.ts`) qui `fetch` + parse une page arbitraire (cheerio), extrait `{ title, headings, mainText, links }` et **retourne les liens internes** pour que le modèle puisse demander `/pricing`, `/about`, `/customers` au tour suivant.
- R2.2.1 — WHEN `browsePage` reçoit une URL hors du domaine racine de la company, THE SYSTEM SHALL refuser et retourner une erreur structurée (anti-SSRF, anti-dérive de scope).
- R2.2.2 — IF l'URL résout vers une IP privée/loopback/link-local OU un schéma non-http(s), THEN THE SYSTEM SHALL refuser sans fetch (anti-SSRF).
- R2.3 — THE SYSTEM SHALL fournir `fetchJobs(domain)`, `fetchNews(companyName)`, `detectTechStack(domain)` réutilisant `scrapeJobPostings` (`sources/jobs.ts:13`), `fetchRecentNews` (`sources/news.ts:3`), `detectTechStack` (`sources/tech-stack.ts:43`).
- R2.4 — THE SYSTEM SHALL exposer `enrichApollo` comme outil **conditionnel** activé uniquement quand P1-10 fournit l'implémentation ; tant qu'absente, l'outil n'est pas ajouté au `ToolSet` (pas de stub trompeur).
- R2.5 — WHEN un outil est appelé deux fois avec les mêmes arguments dans la même boucle, THE SYSTEM SHALL retourner le résultat mémoïsé (cache intra-run par `name+args`) sans refetch réseau (anti-boucle, économie tokens).
- R2.6 — THE SYSTEM SHALL borner chaque `execute` d'outil par un timeout (réutiliser `withTimeout`, `with-timeout.ts:6`) et, en échec, retourner un résultat **structuré** `{ ok: false, error }` au modèle plutôt que de throw (le modèle décide alors de pivoter).

**R3 — Compatibilité de sortie & persistance**

- R3.1 — THE SYSTEM SHALL produire un objet de la forme `SynthesizedFields` (`brief-synthesizer.ts:37-46`) afin que `buildIntelligenceBrief` (`:75-96`) persiste le brief **sans changement de schéma**.
- R3.2 — THE SYSTEM SHALL préserver l'upsert tenant-scopé existant (`:99-106`, conflit sur `tenantId+companyId+contactId`) et le TTL `BRIEF_TTL_DAYS=14` (`:17`).
- R3.3 — THE SYSTEM SHALL remplir `sourcesAttempted`/`sourcesSucceeded`/`sourceErrors` (`types.ts:18-20`) à partir des appels outils réellement émis par le modèle (et non d'un compteur fixe).
- R3.4 — THE SYSTEM SHALL conserver `recentNews`/`jobPostings`/`techStack`/`linkedinActivity` (`:80-83`) issus des résultats outils, comme aujourd'hui.

**R4 — Budget, observabilité, robustesse**

- R4.1 — THE SYSTEM SHALL router 100% des appels LLM de l'agent par `tracedGenerateText` (`traced-ai.ts:73`) pour hériter du gate budget (`enforceLlmBudget`, `:84`), du trace `recordTrace` et du prompt versionné.
- R4.2 — IF `enforceLlmBudget` throw `BudgetExceededError`, THEN THE SYSTEM SHALL laisser l'erreur remonter pour que `buildIntelligenceBrief` la propage (pas de fallback silencieux qui brûlerait encore du budget).
- R4.3 — IF la boucle agentique throw (hors budget) OU produit une sortie qui ne valide pas le schéma, THEN THE SYSTEM SHALL retomber sur `fetchAllSources` + `synthesizeBrief` (`:51-69`) — **fail-open vers le pipeline déterministe**.
- R4.4 — THE SYSTEM SHALL borner le coût : `maxSteps=8`, mémoïsation R2.5, et `maxOutputTokens` borné ; coût attendu ~4x le pipeline actuel, à journaliser via `llm_calls` (`llm-call.ts:143`).
- R4.5 — THE SYSTEM SHALL exposer un flag d'activation (env `RESEARCH_AGENT_ENABLED`, défaut OFF en prod tant que non évalué) ; WHERE désactivé, `buildIntelligenceBrief` utilise directement `fetchAllSources` (comportement actuel inchangé).

**R5 — Non-buts**

- R5.1 — THE SYSTEM SHALL NOT introduire de nouvelle table ni colonne (réutilise `intelligenceBriefs`).
- R5.2 — THE SYSTEM SHALL NOT implémenter de crawler headless/JS-render dans ce lot (flaggé océan ; `browsePage` reste fetch+cheerio).
- R5.3 — THE SYSTEM SHALL NOT implémenter `enrichApollo` (P1-10) ; seulement le point d'ancrage conditionnel.
- R5.4 — THE SYSTEM SHALL NOT modifier le câblage P0-2 (`readCachedBrief`, `toResearchBriefContext`, `prospect-context.ts:179-193`).
- R5.5 — THE SYSTEM SHALL NOT changer la signature publique de `buildIntelligenceBrief` (`:19-24`).

## Critères d'acceptation (GIVEN/WHEN/THEN)

- AC1 — GIVEN une company avec domaine, WHEN `runResearchAgent` tourne avec `RESEARCH_AGENT_ENABLED=1`, THEN le modèle émet ≥1 appel `fetchWebsite` puis ≥1 appel `browsePage` vers une page interne (`/pricing` ou `/about` ou `/customers`), et la boucle s'arrête avant `maxSteps`. (Vérifie sur `result.steps` / `toolCalls`.)
- AC2 — GIVEN la sortie de l'agent, WHEN elle est mappée, THEN c'est un `SynthesizedFields` valide et `buildIntelligenceBrief` persiste un `IntelligenceBrief` (`types.ts:1-23`) **sans erreur de schéma**. Câblage cache **DÉJÀ IMPLÉMENTÉ** dans `prospect-context.ts:182-188`.
- AC3 — GIVEN `prepareStep`, WHEN une étape est marquée extraction, THEN le modèle utilisé est Haiku ; WHEN raisonnement, THEN Sonnet. (Vérifie via le model id passé par `prepareStep`.)
- AC4 — GIVEN un outil qui throw/timeout, WHEN appelé par le modèle, THEN `execute` retourne `{ ok:false, error }` et la boucle continue (pas de crash). 
- AC5 — GIVEN `RESEARCH_AGENT_ENABLED` absent/`0`, WHEN `buildIntelligenceBrief` tourne, THEN `runResearchAgent` n'est jamais appelé et `fetchAllSources` produit le brief (régression zéro). 
- AC6 — GIVEN la boucle agentique qui throw, WHEN dans `buildIntelligenceBrief`, THEN le fallback `fetchAllSources+synthesizeBrief` produit quand même un brief non-null pour une company valide (fail-open).
- AC7 — GIVEN `enforceLlmBudget` qui throw, WHEN l'agent démarre, THEN l'erreur remonte et **aucun** fallback LLM n'est tenté (R4.2).
- AC8 — GIVEN `browsePage` appelé avec une URL hors-domaine ou IP privée, WHEN exécuté, THEN il refuse sans fetch et retourne `{ ok:false, error:"out_of_scope"|"blocked_host" }`.
- AC9 — GIVEN deux appels outils identiques dans un run, WHEN le second s'exécute, THEN aucun second fetch réseau (mémoïsation, R2.5).

## Edge cases exhaustifs

1. Domaine null sur la company → l'agent n'a pas de `fetchWebsite`/`browsePage`/`fetchJobs`/`detectTechStack` (seul `fetchNews` sur le nom) ; si tout vide → sortie minimale (`websiteSummary:null`, listes vides), brief persisté quand même (cf. `fallbackSynthesis`, `brief-synthesizer.ts:160`).
2. Site SPA (body vide) → `fetchWebsite` renvoie `rawText` vide ; le modèle doit pivoter vers `browsePage("/about")` ou `fetchNews` ; documenter que le rendu JS reste hors scope (R5.2).
3. `browsePage` boucle sur les mêmes liens → mémoïsation R2.5 + `stepCountIs` coupent.
4. Modèle qui ne produit jamais de sortie structurée (atteint `maxSteps` sans output) → `result.experimental_output` peut throw/être undefined → traiter comme échec de schéma → fallback R4.3.
5. JSON outils volumineux (jobs page entière) → tronquer chaque résultat outil (taille bornée, ex. `mainText.slice(0, 3000)` comme `website.ts:51`) pour ne pas exploser les tokens.
6. Redirection cross-domain dans `browsePage` (la page redirige hors domaine) → re-checker l'host APRÈS résolution finale, refuser si hors-domaine.
7. `enrichApollo` activé mais quota Apollo épuisé → outil retourne `{ ok:false }`, le modèle continue sans.
8. Budget dépassé en milieu de boucle (un step passe, le suivant gate) → `tracedGenerateText` throw au step suivant → propagation R4.2 (pas de fallback).
9. Contact sans `linkedinUrl` → pas d'outil linkedin (déjà le cas `fetchAllSources`, `:205`); l'agent ne doit pas halluciner d'activité LinkedIn.
10. Deux requêtes concurrentes même company → déduplication déjà gérée en amont par la route (`research/route.ts:20-23`) et l'upsert ; l'agent n'a pas à re-gérer.
11. Timeout global du run > timeout Inngest/route → borner le run total (somme des timeouts d'étapes < cap appelant) ; `withTimeout` par outil + `maxSteps` bornent.
12. Sortie schéma valide mais sémantiquement vide (toutes listes vides, bestAngle null) → équivaut à `briefIsEmpty` (`build-intelligence-brief.ts:165`) côté lecture P0-2 → non-injecté en génération, comportement correct (pas de garde supplémentaire requise).
13. Modèle appelle un outil inexistant → AI SDK rejette l'appel ; capturer et continuer.
14. `prepareStep` renvoie un modèle null (provider non configuré) → garder le modèle par défaut du call (ne pas overrider avec null).

## Hors scope

- Crawler headless / rendu JS (Playwright/Browserless) — océan, lot séparé.
- `enrichApollo` réel — P1-10.
- Toute nouvelle UI (le brief s'affiche déjà via le câblage existant).
- Changements de schéma DB.
- Re-spécification du cache / `readCachedBrief` / câblage génération (acquis P0-2).
