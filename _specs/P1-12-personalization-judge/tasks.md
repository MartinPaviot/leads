# Tasks — P1-12 Juge de personnalisation sémantique + back-test reply-rate

Estimation totale : **~4.5 jours-dev** (9 tasks). Tout est testable hors LLM (skip déterministe sans clé).

## T0. Audit lecture (read-only)
- **Action** : confirmer file:line des ancres post-P0 : `email-quality-grader.ts:120-143` (dim perso substring), `sequence-quality.ts:68/83` (point d'insertion), `sequence-generator.ts:53-119` (type + attache), `prospect-context.ts:27-33/179-193` (brief), `outbound.ts:286-337` (pas de `qualityScore`), `agent-evals.ts:168-208` (skip sans clé), `eval-harness-cron.ts:25-95` (cron). Identifier **le(s) writer(s) draft→outbound** qui insèrent dans `outboundEmails` depuis un `GeneratedSequence` (grep `insert(outboundEmails)` / `.values(` autour des steps).
- **Verify** : liste des call-sites writer écrite dans le ticket ; ancres confirmées identiques.
- **Test** : N/A.
- **Effort** : 0.25 j.

## T1. Juge sémantique `personalization-judge.ts` [NEW]
- **Action** : créer `app/apps/web/src/lib/evals/personalization-judge.ts` avec `judgePersonalization`, `ClaimVerdict`, `PersonalizationJudgeResult`, `formatBriefFacts`, `parseJudgeJson`, `JUDGE_PROMPT` (Fix 1). Skip neutre sans clé / brief vide (R2/R4), fail-open try/catch (R3), Haiku via `getModelForTask("lightweight")`, `maxTokens 600`, body slice 2000 (R5).
- **Verify** : `pnpm tsc` ; appel manuel avec `ANTHROPIC_API_KEY` unset retourne `{groundedScore:0.5, skipped:true}` sans réseau.
- **Test** : `app/apps/web/src/__tests__/personalization-judge.test.ts` — (a) clé absente ⇒ neutre + fetch non appelé (AC3) ; (b) brief vide ⇒ neutre (R4) ; (c) `parseJudgeJson` sur prose+JSON ⇒ score correct ; (d) JSON cassé ⇒ `skipped` (R3) ; (e) `groundedScore = grounded/total` (edge 9). LLM mocké (`vi.mock("ai")`).
- **Effort** : 1 j.

## T2. Param `opts` + 2e étage dans `gradeSequenceQuality` [NEW]
- **Action** : `sequence-quality.ts:68` — ajouter `opts?: GradeOpts`, passer la fonction **async**, brancher le 2e étage (Fix 2) : `min(det, groundedScore)` (R6), skip ⇒ det inchangé (R9), `perStep[].semantic` (R8), `recomputeComposite` via `DIMENSION_WEIGHTS` partagé. Body vide ⇒ pas d'appel juge (edge 2).
- **Verify** : `pnpm tsc` ; sans `opts` ⇒ aucun appel LLM (spy).
- **Test** : étendre `app/apps/web/src/__tests__/sequence-quality.test.ts` — (a) **régression** AC4 : sans opts, `composite` identique à avant + LLM jamais appelé ; (b) AC5 : substring grounded mais juge `groundedScore=0.2` ⇒ perso rabaissée à 0.2, composite recalculé ; (c) AC6 : juge `skipped` ⇒ perso det conservée, `semantic.skipped:true`. `judgePersonalization` mocké.
- **Effort** : 0.75 j.

## T3. Adapter les call-sites `gradeSequenceQuality` (sync→async) [NEW]
- **Action** : `sequence-generator.ts:104` (`evaluateFn` déjà async — `await` ajouté) et `:111` (`finalEval` → `await`). Ne PAS passer `semanticJudge` (R20 : prod génération inchangée).
- **Verify** : `pnpm tsc` ; `pnpm test sequence` vert ; aucun appel LLM ajouté au flux de génération.
- **Test** : couvert par T2(a) (régression composite identique) ; ajouter un test génération existant si présent vérifiant que `sequenceQuality.composite` est inchangé.
- **Effort** : 0.25 j.

## T4. Migration `outboundEmails.qualityScore` [NEW]
- **Action** : `db/schema/outbound.ts:286` — ajouter `qualityScore: jsonb("quality_score")` après `replyClassification`. Créer migration SQL idempotente `ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS quality_score jsonb;` ; appliquer via `pnpm db:migrate:apply` sur `leadsens-localdev` (runner custom, journal cassé >0012 — MEMORY).
- **Verify** : `pnpm db:studio` montre la colonne ; `pnpm tsc`.
- **Test** : `app/apps/web/src/__tests__/outbound-quality-score-column.test.ts` — type drizzle accepte/retourne le jsonb (shape `{composite, personalizationDet, personalizationSemantic, framework}`).
- **Effort** : 0.25 j.

## T5. Recopie `qualityScore` à l'écriture outbound [NEW]
- **Action** : dans le(s) writer(s) identifiés en T0, mapper `step.qualityScore` (`sequence-generator.ts:57`) → colonne via helper `toQualityScoreColumn(step)` (null-safe, R11). Step sans score ⇒ `null` (edge 14).
- **Verify** : insertion depuis un step scoré peuple la colonne ; depuis un step non scoré ⇒ `null`.
- **Test** : `app/apps/web/src/__tests__/outbound-quality-score-write.test.ts` — `toQualityScoreColumn` : step scoré ⇒ objet attendu ; step nu ⇒ `null` (AC7).
- **Effort** : 0.5 j.

## T6. Table `personalizationCalibration` [NEW]
- **Action** : `db/schema/` — créer `personalizationCalibration` (Fix 4) + index unique `(tenantId, runDate)` (R16) + index `tenantId`. Migration idempotente `CREATE TABLE IF NOT EXISTS ...` ; appliquer via `db:migrate:apply`.
- **Verify** : `pnpm db:studio` montre la table + index ; `pnpm tsc`.
- **Test** : `app/apps/web/src/__tests__/perso-calibration-schema.test.ts` — contrainte unique `(tenantId, runDate)` rejette le doublon.
- **Effort** : 0.25 j.

## T7. Back-test `backtestTenant` + stat [NEW]
- **Action** : créer `app/apps/web/src/lib/evals/personalization-backtest.ts` exportant `backtestTenant(tenantId, windowDays)` + `bucketize`, `pointBiserial` (Fix 5 étapes 1–5). Tenant-scoping (edge 15), `sentAt>=now-90d AND qualityScore IS NOT NULL` (edge 12/14), bornes tiers (edge 11), `insufficientData` si <30 (R15), UPSERT `(tenantId, runDate)` (R16).
- **Verify** : run local sur fixtures DB ⇒ 1 ligne/tenant/jour ; re-run ⇒ UPDATE.
- **Test** : `app/apps/web/src/__tests__/personalization-backtest.test.ts` — (a) AC8 : 50 scorés/10 répondus ⇒ 4 buckets, comptes corrects, re-run même jour = UPDATE (1 ligne) ; (b) AC9 : 12 scorés ⇒ `insufficientData:true`, `correlation=null`, comptes bruts ; (c) `bucketize` bornes 0.5/0.7/0.9 ; (d) `pointBiserial` valeur connue. DB mockée ou fixtures.
- **Effort** : 0.75 j.

## T8. Cron Inngest `personalizationBacktest` [NEW]
- **Action** : créer `app/apps/web/src/inngest/personalization-backtest.ts` (Fix 5 wrapper) : `inngest.createFunction` cron `TZ=UTC 0 3 * * *`, `retries:0`, `step.run` par tenant appelant `backtestTenant`. Enregistrer la fn dans le registre Inngest (grep où `weeklyEvalHarness` est enregistrée et ajouter à côté).
- **Verify** : `pnpm tsc` ; la fn apparaît dans le registre ; smoke local Inngest dev déclenche sans erreur.
- **Test** : `app/apps/web/src/__tests__/personalization-backtest-cron.test.ts` — la fn est enregistrée, id/cron corrects, `backtestTenant` appelé par tenant (handler mocké).
- **Effort** : 0.25 j.

## T9. Gold `PERSONALIZATION_GOLDEN` + suite de calibration [NEW]
- **Action** : créer `app/apps/web/src/lib/evals/personalization-golden.ts` (≥20 cas annotés, couvrant edges 1/4/6/7/8/9 : faux-positif substring, brief vide, FR, claim générique, quote verbatim, mix vrai/faux) + `runPersonalizationJudgeEval` (Fix 6, MAE juge↔humain, `skipped` sans clé R18). Brancher comme `out8` dans `eval-harness-cron.ts:90` (un `step.run` de plus).
- **Verify** : `pnpm test personalization-golden` ; sans clé ⇒ suite `skipped:true` ; structure des cas valide (chaque `human.groundedScore` ∈ [0,1]).
- **Test** : `app/apps/web/src/__tests__/personalization-golden.test.ts` — (a) ≥20 cas, chaque cas bien formé ; (b) `runPersonalizationJudgeEval` sans clé ⇒ `skipped:true` (AC10) ; (c) avec juge mocké renvoyant le label humain ⇒ MAE=0.
- **Effort** : 1 j.

## Ordre d'exécution

T0 → T1 → T2 → T3 (T2/T3 dépendent de T1) ; en parallèle T4 → T5 → T6 → T7 → T8 (chaîne persistance+back-test, indépendante de T1–T3) ; T9 dépend de T1. Merge quand `pnpm tsc && pnpm lint && pnpm test` vert et migrations appliquées sur `leadsens-localdev`.

## Estimation effort (jours)

T0 0.25 · T1 1 · T2 0.75 · T3 0.25 · T4 0.25 · T5 0.5 · T6 0.25 · T7 0.75 · T8 0.25 · T9 1 = **~4.5 j**.
