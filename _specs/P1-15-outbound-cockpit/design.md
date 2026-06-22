# Design — P1-15 Outbound Cockpit

## Composants existants (read-only puis fix ciblé)

| Fichier | Rôle | Status | Ancre |
|---|---|---|---|
| `app/apps/web/src/app/(dashboard)/call-mode/page.tsx` | Cockpit 3-col de référence : queue, auto-advance, SSE, PageActions | DONE (à calquer) | `:224-270` ResizeHandle, `:892-897` auto-advance |
| `app/apps/web/src/app/(dashboard)/sequences/review/page.tsx` | File canonique drafts ; network bodies approve/reject/bulk | DONE (à extraire/réutiliser) | `:168-263`, `:315-394` |
| `app/apps/web/src/app/(dashboard)/inbox/page.tsx` | Raccourcis j/k/a/r + cheatsheet | DONE (à modeler) | `:823-878` |
| `app/apps/web/src/app/api/sequences/drafts/route.ts` | Liste drafts (curseur) | DONE → fix R3.4 | `:83-101` |
| `app/apps/web/src/inngest/sequence-draft-router.ts` | Personnalise + insère draft | DONE → fix R3.2/R4.1 | `:207-272`, `:263` |
| `app/apps/web/src/db/schema/outbound.ts` | `sequenceDrafts` + `personalizationSources` | DONE → fix R3.1 (col) | `:128-194`, `:146-152` |
| `app/apps/web/src/lib/evals/sequence-quality.ts` | `gradeSequenceQuality`, `gradeGeneratedStep` | DONE (réutiliser) | `:34,56` |
| `app/apps/web/src/components/ai-ui/index.ts` | `CitedClaim`, `SourceLink` (P1-11) | DONE (réutiliser) | — |
| `app/apps/web/src/lib/hotkey-registry.ts` | `registerShortcut` | DONE (réutiliser) | `:23` |
| `app/apps/web/src/lib/chat/page-actions/registry.ts` | `useRegisterPageActions` | DONE (réutiliser) | `:56` |

## Fixes ciblés

### Fix 1 — Extraire `ResizeHandle` (R1.2)

Déplacer la fonction locale de `call-mode/page.tsx:224-270` vers un composant partagé, importé par les deux cockpits. Signature inchangée :

```ts
// src/components/cockpit/resize-handle.tsx
export function ResizeHandle(props: { onDelta: (dx: number) => void; side: "left" | "right" }): JSX.Element
```

`call-mode/page.tsx` importe désormais ce composant (suppression de la copie locale — refactor pur, commit séparé).

### Fix 2 — Extraire les network bodies de review (R1.3)

Déplacer `approveDraft` / `rejectDraft` / `bulkApproveDrafts` (`review/page.tsx:168-263`) vers un hook partagé, consommé par `review/page.tsx` ET `outbound-mode/page.tsx` :

```ts
// src/lib/sequences/use-draft-actions.ts
export function useDraftActions(opts: {
  onDraftRemoved: (id: string) => void;
}): {
  approveDraft: (draftId: string, version: number) => Promise<{ ok: boolean; error?: string }>;
  rejectDraft: (draftId: string, body: { reason: string; version: number; pauseEnrollment: boolean }) => Promise<{ ok: boolean; error?: string }>;
  bulkApproveDrafts: (ids: string[]) => Promise<{ ok: boolean; approved?: string[]; error?: string }>;
};
```

Les signatures réseau (URLs, body JSON, gestion 409/404) sont copiées telles quelles depuis `review/page.tsx:171-263` — zéro changement de contrat API.

### Fix 3 — Colonne `qualityScore` (R3.1)

```ts
// src/db/schema/outbound.ts — dans sequenceDrafts (après personalizationSources)
qualityScore: real("quality_score"), // nullable — null = non scoré (drafts pré-backfill)
// + index
index("sequence_drafts_quality_idx").on(table.tenantId, table.status, table.qualityScore),
```

### Fix 4 — Scoring + citations à la génération (R3.2, R3.3, R4.1)

Dans `sequence-draft-router.ts`, étendre l'étape `personalise` (`:207-245`) pour retourner aussi citations + score, puis `buildDraftRow` (`:252-264`) les persiste :

```ts
// remplace personalizationSources: [] (router :263)
const sources = ctx.researchBrief?.citations ?? []; // ResearchBriefContext, prospect-context.ts
const graded = await withTimeout(
  () => gradeGeneratedStep(out, ctx, methodology), // sequence-quality.ts:34
  3_000,
).catch(() => null); // R3.3 fail-open
// buildDraftRow({ ..., personalizationSources: sources, qualityScore: graded?.score ?? null })
```

`buildDraftRow` signature étendue (nouveau champ optionnel `qualityScore?: number | null`).

### Fix 5 — Exposer `qualityScore` dans la liste (R3.4)

```ts
// src/app/api/sequences/drafts/route.ts — dans drafts.map (route.ts:83-101), ajouter :
qualityScore: d.qualityScore ?? null,
```

### Fix 6 — Endpoint file unifiée (R2.1-R2.5)

```ts
// src/app/api/outbound/queue/route.ts
export async function GET(req: Request): Promise<Response>
// returns { items: OutboundQueueItem[], nextCursor: string | null }

type OutboundQueueItem =
  | { kind: "draft"; id: string; priority: number; qualityScore: number | null; subject: string; contactId: string; triggerReason: string; version: number }
  | { kind: "reply"; id: string; priority: number; contactId: string | null; subject: string; repliedAt: string; replySnippet: string | null }
  | { kind: "reminder"; id: string; priority: number; title: string; dueDate: string; entityId: string | null };
```

Sources : `sequenceDrafts` (status `pending_approval`, tenant-scopé) ; `outboundEmails` (`repliedAt IS NOT NULL`, statut ∉ bounced/failed — cf. `inbox/route.ts:62-63`) ; `tasks` (`status='pending'`, `dueDate` non-null, ≤ fin de journée). Priorité calculée serveur (R2.2) ; sentinelle `0.5` pour `qualityScore null` (R2.3).

### Fix 7 — Page cockpit (R1.1, R5, R6)

```ts
// src/app/(dashboard)/outbound-mode/page.tsx
export default function OutboundModePage(): JSX.Element
```

Calque `call-mode/page.tsx` : `<ResizeHandle/>` (Fix 1), `useDraftActions` (Fix 2), polling 30 s (R6.1), keydown j/k/a/r (R5.2, guard champ texte), `registerShortcut` groupe "Outbound" (R5.3), auto-advance (R5.1, copie de `:892-897`), PageActions `outbound.cockpitApprove|cockpitReject` réutilisant les bodies.

## Data model (drizzle)

- ALTER `sequence_drafts` : `ADD COLUMN quality_score real` (nullable).
- CREATE INDEX `sequence_drafts_quality_idx` ON `sequence_drafts (tenant_id, status, quality_score)`.
- Aucune nouvelle table (la file est une vue read-only sur 3 tables existantes).

## Flux (ordre des appels + gates)

1. **Génération** (Inngest `sequence-draft-router`) : park enrollment → `buildProspectContext` → `personalizeStepEmail` → `withTimeout(gradeGeneratedStep)` (fail-open) → `buildDraftRow{ personalizationSources, qualityScore }` → insert. Gate : score n'a JAMAIS le droit de bloquer l'insert (R3.3).
2. **Affichage** : `/outbound-mode` → `GET /api/outbound/queue` (tenant gate) → tri priorité serveur → auto-select[0].
3. **Action** : `a`/Approve → `useDraftActions.approveDraft` → `POST /api/sequences/drafts/[id]/approve` (version gate, optimistic-lock) → retire item → advance. `r`/Reject → modal raison → `rejectDraft` → advance.
4. **Refresh** : polling 30 s re-fetch la file.

## Failure handling / Security

- **Scoring fail-open** (R3.3) : un échec/timeout de `gradeGeneratedStep` → `qualityScore=null`, draft quand même créé. Justification : le scoring est cosmétique (tri), jamais bloquant pour l'outbound.
- **Approve/reject fail-closed** : l'optimistic-lock `version` (`outbound.ts:171-175`) rejette les approbations concurrentes (409) — la file retire l'item et toast.
- **Tenant-scoping** : `GET /api/outbound/queue` filtre les 3 sources sur `authCtx.tenantId` ; 401 si pas d'auth (pattern `drafts/route.ts:33-36`).
- **Idempotence** : la génération de draft est déjà idempotente par `(enrollmentId, stepId)` (`sequence-draft-router.ts:155-160`) ; ajouter le score ne change pas cette clé.
- **Budget tokens** : `gradeGeneratedStep` réutilise le grader data-backed déjà appelé dans `sequence-generator.ts` — le scoring au router est UN appel additionnel par draft, borné par `withTimeout` 3 s ; pas de boucle évaluateur ici (pas d'optimisation, juste une note).

## Open questions

1. Pondération exacte priorité cross-kind (qualityScore vs ancienneté reply vs proximité dueDate) — proposer des poids initiaux, calibrer après dogfood. Ne bloque pas le MVP.
2. Backfill historique : recalculer score/citations sur les drafts `pending_approval` existants est-il souhaité, ou on laisse `null` (sentinelle) ? MVP = sentinelle ; backfill = tâche séparée flaggée.
3. L'item `reply` doit-il deep-linker vers `/inbox?thread=...` ou rendre le thread inline dans le cockpit ? MVP = deep-link (réutilise l'inbox), inline = extension.
