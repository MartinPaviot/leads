# Tasks — P1-15 Outbound Cockpit

Estimation totale : **~6 jours-dev** (MVP boilable). Backfill historique + reply-inline flaggés hors MVP.

## T0 — Audit lecture (read-only)

- **Action** : Confirmer les ancres live : `call-mode/page.tsx:224-270,892-897` ; `review/page.tsx:168-263,315-394` ; `inbox/page.tsx:823-878` ; `outbound.ts:128-194` (absence `qualityScore`) ; `sequence-draft-router.ts:207-272` (`personalizationSources:[]` :263) ; `sequence-quality.ts:34,56`.
- **Verify** : `rg "qualityScore" src/db/schema/outbound.ts` → 0 résultat (confirme le gap).
- **Test** : N/A.

## T1 — [NEW] Colonne `qualityScore` sur `sequenceDrafts`

- **Action** : `src/db/schema/outbound.ts` — ajouter `qualityScore: real("quality_score")` (nullable) + `index("sequence_drafts_quality_idx").on(tenantId, status, qualityScore)`. Générer migration drizzle.
- **Verify** : `pnpm db:push` (dev `leadsens-localdev`) puis `\d sequence_drafts` montre `quality_score`.
- **Test** : `src/db/__tests__/outbound-schema.test.ts` — assert la colonne existe dans l'objet table drizzle.

## T2 — [NEW] Persister score + citations à la génération

- **Action** : `src/inngest/sequence-draft-router.ts` — étape `personalise` (:207) retourne `{ sources, score }` ; `withTimeout(gradeGeneratedStep, 3000)` fail-open (R3.3) ; `buildDraftRow` (:252) reçoit `personalizationSources` (vraies citations depuis `ctx.researchBrief`) + `qualityScore`, remplaçant `personalizationSources: []` (:263).
- **Verify** : déclencher le router en dev, inspecter la ligne : `quality_score` non-null, `personalization_sources` non-vide.
- **Test** : `src/inngest/__tests__/sequence-draft-router-quality.test.ts` — mock `gradeGeneratedStep` → score persisté ; mock qui throw → `qualityScore=null`, draft inséré quand même.

## T3 — [NEW] Exposer `qualityScore` dans la liste drafts

- **Action** : `src/app/api/sequences/drafts/route.ts` — ajouter `qualityScore: d.qualityScore ?? null` dans le `.map` (:83-101).
- **Verify** : `GET /api/sequences/drafts` renvoie le champ.
- **Test** : `src/app/api/sequences/drafts/__tests__/route.test.ts` — réponse inclut `qualityScore`.

## T4 — [NEW] Endpoint file unifiée

- **Action** : créer `src/app/api/outbound/queue/route.ts` (`GET`) agrégeant drafts (`pending_approval`) + replies (`outboundEmails.repliedAt`) + reminders (`tasks` dues), tenant-scopé, tri priorité serveur (R2.2), sentinelle `0.5` (R2.3), curseur (R2.4), 401 si pas d'auth.
- **Verify** : seed 4 items hétérogènes → réponse triée, tenant B ne voit rien.
- **Test** : `src/app/api/outbound/queue/__tests__/route.test.ts` — tri par priorité (AC2), tenant-scoping (AC8), null→sentinelle (AC6), curseur invalide→400, file vide→`items:[]`.

## T5 — [NEW] Extraire `ResizeHandle` (refactor pur)

- **Action** : créer `src/components/cockpit/resize-handle.tsx` (copie de `call-mode/page.tsx:224-270`, signature inchangée) ; remplacer la fonction locale dans `call-mode/page.tsx` par l'import.
- **Verify** : `pnpm tsc` vert ; call-mode redimensionne toujours.
- **Test** : `src/components/cockpit/__tests__/resize-handle.test.tsx` — pointerdown→pointermove appelle `onDelta(dx)`.

## T6 — [NEW] Extraire les network bodies de review (`useDraftActions`)

- **Action** : créer `src/lib/sequences/use-draft-actions.ts` (approve/reject/bulk, copie de `review/page.tsx:168-263`) ; refactorer `review/page.tsx` pour le consommer (comportement identique, 409/404 préservés).
- **Verify** : `/sequences/review` approve/reject/bulk fonctionne comme avant ; `pnpm tsc` vert.
- **Test** : `src/lib/sequences/__tests__/use-draft-actions.test.ts` — approve OK retire l'id ; 409 → `{ ok:false }` + pas de retrait ; bulk rollback géré.

## T7 — [NEW] Page cockpit `/outbound-mode`

- **Action** : créer `src/app/(dashboard)/outbound-mode/page.tsx` (3-col, `<ResizeHandle/>` T5, `useDraftActions` T6, fetch `GET /api/outbound/queue`, auto-select[0], polling 30 s, EmptyState, largeurs localStorage `elevay.outboundmode.colWidths`). Default export uniquement (cf. mémoire `nextjs-page-export-build-gap`).
- **Verify** : `pnpm dev`, ouvrir `/outbound-mode`, file rendue + colonnes redimensionnables persistées.
- **Test** : `src/app/(dashboard)/outbound-mode/__tests__/page.test.tsx` — rend la file, auto-select[0], EmptyState si vide.

## T8 — [NEW] Pane "Why this draft" avec citations P1-11

- **Action** : composant central rendant `triggerReason` + `personalizationSources` via `CitedClaim`/`SourceLink` (`ai-ui/index.ts`) ; fallback `triggerReason` seul si `[]` (R4.3).
- **Verify** : draft cité → sources cliquables ; draft sans citation → en-tête seul, pas de bloc vide.
- **Test** : `src/app/(dashboard)/outbound-mode/__tests__/why-panel.test.tsx` — N citations → N `SourceLink` ; `[]` → 0.

## T9 — [NEW] Auto-advance + raccourcis j/k/a/r

- **Action** : dans `outbound-mode/page.tsx`, keydown j/k/a/r (modèle `inbox/page.tsx:823-878`, guard champ texte), mapping a/r selon `kind` (R5.4), auto-advance après action (copie `call-mode:892-897`), `registerShortcut` groupe "Outbound" (R5.3).
- **Verify** : presser `a` sur un draft → approuvé + advance ; `r` → modal raison ; `j`/`k` navigue ; focus textarea → no-op.
- **Test** : `src/app/(dashboard)/outbound-mode/__tests__/shortcuts.test.tsx` — j/k déplacent la sélection ; a appelle approve ; r ouvre le modal ; raccourcis enregistrés dans la cheatsheet.

## T10 — [NEW] PageActions du cockpit + nav

- **Action** : enregistrer `outbound.cockpitApprove|cockpitReject` via `useRegisterPageActions` (réutilise `useDraftActions`) ; ajouter l'entrée nav vers `/outbound-mode` dans `src/components/sidebar.tsx`.
- **Verify** : la palette chat liste les actions ; le lien sidebar route vers le cockpit.
- **Test** : `src/app/(dashboard)/outbound-mode/__tests__/page-actions.test.tsx` — `cockpitApprove.run({draftId,version})` appelle le body partagé.

## T11 — E2E + edge cases

- **Action** : Playwright sur la live app : file unifiée, approve via `a` + advance, reject via `r`, EmptyState, persistance largeurs, tenant-scoping.
- **Verify** : screenshots `001-queue.png` … `00N-empty.png`.
- **Test** : `e2e/outbound-cockpit.spec.ts` — AC1, AC3, AC4, AC9, AC10 + edge concurrent-approve (409).

## Ordre d'exécution

T0 → **T1 → T2 → T3** (data + génération, indépendants du front) → **T4** (endpoint) → **T5, T6** (extractions partagées, parallélisables) → **T7 → T8 → T9 → T10** (front, séquentiel) → **T11** (E2E gate).

## Estimation effort (jours)

| Task | Jours |
|---|---|
| T1 schema + migration | 0.25 |
| T2 score+citations génération | 1.0 |
| T3 expose | 0.25 |
| T4 endpoint queue | 1.0 |
| T5 extract ResizeHandle | 0.25 |
| T6 extract useDraftActions | 0.5 |
| T7 page cockpit | 1.0 |
| T8 why-panel citations | 0.5 |
| T9 auto-advance + shortcuts | 0.5 |
| T10 PageActions + nav | 0.25 |
| T11 E2E | 0.5 |
| **Total MVP** | **~6.0 j** |

**Flaggé hors MVP (OCEAN)** : backfill score/citations sur drafts historiques ; reply rendu inline (vs deep-link inbox) ; SSE live dédié à la file.
