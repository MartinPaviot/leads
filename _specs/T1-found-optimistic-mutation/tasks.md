# T1-F8 — Optimistic mutation hook — Tasks

- [x] Create `src/hooks/use-optimistic-mutation.ts` with `runOptimisticMutation` pure runner + `useOptimisticMutation` React wrapper.
- [x] Vitest coverage (7 cases) on the pure runner: ordering guarantee, onSuccess path, rejection+rollback, safe no-op rollback, onSuccess not called on reject, onError not called on success, verbatim result propagation.
- [x] Typecheck green.
- [x] Kiro spec in `_specs/T1-found-optimistic-mutation/`.
- [x] Commit on feat/T1-found-optimistic-mutation.
- [ ] Merge to main.

## Post-tasks
- [x] Typecheck ok
- [x] Vitest ok (all tests pass)
- [ ] No caller migrated yet — hook is available for future inline-edit and drag-reorder UIs.
