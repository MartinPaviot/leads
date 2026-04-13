# T1-F8 — Optimistic mutation hook — Design

## System fit

Nouveau : `app/apps/web/src/hooks/use-optimistic-mutation.ts`.
Suit la convention existante (`src/hooks/`), pas `src/lib/hooks/` comme
suggéré dans le plan — cohérent avec `use-custom-fields.ts` + `use-keyboard-shortcuts.ts`.

Aucune dép externe. Pure `useState` + `useRef` + `useCallback`.

## Data model

N/A.

## API

```ts
interface OptimisticMutationConfig<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult>;
  onSuccess?: (result: TResult, input: TInput) => void;
  onError?: (err: unknown, input: TInput) => void;
}

interface TriggerOptions {
  optimisticUpdate?: () => void;
  rollback?: () => void;
}

function useOptimisticMutation<TInput, TResult>(
  config: OptimisticMutationConfig<TInput, TResult>
): {
  trigger: (input: TInput, opts?: TriggerOptions) => Promise<TResult | undefined>;
  pending: boolean;   // inFlight > 0
  inFlight: number;   // count of concurrent triggers
  error: unknown | null;
};

// Pure runner (exported for tests + non-React usage):
async function runOptimisticMutation<TInput, TResult>(
  input: TInput,
  config: OptimisticMutationConfig<TInput, TResult>,
  opts?: TriggerOptions
): Promise<TResult>;
```

## Data flow

```
trigger(input, opts)
  → setInFlight(++)
  → runOptimisticMutation(input, cfg, opts):
       opts.optimisticUpdate?.()
       try   → result = await cfg.mutate(input); cfg.onSuccess?.(result,input); return result
       catch → opts.rollback?.(); cfg.onError?.(err,input); throw err
  → hook catches the rethrow → setError(err); return undefined
  → finally: setInFlight(--)
```

## Failure handling

Voir Data flow. Pas de retry automatique — intentionnel. Retry est
l'affaire du caller (il peut re-trigger si besoin).

## Security

N/A (pure client-side state).

## Reversibility

Pure addition. Callers migrateront vers ce hook progressivement ; rien
de forcé.
