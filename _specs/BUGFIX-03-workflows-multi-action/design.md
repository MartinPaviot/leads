# Design — BUGFIX-03

## Fit dans le système
Tout est UI. Backend (`workflow-engine.ts`, `api/settings/workflows/route.ts`) déjà multi-action. On refactor :
- `WorkflowsPage` : passer du flat state monolithique à un state structuré `actions: ActionDraft[]`
- Composant `<ActionEditor action={} onChange={} onRemove={} />` extrait pour réutilisation
- Bouton Edit nouveau (en plus de toggle/delete)

## Data model
**Pas de changement DB.** Le schéma `workflow.actions` est déjà `Array<{type, params}>`. La validation côté API peut être renforcée :
```ts
// apps/web/src/app/api/settings/workflows/route.ts (PUT)
if (!Array.isArray(workflow.actions) || workflow.actions.length === 0) return 400;
if (workflow.actions.length > 20) return 400;
```

## Composant `<ActionEditor>`
```tsx
// apps/web/src/components/workflow-action-editor.tsx
type ActionDraft = { id: string; type: string; params: Record<string, string> };

export function ActionEditor({
  action,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  action: ActionDraft;
  onChange: (next: ActionDraft) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  // Type select + params inputs dynamiques selon action.type
  // Boutons : ↑ ↓ ✕
}
```

Les params dynamiques (équivalents des `actionTitle`, `actionBody`, `actionUrl`, etc. actuellement en flat state) sont gérés en interne par `ActionEditor` (switch sur `action.type`).

## State refactor de `WorkflowsPage`

Avant (flat) :
```ts
const [newWorkflow, setNewWorkflow] = useState({
  name: "", triggerType: "...", actionType: "...",
  actionTitle: "", actionBody: "", actionUrl: "", ...
});
```

Après (structuré) :
```ts
const [draft, setDraft] = useState<{
  id?: string;            // si édition d'un workflow existant
  name: string;
  trigger: { type: string; conditions: Record<string, string> };
  actions: ActionDraft[];
}>({
  name: "",
  trigger: { type: "deal_stage_changed", conditions: {} },
  actions: [{ id: crypto.randomUUID(), type: "send_notification", params: {} }],
});
```

Helpers :
- `addAction()` : append ActionDraft vide avec `type: "send_notification"`
- `removeAction(id)` : filter
- `moveAction(id, direction)` : swap dans l'array
- `updateAction(id, next)` : map

## Edit flow
- Bouton "Edit" sur card workflow → `setDraft(workflowToDraft(wf))` + `setShowCreate(true)`
- À la sauvegarde : si `draft.id` existe → update in place (`workflows.map`), sinon push.

## API contract
Pas de changement de signature. Le PUT existant accepte déjà `{ workflows: WorkflowDef[] }`. On renforce validation backend :
- `actions.length >= 1 && <= 20`
- Chaque action a un `type` ∈ liste `ACTION_TYPES`
- `id` workflow est UUID

## Failure handling
- Save fail : toast erreur, draft conservé
- Action vide (params manquants pour le type) : warning visuel, save autorisé (pas bloquant — l'engine handle gracefully)

## Tests
- Vitest unit pour `ActionEditor` : render selon type, onChange, params reset au type change
- E2E Playwright : créer workflow 3 actions, vérifier exécution via Inngest dev server
- Régression : workflow existant 1-action s'édite et se sauve sans corruption

## Observabilité
- PostHog event `workflow_created` avec `actionCount`, `triggerType`
- Surveillance backend : si une action lève, log + skip (déjà en place via try/catch implicite Inngest)
