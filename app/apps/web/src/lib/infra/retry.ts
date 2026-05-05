/**
 * Tiny retry helper with exponential backoff. Pure function — no side
 * effects beyond invoking `fn`. Intended for outbound HTTP / API calls
 * where the caller wants a small in-process retry without pulling in a
 * full circuit-breaker library.
 *
 * Each retry waits `baseDelayMs * 2^attempt` (capped at `maxDelayMs`).
 * Pass `shouldRetry` to opt out of retrying for terminal errors (e.g.
 * 4xx responses that won't succeed on a second attempt).
 */
export interface RetryOptions {
  /** Total attempts including the first one. Must be >= 1. */
  attempts?: number;
  /** Backoff base in ms. Each retry waits baseDelayMs * 2^(attempt-1). */
  baseDelayMs?: number;
  /** Cap on the per-retry sleep, in ms. */
  maxDelayMs?: number;
  /** Override the default "always retry" behaviour. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  /** Hook for tests / observability — called after each failed attempt. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Sleep implementation. Tests inject a vi.fn() to skip real timers. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseDelayMs = Math.max(0, opts.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, opts.maxDelayMs ?? 5_000);
  const sleep = opts.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isFinalAttempt = attempt === attempts;
      const allowRetry = opts.shouldRetry ? opts.shouldRetry(err, attempt) : true;
      if (isFinalAttempt || !allowRetry) {
        throw err;
      }
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  // Unreachable — the loop always either returns or throws — but the
  // type checker can't see that without `never` plumbing.
  throw lastErr;
}
