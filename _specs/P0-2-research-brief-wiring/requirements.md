# P0-2 — Brancher le brief de recherche dans le flux de generation principal

## Note importante (verite du code, ancree file:line — verifie 2026-06-21)

Le pipeline research -> copy est sectionne. Tout le travail de recherche existe, est riche, et est cache 14 jours, mais rien de ce contenu n'atteint le LLM qui ecrit les sequences. Etat reel verifie ligne a ligne :

- **Le brief EXISTE et est riche.** `buildIntelligenceBrief()` (`app/apps/web/src/lib/campaign-engine/build-intelligence-brief.ts:18-108`) produit et persiste `websiteSummary`, `publicContent`, `competitorDetected`, `communicationStyle`, `painPoints`, `bestAngle`, `warmthSignals` (champs ecrits en `build-intelligence-brief.ts:83-89`). Le type complet est `IntelligenceBrief` (`app/apps/web/src/lib/campaign-engine/types.ts:1-23`).
- **Cache 14 jours.** `BRIEF_TTL_DAYS = 14` (`build-intelligence-brief.ts:16`), `getCachedBrief()` lit le cache avant tout (`:24-28`, `:110-132`). Un 2e appel dans la fenetre TTL n'engage AUCUN scrape/LLM — il rend la ligne en cache. Le cout d'un AWAIT est donc amorti des le 2e passage sur la meme paire `(companyId, contactId)`.
- **Le brief est lance en fire-and-forget.** `route.ts:67-69` : `buildIntelligenceBrief(...).catch(() => {})` — non attendu, resultat jete.
- **La route ne consomme du brief que le `strategyId`.** `route.ts:74-84` appelle `selectStrategy()` et ne garde que `candidates[0].strategyId` (`:79`). Le corps du brief (angle, pains, contenu public) n'est jamais lu.
- **`ProspectContext` n'a AUCUN champ brief.** Interface complete en `prospect-context.ts:23-83` : contact, company, signals, technologies, funding, knowledge, previousEmails, recentActivities — pas de `researchBrief`.
- **`formatContextForPrompt` ne peut donc rien rendre du brief.** `prospect-context.ts:275-337` n'emet que les sections firmographiques. C'est CETTE fonction qui construit le bloc vu par le LLM (`buildGenerationPrompt` l'appelle en `sequence-generator.ts:220`).
- **`buildPersonalizationBrief` est 100% firmographique.** `sequence-generator.ts:303-347` : signal, funding, tech, taille, industrie, titre, seniorite, derniere activite. Aucun champ du brief de recherche.
- **DEUX chemins de generation dans la route.** Chemin contact (`route.ts:86-89` -> `buildProspectContext` + `generateSequence(ctx)`) ET chemin template (`route.ts:90-136`, `minimalCtx as any` -> `generateSequence`). Le brief doit etre injecte dans LES DEUX, sinon le chemin sans contact reste generique.

Le gap reel = (a) attendre le brief au lieu de le jeter, (b) le porter dans `ProspectContext`, (c) le rendre dans `formatContextForPrompt` ET `buildPersonalizationBrief`, (d) threader dans les deux chemins, (e) timeout fail-open vers le flux firmographique si le brief echoue/depasse le budget temps.

Aucun changement de schema : la table `intelligenceBriefs` existe deja et porte tous les champs (`build-intelligence-brief.ts:74-95`).

Correction au grounding : `selectStrategy` est deja AWAITE et fonctionnel (`route.ts:77`), ce n'est pas un fire-and-forget — seul `buildIntelligenceBrief` l'est (`route.ts:68`). Aucun test n'existe pour `route.ts`, `prospect-context.ts`, ni `sequence-generator.ts` (verifie via glob — 0 fichier). Les tests existants vivent dans `app/apps/web/src/__tests__/` (ex `campaign-prepare.test.ts`).

## Scope

On construit :
- Extension de l'interface `ProspectContext` avec un champ optionnel `researchBrief` (sous-ensemble du `IntelligenceBrief`).
- Lecture du brief depuis le cache (sans declencher de refresh) lors de la construction du contexte, ou injection du brief deja resolu dans la route.
- Rendu du brief dans `formatContextForPrompt` (bloc texte vu par le LLM) ET dans `buildPersonalizationBrief` (avec `bestAngle` + `painPoints` places AVANT les facts firmographiques).
- Modification de `route.ts` : AWAIT du brief (cache amorti) avec timeout + fallback fail-open, threading dans le chemin contact et le chemin template.

On ne reconstruit pas :
- `buildIntelligenceBrief` / le scraping / la synthese LLM (existe, intacte).
- `selectStrategy` (continue de fournir le `strategyId`, inchange).
- Le schema `intelligenceBriefs` (aucune migration).
- Les methodologies / `SIGNAL_ANGLES` / golden examples.

## Exigences (EARS)

### Contexte prospect

- **R1** — THE SYSTEM SHALL etendre l'interface `ProspectContext` (`prospect-context.ts:23-83`) d'un champ optionnel `researchBrief?: { bestAngle: string | null; painPoints: string[]; competitorDetected: string | null; publicContent: Array<{ type: string; title: string; quote: string }>; warmthSignals: Array<{ type: string; detail: string }> }`.
- **R2** — WHEN `buildProspectContext(contactId, tenantId)` s'execute et qu'un brief NON expire existe en cache pour `(companyId, contactId)`, THE SYSTEM SHALL peupler `ctx.researchBrief` depuis ce cache SANS declencher de refresh (lecture seule, equivalente aux conditions de `getCachedBrief` — `build-intelligence-brief.ts:110-132`).
- **R3** — IF aucun brief en cache valide n'existe pour le prospect, THEN THE SYSTEM SHALL laisser `ctx.researchBrief` a `undefined` et poursuivre le flux firmographique existant inchange (`prospect-context.ts:229-269`).
- **R4** — THE SYSTEM SHALL scoper toute lecture de brief par `tenantId` ET `companyId` (et `contactId` quand disponible), identique aux conditions de `getCachedBrief` (`build-intelligence-brief.ts:115-123`).

### Rendu vers le LLM

- **R5** — WHERE `ctx.researchBrief` est defini, THE SYSTEM SHALL emettre dans `formatContextForPrompt` (`prospect-context.ts:275-337`) une section `RESEARCH BRIEF` contenant `bestAngle`, `painPoints`, `competitorDetected`, jusqu'a 2 extraits de `publicContent` (avec `quote` tronquee a ~200 car), et les `warmthSignals`.
- **R6** — WHERE `ctx.researchBrief.bestAngle` ou `ctx.researchBrief.painPoints` est non vide, THE SYSTEM SHALL injecter ces elements dans `buildPersonalizationBrief` (`sequence-generator.ts:303-347`) AVANT les facts firmographiques (signal/funding/tech/role), pour que l'angle de recherche prime.
- **R7** — IF `ctx.researchBrief` est `undefined`, THEN `formatContextForPrompt` et `buildPersonalizationBrief` SHALL produire exactement la sortie firmographique actuelle (aucune section vide, aucun changement de comportement).

### Flux de la route

- **R8** — WHEN `POST /api/campaigns/generate` resout un `companyForBrief` (`route.ts:66`), THE SYSTEM SHALL AWAITER `buildIntelligenceBrief(companyForBrief, tenantId, contactForBrief)` au lieu du fire-and-forget actuel (`route.ts:67-69`), borne par un timeout configurable.
- **R9** — IF `buildIntelligenceBrief` rejette OU depasse le timeout, THEN THE SYSTEM SHALL continuer la generation via le flux firmographique (`ctx.researchBrief` reste `undefined`) sans faire echouer la requete (fail-open).
- **R10** — WHEN la generation suit le chemin contact (`route.ts:86-89`), THE SYSTEM SHALL faire en sorte que le brief resolu soit present dans le `ProspectContext` passe a `generateSequence`.
- **R11** — WHEN la generation suit le chemin template sans contact (`route.ts:90-136`), THE SYSTEM SHALL injecter `researchBrief` dans le `minimalCtx` si un brief company-level existe en cache.
- **R12** — THE SYSTEM SHALL preserver le comportement existant de `selectStrategy` / `strategyUsed` (`route.ts:74-84`, `:193`).

### Non-regression

- **R13** — THE SYSTEM SHALL NOT modifier le schema de la table `intelligenceBriefs` ni ajouter de migration.
- **R14** — THE SYSTEM SHALL NOT declencher un second scrape/synthese LLM lors de la lecture du brief dans `buildProspectContext` (lecture cache seule).
- **R15** — THE SYSTEM SHALL NOT augmenter le temps de reponse de la route au-dela de `timeoutBriefMs` (defaut 8000 ms) dans le pire cas brief-froid, grace au fallback fail-open (R9).

## Criteres d'acceptation

- **AC1** (R1) — GIVEN l'interface `ProspectContext`, WHEN on inspecte le type, THEN le champ `researchBrief?` existe avec la forme decrite. (NON IMPLEMENTE — `prospect-context.ts:23-83` n'a pas le champ.)
- **AC2** (R2) — GIVEN un brief non expire en cache pour `(company, contact)`, WHEN `buildProspectContext` s'execute, THEN `ctx.researchBrief.bestAngle` egale le `bestAngle` de la ligne en cache, AND aucun appel de scrape/LLM n'est emis. (NON IMPLEMENTE.)
- **AC3** (R3) — GIVEN aucun brief en cache, WHEN `buildProspectContext` s'execute, THEN `ctx.researchBrief === undefined` AND le reste du contexte est identique a la sortie actuelle (`prospect-context.ts:229-269`). (Comportement firmographique DEJA IMPLEMENTE dans `prospect-context.ts:229-269` ✅ — garantir qu'il reste intact.)
- **AC4** (R5) — GIVEN `ctx.researchBrief` defini, WHEN `formatContextForPrompt` s'execute, THEN la sortie contient `RESEARCH BRIEF:` avec `bestAngle`, `painPoints` et au plus 2 `publicContent` quotes. (NON IMPLEMENTE.)
- **AC5** (R6) — GIVEN `ctx.researchBrief.bestAngle = "X"`, WHEN `buildPersonalizationBrief` s'execute, THEN une ligne de facts reference `X` AND apparait AVANT toute ligne `SIGNAL/FUNDING/TECH`. (NON IMPLEMENTE.)
- **AC6** (R7) — GIVEN `ctx.researchBrief === undefined`, WHEN `formatContextForPrompt` et `buildPersonalizationBrief` s'executent, THEN la sortie est byte-identique a la sortie actuelle. (Garanti par test de non-regression — snapshot.)
- **AC7** (R8/R9) — GIVEN un `companyForBrief` resolu et un brief froid qui rejette, WHEN `POST /api/campaigns/generate` s'execute, THEN la route renvoie 201 AND la sequence est generee via le flux firmographique. (NON IMPLEMENTE — actuellement le brief est jete `route.ts:68`; le changement rend l'AWAIT sur, sans casser le 201.)
- **AC8** (R10) — GIVEN un brief en cache et un contact, WHEN la route genere, THEN le `ProspectContext` passe a `generateSequence` (`route.ts:89`) porte `researchBrief` non `undefined`. (NON IMPLEMENTE.)
- **AC9** (R11) — GIVEN un brief company-level en cache et AUCUN contact, WHEN la route suit le chemin template (`route.ts:90-136`), THEN `minimalCtx.researchBrief` est peuple. (NON IMPLEMENTE.)
- **AC10** (R12) — GIVEN la generation, WHEN la route repond, THEN le champ `strategyUsed` conserve la valeur produite par `selectStrategy`. (DEJA IMPLEMENTE — `route.ts:79`, `:193` ✅ — non-regression.)
- **AC11** (R15) — GIVEN un brief froid qui met >8s, WHEN la route genere, THEN la reponse n'attend pas plus de `timeoutBriefMs` sur le brief avant fallback. (NON IMPLEMENTE.)

## Edge cases

- **Brief null / company introuvable** — `buildIntelligenceBrief` rend `null` si la company n'existe pas (`build-intelligence-brief.ts:37`). `researchBrief` doit rester `undefined`, pas `null` propage en sections vides.
- **Champs brief vides** — `painPoints: []`, `bestAngle: null`, `publicContent: []`, `warmthSignals: []` sont des etats valides (defauts en `build-intelligence-brief.ts:210-216`). NE PAS emettre de section `RESEARCH BRIEF` si tous les sous-champs pertinents sont vides/null.
- **Soft-delete** — `buildProspectContext` ne filtre PAS `deletedAt` sur contact (`prospect-context.ts:94-98`); la route le fait en amont (`route.ts:33,56`). La lecture brief ne doit pas ressusciter un contact supprime : scope `tenantId`/`companyId` suffit, brief inutilise si le contexte est null.
- **Brief contact-level vs company-level** — `getCachedBrief` ajoute `contactId` aux conditions si fourni (`build-intelligence-brief.ts:121-123`). Le chemin template (sans contact) doit lire le brief company-level (sans filtre `contactId`), sinon il ne trouve jamais de ligne.
- **Concurrence** — deux requetes generate simultanees pour le meme prospect : `onConflictDoUpdate` (`build-intelligence-brief.ts:101-104`) gere l'upsert; la lecture cache est idempotente. Pas de verrou requis.
- **Cross-runtime** — la route est un handler Next App Router (Node runtime, `db` Drizzle). `buildProspectContext` fait des `await import()` dynamiques (`prospect-context.ts:167,226`); l'ajout de lecture brief doit rester compatible (pas d'import top-level qui casserait un eventuel edge).
- **Timeout brief** — `Promise.race` entre `buildIntelligenceBrief` et un timer; le rejet du timer ne doit pas laisser de promesse pendante non geree (attacher `.catch(()=>{})` au perdant, clear du timer).
- **Idempotence route** — regenerer une sequence (`sequenceId` fourni, `route.ts:141-157`) supprime puis reinsere les steps; l'ajout du brief ne change pas cette idempotence.
- **Expiration en course** — brief `expiresAt` passe entre la lecture et l'usage : non bloquant, on a deja la donnee en memoire.
- **Injection prompt** — `publicContent.quote` vient de scraping externe; le rendu doit le traiter comme texte et tronquer les quotes longues a ~200 car pour ne pas exploser le prompt.

## Hors scope

- Refresh proactif / invalidation du brief (`invalidateBrief` `build-intelligence-brief.ts:222-227` existe deja, non touchee).
- Toute amelioration de la qualite de synthese du brief (`brief-synthesizer.ts`).
- Exposition du brief dans l'UI (preview, citations) — backlog distinct.
- Changement de la logique `selectStrategy` / scoring playbooks.
- Migration ou backfill de la table `intelligenceBriefs`.
