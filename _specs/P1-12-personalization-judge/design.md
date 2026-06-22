# Design — P1-12 Juge de personnalisation sémantique + back-test reply-rate

## Composants existants (read-only puis fix ciblé)

| Fichier | Rôle | Status | Ancre |
|---|---|---|---|
| `lib/evals/email-quality-grader.ts` | grader déterministe ; dim `personalization` = substring | **read-only** (on ne touche pas la logique substring, on la **complète** au-dessus) | `:52`, `:120-143` |
| `lib/evals/sequence-quality.ts` | `gradeSequenceQuality` / `gradeGeneratedStep` ; point d'insertion 2e étage | **fix ciblé** (param `opts` + combine) | `:34`, `:68`, `:83` |
| `lib/agents/sequence-generator.ts` | boucle EO + attache `qualityScore`/`sequenceQuality` | **read-only** pour le gate ; le type `GeneratedSequence` est déjà bon (`:53-60`) | `:104-119` |
| `lib/context/prospect-context.ts` | `ResearchBriefContext` (source de vérité des claims) | **read-only** | `:27-33`, `:97`, `:179-193` |
| `lib/campaign-engine/build-intelligence-brief.ts` | `briefIsEmpty`, `toResearchBriefContext` | **read-only** (réutilisés) | `:150`, `:165` |
| `lib/ai/ai-provider.ts` | `getModelForTask("lightweight")` → Haiku | **read-only** | `:217` |
| `lib/evals/agent-evals.ts` | pattern `llm_judge` (skip sans clé, fail-open) | **read-only** (pattern copié) | `:168-208` |
| `inngest/eval-harness-cron.ts` | pattern cron nocturne `retries:0`+`step.run` | **read-only** (pattern copié) | `:25-95` |
| `db/schema/outbound.ts` | `outboundEmails` (pas de `qualityScore`) | **fix ciblé** (ALTER) | `:286-337` |
| `lib/evals/golden-cases.ts` | gold harness agents (pas de perso-judgment) | **read-only** (on ajoute un fichier sibling) | `:401` |

## Fixes ciblés

### Fix 1 — `lib/evals/personalization-judge.ts` (NEW) — le juge sémantique

Signatures exactes (noms réels du codebase) :

```ts
import type { ResearchBriefContext } from "@/lib/context/prospect-context";

export interface ClaimVerdict {
  text: string;            // la claim factuelle extraite du body
  grounded: boolean;       // trace à un fait du brief ?
  evidence: string | null; // champ/quote du brief qui la supporte
}

export interface PersonalizationJudgeResult {
  groundedScore: number;        // 0–1 = grounded / total claims factuelles
  claims: ClaimVerdict[];
  skipped: boolean;             // true => neutre (0.5), pas de pénalité
  error?: string;
}

/** Pure-ish : lit ANTHROPIC_API_KEY + appelle le modèle ; ne touche pas la DB. */
export async function judgePersonalization(
  emailBody: string,
  brief: ResearchBriefContext | undefined,
): Promise<PersonalizationJudgeResult>;
```

Corps (réplique stricte du contrat `agent-evals.ts:168-208`) :

```ts
const NEUTRAL: PersonalizationJudgeResult = { groundedScore: 0.5, claims: [], skipped: true };

export async function judgePersonalization(emailBody, brief) {
  const { briefIsEmpty } = await import("@/lib/campaign-engine/build-intelligence-brief");
  if (!brief || briefIsEmpty(brief)) return NEUTRAL;                 // R4
  if (!process.env.ANTHROPIC_API_KEY) return NEUTRAL;               // R2 (parité :176)
  try {
    const { generateText } = await import("ai");
    const { getModelForTask } = await import("@/lib/ai/ai-provider");
    const model = getModelForTask("lightweight");                   // R5 Haiku
    if (!model) return NEUTRAL;
    const factSheet = formatBriefFacts(brief);                       // bestAngle/painPoints/competitor/quotes/warmth
    const res = await generateText({
      model,
      // @ts-expect-error maxTokens lag (cf. agent-evals.ts:196)
      maxTokens: 600,                                                // R5 budget
      prompt: JUDGE_PROMPT(factSheet, emailBody.slice(0, 2000)),     // body tronqué R5
    });
    return parseJudgeJson(res.text);                                 // tolère prose autour du JSON
  } catch (err) {
    return { ...NEUTRAL, error: err instanceof Error ? err.message : "unknown" }; // R3 fail-open
  }
}
```

`JUDGE_PROMPT` : demande au modèle d'extraire **seulement les claims factuelles** (exclure salutations/CTA génériques — edge 7), et pour chacune `{text, grounded, evidence}` en sortie JSON stricte, avec instruction : *« une claim est grounded UNIQUEMENT si un fait listé la supporte ; une affirmation plausible mais non listée est NON grounded »* (cœur AC1). `formatBriefFacts` sérialise `bestAngle | painPoints | competitorDetected | publicContent[].quote | warmthSignals[].detail` (les seuls champs de `ResearchBriefContext`, `prospect-context.ts:27-33`). `parseJudgeJson` : regex extrait le 1er bloc `{...}`/`[...]`, `JSON.parse`, calcule `groundedScore = grounded / max(1,total)` ; si rien d'extractible ⇒ `NEUTRAL` (R3).

### Fix 2 — `gradeSequenceQuality` : param `opts` + 2e étage (`sequence-quality.ts:68`)

```ts
export interface GradeOpts { semanticJudge?: boolean; }            // R7 rétro-compat

export async function gradeSequenceQuality(
  output: string,
  ctx: ProspectContext,
  methodology: Methodology,
  opts?: GradeOpts,                                                  // NEW, optionnel
): Promise<SequenceQualityResult>                                    // devient async (était sync)
```

> **Note signature** : la fonction passe **sync → async**. Les 2 call-sites (`sequence-generator.ts:104` dans `evaluateFn` déjà `async`, et `:111` `finalEval`) doivent `await`. Le test de régression AC4 verrouille l'équivalence numérique.

Logique ajoutée après `const graded = seq.steps.map(...)` (`:83`) :

```ts
const perStep = await Promise.all(graded.map(async (g, i) => {
  const base = { stepNumber: g.stepNumber, composite: g.score,
                 dimensions: Object.fromEntries(g.dimensions.map(d => [d.name, d.score])) };
  if (!opts?.semanticJudge || g.score === 0) return base;          // R7 / edge 2 (body vide)
  const body = seq.steps[i].body;
  const sem = await judgePersonalization(body, ctx.researchBrief); // R6
  if (sem.skipped) return { ...base, semantic: { groundedScore: sem.groundedScore, skipped: true } }; // R9
  const det = base.dimensions.personalization ?? 0;
  const tightened = Math.min(det, sem.groundedScore);              // R6 : ne peut que resserrer
  const dims = { ...base.dimensions, personalization: tightened };
  const composite = recomputeComposite(dims);                      // re-pondère (poids 0.25 perso)
  return { ...base, composite, dimensions: dims,
           semantic: { groundedScore: sem.groundedScore, skipped: false } };
}));
const composite = perStep.reduce((a, p) => a + p.composite, 0) / perStep.length;
```

`recomputeComposite` réutilise les poids canoniques de `email-quality-grader.ts:73-199` (extrait en constante partagée `DIMENSION_WEIGHTS` pour ne pas les dupliquer — petit refactor read-safe). `SequenceQualityResult.perStep[]` gagne `semantic?: { groundedScore; skipped }` (R8).

### Fix 3 — Migration `outboundEmails.qualityScore` (`db/schema/outbound.ts:286`)

```ts
// dans pgTable("outbound_emails", { ... après replyClassification ... })
qualityScore: jsonb("quality_score"),   // { composite, personalizationDet, personalizationSemantic|null, framework } | null
```

Migration drizzle (SQL idempotent, runner custom `db:migrate:apply` car journal cassé >0012 — cf. MEMORY supabase-dev-db-setup) :

```sql
ALTER TABLE outbound_emails ADD COLUMN IF NOT EXISTS quality_score jsonb;
```

Écriture (R11) : au point où un `GeneratedSequence.steps[i]` devient un `outboundEmails` row, mapper `step.qualityScore` (`sequence-generator.ts:57`) → colonne. Le call-site exact (draft→outbound writer) est identifié en T0 ; si plusieurs writers, un helper `toQualityScoreColumn(step)` centralise (null-safe).

### Fix 4 — `db/schema/*` table `personalizationCalibration` (NEW)

```ts
export const personalizationCalibration = pgTable("personalization_calibration", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").references(() => tenants.id).notNull(),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  runDate: date("run_date").notNull(),               // pour l'idempotence R16 (unique tenant+date)
  windowDays: integer("window_days").notNull().default(90),
  buckets: jsonb("buckets").notNull(),               // [{ tier, n, replied, replyRate }]
  correlation: real("correlation"),                  // null si insufficientData R15
  insufficientData: boolean("insufficient_data").notNull().default(false),
  totalScored: integer("total_scored").notNull(),
}, (t) => [
  uniqueIndex("perso_calib_tenant_date_idx").on(t.tenantId, t.runDate), // R16
  index("perso_calib_tenant_idx").on(t.tenantId),
]);
```

### Fix 5 — `inngest/personalization-backtest.ts` (NEW)

```ts
export const personalizationBacktest = inngest.createFunction(
  { id: "personalization-backtest", name: "Nightly personalization back-test",
    retries: 0,                                       // parité eval-harness-cron.ts:29
    triggers: [{ cron: "TZ=UTC 0 3 * * *" }] },       // 03:00 UTC nocturne
  async ({ step }) => {
    const tenants = await step.run("list-tenants", listTenantsWithScoredEmails);
    for (const tenantId of tenants) {
      await step.run(`backtest-${tenantId}`, () => backtestTenant(tenantId, 90)); // R12
    }
  },
);
```

`backtestTenant(tenantId, windowDays)` (testable hors Inngest, pure-ish sur la DB) :
1. `SELECT qualityScore, repliedAt FROM outbound_emails WHERE tenantId=$ AND sentAt >= now()-90d AND qualityScore IS NOT NULL` (R12, edge 12/14, tenant-scoping edge 15).
2. bucket par `composite` en 4 tiers `<0.5 | [0.5,0.7) | [0.7,0.9) | ≥0.9` (R13, bornes edge 11).
3. `replyRate = replied/n` par tier ; `correlation = spearman(composite, replied?1:0)` (R14).
4. IF `total < 30` ⇒ `insufficientData:true`, `correlation=null` (R15).
5. UPSERT sur `(tenantId, runDate=today)` (R16, idempotence) → table Fix 4.

### Fix 6 — Gold `lib/evals/personalization-golden.ts` + suite (NEW)

```ts
export interface PersonalizationGoldenCase {
  id: string;
  emailBody: string;
  brief: ResearchBriefContext;
  human: { groundedScore: number; verdicts: Array<{ claim: string; grounded: boolean }> };
  tags: string[];   // ["false-positive-substring","verbatim-quote","fr","empty-brief","placeholder",...]
}
export const PERSONALIZATION_GOLDEN: PersonalizationGoldenCase[]; // ≥20 (edges 1,4,6,7,8,9)

export async function runPersonalizationJudgeEval(): Promise<{
  surfaceId: string; casesTotal: number; casesPassed: number; mae: number; skipped: boolean;
}>;  // R17 ; skipped:true sans clé R18 (parité transcript-coaching-grounded.eval.ts:344)
```

Branché optionnellement dans `eval-harness-cron.ts` comme `out8` (un `step.run` de plus, parité `:86`).

## Data model

- **ALTER** `outbound_emails ADD COLUMN quality_score jsonb` (Fix 3).
- **CREATE** `personalization_calibration` (Fix 4) + 2 index dont un unique `(tenant_id, run_date)`.
- Aucun changement sur `contacts/companies/knowledgeEntries` (lecture via `ctx.researchBrief` uniquement, R21).

## Flux (ordre des appels + gates)

**Génération (inchangée par défaut — R20)** :
`generateSequence` → `evaluatorOptimizerLoop(generateFn, gradeSequenceQuality(/* pas d'opts */), 2)` (`sequence-generator.ts:107`) → 1er étage déterministe seul. Aucun coût LLM ajouté.

**Eval/calibration (opt-in)** :
`runPersonalizationJudgeEval` → pour chaque gold : `judgePersonalization(body, brief)` (Fix 1) → MAE vs `human.groundedScore`. OU `gradeSequenceQuality(out, ctx, m, { semanticJudge:true })` → 2e étage : `gradeGeneratedStep` (det) → `judgePersonalization` → `min(det, grounded)` → composite resserré (Fix 2).

**Persistance** : draft/outbound writer → recopie `step.qualityScore` → `outbound_emails.quality_score` (Fix 3, R11).

**Back-test nocturne** : cron 03:00 UTC → `listTenantsWithScoredEmails` → `backtestTenant` par tenant → UPSERT `personalization_calibration` (Fix 5).

## Failure handling / Security

- **Fail-open motivé** : le juge (R2/R3/R4) renvoie `0.5 skipped` plutôt que de bloquer. Justification : le 2e étage est un **resserrement optionnel hors chemin de prod** ; une panne LLM ne doit jamais dégrader le gate déterministe existant (qui, lui, reste fail-closed comme P0-3 : JSON invalide ⇒ `{pass:false}`). Le 1er étage garde sa sémantique.
- **Tenant-scoping** : `backtestTenant` filtre `tenantId` sur toute requête (edge 15, parité `prospect-context.ts:112`). `personalization_calibration` porte `tenantId` + index.
- **Idempotence** : back-test UPSERT `(tenantId, runDate)` (R16) ; cron `retries:0` (pas de double-write, parité `eval-harness-cron.ts:29`).
- **Budget tokens** : Haiku (`getModelForTask("lightweight")`), `maxTokens ≤ 600`, body ≤ 2000 chars (R5) ⇒ < ~$0.01/step ; juge **jamais** dans le hot path bulk (R20). Le back-test ne fait **aucun** appel LLM (pur SQL+stat).
- **No-scrape** : juge lit `ctx.researchBrief` caché uniquement (R21).
- **PII** : la ligne de calibration ne stocke que des agrégats (comptes, taux, corrélation) — aucun body d'email (RGPD-safe).

## Open questions

1. **Spearman vs point-biserial** : `replied` est binaire ⇒ point-biserial est techniquement le bon coef. On implémente point-biserial mais on l'expose sous le nom `correlation` (R14 n'impose pas la famille). À confirmer en review stat.
2. **Quel writer draft→outbound** porte la recopie `qualityScore` (Fix 3) — résolu en T0 (peut être >1 ; helper centralise).
3. **Seuil `insufficientData` = 30** (R15) — heuristique ; à recalibrer une fois des volumes réels observés (non bloquant, constante nommée).
4. **`min(det, grounded)` vs remplacement pur** (R6) — on choisit `min` pour que le 2e étage ne puisse jamais *augmenter* un score (conservateur). Alternative (moyenne pondérée) rejetée : masquerait les faux positifs substring, qui sont précisément la cible (AC1).
