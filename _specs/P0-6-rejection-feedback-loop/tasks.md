# Tasks — P0-6 Rejection Feedback Loop

Effort total estimé : **~1 jour** (mapper + wiring + tests). Aucune migration.

## T0. Audit lecture (read-only)
- **Action** : relire `sequence-generator.ts:58-116,212-297`, `route.ts:86-137`, `rejection-classifier.ts:20-26,114-202`, `outbound.ts:47`. Confirmer : (a) aucun read de `rejectionInsights` en génération, (b) `RULES` = 5 catégories + `other` fallback, (c) `campaignConfig` jsonb, (d) seul `route.ts` a un chemin `sequenceId`.
- **Verify** : `Grep "rejectionInsights" app/apps/web/src` ne retourne que classifier, learner, tests — aucun fichier de génération.
- **Test** : N/A.

## T1. Module pur `rejection-counter-prompt.ts` (Fix 1) [NEW]
- **Action** : créer `app/apps/web/src/lib/sequence-drafts/rejection-counter-prompt.ts` avec `REJECTION_INSIGHT_FLOOR`, `extractDominantInsight`, `buildRejectionCounterPrompt`, `COUNTER_INSTRUCTIONS` (5 catégories, `other` absent). Importer `RejectionCategory` depuis `./rejection-classifier`.
- **Verify** : `pnpm tsc` passe ; `extractDominantInsight({ rejectionInsights: { dominantInsight: { category: "tone", count: 4 } } })` retourne `{category:"tone",count:4}` ; `extractDominantInsight(null)` retourne `null`.
- **Test** : `app/apps/web/src/__tests__/rejection-counter-prompt.test.ts` — couvre : null config, `rejectionInsights` absent, `dominantInsight` null, count<3 → null, count non-numérique → null, catégorie `other` → null, catégorie inconnue → null, chacune des 5 catégories → bloc texte non vide contenant le `count`. Refs R2,R4,R6-R11.

## T2. `generateSequence` accepte `options.rejectionInsight` (Fix 2) [NEW]
- **Action** : dans `sequence-generator.ts`, étendre le type `options` (:60) avec `rejectionInsight?: DominantInsight | null` ; passer `options?.rejectionInsight ?? null` à `buildGenerationPrompt` (:70). Pas de changement pour le chemin `evaluate` (le `basePrompt` le réutilise déjà :91).
- **Verify** : `pnpm tsc` ; les 3 call sites existants compilent sans modif (param optionnel).
- **Test** : couvert par T4 (intégration prompt) — pas de test isolé nécessaire pour le passage de param.

## T3. `buildGenerationPrompt` préfixe la contre-instruction (Fix 3) [NEW]
- **Action** : ajouter le param `rejectionInsight?: DominantInsight | null` à `buildGenerationPrompt` (:212-219) ; calculer `counterBlock = buildRejectionCounterPrompt(...)` ; préfixer le return (:266) par `counterBlock + "\n\n"` si non vide. Ne pas toucher aux `CRITICAL RULES` (:283-296).
- **Verify** : inspecter manuellement que `counterBlock` précède `You are a world-class SDR` et que `${contextBlock}` suit intact.
- **Test** : `app/apps/web/src/__tests__/sequence-generator-rejection-prompt.test.ts` — exporter ou tester `buildGenerationPrompt` (le rendre exporté si nécessaire, comme `evaluateSequenceQuality` :123 l'est déjà). Asserter : avec insight `tone`/count 4 → prompt contient le marqueur ton + "4" + "PRIORITÉ ABSOLUE" placé avant "world-class SDR" ; avec `null` → prompt identique à l'actuel (pas de bloc feedback). Refs R5,R6,R12.

## T4. Route charge `campaignConfig` + garde floor, fail-open (Fix 4) [NEW]
- **Action** : dans `route.ts`, importer `extractDominantInsight` ; avant `:89`, si `sequenceId` présent, `SELECT campaignConfig WHERE id=sequenceId AND tenantId=authCtx.tenantId` dans un `try/catch` (fail-open, R15) → `rejectionInsight` ; passer `rejectionInsight` aux deux appels `generateSequence` (:89 et :136).
- **Verify** : démarrer `pnpm dev`, forger une séquence avec `campaignConfig.rejectionInsights.dominantInsight={category:"tone",count:4}` via `db:studio`, `POST /api/campaigns/generate` avec ce `sequenceId`, et vérifier dans la trace `tracedGenerateObject` (admin observability) que le prompt contient le bloc feedback ; répéter sans insight → absent.
- **Test** : `app/apps/web/src/__tests__/campaigns-generate-rejection-load.test.ts` — mocker `db`, `buildProspectContext`, `generateSequence` ; asserter que `generateSequence` est appelé avec `rejectionInsight={category:"tone",count:4}` quand le `SELECT` renvoie ce config ; avec `null` quand pas de `sequenceId` ; avec `null` quand le `SELECT` throw (fail-open) ; avec `null` quand le config appartient à un autre tenant (le mock renvoie `[]`). Refs R1,R3,R4,R5,R15,AC5.

## T5. Régression call sites neufs [NEW]
- **Action** : aucune modif de code ; vérifier que `action.ts:1015` et `handler.ts:21` compilent et appellent `generateSequence` sans `rejectionInsight`.
- **Verify** : `pnpm tsc` + `pnpm test` verts.
- **Test** : ajouter un cas dans `sequence-generator-rejection-prompt.test.ts` : `generateSequence(ctx, { stepCount: 5 })` sans `rejectionInsight` → prompt sans bloc feedback (garantit R13). Refs R13.

## Ordre d'exécution
T0 → T1 (module pur, base de tout) → T2 + T3 (dépendent de T1, parallélisables) → T4 (dépend de T1+T2) → T5 (régression finale, dépend de T2/T3).

## Estimation effort
- T0 : 0.5 h
- T1 : 1.5 h (module + test exhaustif)
- T2 : 0.5 h
- T3 : 1.5 h (rendre exporté + test prompt)
- T4 : 2 h (load + mocks DB + tenant-scoping test)
- T5 : 0.5 h
- **Total : ~6.5 h (~1 jour)**, 0 migration, 0 nouvelle dépendance.
