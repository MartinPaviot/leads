# T1-F8 — Optimistic mutation hook — Requirements

## User story

Comme dev front-end travaillant sur toute UI avec edits in-line (drag-reorder
stages, toggle favoris, rename row, archive, …), je veux un hook qui applique
un changement visible immédiatement puis le confirme contre le serveur, avec
rollback automatique en cas d'échec — sans redéfinir ce pattern à chaque
site d'appel.

## Acceptance criteria (GIVEN/WHEN/THEN)

- GIVEN `trigger(input, { optimisticUpdate, rollback })` appelé, WHEN le
  mutate résout OK, THEN `optimisticUpdate` a été appelé AVANT l'await,
  `onSuccess(result, input)` est invoqué une fois, rollback jamais.
- GIVEN `trigger` appelé, WHEN `mutate` rejette, THEN `rollback` est invoqué
  synchroniquement après, `onError(err, input)` reçoit l'erreur, puis
  la promesse rejette (le runner pur rethrow ; le hook hide la rejection
  en remplissant `error` et en retournant `undefined`).
- GIVEN 3 triggers concurrents, WHEN le 1er résout, THEN `pending=true`
  reste jusqu'à ce que TOUS résolvent (inFlight counter > 0).
- GIVEN mutate rejette, WHEN un 2e trigger résout après, THEN `error`
  est remis à null (les erreurs sont par-trigger, pas sticky).

## Edge cases

- `optimisticUpdate` omis : skip silencieux.
- `rollback` omis : safe no-op (erreur toujours rethrow).
- Composant démonté pendant l'await : le hook ref/state
  ignore les setState post-unmount (standard React warning guard).
- Concurrency : inFlight counter par déclenchement (pas juste boolean).

## Evaluation (how to test manually)

Une fois consommé par une UI (stages drag-drop par exemple) :

1. Renommer une stage localement → l'input reflète instantanément le
   nouveau nom.
2. Couper le réseau ; déclencher un rename → toast "failed" + le nom
   revient au précédent automatiquement.
3. 3 renames back-to-back → spinner/lock "saving 3 changes" pendant
   que tous complètent.
