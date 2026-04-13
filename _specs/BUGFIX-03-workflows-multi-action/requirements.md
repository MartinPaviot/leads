# BUGFIX-03 — Workflows : single action hardcodée côté UI

## User story
**As** un admin construisant des automations
**Je veux** chaîner plusieurs actions dans un seul workflow (ex : "Deal won → send_notification + create_task + add_tag")
**Pour** modéliser des reactions complètes à un événement sans dupliquer les workflows.

## Bug actuel
- **Backend OK** : `apps/web/src/inngest/workflow-engine.ts:61` itère `for (const action of workflow.actions)` — multi-action supporté natif.
- **Type OK** : `WorkflowDef.actions: Array<{type, params}>` (workflows/page.tsx:18-21).
- **UI cassée** : `workflows/page.tsx:112-126` — `createWorkflow()` produit toujours `actions: [{type: newWorkflow.actionType, params: {...}}]` (1 action max).
- **Affichage limité** : ligne 345 affiche `wf.actions.map(...).join(", ")` mais sans ordre/edit.

## Critères d'acceptation

### AC1 — Créer workflow avec 2+ actions
- **GIVEN** je crée un workflow "When deal_won → send_notification AND create_task AND add_tag"
- **WHEN** je remplis le form, ajoute 3 actions, clique "Create"
- **THEN** le workflow est sauvegardé avec `actions.length === 3`, dans l'ordre saisi
- **AND** le moteur Inngest exécute les 3 actions séquentiellement

### AC2 — UI form supporte add/remove
- **GIVEN** je suis dans le form "Create workflow"
- **WHEN** j'ai sélectionné un trigger
- **THEN** je vois une section "Actions" avec un bouton "+ Add action"
- **AND** chaque action ajoutée affiche : type select + params dynamiques + bouton remove

### AC3 — Reorder actions (drag/up-down)
- **GIVEN** un workflow draft avec 3 actions
- **WHEN** je drag la 3e action en position 1 (ou utilise boutons ↑/↓)
- **THEN** l'ordre est mis à jour, persisté

### AC4 — Édition d'un workflow existant
- **GIVEN** un workflow déjà sauvegardé avec 2 actions
- **WHEN** je clique "Edit" sur ce workflow (nouveau bouton)
- **THEN** le form se ré-ouvre pré-rempli avec les actions existantes
- **AND** je peux ajouter, supprimer, modifier, réordonner
- **AND** "Save" met à jour le workflow

### AC5 — Affichage liste — afficher chaîne d'actions
- **GIVEN** un workflow avec 3 actions
- **WHEN** je vois la card dans la liste
- **THEN** je lis "When <trigger> → <action1> → <action2> → <action3>"
- **AND** un bouton "Edit" est visible (en plus des Play/Pause/Delete actuels)

### AC6 — Backward compat
- **GIVEN** des workflows existants avec une seule action
- **WHEN** je charge la page après déploiement
- **THEN** ils s'affichent et s'éditent normalement (la migration est purement UI, pas de schema)

## Edge cases
- 0 action : bouton "Create" disabled
- > 10 actions : warning + soft cap (refus côté API au-delà de 20)
- Type d'action invalide en cours d'édition : champ rouge + Save disabled
- 2 actions identiques (ex: 2× `add_tag` avec mêmes params) : autorisé

## Steps d'évaluation
1. Créer workflow avec 3 actions différentes → vérifier en DB que `actions.length === 3`
2. Trigger event manuel → 3 actions exécutées dans l'ordre (logs Inngest)
3. Éditer le workflow, supprimer la 2e action → re-trigger → 2 actions exécutées
4. Réordonner → re-trigger → ordre respecté
5. Workflow legacy (1 action) : éditer + sauver sans toucher → toujours 1 action
