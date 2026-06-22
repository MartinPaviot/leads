# Tasks — P0-3 Gate de scoring qualité à la génération

Estimation totale : **~2.5 jours** (10 tâches, dont 1 audit read-only).

## T0. Audit lecture (read-only)
- **Action** : grep tous les call-sites de `generateSequence(` (notamment `campaigns/generate/route.ts:89,136`, `sequence-draft-router`, inngest, previews) et de `options.evaluate` ; confirmer le set de `Methodology.name` retournés par `getMethodology` ; confirmer que `vertical-baseline.test.ts` n'importe que `scoreEmailAgainstBenchmarks` (intact).
- **Verify** : `rg "generateSequence\(" app/apps/web/src` + `rg "\.evaluate" app/apps/web/src/lib/agents` ; lister les fichiers impactés dans le PR description.
- **Test** : N/A.

## T1. Module `sequence-quality.ts` — mapping + `gradeGeneratedStep` [NEW]
- **Action** : créer `app/apps/web/src/lib/evals/sequence-quality.ts` avec `METHODOLOGY_TO_FRAMEWORK`, `methodologyToFramework`, `gradeGeneratedStep` (Fix 1), gérant l'edge case body vide → composite 0.
- **Verify** : `pnpm tsc` vert ; appel manuel dans un scratch test sur un step BASHO 200 mots → `word_count < 0.6`.
- **Test** : `app/apps/web/src/__tests__/sequence-quality.test.ts` — cas : (a) BASHO name→`basho`, (b) Problem-Solution→`problem_solution` (AC9), (c) name inconnu→`undefined` sans throw (AC10), (d) body vide→composite 0 + issue "empty body", (e) step BASHO trop long → `word_count<0.6` (AC2), (f) dead opener → `anti_patterns<1.0` (AC3). Réfs R2,R3,R4.

## T2. `gradeSequenceQuality` + `passThresholdFor` [NEW]
- **Action** : ajouter à `sequence-quality.ts` (Fix 2) : agrégat composite, feedback par-dimension, seuil 0.80 BASHO / 0.70 sinon, gardes JSON invalide et séquence vide.
- **Verify** : test scratch sur une séquence valide → `perStep.length === steps.length`, `score` ∈ [0,1].
- **Test** : (même fichier que T1) — (a) séquence valide → pass/score/perStep cohérents, (b) JSON invalide → `{pass:false,score:0,feedback:"Invalid JSON output"}` (edge), (c) séquence `steps:[]` → `{pass:false,score:0}`, (d) BASHO seuil 0.80 vs Challenger 0.70 (R5), (e) feedback contient `Step N:` (AC4). Réfs R5,R6.

## T3. Brancher la boucle dans `generateSequence` (preview ET bulk) [NEW]
- **Action** : `sequence-generator.ts:72-116` — supprimer la branche directe `:73-86`, faire tourner `evaluatorOptimizerLoop(generateFn, evaluateFn=gradeSequenceQuality, 2)` toujours ; attacher `qualityScore`/`sequenceQuality` (Fix 3) ; étendre le type `GeneratedSequence` (R7).
- **Verify** : test avec `tracedGenerateObject` mocké (séquence sous-seuil puis au-seuil) → `iterations>=2`, retour porte `sequenceQuality` + `steps[].qualityScore`.
- **Test** : `app/apps/web/src/__tests__/sequence-generator-gate.test.ts` — mock `@/lib/ai/traced-ai` : (a) bulk (sans `evaluate`) renvoie `sequenceQuality` (AC1), (b) score bas → 2e appel avec `feedback` non vide (AC4), (c) reste sous-seuil après 2 iters → retourne best output `passed:false` sans throw (AC5,R6), (d) `_trace` reçoit `evalScore` (AC11,R12). Réfs R1,R7.

## T4. Préserver `evaluateSequenceQuality` (compat tests) [NEW]
- **Action** : vérifier que `evaluateSequenceQuality` (`sequence-generator.ts:121-210`) reste exporté et n'est plus appelé par `generateSequence` (grep).
- **Verify** : `rg "evaluateSequenceQuality" app/apps/web/src` → seuls les tests l'appellent.
- **Test** : ajouter au fichier T3 un test asserting l'export existe toujours (`expect(evaluateSequenceQuality).toBeTypeOf("function")`) (AC12,R11).

## T5. Route `campaigns/generate` renvoie `quality` [NEW]
- **Action** : `route.ts:183-194` (Fix 4) — ajouter le bloc `quality` au JSON pour les deux branches (`:89` contact, `:136` template).
- **Verify** : lancer la route en dev avec un contactId réel → réponse 201 contient `quality.composite` + `quality.perStep`.
- **Test** : `app/apps/web/src/__tests__/campaigns-generate-quality.test.ts` — mock `generateSequence` pour retourner un objet avec `sequenceQuality` ; POST → body JSON contient `quality.composite` et `quality.perStep[]` (AC6). Réf R8.

## T6. Path template minimal non pénalisé [NEW]
- **Action** : vérifier (et au besoin garde dans `gradeGeneratedStep`) que le template minimal (`route.ts:103-134`, placeholders, `bestSignal:null`) ne fait pas crasher le scoring ni ne force `passed:false` à cause des placeholders (R9).
- **Verify** : POST `campaigns/generate` sans aucun contact en DB → 201, `quality` présent.
- **Test** : ajouter au fichier T1 un cas `gradeGeneratedStep` avec `prospectContext.name="{{firstName}} {{lastName}}"`, `signal:undefined` → pas de throw, composite raisonnable (AC7, edge placeholders/null).

## T7. `generateFollowUpEmail` grade non-bloquant [NEW]
- **Action** : `action.ts:126+` (Fix 5) — après génération subject+body, appeler `gradeGeneratedStep`/`gradeEmail` avec prospectContext minimal, inclure `qualityScore.composite` dans le retour ; NE PAS bloquer/régénérer.
- **Verify** : appel du tool en dev → retour contient `qualityScore` ; un body médiocre ne bloque pas la réponse.
- **Test** : `app/apps/web/src/__tests__/follow-up-email-grade.test.ts` — mock LLM + DB contact ; assert `result.qualityScore.composite` présent ET tool retourne même si composite bas (AC8,R10).

## T8. Confirmer `draftEmail` reste non gradé (correction grounding) [NEW]
- **Action** : documenter (commentaire `action.ts:56`) que `draftEmail` ne produit pas de texte d'email (délègue au LLM hôte via `instruction`), donc rien à grader — le grounding visait `generateFollowUpEmail`.
- **Verify** : lecture ; aucun changement de comportement de `draftEmail`.
- **Test** : N/A (commentaire). Couvert indirectement par l'absence de régression chat.

## T9. Régression + suite complète
- **Action** : `pnpm test` (ciblé email-quality / sequence) + `pnpm tsc` + `pnpm lint`.
- **Verify** : `email-quality-grader.test.ts` et `vertical-baseline.test.ts` toujours verts ; nouveaux tests verts.
- **Test** : run de `app/apps/web/src/__tests__/email-quality-grader.test.ts` (inchangé) comme garde anti-régression (AC12).

## Ordre d'exécution
- T0 → (T1 → T2) → T3 → T4 → (T5, T6) → T7 → T8 → T9.
- T1+T2 forment le module pur (testable isolément, sans LLM).
- T3 dépend de T1+T2. T5/T6 dépendent de T3. T7 dépend de T1 (réutilise `gradeGeneratedStep`). T9 en dernier.

## Estimation effort
- T0 : 1h. T1 : 3h. T2 : 3h. T3 : 0.5j. T4 : 0.5h. T5 : 2h. T6 : 1h. T7 : 2h. T8 : 0.5h. T9 : 2h.
- **Total : ~2.5 jours** (un dev), tests inclus.
