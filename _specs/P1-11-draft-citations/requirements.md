# P1-11 — Citations phrase-par-phrase dans le draft outbound + re-vérif à l'approbation

## Note importante (vérité du code post-P0 — file:line vérifiés le 2026-06-22)

Ce qui **EXISTE déjà** (ne PAS re-spécifier) :

- **Colonne `personalizationSources`** sur `sequence_drafts` : `jsonb`, shape `{ kind, label, href, quote? }`, `notNull().default([])` — `app/apps/web/src/db/schema/outbound.ts:149-152`. Le shape miroite la primitive AI-UI.
- **Helpers de citation purs** : `collectCitationUrls()` (filtre les http(s) bien formés, dédupe, drop les malformés) et `decideCitationGate()` (fail-closed : toute URL non vérifiée bloque) — `app/apps/web/src/lib/sequence-drafts/citations.ts:25-69`.
- **Gate citations au SEND** (T-0), fail-closed, re-verify via cache 7j + recall vers review — `app/apps/web/src/inngest/sequence-draft-to-outbound.ts:129-174`. Couvre aussi les `phone_task` (le script cite des sources).
- **Gate spam au SEND** (fail-soft, email only, recall si score ≥50) — `sequence-draft-to-outbound.ts:176-209` + `app/apps/web/src/lib/sequence-drafts/spam-gate.ts`.
- **Cache de vérif URL** TTL 7j, tenant-agnostique (URL globale), `verifySignalUrlsBatch` — `app/apps/web/src/lib/signals/url-verifier-cache.ts:1-22,47+`.
- **Rendu inbox citations inline** : badge + icône `Quote` + texte d'évidence, déjà stylé — `app/apps/web/src/app/(dashboard)/inbox/_conversation-pane.tsx:1033-1041`.
- **Research brief caché** avec TTL (`intelligenceBriefs.expiresAt`, `getCachedBrief` filtre `gt(expiresAt, now)`) — `app/apps/web/src/lib/campaign-engine/build-intelligence-brief.ts:117-119,141-147`. Exposé au prompt via `ResearchBriefContext` (`prospect-context.ts:27-33,96-97`).
- **Route context** mappe `signalsAtTriggerTime = draft.personalizationSources` (verbatim) — `app/apps/web/src/app/api/sequences/drafts/[id]/context/route.ts:13,169`.
- **State machine** `recall` + `approve` (transitions, `canTransition`) — `app/apps/web/src/lib/sequence-drafts/state-machine.ts`.
- **Acquis P0** sur lesquels on construit (ne PAS re-spécifier) : `gradeSequenceQuality`/`qualityScore` (`lib/evals/sequence-quality.ts`), `researchBrief`/`ResearchBriefContext` (`prospect-context.ts`), `with-timeout.ts`, `suppression.ts`, `spam-gate.ts`, `rejection-counter-prompt.ts`, le gate qualité dans `generateSequence` (`sequence-generator.ts:82-119`).

Le **GAP réel** (ce qui manque, ancré) :

1. **`generatedSequenceSchema` n'émet aucun `claims[]`** — `app/apps/web/src/lib/agents/sequence-generator.ts:37-51`. La sortie LLM ne porte aucune ancre phrase→source.
2. **`personalizationSources` est codé en dur `[]`** au moment de la création du draft — `app/apps/web/src/inngest/sequence-draft-router.ts:263` (passe `personalizationSources: []` à `buildDraftRow`). Conséquence : le gate citations au send (`sequence-draft-to-outbound.ts:136`) reçoit **toujours** un tableau vide ⇒ la garde existe mais ne mord jamais en prod via le chemin router. C'est le défaut central.
3. **Le chemin router personnalise via `personalizeStepEmail`** (`sequence-draft-router.ts:222`), PAS `generateSequence` — donc même si on enrichit `generatedSequenceSchema`, le draft router n'en bénéficie pas tant qu'on n'extrait pas les claims dans le chemin `personalizeStepEmail` ou qu'on ne dérive pas les sources depuis le `ProspectContext`.
4. **Le panneau "Why this draft?" dump un `JSON.stringify(...)` brut dans un `<pre>`** — `app/apps/web/src/components/sequence-draft-preview.tsx:357-376`. Dump dev, illisible, asymétrique vs l'inbox qui cite proprement.
5. **Aucun gate à l'APPROBATION** — la route `approve` (`app/apps/web/src/app/api/sequences/drafts/[id]/approve/route.ts:26-179`) fait state-machine + advance enrollment + emit `email.send.queued`, mais ne re-vérifie **aucune** URL. La seule re-vérif est generation + send. Fenêtre : un fondateur approuve, le draft est planifié à J+2 ; si la source meurt entre approve et send, le recall arrive au send (bien) mais le fondateur a déjà investi sa confiance ; on veut un feedback **à l'approbation**.
6. **Les faits NON-URL (funding, headcount) ne sont JAMAIS re-checkés** — `collectCitationUrls` ignore explicitement les sources sans href (`citations.ts:24-25,28-34`). Un round de funding annoncé il y a 6 mois reste cité comme « news » sans garde de fraîcheur.

## Scope

**MVP boilable (P1-11)** :
1. Émettre des `claims[{sentence, sourceKind, sourceHref, quote}]` depuis le pipeline de génération et les persister dans `personalizationSources` (au lieu de `[]`).
2. Refondre "Why this draft?" pour surligner inline chaque phrase ancrée + tooltip source, en réutilisant le rendu inbox.
3. Re-vérifier les URLs des claims **à l'approbation** (route approve), pas seulement generation + send.
4. **Freshness gate au send** pour les faits NON-URL (funding/headcount) : périmé si le brief source dépasse un TTL (14j) ⇒ recall.

**Océan à flaguer (HORS scope P1-11)** : un moteur de provenance généralisé qui trace chaque token de l'email vers une source structurée multi-niveaux (réécriture du générateur en RAG citationnel). Trop large. On ancre au niveau **phrase**, pas token.

## Exigences (EARS)

### R1 — Émission des claims à la génération

- **R1.1** — WHEN le pipeline de génération produit un email de séquence, THE SYSTEM SHALL émettre un tableau `claims: Array<{ sentence: string; sourceKind: string; sourceHref?: string; quote?: string }>` dans le schéma de sortie, étendant `generatedSequenceSchema` (`sequence-generator.ts:37-51`).
- **R1.2** — THE SYSTEM SHALL n'inclure dans `claims` que les phrases de `body` qui s'appuient sur un fait vérifiable (URL du brief, signal, funding, tech stack) — pas les phrases de transition/CTA génériques.
- **R1.3** — WHERE un claim référence une URL, THE SYSTEM SHALL peupler `sourceHref` avec une URL http(s) bien formée ; IF l'URL est malformée, THEN THE SYSTEM SHALL omettre le `sourceHref` (le claim reste, sans lien cliquable) — cohérent avec le drop de `collectCitationUrls` (`citations.ts:35-44`).
- **R1.4** — WHEN un draft est créé par le router (`sequence-draft-router.ts:263`), THE SYSTEM SHALL persister les claims dérivés dans `personalizationSources` au format `{ kind, label, href, quote }` (et NON `[]`), de sorte que le gate citations au send (`sequence-draft-to-outbound.ts:136`) reçoive des URLs réelles.
- **R1.5** — IF le chemin de personnalisation (`personalizeStepEmail`) ne peut produire de claims (LLM threw, contexte manquant), THEN THE SYSTEM SHALL persister `personalizationSources: []` et ne PAS bloquer la création du draft (fail-open sur la génération).

### R2 — Rendu "Why this draft?" cité

- **R2.1** — WHEN le panneau de preview affiche un draft, THE SYSTEM SHALL rendre chaque phrase ancrée du corps surlignée (et non un `JSON.stringify` brut), remplaçant le `<pre>` de `sequence-draft-preview.tsx:357-376`.
- **R2.2** — WHEN l'utilisateur survole une phrase ancrée, THE SYSTEM SHALL afficher un tooltip portant `{ label, quote, href }` de la source, réutilisant la primitive de rendu de l'inbox (`_conversation-pane.tsx:1033-1041`, icône `Quote`).
- **R2.3** — WHERE un claim porte un `href`, THE SYSTEM SHALL rendre la source comme un lien cliquable (`target="_blank"`, `rel="noopener noreferrer"`).
- **R2.4** — IF un draft n'a aucun claim (`personalizationSources` vide), THEN THE SYSTEM SHALL afficher le corps non surligné sans erreur (pas de dump JSON, pas de section vide).
- **R2.5** — THE SYSTEM SHALL NOT afficher de `JSON.stringify` brut de `signalsAtTriggerTime` dans l'UI fondateur.

### R3 — Re-vérification à l'approbation

- **R3.1** — WHEN un draft est approuvé via `POST /api/sequences/drafts/[id]/approve`, THE SYSTEM SHALL re-vérifier toutes les URLs de citation (`collectCitationUrls(draft.personalizationSources)`) avant de basculer le statut à `approved`.
- **R3.2** — IF une ou plusieurs URLs de citation sont non vérifiées à l'approbation, THEN THE SYSTEM SHALL refuser l'approbation et répondre `409` avec `{ error, deadUrls, reviewReason }` issu de `decideCitationGate`, laissant le draft en `pending_approval`.
- **R3.3** — WHERE aucune URL de citation n'existe (claims non-URL only, ou `personalizationSources` vide), THE SYSTEM SHALL procéder à l'approbation sans vérif réseau (no-op, pas de latence).
- **R3.4** — THE SYSTEM SHALL réutiliser le cache de vérif URL 7j (`verifySignalUrlsBatch`) pour que l'approbation ne re-HEAD pas une URL déjà vérifiée à la génération.
- **R3.5** — THE SYSTEM SHALL tenant-scoper la vérif d'approbation via le draft déjà chargé tenant-scopé (`approve/route.ts:58-67`).

### R4 — Freshness gate des faits non-URL au send

- **R4.1** — WHEN le gate de send s'exécute (`sequence-draft-to-outbound.ts`), THE SYSTEM SHALL identifier les claims non-URL dont `kind ∈ { funding, headcount }` (faits volatils sans lien à rechecker).
- **R4.2** — IF un claim `funding`/`headcount` provient d'un research brief dont l'âge dépasse le TTL de fraîcheur (14 jours), THEN THE SYSTEM SHALL recaller le draft en review avec une `reviewReason` explicite (fait potentiellement périmé), fail-closed comme la garde citations.
- **R4.3** — WHERE le brief source est encore frais (≤14j) OU absent (claim sans brief rattaché), THE SYSTEM SHALL laisser passer (pas de recall arbitraire sur des faits non datables).
- **R4.4** — THE SYSTEM SHALL dériver l'âge depuis `intelligenceBriefs.generatedAt`/`createdAt` (la fenêtre TTL du brief, `build-intelligence-brief.ts:117-119`), PAS depuis l'âge du draft.

### Non-goals

- **R5.1** — THE SYSTEM SHALL NOT re-générer le corps de l'email pendant le gate d'approbation (re-vérif seulement, pas de mutation du texte).
- **R5.2** — THE SYSTEM SHALL NOT vérifier les URLs au niveau token ni construire un index de provenance multi-niveaux (océan, hors scope).
- **R5.3** — THE SYSTEM SHALL NOT bloquer une approbation pour un fait non-URL au moment de l'approbation (la garde fraîcheur est un gate de **send**, R4 — pour ne pas re-checker un brief qui peut encore se rafraîchir entre approve et send).

## Critères d'acceptation

- **AC1** — GIVEN un `ProspectContext` avec `researchBrief.publicContent[].quote` + une URL de funding, WHEN `generateSequence`/le pipeline de personnalisation tourne, THEN la sortie porte `claims[]` non vide avec `sentence`/`sourceKind`/`sourceHref`/`quote`. (NOUVEAU — `generatedSequenceSchema` n'a pas de `claims`, `sequence-generator.ts:37-51`.)
- **AC2** — GIVEN un draft généré, WHEN il est inséré par le router, THEN `personalizationSources` contient les claims mappés `{kind,label,href,quote}` (et non `[]`). (NOUVEAU — codé `[]` à `sequence-draft-router.ts:263`.)
- **AC3** — GIVEN un draft avec ≥1 claim ancré, WHEN la preview s'affiche, THEN chaque phrase ancrée est surlignée avec tooltip source, et aucun `<pre>{JSON.stringify(...)}` n'est rendu. (NOUVEAU — `sequence-draft-preview.tsx:357-376`.)
- **AC4** — GIVEN un draft dont une URL de citation est morte (404/timeout), WHEN `POST .../approve`, THEN la réponse est `409 { deadUrls, reviewReason }` et le statut reste `pending_approval`. (NOUVEAU — la route approve ne vérifie rien, `approve/route.ts`.)
- **AC5** — GIVEN un draft dont les URLs sont toutes vivantes, WHEN `POST .../approve`, THEN statut→`approved` + `email.send.queued` émis (comportement actuel préservé). (Partiellement DÉJÀ IMPLÉMENTÉ — `approve/route.ts:93-173` ; on ajoute le gate en amont.)
- **AC6** — GIVEN un draft avec un claim `funding` issu d'un brief de 20 jours, WHEN le gate de send tourne, THEN le draft est recallé avec `reviewReason` « fait potentiellement périmé ». (NOUVEAU — aucune garde fraîcheur non-URL aujourd'hui.)
- **AC7** — GIVEN un draft avec un claim `funding` issu d'un brief de 3 jours, WHEN le gate de send tourne, THEN le send procède (pas de recall). (NOUVEAU.)
- **AC8** — GIVEN le gate citations au send avec des URLs réelles désormais peuplées, WHEN une URL est morte, THEN recall (DÉJÀ IMPLÉMENTÉ — `sequence-draft-to-outbound.ts:147-173` ; la régression vérifie qu'on ne casse pas la garde existante en peuplant `personalizationSources`).
- **AC9** — GIVEN la vérif d'approbation, WHEN une URL a déjà été vérifiée à la génération (<7j), THEN aucun HEAD réseau supplémentaire (cache hit). (DÉJÀ IMPLÉMENTÉ côté cache — `url-verifier-cache.ts:22` ; vérifié par mock du cache.)

## Edge cases exhaustifs

1. **`personalizationSources` legacy vide** (drafts pré-P1-11) : approve doit fonctionner sans vérif (R3.3), preview rend le corps nu (R2.4).
2. **Claim avec `sentence` absente du body** (LLM a paraphrasé) : le surlignage ne matche pas ⇒ la phrase n'est pas surlignée, le claim reste listé en pied de section (pas d'erreur runtime).
3. **Phrase répétée dans le body** : surligner la première occurrence seulement (match index-based déterministe), pas toutes.
4. **URL malformée dans un claim** : `collectCitationUrls` la drop (`citations.ts:35-44`) ⇒ jamais cause de recall ; mais le claim reste affiché sans lien (R1.3).
5. **Mix URL morte + fait funding périmé** : approve fail (409 sur l'URL morte, R3.2) avant même d'atteindre le send ; si l'URL est ré-vivante au re-approve mais funding périmé, le recall arrive au send (R4.2). Ordre déterministe : URL gate à l'approve, freshness gate au send.
6. **Brief sans `generatedAt`/`createdAt` exploitable** : R4.3 (laisser passer — on ne recalle pas sur une date indéterminable).
7. **Timeout réseau transitoire à l'approbation** : `decideCitationGate` est fail-closed ⇒ 409 ; l'utilisateur re-approuve, le cache/re-HEAD tranche. Pas de boucle infinie (le re-approve re-tente).
8. **Course double-approve** : l'optimistic lock existant (`approve/route.ts:79-120`) reste en amont/aval du gate ; le gate ne doit pas muter `version` lui-même.
9. **`phone_task`** : claims s'appliquent aussi (le script cite). Le gate citations au send les couvre déjà (`sequence-draft-to-outbound.ts:135`). Le freshness gate s'applique aussi avant le branch phone (R4 doit s'exécuter avant le `decision.via === "phone_task"` au `:216`).
10. **Très grand nombre de claims** (>20) : `verifySignalUrlsBatch` dédupe via `collectCitationUrls` (Set) ; pas d'explosion réseau.
11. **Claim `funding` SANS brief rattaché** (funding venu d'enrichissement direct, `prospect-context.ts:70-74,358-359`) : pas de date brief ⇒ R4.3 laisse passer. On ne fabrique pas de garde sur une donnée non datée.
12. **Tooltip XSS** : `quote`/`label` issus du LLM/scrape ⇒ rendus en texte (jamais `dangerouslySetInnerHTML`).
13. **i18n** : labels/tooltips en clé i18n (FR par défaut, conv repo).

## Hors scope

- Provenance token-level / RAG citationnel (R5.2) — océan.
- Re-génération de corps pendant un gate (R5.1).
- Vérif des sources non-URL autres que funding/headcount (ex. quotes de call) — pas de garde de fraîcheur datable fiable.
- Modification du cache TTL URL (reste 7j, `url-verifier-cache.ts:22`).
- UI de gestion manuelle des citations par le fondateur (édition source par source).
