# Design — P0-3 Gate de scoring qualité à la génération

## Composants existants (read-only puis fix ciblé)

| Fichier:ligne | Rôle | Status |
|---|---|---|
| `lib/evals/email-quality-grader.ts:52-206` | `gradeEmail` data-backed, 6 dims pondérées, composite 0–1 | ✅ correct — réutilisé tel quel |
| `skills/outreach/knowledge/email-benchmarks.ts:126-253` | `FRAMEWORKS` (5 clés) + `scoreEmailAgainstBenchmarks:328` | ✅ correct — source du mapping |
| `lib/agents/sequence-generator.ts:58-116` | `generateSequence` — branche bulk sans gate `:73-86`, branche eval `:88-116` | à modifier (unifier sur la boucle + scorer) |
| `lib/agents/sequence-generator.ts:123-210` | `evaluateSequenceQuality` lint maison | conservé exporté, **plus appelé** (R11) |
| `lib/evals/flywheel.ts:596-638` | `evaluatorOptimizerLoop` (défaut 3 iters) | ✅ correct — réutilisé, appelé avec 2 |
| `lib/scoring/outbound-methodologies.ts:23-148` | `METHODOLOGIES`/`getMethodology` → `name ∈ {BASHO,Challenger,Problem-Solution,Product-Led}` | ✅ source du mapping name→framework |
| `lib/context/prospect-context.ts:23-83` | `ProspectContext` (contact.fullName, company.name, bestSignal.title) | ✅ source du prospectContext |
| `app/api/campaigns/generate/route.ts:86-194` | path BULK, appelle `generateSequence` sans `evaluate` `:89/:136` | à modifier (renvoyer `quality`) |
| `lib/chat/tools/action.ts:126+` | `generateFollowUpEmail` (produit subject+body) | à modifier (grader le body) |
| `lib/chat/tools/action.ts:56-123` | `draftEmail` (renvoie instruction, pas de texte) | ✅ read-only — rien à grader (correction grounding) |

## Fixes ciblés

### Fix 1 — Adaptateur `gradeGeneratedStep` (NEW, dans `email-quality-grader.ts` ou un module `sequence-quality.ts`)

Mappe un step `GeneratedSequence` + ctx vers un appel `gradeEmail`. Centralise le name→framework mapping et l'edge case body vide.

```ts
// lib/evals/sequence-quality.ts  (NEW)
import { gradeEmail, type EmailGradeResult } from "./email-quality-grader";
import type { FRAMEWORKS } from "@/skills/outreach/knowledge/email-benchmarks";
import type { ProspectContext } from "@/lib/context/prospect-context";
import type { Methodology } from "@/lib/scoring/outbound-methodologies";

const METHODOLOGY_TO_FRAMEWORK: Record<string, keyof typeof FRAMEWORKS> = {
  BASHO: "basho",
  Challenger: "challenger",
  "Problem-Solution": "problem_solution",
  "Product-Led": "product_led",
  // "Mouse Trap" jamais retourné par getMethodology — non mappé
};

export function methodologyToFramework(name: string): keyof typeof FRAMEWORKS | undefined {
  return METHODOLOGY_TO_FRAMEWORK[name]; // undefined => framework neutre dans gradeEmail
}

export function gradeGeneratedStep(
  step: { subject: string; body: string; stepNumber: number },
  ctx: ProspectContext,
  methodology: Methodology,
): EmailGradeResult & { stepNumber: number } {
  if (!step.body || step.body.trim() === "") {
    return { stepNumber: step.stepNumber, score: 0, dimensions: [],
      issues: ["empty body"], strengths: [] };
  }
  const result = gradeEmail({
    email: step.body,
    subjectLine: step.subject,
    framework: methodologyToFramework(methodology.name),
    prospectContext: {
      name: ctx.contact.fullName,           // prospect-context.ts:234
      company: ctx.company?.name,            // :40-42 (nullable)
      signal: ctx.bestSignal?.title,         // :56 / sequence-generator.ts:232
      seniority: ctx.contact.seniority ?? undefined,
    },
  });
  return { ...result, stepNumber: step.stepNumber };
}
```

### Fix 2 — `gradeSequenceQuality` (NEW) remplace `evaluateSequenceQuality` dans la boucle

Signature compatible avec `evaluateFn` attendu par `evaluatorOptimizerLoop` (`flywheel.ts:597-598`).

```ts
// lib/evals/sequence-quality.ts (suite)
const TIER1_FRAMEWORKS = new Set(["basho"]);

export function passThresholdFor(methodology: Methodology): number {
  const fw = methodologyToFramework(methodology.name);
  return fw && TIER1_FRAMEWORKS.has(fw) ? 0.80 : 0.70; // R5
}

export function gradeSequenceQuality(
  output: string,
  ctx: ProspectContext,
  methodology: Methodology,
): { pass: boolean; score: number; feedback: string;
     perStep: Array<{ stepNumber: number; composite: number; dimensions: Record<string, number> }> } {
  let seq;
  try { seq = JSON.parse(output); }
  catch { return { pass: false, score: 0, feedback: "Invalid JSON output", perStep: [] }; }
  if (!seq.steps || seq.steps.length === 0)
    return { pass: false, score: 0, feedback: "Empty sequence", perStep: [] };

  const graded = seq.steps.map((s: any) => gradeGeneratedStep(s, ctx, methodology));
  const composite = graded.reduce((a, g) => a + g.score, 0) / graded.length;

  // Feedback par-dimension réinjecté au prompt (R5)
  const feedback = graded.flatMap((g) =>
    g.issues.map((iss) => `Step ${g.stepNumber}: ${iss}`)
  ).join("\n");

  const perStep = graded.map((g) => ({
    stepNumber: g.stepNumber, composite: g.score,
    dimensions: Object.fromEntries(g.dimensions.map((d) => [d.name, d.score])),
  }));

  const threshold = passThresholdFor(methodology);
  return { pass: composite >= threshold, score: composite, feedback, perStep };
}
```

### Fix 3 — `generateSequence` : toujours passer par la boucle, attacher `qualityScore`

Diff conceptuel sur `sequence-generator.ts:58-116`. Supprime la branche directe `:73-86` ; la boucle tourne pour bulk ET preview. `evaluate` devient un no-op de compat (ou supprimé des call-sites).

```ts
// sequence-generator.ts — remplace lignes 72-116
const generateFn = async (feedback?: string) => {
  const prompt = feedback ? `${basePrompt}\n\nPREVIOUS ATTEMPT FEEDBACK — fix these issues:\n${feedback}` : basePrompt;
  const { object } = await tracedGenerateObject({
    model, schema: generatedSequenceSchema, prompt, temperature: 0.5,
    _trace: { agentId: "generate-sequence", tenantId: options?.tenantId,
      inputPreview: `Sequence for ${ctx.contact.fullName} at ${ctx.companyName || "unknown"}` },
  });
  return { text: JSON.stringify(object) };
};
const evaluateFn = async (output: string) => gradeSequenceQuality(output, ctx, methodology);

const { evaluatorOptimizerLoop } = await import("@/lib/evals/flywheel");
const result = await evaluatorOptimizerLoop(generateFn, evaluateFn, 2); // R1, max 2

const parsed = JSON.parse(result.output) as GeneratedSequence;
// R7 : attacher les scores
const finalEval = gradeSequenceQuality(result.output, ctx, methodology);
return {
  ...parsed,
  steps: parsed.steps.map((s) => {
    const ps = finalEval.perStep.find((p) => p.stepNumber === s.stepNumber);
    return { ...s, qualityScore: ps ? { composite: ps.composite, dimensions: ps.dimensions } : undefined };
  }),
  sequenceQuality: { composite: finalEval.score, passed: finalEval.pass, iterations: result.iterations },
} as GeneratedSequence;
```

Type étendu (in-memory, R7) :

```ts
export type GeneratedSequence = z.infer<typeof generatedSequenceSchema> & {
  steps: Array<z.infer<typeof generatedSequenceSchema>["steps"][number] & {
    qualityScore?: { composite: number; dimensions: Record<string, number> };
  }>;
  sequenceQuality?: { composite: number; passed: boolean; iterations: number };
};
```

**Note R12 :** ajouter `evalScore: finalEval.score` au `_trace` du dernier `tracedGenerateObject` (ou via le tracer post-loop) pour alimenter `agentTraces.evalScore`.

### Fix 4 — Route `campaigns/generate` renvoie `quality`

`route.ts:183-194`. `generated` porte désormais `sequenceQuality` + `steps[].qualityScore` (Fix 3), pour les DEUX branches (`:89` et `:136`).

```ts
return Response.json({
  sequenceId: targetSequenceId,
  sequenceName: generated.sequenceName,
  reasoning: generated.sequenceReasoning,
  steps: generated.steps,
  quality: {
    composite: generated.sequenceQuality?.composite ?? null,
    passed: generated.sequenceQuality?.passed ?? null,
    perStep: generated.steps.map((s) => ({ stepNumber: s.stepNumber, composite: s.qualityScore?.composite ?? null })),
  },
  methodology: { /* inchangé */ },
  strategyUsed,
}, { status: 201 });
```

### Fix 5 — `generateFollowUpEmail` (chat) grade non-bloquant

`action.ts:126+`. Après génération du `{ subject, body }`, grader le body (méthodo par défaut via `getMethodology(contact.seniority)`), inclure `qualityScore` dans le retour. Pas de régénération (R10).

```ts
import { gradeGeneratedStep } from "@/lib/evals/sequence-quality";
import { getMethodology } from "@/lib/scoring/outbound-methodologies";
// après obtention de { subject, body } :
const grade = gradeGeneratedStep(
  { subject, body, stepNumber: 1 },
  /* ctx minimal */ ctxForGrade,  // construit depuis contact+company
  getMethodology(contact.seniority),
);
return { subject, body, actionItems, qualityScore: { composite: grade.score } };
```
*(Si construire un `ProspectContext` complet est trop coûteux ici, appeler `gradeEmail` directement avec un `prospectContext` minimal — même résultat, voir Open question 3.)*

## Data model

Aucun changement de schéma. `qualityScore`/`sequenceQuality` sont in-memory sur le type `GeneratedSequence` et dans le JSON de réponse. La colonne `sequence_drafts.personalizationSources` (`outbound.ts:149`) n'est PAS écrite par ce spec (hors scope).

## Flux (ordre des appels, gates en gras)

1. `POST /api/campaigns/generate` → résout `resolvedContactId` (`route.ts:27-61`).
2. `buildProspectContext(contactId, tenantId)` → `ctx` tenant-scoped (`route.ts:87`).
3. `generateSequence(ctx, { stepCount })` :
   a. `getMethodology(ctx.contact.seniority)` (`sequence-generator.ts:65`).
   b. **`evaluatorOptimizerLoop(generateFn, evaluateFn, 2)`** :
      - `generateFn()` → LLM → JSON.
      - **`evaluateFn` = `gradeSequenceQuality`** → composite via `gradeEmail` par step.
      - si `composite < passThresholdFor(methodology)` → `generateFn(feedback)` (déductions par-dimension) → re-grade. Max 2 iters.
   c. parse best output, attache `qualityScore`/`sequenceQuality`, trace `evalScore`.
4. Route persiste steps (inchangé `:141-181`) et renvoie `quality` (Fix 4).
5. Chat `generateFollowUpEmail` : LLM → body → **`gradeGeneratedStep` (non bloquant)** → retour avec `qualityScore`.

## Failure handling / Security

- **Fail-open (R6)** : la génération ne throw jamais sur score bas — best output retourné, `passed:false` exposé. Motivation : cohérent avec `personalizeStepEmail` (`sequence-generator.ts:366-370`) — un email sous-seuil vaut mieux qu'un send droppé. Le founder révise avant envoi (les steps sont en `status:"draft"` `route.ts:166`).
- **Fail-closed local** : `gradeSequenceQuality` sur JSON invalide → `{pass:false, score:0}` (pas de throw), ce qui force une itération de plus dans la boucle au lieu de planter (`flywheel.ts:619-635`).
- **Tenant-scoping** : `ctx` provient de `buildProspectContext(contactId, tenantId)` ; le scorer est pur, ne lit pas la DB, n'introduit aucune fuite. `generateFollowUpEmail` charge contact/company déjà scopés `eq(tenantId)` (`action.ts:144,153`).
- **Idempotence** : scoring pur, déterministe pour un même input (string-match) ; aucun effet de bord, rejouable.
- **Coût** : worst case ×2 appels LLM par séquence (2 itérations), déjà le coût du path preview existant. BULK passe de 1 à ≤2 appels/contact — documenté, acceptable (composite cible 0.80).

## Open questions

1. **Seuil tier-1** : 0.80 confirmé pour BASHO uniquement, 0.70 ailleurs ? Le grounding dit « 0.80 tier-1 ». À confirmer si Challenger doit aussi être à 0.80. (Défaut spec : BASHO=0.80, reste=0.70.)
2. **`evaluate` option** : faut-il supprimer `options.evaluate` de tous les call-sites ou le garder en no-op ? Grep des call-sites de `generateSequence(..., { evaluate })` avant suppression (T0).
3. **Coût `generateFollowUpEmail`** : construire un `ProspectContext` complet via `buildProspectContext` (DB round-trips) vs appeler `gradeEmail` directement avec un prospectContext minimal `{ name, company, signal:undefined }`. Le second est moins cher et suffit (R10 non bloquant) — privilégier `gradeEmail` direct.
4. **`vertical-baseline.test.ts`** importe `scoreEmailAgainstBenchmarks` — vérifier qu'on ne casse rien en n'y touchant pas.
