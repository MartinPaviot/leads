# Design — P0-6 Rejection Feedback Loop

## Composants existants (read-only puis fix ciblé)

| Fichier | Rôle | Status |
|---|---|---|
| `app/apps/web/src/lib/sequence-drafts/rejection-classifier.ts` | `classifyRejection`, `aggregateRejections`, `dominantInsight` (:187-202), type `RejectionCategory` (:20-26) | ✅ correct — **read-only**, on importe le type uniquement |
| `app/apps/web/src/inngest/sequence-draft-rejection-learner.ts` | Écrit `campaignConfig.rejectionInsights` sur `draft.rejected` (:121-150) | ✅ correct — **aucun changement** |
| `app/apps/web/src/db/schema/outbound.ts:47` | `campaignConfig: jsonb("campaign_config")` | ✅ correct — **aucune migration** |
| `app/apps/web/src/lib/agents/sequence-generator.ts` | `generateSequence` (:58), `buildGenerationPrompt` (:212-297) | **à modifier** — nouveau param + injection prompt |
| `app/apps/web/src/app/api/campaigns/generate/route.ts` | `POST` — construit ctx, appelle `generateSequence` (:89/:136) | **à modifier** — ajouter le load `campaignConfig` |

## Fixes ciblés

### Fix 1 — Nouveau module pur : mapper insight → contre-instruction

Nouveau fichier `app/apps/web/src/lib/sequence-drafts/rejection-counter-prompt.ts`. Source de vérité unique du mapping, importable par la route (validation/garde) et le générateur (rendu). Réutilise le type existant.

```ts
import type { RejectionCategory } from "./rejection-classifier";

export interface DominantInsight {
  category: RejectionCategory;
  count: number;
}

/** Floor partagé — identique au défaut de dominantInsight (rejection-classifier.ts:189). */
export const REJECTION_INSIGHT_FLOOR = 3;

/**
 * Lit un blob campaignConfig.rejectionInsights non typé (jsonb) et
 * en extrait un DominantInsight valide, ou null. Robuste aux blobs
 * forgés / versions antérieures (count non numérique, catégorie inconnue).
 */
export function extractDominantInsight(
  campaignConfig: unknown,
): DominantInsight | null {
  const ri = (campaignConfig as { rejectionInsights?: unknown } | null)
    ?.rejectionInsights as { dominantInsight?: unknown } | undefined;
  const di = ri?.dominantInsight as
    | { category?: unknown; count?: unknown }
    | null
    | undefined;
  if (!di || typeof di.count !== "number") return null;
  if (di.count < REJECTION_INSIGHT_FLOOR) return null;          // R4
  if (typeof di.category !== "string") return null;
  if (!(di.category in COUNTER_INSTRUCTIONS)) return null;       // exclut "other" + inconnues → R11
  return { category: di.category as RejectionCategory, count: di.count };
}

/**
 * 5 catégories mappées (rejection-classifier RULES :46-111).
 * "other" volontairement absent → null → pas de contre-instruction (R11).
 */
const COUNTER_INSTRUCTIONS: Partial<Record<RejectionCategory, string>> = {
  tone: "le ton — adoucir, être moins direct/agressif, registre plus mesuré",
  timing: "le moment — reformuler ou retirer la justification temporelle, ne pas présumer l'urgence du déclencheur",
  personalization: "une personnalisation trop générique — ancrer chaque email sur un fait concret et vérifiable du dossier, jamais de placeholder",
  trigger: "un mauvais signal déclencheur — ne pas s'appuyer dessus, choisir un autre angle ou n'utiliser qu'un signal frais et vérifié",
  content: "le contenu (exactitude / professionnalisme) — vérifier chaque fait, pas de lien cassé, registre professionnel",
};

/** Bloc texte à préfixer au prompt. Retourne "" si pas d'insight exploitable. */
export function buildRejectionCounterPrompt(
  insight: DominantInsight | null,
): string {
  if (!insight) return "";
  const reason = COUNTER_INSTRUCTIONS[insight.category];
  if (!reason) return "";
  return `FEEDBACK FONDATEUR — PRIORITÉ ABSOLUE : les drafts précédents de cette séquence ont été rejetés ${insight.count} fois pour ${reason}. Corrige ce point dans CHAQUE email avant toute autre considération.`;
}
```

### Fix 2 — `generateSequence` accepte et transmet l'insight

`sequence-generator.ts`. Ajout au type `options` (:60) et passage à `buildGenerationPrompt` (:70).

```ts
// :58-61 — signature options enrichie
options?: {
  stepCount?: number; meetingSlots?: string; tenantId?: string;
  evaluate?: boolean; knowledgeContext?: string;
  rejectionInsight?: import("@/lib/sequence-drafts/rejection-counter-prompt").DominantInsight | null; // NEW
}

// :70 — passer l'insight
const basePrompt = buildGenerationPrompt(
  ctx, methodology, signalAngle, strategies,
  options?.meetingSlots, options?.knowledgeContext,
  options?.rejectionInsight ?? null,                 // NEW
);
```

### Fix 3 — `buildGenerationPrompt` préfixe la contre-instruction

`sequence-generator.ts:212-297`. Nouveau paramètre + préfixe au return.

```ts
function buildGenerationPrompt(
  ctx, methodology, signalAngle, strategies,
  meetingSlots?, knowledgeContext?,
  rejectionInsight?: DominantInsight | null,         // NEW
): string {
  // ... blocs existants inchangés ...
  const counterBlock = buildRejectionCounterPrompt(rejectionInsight ?? null); // NEW

  // return :266 — préfixer counterBlock EN TÊTE (avant le rôle SDR), sans
  // toucher aux CRITICAL RULES (:283-296)
  return `${counterBlock ? counterBlock + "\n\n" : ""}You are a world-class SDR at ${ctx.companyName || "our company"}. ...`;
}
```

### Fix 4 — La route charge `campaignConfig` et garde le floor

`route.ts`. Avant l'appel `generateSequence` (:86-89). Fail-open (R15).

```ts
import { extractDominantInsight } from "@/lib/sequence-drafts/rejection-counter-prompt";

// après résolution de targetSequenceId / avant generateSequence (:86)
let rejectionInsight = null;
if (sequenceId) {
  try {
    const [seq] = await db
      .select({ campaignConfig: sequences.campaignConfig })
      .from(sequences)
      .where(and(eq(sequences.id, sequenceId), eq(sequences.tenantId, authCtx.tenantId)))
      .limit(1);
    rejectionInsight = extractDominantInsight(seq?.campaignConfig); // null-safe + floor
  } catch (err) {
    console.warn("rejectionInsight load failed (fail-open):", err); // R15
  }
}

// :89 et :136 — passer l'insight
generated = await generateSequence(ctx, { stepCount: stepCount || 5, rejectionInsight });
```

## Data model

Aucun changement de schéma. `sequences.campaignConfig` est déjà `jsonb` (`outbound.ts:47`) et `rejectionInsights` y est déjà écrit par le learner. Pas de migration, pas de backfill.

## Flux

```
draft.rejected (existant)
  └─ learner → écrit campaignConfig.rejectionInsights.dominantInsight  [DÉJÀ FAIT, :121-150]

POST /api/campaigns/generate (sequenceId présent)            [NEW load]
  1. auth + résolution contact (existant :17-87)
  2. SELECT campaignConfig WHERE id=sequenceId AND tenantId   ← Fix 4 (tenant-scoped)
  3. extractDominantInsight(config)                           ← Fix 1 (garde floor≥3, exclut other)
  4. generateSequence(ctx, { stepCount, rejectionInsight })   ← Fix 2
       └─ buildGenerationPrompt(..., rejectionInsight)        ← Fix 3
            └─ buildRejectionCounterPrompt → préfixe le prompt ← Fix 1
  5. tracedGenerateObject(prompt) → steps (existant :74-85)

POST sans sequenceId / action.ts:1015 / handler.ts:21
  → rejectionInsight = null → prompt inchangé                 [no-op, R3/R13]
```

Gate clé : le floor ≥3 et l'exclusion de `other` sont appliqués **deux fois** — par le learner à l'écriture (`dominantInsight` :189/:194) et par `extractDominantInsight` à la lecture (défense en profondeur, robuste aux blobs forgés).

## Failure handling / Security

- **Fail-open** sur le load (R15) : un `SELECT` qui échoue ou un blob corrompu → `rejectionInsight = null` → génération normale. Un insight manquant ne doit JAMAIS bloquer une génération (la génération est le hot path produit ; l'insight est une amélioration best-effort).
- **Tenant-scoping** : le `SELECT` filtre `eq(sequences.tenantId, authCtx.tenantId)` (Fix 4) — identique au pattern de mise à jour existant ailleurs dans la route (`:147`). Pas de fuite cross-tenant (AC5).
- **Pas de fail-closed** : injecter une mauvaise contre-instruction est au pire un prompt sous-optimal, jamais une fuite de données ni un blocage. Le risque justifie le fail-open.
- **Idempotence** : pur et déterministe ; aucune écriture côté génération.
- **Pas de surface LLM nouvelle** : `tracedGenerateObject` reste l'unique appel modèle (R14).

## Open questions

- Confirmer au moment du build que le return de `buildGenerationPrompt` est toujours la chaîne unique à `sequence-generator.ts:266` (le fichier peut avoir bougé) — vérifier que le préfixe ne casse pas le bloc `${contextBlock}` qui suit immédiatement.
- Confirmer que `route.ts:136` (chemin template company-only) reçoit bien `rejectionInsight` aussi : un `sequenceId` peut être fourni même sans contact résolu → oui, il faut passer l'insight aux deux appels.
- Vérifier qu'aucun consommateur tiers de `campaignConfig` ne stocke `rejectionInsights.dominantInsight` sous une forme différente (le learner est le seul writer connu, `:133`).
