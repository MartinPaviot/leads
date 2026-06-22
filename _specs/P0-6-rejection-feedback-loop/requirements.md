# P0-6 — Fermer la boucle de feedback rejection (lire `rejectionInsights` à la génération)

## Note importante (vérité du code, ancrée file:line — audit live 2026-06-21)

Ce qui **EXISTE déjà** (ne pas reconstruire) :

- **Classifier déterministe** : `app/apps/web/src/lib/sequence-drafts/rejection-classifier.ts`.
  - `classifyRejection(reason)` → `{ category, confidence, matchedSignals }` (:114-152).
  - `RULES` couvre **5** catégories avec regex : `tone` (:46-59), `timing` (:60-73), `personalization` (:74-86), `trigger` (:87-98), `content` (:99-111). La 6e valeur du type `RejectionCategory`, `other` (:26), **n'a aucune règle** — c'est le fallback (:117, :138-140). ⚠️ Le grounding dit « 6 catégories RULES » : faux, il y en a **5** mappables ; `other` ne reçoit jamais de contre-instruction.
  - `aggregateRejections` (:158-173) et `dominantInsight(counts, threshold=3)` (:187-202) : floor par défaut **≥3**, `other` exclu du calcul du dominant (:194). Confirme le floor du grounding.
- **Learner** : `app/apps/web/src/inngest/sequence-draft-rejection-learner.ts`. Sur `draft.rejected`, agrège 14 j, écrit `sequences.campaignConfig.rejectionInsights = { lookbackDays, lastUpdated, totalRejections, byCategory, dominantInsight, lastReason }` (:133-142). Concurrency sérialisée par `sequenceId` (:49). **L'écriture marche déjà.**
- **Schéma** : `sequences.campaignConfig` est un `jsonb` non typé — `app/apps/web/src/db/schema/outbound.ts:47`. Aucune migration nécessaire.

Le **GAP réel** (ce qu'on construit) :

- **Aucun chemin de génération ne LIT `rejectionInsights`.** Vérifié :
  - `buildGenerationPrompt` (`sequence-generator.ts:212-297`) ne référence jamais `campaignConfig` ni `rejectionInsights`.
  - `buildPersonalizationBrief` (`sequence-generator.ts:303-347`) non plus.
  - `generateSequence` (`sequence-generator.ts:58-116`) ne prend pas de tel paramètre dans `options` (:60).
- **La route ne charge pas `campaignConfig`.** `POST /api/campaigns/generate` (`app/apps/web/src/app/api/campaigns/generate/route.ts`) construit `ctx` via `buildProspectContext` (:87) et appelle `generateSequence(ctx, { stepCount })` (:89, :136). Même quand `sequenceId` est fourni (regénération dans une séquence existante, :141-157), elle ne lit jamais `sequences.campaignConfig` de cette séquence. ⚠️ Le grounding pointe exactement ce trou.
- Conséquence : `learner` écrit l'insight, personne ne le relit → **les drafts rejetés ne s'améliorent jamais.** La boucle est ouverte.

Call sites de `generateSequence` (vérifié) :
- `route.ts:89` (contact) et `:136` (template company-only) — **seul** chemin avec une `sequenceId` préexistante donc des insights potentiels.
- `app/apps/web/src/lib/chat/tools/action.ts:1015` — crée une séquence neuve juste avant (`:990-999`) → jamais d'insights antérieurs. Hors scope du load (rien à charger).
- `app/apps/web/src/skills/outreach/cold-email-outreach/handler.ts:21` — skill stateless, pas de `sequenceId` → idem.

## Scope

**On construit :**
1. Une fonction pure de mapping `rejectionInsights.dominantInsight` → bloc de contre-instruction textuel (5 catégories mappées : tone, timing, personalization, trigger, content).
2. Un nouveau paramètre `options.rejectionInsight` sur `generateSequence` + injection dans `buildGenerationPrompt`.
3. Le **load** de `sequences.campaignConfig.rejectionInsights` dans `POST /api/campaigns/generate` quand un `sequenceId` est fourni, avec garde du floor ≥3.

**On ne reconstruit pas :** le classifier, le learner, le schéma `campaignConfig`, le calcul `dominantInsight`/threshold. Tout cela existe et est testé.

## Exigences (EARS)

- **R1** — WHEN `POST /api/campaigns/generate` reçoit un `body.sequenceId` non nul, THE SYSTEM SHALL charger `sequences.campaignConfig.rejectionInsights` de cette séquence, scopé `tenantId = authCtx.tenantId`, avant d'appeler `generateSequence` (`route.ts:141` est le point d'insertion ; le load doit précéder `:89`/`:136`).
- **R2** — WHERE `rejectionInsights.dominantInsight` est présent ET `dominantInsight.count >= 3` ET `dominantInsight.category !== "other"`, THE SYSTEM SHALL passer cet insight à `generateSequence` via `options.rejectionInsight`.
- **R3** — IF `rejectionInsights` est absent, `null`, ou `dominantInsight` est `null`, THEN THE SYSTEM SHALL appeler `generateSequence` sans `options.rejectionInsight` (comportement actuel inchangé, `route.ts:89`).
- **R4** — IF `dominantInsight.count < 3` (sous le floor), THEN THE SYSTEM SHALL ignorer l'insight et ne passer aucune contre-instruction (re-garde côté route même si le learner applique déjà le threshold à l'écriture, défense en profondeur).
- **R5** — WHEN `generateSequence` reçoit `options.rejectionInsight`, THE SYSTEM SHALL le transmettre à `buildGenerationPrompt` (`sequence-generator.ts:70` est l'appel à modifier).
- **R6** — WHERE `buildGenerationPrompt` reçoit un `rejectionInsight` non nul de catégorie `tone`, THE SYSTEM SHALL préfixer le prompt d'une contre-instruction d'adoucissement (« cette séquence a été rejetée N fois pour le ton — adoucir, moins direct »).
- **R7** — WHERE la catégorie est `timing`, THE SYSTEM SHALL injecter une contre-instruction de reformulation du déclencheur temporel (« le moment a été jugé mauvais — reformuler / retirer la justification temporelle, ne pas présumer l'urgence »).
- **R8** — WHERE la catégorie est `personalization`, THE SYSTEM SHALL injecter une contre-instruction d'ancrage sur un fait vérifiable spécifique (« perso jugée trop générique — ancrer chaque email sur un fait concret et vérifiable du dossier »).
- **R9** — WHERE la catégorie est `trigger`, THE SYSTEM SHALL injecter une contre-instruction sur la validité du signal (« le signal déclencheur a été jugé mauvais/périmé — ne pas s'appuyer sur lui, choisir un autre angle ou vérifier sa fraîcheur »).
- **R10** — WHERE la catégorie est `content`, THE SYSTEM SHALL injecter une contre-instruction de rigueur factuelle (« contenu jugé incorrect/non professionnel — vérifier exactitude des faits, pas de liens cassés, registre professionnel »).
- **R11** — IF la catégorie est `other`, THEN THE SYSTEM SHALL n'injecter aucune contre-instruction (`other` n'a pas de règle de mapping ; cohérent avec l'exclusion de `dominantInsight`, `rejection-classifier.ts:194`).
- **R12** — THE SYSTEM SHALL placer la contre-instruction en tête du prompt construit (`buildGenerationPrompt` return, `sequence-generator.ts:266`), comme contrainte de plus haute priorité, sans supprimer les `CRITICAL RULES` existantes (:283-296).
- **R13** — THE SYSTEM SHALL NOT modifier le comportement de `generateSequence` pour les call sites sans `sequenceId` (`action.ts:1015`, `handler.ts:21`) — ces chemins continuent d'appeler sans `options.rejectionInsight`.
- **R14** — THE SYSTEM SHALL NOT déclencher d'appel LLM supplémentaire ni de requête DB hors le `SELECT campaignConfig` unique ajouté (R1) — le mapping insight→texte est pur et synchrone.
- **R15** — IF le `SELECT campaignConfig` échoue (DB error), THEN THE SYSTEM SHALL fail-open : logger et générer sans contre-instruction (un insight manquant ne doit jamais bloquer une génération).

## Critères d'acceptation

- **AC1** — GIVEN une séquence dont `campaignConfig.rejectionInsights.dominantInsight = { category: "tone", count: 4 }`, WHEN on `POST /api/campaigns/generate` avec ce `sequenceId`, THEN le prompt envoyé à l'LLM contient la contre-instruction « ton / adoucir » AND elle apparaît avant le bloc `CRITICAL RULES`.
- **AC2** — GIVEN une séquence sans `campaignConfig` (`null`), WHEN on régénère, THEN aucun bloc de contre-instruction n'est présent dans le prompt AND la génération réussit (comportement actuel, `route.ts:89`). **Le load est nouveau ; le fallback no-op doit être préservé.**
- **AC3** — GIVEN `dominantInsight = { category: "personalization", count: 2 }` (sous le floor), WHEN on régénère, THEN aucun bloc de contre-instruction (R4).
- **AC4** — GIVEN `dominantInsight = { category: "other", count: 9 }` (cas théorique forgé directement dans le jsonb), WHEN on régénère, THEN aucun bloc de contre-instruction (R11). En pratique le learner ne produit jamais `other` comme dominant (`:194`), mais le mapper doit être robuste.
- **AC5** — GIVEN deux tenants, tenant A a une séquence avec insight `tone`, WHEN tenant B `POST /generate` avec un `sequenceId` lui appartenant et sans insight, THEN le prompt de B ne contient aucune contre-instruction (tenant-scoping du load, R1).
- **AC6** — Pour chacune des 5 catégories mappées, GIVEN `dominantInsight.category = X`, WHEN `buildGenerationPrompt` reçoit l'insight, THEN le prompt contient le marqueur textuel propre à X AND le `count` est interpolé dans le texte.
- **AC7** — DEJA IMPLEMENTE : l'écriture de `rejectionInsights` par le learner sur `draft.rejected` est dans `sequence-draft-rejection-learner.ts:121-150` ✅. P0-6 ne touche pas à l'écriture.
- **AC8** — DEJA IMPLEMENTE : `dominantInsight` applique déjà le floor ≥3 et exclut `other`, `rejection-classifier.ts:187-202` ✅. La re-garde route (R4) est une défense en profondeur, pas une réimplémentation.

## Edge cases

- **`campaignConfig === null`** (séquence créée sans config, p.ex. `route.ts:160-169` n'écrit pas de `campaignConfig`) → `rejectionInsights` absent → no-op (R3).
- **`campaignConfig` présent mais `rejectionInsights` absent** (autre consommateur écrit d'autres clés, cf. commentaire learner `:118-120`) → no-op.
- **`rejectionInsights.dominantInsight === null`** (le learner l'écrit explicitement à `null` quand aucun bin ne franchit le floor, `:138`) → no-op (R3).
- **`dominantInsight.count` manquant ou non-numérique** (jsonb corrompu / version antérieure) → traiter comme sous le floor → no-op (R4). Le mapper doit valider `typeof count === "number"`.
- **`dominantInsight.category` inconnue** (jsonb forgé / futur ajout de catégorie) → no-op (mapper retourne `null` si la catégorie n'a pas d'entrée).
- **Pas de `sequenceId` dans le body** (création neuve) → pas de load, pas d'insight (R3) — c'est la majorité des appels.
- **Tenant mismatch** : `sequenceId` appartenant à un autre tenant → le `SELECT` scopé `tenantId` ne retourne rien → no-op (R5/AC5). Jamais de fuite cross-tenant.
- **Soft-delete** : `sequences` n'a pas de filtre `deletedAt` dans le code learner (`:125`) ; rester cohérent — ne pas inventer de filtre soft-delete ici, le `SELECT` reste scopé par `id + tenantId`.
- **Concurrence** : le load est read-only et idempotent ; aucune course possible côté génération. (La course est gérée à l'écriture par la concurrency Inngest `:49`.)
- **Cross-runtime** : le mapper est une fonction pure importable côté route (Node) ET dans `sequence-generator` (Node). Aucune dépendance runtime spécifique. À placer dans `lib/` (pas dans `inngest/`).
- **Idempotence** : régénérer deux fois avec le même insight produit la même contre-instruction (déterministe).
- **DB error sur le `SELECT`** → fail-open, génération sans insight (R15).
- **`count` énorme** (p.ex. 500, la limite du learner `:108`) → interpolation telle quelle, pas de cap (pas critique).

## Hors scope

- Réécrire le classifier en version LLM-graded (mentionné comme follow-up dans `rejection-classifier.ts:14-17`).
- Charger les insights dans `action.ts:1015` ou `handler.ts:21` (ces chemins créent des séquences neuves sans historique de rejet).
- Modifier `buildPersonalizationBrief` (`sequence-generator.ts:303-347`) : l'injection se fait dans `buildGenerationPrompt`, pas dans le brief de personnalisation par fait.
- Toute UI affichant l'insight au founder.
- Affiner le threshold par tenant (`tenants.settings.rejectionInsightThreshold`, évoqué `rejection-classifier.ts:185`).
