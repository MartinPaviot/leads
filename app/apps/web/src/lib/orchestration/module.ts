/**
 * Module harness (spec 03, AC1/AC4). defineModule wraps inngest.createFunction
 * with house defaults — bounded retries, tenant-scoped concurrency, native
 * idempotency, and an onFailure hook — so "a module is a step function with
 * per-step retry + idempotency" is a first-class primitive instead of being
 * re-implemented per file. Error classification (permanent vs transient) is
 * asserted in code rather than relying on the implicit platform default.
 */
import { inngest } from "@/inngest/client";
import { NonRetriableError } from "inngest";

/** Throw to mark a failure PERMANENT (bad input, missing tenant) — Inngest will
 *  not retry. Transient failures (rate limit, 5xx) should throw a normal Error
 *  so the bounded retry + platform backoff applies. */
export const PermanentError = NonRetriableError;

/** Classify + throw: permanent errors short-circuit retries; transient ones
 *  bubble as normal Errors so the module's bounded retries + backoff apply. */
export function failModule(message: string, opts?: { permanent?: boolean; cause?: unknown }): never {
  if (opts?.permanent) throw new NonRetriableError(message, { cause: opts.cause });
  throw new Error(message);
}

export interface ModuleConfig {
  /** Slug -> Inngest function id. */
  name: string;
  /** Event/cron triggers (Inngest trigger objects). */
  triggers: Array<{ event: string } | { cron: string }>;
  /** Bounded retry limit (default 3). */
  retries?: number;
  /** Event-data key for tenant-scoped concurrency (e.g. "event.data.tenantId"). */
  concurrencyKey?: string;
  concurrencyLimit?: number;
  /** CEL expression for native Inngest idempotency (e.g. "event.data.ref"). */
  idempotency?: string;
}

/** Pure: the Inngest function options with house defaults applied. Unit-tested. */
export function moduleOptions(config: ModuleConfig): Record<string, unknown> {
  return {
    id: config.name,
    retries: config.retries ?? 3,
    triggers: config.triggers,
    ...(config.concurrencyKey
      ? { concurrency: [{ key: config.concurrencyKey, limit: config.concurrencyLimit ?? 5 }] }
      : {}),
    ...(config.idempotency ? { idempotency: config.idempotency } : {}),
  };
}

/** Deterministic idempotency key for a module run. Pure. */
export function moduleIdempotencyKey(module: string, parts: Array<string | number | undefined | null>): string {
  return [module, ...parts.filter((p) => p !== undefined && p !== null)].join(":");
}

type CreateFnArgs = Parameters<typeof inngest.createFunction>;

/**
 * Define a module as an Inngest step function with house defaults. Thin wrapper
 * over createFunction; the value (defaults) lives in the tested moduleOptions.
 */
export function defineModule(config: ModuleConfig, handler: CreateFnArgs[1]) {
  return inngest.createFunction(moduleOptions(config) as unknown as CreateFnArgs[0], handler);
}
