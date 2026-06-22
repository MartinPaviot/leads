# P0-3 — Gate de scoring qualité à la génération (BULK inclus)

## Note importante (vérité du code au 2026-06-21)

Vérifié file:line sur la branche courante. Le grounding est exact sur l'essentiel ; corrections/précisions ci-dessous.

**Ce qui EXISTE déjà :**

- `gradeEmail(input)` — scorer déterministe data-backed (6 dimensions pondérées : word_count 0.15, anti_patterns 0.20, personalization 0.25, cta_clarity 0.15, subject_line 0.10, framework_compliance 0.15), composite 0–1. `app/apps/web/src/lib/evals/email-quality-grader.ts:52-206`. Retourne `{ score, dimensions: DimensionScore[], issues, strengths }`.
- `scoreEmailAgainstBenchmarks(email, framework)` — scorer plus léger, retourne `{ score, issues }`. `app/apps/web/src/skills/outreach/knowledge/email-benchmarks.ts:328-364`.
- `FRAMEWORKS` (clés : `basho`, `challenger`, `problem_solution`, `product_led`, `mouse_trap`). `email-benchmarks.ts:126-253`.
- `evaluateSequenceQuality(output, ctx, methodology)` — lint maison string-match, seuil de passage `0.7`, retourne `{ pass, score, feedback }`. `app/apps/web/src/lib/agents/sequence-generator.ts:123-210`.
- `evaluatorOptimizerLoop(generateFn, evaluateFn, maxIterations)` — boucle generate→évalue→raffine ; **par défaut maxIterations=3** mais `generateSequence` l'appelle avec **2** (`sequence-generator.ts:113`). `app/apps/web/src/lib/evals/flywheel.ts:596-638`.
- `generateSequence(ctx, options)` — branche `options.evaluate=true` → boucle evaluator-optimizer ; branche par défaut (BULK) → un seul `tracedGenerateObject`, AUCUN gating. `sequence-generator.ts:58-116`.
- `METHODOLOGIES` + `getMethodology(seniority)` retourne `Methodology.name ∈ {BASHO, Challenger, Problem-Solution, Product-Led}` (jamais `Mouse Trap`). `app/apps/web/src/lib/scoring/outbound-methodologies.ts:23-148`.
- Colonne `sequenceDrafts.personalizationSources jsonb notNull default []` (`Array<Record<string,unknown>>`). `app/apps/web/src/db/schema/outbound.ts:149-152`. **NB :** cette colonne est sur `sequence_drafts` (le pipeline draft-router), PAS sur `sequence_steps` ni sur le type `GeneratedSequence`.

**Le GAP réel :**

1. `gradeEmail` / `scoreEmailAgainstBenchmarks` ne tournent sur AUCUN email réel généré. Importés seulement par : tests (`__tests__/email-quality-grader.test.ts`, `__tests__/vertical-baseline.test.ts`) et un grader dégradé non lié à la génération (`skills/runner.ts:108-109`, `gradeEmailOutput` — code mort vis-à-vis de `generateSequence`). Confirmé via grep.
2. Le path BULK `campaigns/generate/route.ts:89` et `:136` appelle `generateSequence(ctx, { stepCount })` SANS `evaluate:true` → branche `sequence-generator.ts:73-86`, zéro gate. C'est le path qui emaile de vrais prospects.
3. Même quand le gate tourne (preview, `evaluate:true`), c'est `evaluateSequenceQuality` (lint maison, seuil 0.7) qui juge — pas le scorer data-backed `gradeEmail`. Donc deux barres de qualité divergentes.
4. `draftEmail` (chat) ne génère même pas l'email : il renvoie un `instruction` au LLM appelant et n'a aucun grade. `app/apps/web/src/lib/chat/tools/action.ts:56-123`. Le grounding parle de « câbler draftEmail via le même scorer » ; **correction** : `draftEmail` ne produit pas de texte d'email à grader (il délègue au LLM hôte). Le tool gradable côté chat est `generateFollowUpEmail` (`action.ts:126+`), qui lui produit subject+body. Voir AC8.
5. `personalizationSources` n'existe pas sur `GeneratedSequence` ni sur `sequence_steps`. Exposer le score par-dimension « dans le draft » nécessite soit d'étendre le type `GeneratedSequence` (in-memory, pas de schéma), soit d'écrire dans `sequence_drafts.personalizationSources` côté draft-router. Ce spec étend `GeneratedSequence` en mémoire et renvoie le score dans la réponse de la route ; l'écriture en DB sur `sequence_drafts` est **hors scope** (item séparé).

**Limite connue (NON résolue ici) :** le scorer est string-match. La fausse personnalisation (« I noticed your company… » + pitch générique, cf. `WHAT_FAILS.structural.fakePersonalization` `email-benchmarks.ts:101`) n'est PAS attrapée. C'est P1-12, hors scope.

## Scope

**On construit :**
- Un adaptateur unique `gradeGeneratedStep` qui mappe un step (`GeneratedSequence.steps[i]`) + `ProspectContext` + `Methodology` vers un appel `gradeEmail` (mapping name→clé FRAMEWORKS, extraction du `prospectContext`).
- Un évaluateur de séquence `gradeSequenceQuality` qui remplace `evaluateSequenceQuality` dans la boucle evaluator-optimizer : agrège les `gradeEmail` par step, produit `{ pass, score, feedback }` où `feedback` est la liste des déductions par-dimension (réinjectée au prompt de régénération via le mécanisme `feedback` déjà câblé `sequence-generator.ts:90-92`).
- Activation du gate sur le path BULK : `generateSequence` tourne la boucle evaluator-optimizer **toujours** (preview ET bulk), seuil composite `0.80` pour tier-1 (BASHO), `0.70` sinon.
- Exposition du `qualityScore` par-dimension dans le retour de `generateSequence` (sur chaque step + un agrégat séquence) et dans la réponse `POST /api/campaigns/generate`.
- Câblage du même scorer sur `generateFollowUpEmail` (chat) — grade le body généré, log le score (non bloquant pour le chat, voir R6).

**On ne reconstruit pas :**
- `gradeEmail`, `scoreEmailAgainstBenchmarks`, `FRAMEWORKS`, `evaluatorOptimizerLoop` — réutilisés tels quels.
- `evaluateSequenceQuality` est conservé (export utilisé par les tests `sequence-generator.ts:121`) mais n'est plus appelé en prod par `generateSequence`.

## Exigences (EARS)

- **R1** — WHEN `generateSequence(ctx, options)` est invoqué (preview OU bulk), THE SYSTEM SHALL exécuter la boucle evaluator-optimizer (`evaluatorOptimizerLoop`, max 2 itérations) avec `gradeSequenceQuality` comme évaluateur. Remplace la branche directe `sequence-generator.ts:73-86`.
- **R2** — THE SYSTEM SHALL noter chaque step généré via `gradeEmail` (`email-quality-grader.ts:52`) et non via le lint string-match `evaluateSequenceQuality` (`sequence-generator.ts:123`).
- **R3** — THE SYSTEM SHALL mapper `Methodology.name` (`outbound-methodologies.ts`) vers une clé `FRAMEWORKS` (`email-benchmarks.ts:126`) : `BASHO→basho`, `Challenger→challenger`, `Problem-Solution→problem_solution`, `Product-Led→product_led`. IF le name est inconnu, THEN THE SYSTEM SHALL passer `framework: undefined` à `gradeEmail` (dimension framework neutre 0.5, cf. `email-quality-grader.ts:185`).
- **R4** — THE SYSTEM SHALL construire le `prospectContext` passé à `gradeEmail` depuis `ctx` : `name=ctx.contact.fullName`, `company=ctx.company?.name`, `signal=ctx.bestSignal?.title`, `seniority=ctx.contact.seniority`. Réf `prospect-context.ts:23-83`.
- **R5** — WHILE le composite séquence `< seuil` (0.80 pour framework tier-1 BASHO, 0.70 sinon), THE SYSTEM SHALL réinjecter, via le paramètre `feedback` de `generateFn` (`sequence-generator.ts:90-92`), les `issues` par-dimension agrégées par step (format `Step N — <dimension>: <detail>`).
- **R6** — IF la boucle se termine sans atteindre le seuil après 2 itérations, THEN THE SYSTEM SHALL retourner le meilleur output obtenu (`evaluatorOptimizerLoop` retourne déjà `bestOutput` `flywheel.ts:637`) ET attacher `qualityScore` au résultat — la génération n'échoue JAMAIS (fail-open : un email sous-seuil vaut mieux qu'une erreur qui drop le send, cohérent avec `personalizeStepEmail` `sequence-generator.ts:366-370`).
- **R7** — THE SYSTEM SHALL attacher à chaque step retourné un champ `qualityScore: { composite: number; dimensions: Record<string, number> }` et à la séquence un `sequenceQuality: { composite, passed, iterations }`.
- **R8** — WHEN `POST /api/campaigns/generate` répond (`route.ts:183-194`), THE SYSTEM SHALL inclure `quality: { composite, passed, perStep }` dans le JSON, pour les deux branches (contact réel `:89` et template minimal `:136`).
- **R9** — WHERE le contexte est le template minimal (placeholders `{{firstName}}` etc., `route.ts:103-134`, pas de signal, `bestSignal:null`), THE SYSTEM SHALL ne PAS pénaliser l'absence de signal (déjà géré `email-quality-grader.ts:134-136`) ni l'absence de perso réelle au-delà du barème normal — le gate reste informatif mais non bloquant sur les placeholders.
- **R10** — WHEN `generateFollowUpEmail` (`action.ts:126`) produit un `subject`+`body`, THE SYSTEM SHALL grader le body via `gradeEmail` et inclure `qualityScore.composite` dans le retour du tool, SANS bloquer ni régénérer (le chat est interactif, l'utilisateur révise).
- **R11** — THE SYSTEM SHALL préserver l'export `evaluateSequenceQuality` (`sequence-generator.ts:121`) pour la rétro-compatibilité des tests, mais ne plus l'appeler dans `generateSequence`.
- **R12** — THE SYSTEM SHALL tracer le composite final via le `_trace` déjà présent (`sequence-generator.ts:79-83`) en ajoutant `evalScore` au trace pour alimenter le flywheel (`agentTraces.evalScore`, cf. `flywheel.ts:116`).
- **R13** — THE SYSTEM SHALL NOT introduire de nouveau provider LLM, de nouvelle table, ou de nouvelle dépendance.
- **R14** — THE SYSTEM SHALL NOT tenter de détecter la fausse personnalisation sémantique (string-match seulement) — explicitement renvoyé à P1-12.

## Critères d'acceptation

- **AC1** — GIVEN un `ctx` avec contact+company+signal réels, WHEN `generateSequence(ctx, { stepCount: 5 })` (sans `evaluate`), THEN le retour contient `sequenceQuality.composite` et chaque `step.qualityScore`. *(Aujourd'hui : aucune des deux branches `sequence-generator.ts:73-86` / `:88-116` ne renvoie de score sur la branche bulk — GAP.)*
- **AC2** — GIVEN une séquence dont un step fait 200 mots pour une méthodo BASHO (maxWords 80), WHEN gradée, THEN `step.qualityScore.dimensions.word_count < 0.6` et le composite step baisse (réf barème `email-quality-grader.ts:60-73`). DÉJÀ IMPLÉMENTÉ dans `email-quality-grader.ts:60-73` ✅ (il manque seulement le câblage).
- **AC3** — GIVEN une séquence BASHO dont step 1 contient « I hope this finds you well », WHEN gradée, THEN `dimensions.anti_patterns < 1.0` et `issues` mentionne le dead opener. DÉJÀ IMPLÉMENTÉ dans `email-quality-grader.ts:79-84` ✅.
- **AC4** — GIVEN un composite séquence `0.62 < 0.80` pour BASHO, WHEN la boucle tourne, THEN `generateFn` est rappelée avec un `feedback` non vide listant les déductions par-dimension, ET `iterations >= 2`. (Mécanisme `feedback` déjà câblé `sequence-generator.ts:90-92` ✅ ; le contenu par-dimension est NEW.)
- **AC5** — GIVEN un composite qui reste `< seuil` après 2 itérations, WHEN la boucle finit, THEN `generateSequence` retourne quand même un objet valide (best output) avec `sequenceQuality.passed=false`. (Best-output déjà retourné `flywheel.ts:625-637` ✅.)
- **AC6** — GIVEN `POST /api/campaigns/generate` avec `contactId` valide, WHEN 201, THEN le body JSON contient `quality.composite` et `quality.perStep[]`. GAP (`route.ts:183-194` ne renvoie rien de tel).
- **AC7** — GIVEN le path template minimal (`route.ts:90-136`, aucun contact), WHEN 201, THEN `quality` est présent et `quality.passed` n'est pas `false` uniquement à cause des placeholders `{{firstName}}` (R9).
- **AC8** — GIVEN `generateFollowUpEmail` côté chat produit un body, WHEN le tool retourne, THEN le retour contient `qualityScore.composite` ET le chat n'est PAS bloqué si `composite < seuil` (R10). *(Correction grounding : `draftEmail` `action.ts:56` ne génère pas de texte, donc rien à grader ; c'est `generateFollowUpEmail` qui est câblé.)*
- **AC9** — GIVEN un `Methodology.name = "Problem-Solution"`, WHEN mappé, THEN `gradeEmail` reçoit `framework: "problem_solution"` (clé valide `FRAMEWORKS`, `email-benchmarks.ts:181`).
- **AC10** — GIVEN un name de méthodo non mappable, WHEN mappé, THEN `gradeEmail` reçoit `framework: undefined` et ne throw pas (dimension framework neutre, `email-quality-grader.ts:185`).
- **AC11** — GIVEN le composite final calculé, WHEN la génération se termine, THEN le `_trace` porte `evalScore = composite` (vérifiable en mockant `tracedGenerateObject`/le tracer).
- **AC12** — `evaluateSequenceQuality` reste exporté et son test existant passe inchangé (R11).

## Edge cases

- **Step body vide / null** : `generateSequence` schema force `body: z.string()` (`sequence-generator.ts:42`), mais une string vide donne `wordCount=0` → `word_count` score 1.0 (≤max) faux-positif. Le mapping DOIT traiter `body.trim()===""` comme composite step = 0 (déduction explicite « empty body »).
- **`ctx.company === null`** (path company-only où company non résolue) : `prospectContext.company` devient `undefined`, perso company non comptée (`email-quality-grader.ts:127`), pas de crash.
- **`ctx.bestSignal === null`** (template minimal, R9) : pas de pénalité signal (`email-quality-grader.ts:134-136`), composite n'est pas artificiellement bas.
- **Placeholders `{{firstName}}`** : `prospectContext.name = "{{firstName}} {{lastName}}"`. `email.includes("{{firstName}}".split(" ")[0])` = `includes("{{firstName}}")` → match si le LLM a gardé le placeholder. Acceptable (R9) ; ne pas crasher sur `split`.
- **Composite NaN** : `gradeEmail` divise par `totalWeight` (somme des poids = 1.0, jamais 0, `email-quality-grader.ts:202-203`) → pas de NaN. L'agrégat séquence DOIT garder contre `steps.length===0` (séquence vide → composite 0, passed false).
- **Sortie LLM non-JSON dans la boucle** : `evaluatorOptimizerLoop` passe `result.output` (string), `generateSequence` fait `JSON.parse` (`sequence-generator.ts:115`). IF parse échoue, l'erreur remonte ; `gradeSequenceQuality` DOIT, comme `evaluateSequenceQuality` (`sequence-generator.ts:200`), retourner `{ pass:false, score:0, feedback:"Invalid JSON output" }` plutôt que throw, pour laisser la boucle réessayer.
- **Concurrence / idempotence** : pure fonction de scoring, sans état ; aucun risque de course. La route fait déjà des writes DB hors scope du gate.
- **Cross-runtime** : le gate tourne dans la route Next (runtime node) et potentiellement dans Inngest (draft-router) — le scorer est pur TS sans dépendance runtime, OK.
- **Timeout LLM** : la régénération double les appels LLM dans le pire cas (2 itérations). Le BULK path appelle `generateSequence` une fois par contact ; pas de timeout global mais coût ×2 max (déjà le cas pour preview). Documenté dans design (coût).
- **Tenant-scoping** : le scorer ne touche pas la DB ; `ctx` est déjà tenant-scoped par `buildProspectContext(contactId, tenantId)` (`route.ts:87`). Aucune fuite cross-tenant introduite.
- **Mouse Trap** : `getMethodology` ne retourne jamais `Mouse Trap`, donc `mouse_trap` n'est pas atteignable via le mapping — c'est correct, ne pas l'ajouter spéculativement.
- **Step avec `framework_compliance` neutre** : quand framework `undefined`, dimension à 0.5 plafonne le composite max ~0.92 ; le seuil 0.80 reste atteignable. Vérifier qu'un bon email sans framework mappé passe quand même (test).

## Hors scope

- Détection de fausse personnalisation sémantique → **P1-12**.
- Écriture du score par-dimension dans `sequence_drafts.personalizationSources` (DB) → item draft-router séparé.
- Gate sur le pipeline `sequence-draft-router` / `sequence-draft-to-outbound` (Inngest) → suit ce spec mais traité à part.
- Refonte du barème de `gradeEmail` (poids, seuils) → on prend l'existant tel quel.
- Tuning du `temperature` ou du prompt de génération au-delà de l'injection `feedback`.
