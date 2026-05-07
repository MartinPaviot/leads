/**
 * Retry policy for onboarding API calls (P0-3 task 3.2).
 *
 * The wizard's three networked operations — `state`, `phase/:n` POST,
 * `complete` — all benefit from a retry-with-backoff for transient
 * failures (5xx, network reset). User-driven validation failures
 * (4xx with `issues`) must NOT be retried — they're terminal until
 * the user fixes the input.
 *
 * Pure functions. Tested in isolation : `retryDecision()` for the
 * branching logic and `computeBackoffMs()` for the timing.
 */

export interface RetryDecision {
  /** Whether the caller should retry. */
  retry: boolean;
  /** Wait this long before the next attempt. */
  delayMs: number;
  /** Reason — surfaced in logs / telemetry. */
  reason:
    | "transient_5xx"
    | "network_error"
    | "rate_limited"
    | "max_attempts"
    | "non_retryable_4xx"
    | "validation_error";
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 4_000;

/**
 * Exponential backoff with full jitter — `delay = random(0, 2^attempt * BASE)`,
 * capped at MAX_DELAY_MS. Avoids the thundering-herd when many
 * clients retry simultaneously after a brief outage.
 *
 * Pure ; the random source is an injected param so tests assert
 * deterministic delays.
 */
export function computeBackoffMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  if (attempt < 1) return 0;
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.floor(random() * exponential);
}

/**
 * Decide whether to retry given the response status, the attempt
 * number (1-indexed), and whether the body looked like a Zod
 * validation failure.
 *
 * Branching :
 *  - 5xx → retry up to MAX_ATTEMPTS
 *  - 429 (rate-limited) → retry, slightly larger delay
 *  - 4xx with validation issues → never retry (user input)
 *  - Other 4xx → don't retry (auth, malformed)
 *  - Network error (no status) → retry up to MAX_ATTEMPTS
 */
export function retryDecision(args: {
  attempt: number;
  status: number | null;
  hasValidationIssues: boolean;
  random?: () => number;
}): RetryDecision {
  const { attempt, status, hasValidationIssues, random } = args;

  if (attempt >= MAX_ATTEMPTS) {
    return { retry: false, delayMs: 0, reason: "max_attempts" };
  }

  // Network error → no status. Retry.
  if (status === null) {
    return {
      retry: true,
      delayMs: computeBackoffMs(attempt, random),
      reason: "network_error",
    };
  }

  // Rate limit — back off harder than 5xx.
  if (status === 429) {
    return {
      retry: true,
      delayMs: Math.max(1000, computeBackoffMs(attempt, random)),
      reason: "rate_limited",
    };
  }

  // 5xx — transient ; retry.
  if (status >= 500 && status < 600) {
    return {
      retry: true,
      delayMs: computeBackoffMs(attempt, random),
      reason: "transient_5xx",
    };
  }

  // 4xx — validation errors are terminal regardless of attempt count.
  if (status >= 400 && status < 500) {
    if (hasValidationIssues) {
      return { retry: false, delayMs: 0, reason: "validation_error" };
    }
    return { retry: false, delayMs: 0, reason: "non_retryable_4xx" };
  }

  return { retry: false, delayMs: 0, reason: "non_retryable_4xx" };
}

/**
 * Convenience wrapper : execute `fn`, on failure consult
 * `retryDecision`, sleep, retry. Returns the final response object
 * + the attempts-taken count for telemetry. The caller is
 * responsible for parsing the response.
 *
 * `fn` returns `{ status, body }` on success-or-error response and
 * `null` on network failure. This keeps the retry helper agnostic
 * of fetch internals — the caller decides how to extract status.
 */
export interface FetchAttempt {
  status: number | null;
  body: unknown;
}

export interface ExecuteResult extends FetchAttempt {
  attempts: number;
  retried: boolean;
}

export async function executeWithRetry(
  fn: () => Promise<FetchAttempt>,
  opts: {
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    isValidation?: (body: unknown) => boolean;
  } = {},
): Promise<ExecuteResult> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const isValidation =
    opts.isValidation ??
    ((body: unknown) =>
      !!body &&
      typeof body === "object" &&
      Array.isArray((body as { issues?: unknown }).issues));
  let attempt = 1;
  let last: FetchAttempt = { status: null, body: null };
  let retried = false;
  while (true) {
    last = await fn();
    const decision = retryDecision({
      attempt,
      status: last.status,
      hasValidationIssues: last.status !== null && isValidation(last.body),
      random: opts.random,
    });
    if (!decision.retry) {
      return { ...last, attempts: attempt, retried };
    }
    await sleep(decision.delayMs);
    retried = true;
    attempt++;
  }
}
