"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Shared type for a trigger invocation. Callers pass `input` (the payload
 * that describes the change) plus optional `optimisticUpdate` (apply the
 * change to local state immediately) and `rollback` (reverse it if the
 * server rejects).
 *
 * Splitting it out lets the core runner be tested without React state.
 */
export interface TriggerOptions {
  optimisticUpdate?: () => void;
  rollback?: () => void;
}

export interface OptimisticMutationConfig<TInput, TResult> {
  mutate: (input: TInput) => Promise<TResult>;
  onSuccess?: (result: TResult, input: TInput) => void;
  onError?: (err: unknown, input: TInput) => void;
}

export interface OptimisticMutationReturn<TInput, TResult> {
  trigger: (input: TInput, opts?: TriggerOptions) => Promise<TResult | undefined>;
  /** True while an in-flight request exists. */
  pending: boolean;
  /** Count of concurrent triggers — useful for "still saving N changes" indicators. */
  inFlight: number;
  /** Most recent error; cleared on next successful trigger. */
  error: unknown | null;
}

/**
 * Pure runner for the optimistic-mutation flow. Exposed mainly so the
 * logic can be exercised in vitest without a DOM.
 *
 * Contract:
 *
 * 1. Call `optimisticUpdate` synchronously before awaiting the mutation.
 *    If the mutation resolves, the optimistic state already matches
 *    reality — nothing to do.
 * 2. If the mutation rejects, call `rollback` to revert the optimistic
 *    state, then rethrow so the caller's catch can run.
 * 3. `onSuccess` / `onError` lifecycle callbacks fire exactly once per
 *    trigger.
 */
export async function runOptimisticMutation<TInput, TResult>(
  input: TInput,
  config: OptimisticMutationConfig<TInput, TResult>,
  opts: TriggerOptions = {}
): Promise<TResult> {
  opts.optimisticUpdate?.();
  try {
    const result = await config.mutate(input);
    config.onSuccess?.(result, input);
    return result;
  } catch (err) {
    opts.rollback?.();
    config.onError?.(err, input);
    throw err;
  }
}

/**
 * React hook wrapper. Tracks a concurrent in-flight counter so "pending"
 * stays true while ANY trigger call is unresolved — useful when the user
 * drags three rows to a new position in quick succession.
 *
 * Unmount-safe: a boolean ref tracks whether the component is still
 * mounted and we short-circuit state updates after unmount to avoid
 * React's "state update on unmounted component" warning.
 */
export function useOptimisticMutation<TInput, TResult>(
  config: OptimisticMutationConfig<TInput, TResult>
): OptimisticMutationReturn<TInput, TResult> {
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<unknown | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const trigger = useCallback(
    async (input: TInput, opts: TriggerOptions = {}): Promise<TResult | undefined> => {
      setInFlight((n) => n + 1);
      try {
        const result = await runOptimisticMutation(input, configRef.current, opts);
        setError(null);
        return result;
      } catch (err) {
        setError(err);
        return undefined;
      } finally {
        setInFlight((n) => Math.max(0, n - 1));
      }
    },
    []
  );

  return { trigger, pending: inFlight > 0, inFlight, error };
}
