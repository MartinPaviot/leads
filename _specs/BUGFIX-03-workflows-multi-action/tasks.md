# Tasks — BUGFIX-03

## T1. Extraire `<ActionEditor>` composant
- **Action :** Créer `apps/web/src/components/workflow-action-editor.tsx` :
  - Props : `action, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast`
  - Type select (9 options ACTION_TYPES)
  - Params dynamiques (switch sur action.type) — copier la logique des input conditionnels actuels
  - Boutons ↑ ↓ ✕
- **Verify :** Storybook ou test unitaire isolé.
- **Test :** Vitest `ActionEditor.test.tsx` — render chaque type, onChange déclenché.

## T2. Refactor state `WorkflowsPage` (draft structuré)
- **Action :** Modifier `apps/web/src/app/(dashboard)/settings/workflows/page.tsx` :
  - Remplacer `newWorkflow` flat par `draft` structuré (cf design.md)
  - Helpers `addAction`, `removeAction`, `moveAction`, `updateAction`
  - Render : list `<ActionEditor>` + bouton "+ Add action"
- **Verify :** Manuel : créer workflow avec 3 actions → vérifier dans DB `workflow.actions.length === 3`.
- **Test :** Vitest sur les helpers pure (state transitions).

## T3. Ajouter mode "Edit"
- **Action :**
  - Bouton "Edit" sur chaque card workflow (lignes 332+)
  - Helper `workflowToDraft(wf)` qui convertit `WorkflowDef` → format `draft`
  - Au save : si `draft.id` existe, update in place ; sinon append
- **Verify :** Edit workflow existant → form pré-rempli → modif → save → nouvelle valeur en DB.
- **Test :** E2E Playwright.

## T4. Validation backend renforcée
- **Action :** `apps/web/src/app/api/settings/workflows/route.ts` (PUT) :
  - Valider `Array.isArray(workflow.actions)`
  - `1 <= length <= 20`
  - Chaque action.type ∈ liste autorisée
  - 400 sinon
- **Verify :** `curl PUT` avec actions=[] → 400 ; actions=21× → 400.
- **Test :** Vitest sur la route.

## T5. Améliorer affichage liste workflows
- **Action :** `workflows/page.tsx` lignes 332-365 :
  - Joindre actions par ` → ` au lieu de `, `
  - Couleur badge par action type (visual)
  - Bouton Edit visible
- **Verify :** Liste affiche `When deal_won → send_notification → create_task → add_tag`.

## T6. Test E2E full
- **Action :** `apps/web/tests/e2e/workflows-multi-action.spec.ts` :
  - Login admin, créer workflow 3 actions
  - Trigger event via API helper
  - Attendre exécution Inngest (poll status)
  - Vérifier les 3 actions appliquées (notification + task + tag)
  - Edit workflow, supprimer 1 action, re-trigger, vérifier 2 actions
- **Verify :** `pnpm playwright test workflows-multi-action` passe.

## T7. Migration UI legacy workflows
- **Action :** Vérifier qu'un workflow legacy (sauvé avec ancien UI) se charge et s'édite sans crash. Pas de migration DB nécessaire (format identique).
- **Verify :** Charger un workflow existant en prod → ouvrir Edit → save sans modif → diff DB = 0.

## T8. Doc
- **Action :** Mettre à jour `_reports/audit-deep/05-settings-all.md` : cocher Workflows multi-action résolu.

## Ordre d'exécution
T1 → T2 → T3 → T4 (parallélisable T2-T3) → T5 → T6 → T7 → T8

## Estimation effort
~3-4h focused.
