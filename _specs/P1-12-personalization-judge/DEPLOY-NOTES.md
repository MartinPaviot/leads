MIGRATIONS (runner custom `pnpm db:migrate:apply`, jamais le runner journal — il casse >idx 0012, cf. MEMORY supabase-dev-db-setup ; appliquer d'abord sur leadsens-localdev, ne JAMAIS auto-migrer prod depuis une branche non mergée) :
1. `ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS quality_score jsonb;` (T4, idempotent).
2. `CREATE TABLE IF NOT EXISTS personalization_calibration (...)` + `uniqueIndex(tenant_id, run_date)` + `index(tenant_id)` (T6). Prod (leadsens-dev) : appliquer AVANT le premier déclenchement du cron, sinon le UPSERT échoue.

DATASETS : `PERSONALIZATION_GOLDEN` (≥20 cas annotés humains) est un NOUVEAU dataset à créer à la main (T9) — ne pas confondre avec `golden-cases.ts` (cas agents, pas perso-judgment). C'est le gold de calibration juge↔humain ; sa qualité conditionne la valeur du juge.

COUPLAGE DÉPLOIEMENT :
- `gradeSequenceQuality` passe sync→async (T2/T3) : les 2 call-sites `sequence-generator.ts:104/111` DOIVENT être déployés dans le même commit que le changement de signature, sinon build cassé. Param `opts` optionnel ⇒ pas de changement de comportement prod (R20 : 2e étage off par défaut).
- Cron `personalization-backtest` (03:00 UTC) : à enregistrer dans le registre Inngest (à côté de `weeklyEvalHarness`) ET côté Inngest cloud (sync des fonctions au déploiement). Ne déclenchera utilement qu'une fois que des `outbound_emails.quality_score` non-null existent (T5 doit être live avant que le back-test produise du signal ; sinon `insufficientData:true` bénin).
- Juge LLM : skip déterministe sans `ANTHROPIC_API_KEY` (CI verte sans clé). Coût additionnel UNIQUEMENT en eval/calibration (R20), pas dans le hot path de génération — aucun impact budget prod tant que `semanticJudge` n'est pas activé.

HORS SCOPE FLAGGÉ (océan, spec future) : boucle fermée calibration→`passThresholdFor` (R19) ; aucune modification du gate de génération à partir de la corrélation observée — décision produit après ≥1 cycle de calibration.

VÉRIFIÉ contre le code live au 2026-06-22 : email-quality-grader.ts:120-143, sequence-quality.ts:34/68/83, sequence-generator.ts:53-119, prospect-context.ts:27-33/179-193, build-intelligence-brief.ts:150/165, ai-provider.ts:217, agent-evals.ts:168-208, eval-harness-cron.ts:25-95, outbound.ts:286-337, golden-cases.ts:401.