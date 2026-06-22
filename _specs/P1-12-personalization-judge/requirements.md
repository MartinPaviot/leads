# P1-12 — Juge de personnalisation sémantique + back-test reply-rate

## Note importante (vérité du code post-P0)

Audit live au 2026-06-22. Ce qui **EXISTE déjà** (P0 mergé, ne pas re-spécifier) :

- `gradeEmail` — grader data-backed déterministe (string-match), `app/apps/web/src/lib/evals/email-quality-grader.ts:52`. La **dimension `personalization` (poids 0.25) est purement lexicale** : `:120-143` n'additionne du score que si le body **contient le substring** du prénom (`:123`), du nom de société (`:127`), ou du premier mot du signal (`:131`). Aucune vérification que la *claim* est vraie. `"I noticed your company..."` ou `"As a fast-growing startup, CloudNova..."` marque plein pot sans aucun fait vérifiable derrière. **C'est le gap.**
- `gradeSequenceQuality(output, ctx, methodology)` — évaluateur de séquence appelé par la boucle evaluator-optimizer, `app/apps/web/src/lib/evals/sequence-quality.ts:68`. Boucle `gradeGeneratedStep` (`:34`) par step, agrège un composite (`:84`), produit `{ pass, score, feedback, perStep }`. **C'est LE point d'insertion du 2e étage.**
- `gradeGeneratedStep(step, ctx, methodology)` — adaptateur step→`gradeEmail`, `sequence-quality.ts:34`. Extrait `ctx.contact.fullName / company.name / bestSignal.title / seniority` (`:46-51`).
- `passThresholdFor(methodology)` — seuil 0.80 (BASHO) / 0.70 (autres), `sequence-quality.ts:29`.
- `generateSequence` — appelle toujours `evaluatorOptimizerLoop(generateFn, gradeSequenceQuality, 2)` (`sequence-generator.ts:107`), puis attache `qualityScore` par step + `sequenceQuality` au `GeneratedSequence` (`:110-119`). Type `GeneratedSequence` : `sequence-generator.ts:53` (`steps[].qualityScore`, `sequenceQuality`).
- `ProspectContext.researchBrief?: ResearchBriefContext` — déjà peuplé read-only depuis le cache de brief, `prospect-context.ts:97` + `:179-193`. Shape : `bestAngle | painPoints[] | competitorDetected | publicContent[{type,title,quote}] | warmthSignals[{type,detail}]` (`prospect-context.ts:27-33`). C'est **la source de vérité** contre laquelle juger les claims.
- `getModelForTask("lightweight")` → Haiku ; `getModelForTask("chat")` → Sonnet, `ai-provider.ts:217`. Helper canonique pour choisir un modèle (gère circuit-breaker + fallback Mistral/OpenAI).
- Pattern juge LLM existant : `agent-evals.ts:168` (`llm_judge`) — **skip déterministe `{score:0.5}` quand `!process.env.ANTHROPIC_API_KEY`** (`:176-178`), try/catch fail-open (`:206`). C'est le pattern à répliquer.
- Pattern cron nocturne Inngest : `eval-harness-cron.ts:25` (`inngest.createFunction`, cron TZ, `retries:0`, `step.run` par sous-tâche).
- `outboundEmails.repliedAt` (`outbound.ts:315`), `.sentAt` (`:311`), `.stepNumber` (`:295`), `.enrollmentId` (`:292`), `.tenantId` (`:290`). Index `outbound_sent_idx` (`:332`), `outbound_enrollment_idx` (`:331`).

Ce qui **N'EXISTE PAS** (le scope de P1-12) :

- Aucun juge **sémantique** vraie-vs-fausse perso. La dimension `personalization` reste substring-only.
- `golden-cases.ts` (`:401`) = cas email/chat/reply pour le **harness d'agents** ; **aucun gold annoté pour le perso-judgment** (claim → vrai/faux contre un brief). À créer.
- `outboundEmails` **n'a pas de colonne `qualityScore`** (`outbound.ts:286-337`) — le score de génération n'est persisté nulle part de façon requêtable. Le back-test reply-rate a donc besoin d'une source de score persistée.
- Aucune table/store de **calibration** score→reply-tier ni de job nocturne back-testant.

## Scope

1. **`personalization-judge.ts`** : un juge LLM (`getModelForTask`) qui, pour un step donné + `ResearchBriefContext`, extrait chaque claim factuelle de l'email et la note 0–1 selon qu'elle trace à un fait **vérifiable** du brief. Sortie : score agrégé `0–1` + détail par-claim. Fail-open déterministe sans clé (comme `agent-evals.ts:176`).
2. **Branchement 2e étage** dans `gradeSequenceQuality` : après le `gradeEmail` déterministe (`sequence-quality.ts:83`), combiner avec le score sémantique pour produire le composite final, **derrière un flag** (le 2e étage coûte des tokens ⇒ off en CI/preview sync, on en eval/calibration).
3. **Gold annoté** `personalization-golden.ts` : ~20–30 cas (email + brief + label humain `groundedScore` + `verdicts` par claim). Sert à **calibrer** (mesurer accord juge↔humain) et de fixture de test.
4. **Persistance du score** : colonne `outboundEmails.qualityScore` (jsonb) écrite à la génération/draft, pour rendre le back-test possible.
5. **Job nocturne Inngest** back-testant `qualityScore` (90 j) vs `repliedAt`, calculant la corrélation score→reply-tier, écrivant une ligne de calibration consultable.

**Boilable (MVP de ce spec)** : 1+2+3+4+5 ci-dessus, tous déterministes-testables hors LLM. **Océan à flaguer (HORS SCOPE)** : ré-entraîner/auto-ajuster les seuils de `passThresholdFor` en prod à partir de la calibration (boucle de feedback fermée modifiant le gate de génération) — risque de dérive silencieuse du gate, à traiter en spec séparée après ≥1 cycle de calibration observé.

## Exigences (EARS)

### Juge sémantique

- **R1** — WHEN `judgePersonalization(email, brief)` est invoqué avec un `ResearchBriefContext` non vide, THE SYSTEM SHALL extraire les claims factuelles du body et retourner `{ groundedScore: number (0–1), claims: Array<{ text, grounded: boolean, evidence: string|null }> }`, où `grounded=true` ssi la claim trace à un champ de `brief` (`bestAngle | painPoints | competitorDetected | publicContent[].quote | warmthSignals[].detail`, cf. `prospect-context.ts:27-33`).
- **R2** — IF `process.env.ANTHROPIC_API_KEY` est absent, THEN THE SYSTEM SHALL retourner un résultat déterministe `{ groundedScore: 0.5, claims: [], skipped: true }` sans appel réseau, à l'identique du fallback `agent-evals.ts:176-178`.
- **R3** — IF l'appel modèle throw ou renvoie un JSON non parsable, THEN THE SYSTEM SHALL fail-open `{ groundedScore: 0.5, claims: [], skipped: true, error }` (jamais throw), comme `agent-evals.ts:206`.
- **R4** — WHERE `brief` est `undefined` ou `briefIsEmpty(brief)` est vrai (`build-intelligence-brief.ts:165`), THE SYSTEM SHALL retourner `{ groundedScore: 0.5, claims: [], skipped: true }` (pas de fait de référence ⇒ ne pas pénaliser, parité avec la branche `personalizationScore += 0.2` de `email-quality-grader.ts:135`).
- **R5** — THE SYSTEM SHALL utiliser `getModelForTask("lightweight")` (`ai-provider.ts:217`, Haiku) pour le juge, avec un budget tokens borné (`maxTokens ≤ 600`) et un body tronqué (`≤ 2000` chars), pour rester < ~$0.01/step comme `agent-evals.ts:169`.

### Branchement 2e étage

- **R6** — WHEN `gradeSequenceQuality(output, ctx, methodology, opts?)` est appelé AVEC `opts.semanticJudge === true`, THE SYSTEM SHALL, pour chaque step, exécuter `judgePersonalization(step.body, ctx.researchBrief)` APRÈS `gradeGeneratedStep` (`sequence-quality.ts:83`) et remplacer la composante `personalization` déterministe du step par `min(detLexical, groundedScore)` (le sémantique ne peut que **resserrer**, jamais gonfler, un substring non grounded).
- **R7** — WHEN `opts.semanticJudge` est absent/`false`, THE SYSTEM SHALL se comporter exactement comme aujourd'hui (`sequence-quality.ts:68` inchangé fonctionnellement) — zéro appel LLM, signature rétro-compatible (param optionnel).
- **R8** — THE SYSTEM SHALL exposer, dans `perStep[i]`, le `groundedScore` et le `skipped` du juge pour traçabilité (`perStep[].semantic?: { groundedScore, skipped }`), sans casser le shape `{ stepNumber, composite, dimensions }` existant consommé par `sequence-generator.ts:115`.
- **R9** — WHILE le 2e étage tourne, IF un step est `skipped` (R2/R3/R4), THEN THE SYSTEM SHALL conserver le `personalization` déterministe inchangé pour ce step (pas de pénalité du skip).

### Persistance du score

- **R10** — THE SYSTEM SHALL ajouter une colonne `outboundEmails.qualityScore` (jsonb nullable) stockant `{ composite, personalizationDet, personalizationSemantic|null, framework }` au moment où un step devient un draft/outbound row.
- **R11** — WHEN un `outboundEmails` row est créé depuis un `GeneratedSequence.steps[i]` portant `qualityScore` (`sequence-generator.ts:57`), THE SYSTEM SHALL recopier ce score dans la colonne ; IF le step n'a pas de score, THEN la colonne reste `null` (pas de blocage).

### Back-test nocturne

- **R12** — THE SYSTEM SHALL exposer une fonction Inngest cron nocturne `personalizationBacktest` (pattern `eval-harness-cron.ts:25`) qui, par tenant, lit les `outboundEmails` envoyés sur 90 j (`sentAt >= now-90d`, `outbound.ts:311`) avec `qualityScore IS NOT NULL`, et calcule le reply-rate (`repliedAt IS NOT NULL`) par bucket de `composite`.
- **R13** — THE SYSTEM SHALL bucketiser le composite en tiers (`<0.5`, `0.5–0.7`, `0.7–0.9`, `≥0.9`, miroir des seuils documentés `email-quality-grader.ts:8-12`) et écrire UNE ligne de calibration par run dans `personalizationCalibration` : `{ tenantId, runAt, windowDays:90, buckets: [{ tier, n, replied, replyRate }], correlation }`.
- **R14** — THE SYSTEM SHALL calculer un coefficient de corrélation (rang/Spearman sur (composite, replied∈{0,1})) par tenant et le persister, pour qu'un humain juge si le score **prédit** le reply.
- **R15** — IF un tenant a `< 30` emails scorés répondables sur la fenêtre, THEN THE SYSTEM SHALL marquer ce tenant `insufficientData: true` et NE PAS publier de corrélation (bruit statistique), tout en écrivant les comptes bruts.
- **R16** — THE SYSTEM SHALL être idempotent par jour : un re-run le même jour (`runAt::date`) UPDATE la ligne du jour au lieu d'en insérer une 2e (parité avec `retries:0` + `step.run` de `eval-harness-cron.ts:29`).

### Calibration juge↔humain

- **R17** — THE SYSTEM SHALL exposer `runPersonalizationJudgeEval()` (suite, pattern `transcript-coaching-grounded.eval.ts`) qui exécute `judgePersonalization` sur le gold `PERSONALIZATION_GOLDEN` et reporte l'accord (MAE entre `groundedScore` juge et `groundedScore` humain, + accord par-claim).
- **R18** — IF `!ANTHROPIC_API_KEY`, THEN la suite de calibration SHALL être comptée `skipped` (ni pass ni fail), à l'identique de la gate grounded existante (`transcript-coaching-grounded.eval.ts:344`).

### Non-goals

- **R19** — THE SYSTEM SHALL NOT modifier `passThresholdFor` ni les seuils du gate de génération à partir de la calibration (boucle fermée = HORS SCOPE, flaggé océan).
- **R20** — THE SYSTEM SHALL NOT exécuter le juge sémantique dans le chemin de génération bulk/preview par défaut (R7) — uniquement sous flag explicite (eval/calibration), pour ne pas ajouter de latence+coût LLM au gate de prod existant.
- **R21** — THE SYSTEM SHALL NOT scraper de nouvelle donnée de recherche : le juge ne lit que `ctx.researchBrief` déjà caché (`prospect-context.ts:179`).

## Critères d'acceptation

- **AC1** — GIVEN un email `"As a fast-growing startup, CloudNova is surely scaling its eng team"` ET un brief SANS painPoint/angle correspondant, WHEN `judgePersonalization` tourne (clé présente), THEN la claim "scaling its eng team" est `grounded:false`, `groundedScore < 0.5`. (Le grader déterministe, lui, donne plein pot car "CloudNova" est un substring — `email-quality-grader.ts:127`.)
- **AC2** — GIVEN un email citant verbatim un `publicContent[].quote` du brief, WHEN le juge tourne, THEN cette claim est `grounded:true` avec `evidence` pointant le quote, `groundedScore ≥ 0.8`.
- **AC3** — GIVEN `ANTHROPIC_API_KEY` absent, WHEN `judgePersonalization` tourne, THEN retour `{ groundedScore:0.5, skipped:true }`, **zéro appel réseau** (mock fetch non appelé). Parité `agent-evals.ts:176`.
- **AC4** — GIVEN `gradeSequenceQuality(out, ctx, m)` SANS `opts`, WHEN exécuté, THEN comportement byte-identique à aujourd'hui (DÉJÀ IMPLÉMENTÉ `sequence-quality.ts:68` ; test = régression confirmant aucun appel LLM, mêmes `composite`).
- **AC5** — GIVEN `opts.semanticJudge:true` ET un step au substring grounded mais sémantiquement faux, WHEN exécuté, THEN le `personalization` du step est rabaissé à `groundedScore` (R6, `min`), composite recalculé en conséquence.
- **AC6** — GIVEN un step `skipped` par le juge, WHEN le 2e étage tourne, THEN `personalization` reste la valeur déterministe (R9), `perStep[].semantic.skipped:true`.
- **AC7** — GIVEN la migration appliquée, WHEN on insère un `outboundEmails` depuis un step scoré, THEN `qualityScore` jsonb est peuplé ; un step non scoré ⇒ `null` (R10/R11).
- **AC8** — GIVEN 50 outbound emails scorés sur 90 j dont 10 répondus, WHEN `personalizationBacktest` tourne, THEN une ligne `personalizationCalibration` est écrite avec 4 buckets, comptes corrects, et un re-run même jour UPDATE (1 seule ligne/jour/tenant — R16).
- **AC9** — GIVEN un tenant avec 12 emails scorés, WHEN le back-test tourne, THEN `insufficientData:true`, pas de corrélation publiée, comptes bruts présents (R15).
- **AC10** — GIVEN le gold `PERSONALIZATION_GOLDEN` (≥20 cas), WHEN `runPersonalizationJudgeEval` tourne avec clé, THEN MAE(juge, humain) est reporté ; sans clé ⇒ suite `skipped` (R17/R18).

## Edge cases exhaustifs

1. **Substring vrai mais claim fausse** (AC1) — cœur du gap. Le juge doit dé-noter.
2. **Body vide / whitespace** — `gradeGeneratedStep` court-circuite déjà à composite 0 (`sequence-quality.ts:39`) ; le juge ne doit même pas être appelé pour ce step.
3. **Brief absent / vide** (R4) — `briefIsEmpty` ⇒ skip neutre, pas de pénalité.
4. **Placeholders template** (`{{firstName}}`, `[COMPANY]`) — le juge ne doit pas halluciner un grounding ; ces tokens ne sont jamais dans le brief ⇒ `grounded:false` mais traité comme claim non-perso, pas comme erreur. Réutilise le cas P0-3 (`P0-3 tasks.md:38`).
5. **JSON modèle malformé** (R3) — fail-open `skipped:true`.
6. **Email multilingue (FR)** — le juge doit grounder une claim FR contre un brief EN (les faits, pas la langue). Cas gold dédié.
7. **Claim générique non vérifiable** ("I hope you're well") — ni grounded ni pénalisée (ce n'est pas une claim factuelle ⇒ exclue du dénominateur).
8. **Quote partiellement cité / paraphrasé** — grounding partiel ; le juge doit accepter une paraphrase fidèle (evidence = quote source).
9. **Plusieurs claims, certaines vraies certaines fausses** — `groundedScore` = ratio grounded / total claims factuelles.
10. **Back-test : tenant 0 email** — skip propre, pas de division par zéro (R15).
11. **Back-test : composite exactement aux bornes** (0.5, 0.7, 0.9) — borne incluse dans le tier supérieur, défini une fois (miroir `email-quality-grader.ts:8-12`).
12. **Back-test : email scoré mais jamais envoyé** (`sentAt IS NULL`) — exclu (dénominateur = envoyés).
13. **Re-run cron même jour** (R16) — UPDATE, pas INSERT doublon.
14. **`qualityScore` legacy null sur vieux rows** — exclus du back-test (`WHERE qualityScore IS NOT NULL`), pas un crash.
15. **Tenant-scoping** — toute requête back-test filtre `tenantId` (parité `prospect-context.ts:112`).
16. **Concurrence génération** — le 2e étage ne doit pas muter `ctx` (pure).

## Hors scope

- **R19** — boucle fermée calibration→seuils (océan, spec future).
- Modifier la classification de reply (`replyClassification`, `outbound.ts:318`) — on lit seulement `repliedAt`.
- UI/dashboard de la calibration (la ligne `personalizationCalibration` est lisible en SQL ; un panneau admin = spec UI séparée).
- Juger les dimensions non-perso (word count, CTA, framework restent déterministes — `email-quality-grader.ts`).
- Activer le 2e étage en prod génération (R20) — décision produit post-calibration.
