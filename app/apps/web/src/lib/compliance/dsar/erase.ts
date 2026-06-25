/**
 * Spec 34 (AC2–AC5) — DSAR erasure. Erases/anonymizes a person across the
 * canonical store and caches, propagates to the CRM, adds spec-22 suppression,
 * sets a permanent do-not-resurrect marker, and verifies no residual personal
 * data remains. Destructive — gated + verified. Idempotent: re-running confirms
 * the clean state. Blast radius: compliance/dsar/* only.
 */

export interface EraseDeps {
  /** Erase/anonymize the canonical record (e.g. cascade-delete). Idempotent. */
  eraseCanonical: (personId: string) => Promise<void>;
  /** Clear provider/enrichment caches; returns the cache stores cleared. */
  eraseCaches: (personId: string) => Promise<string[]>;
  /** Propagate the deletion to the CRM (28). Returns whether a CRM record was affected. */
  propagateCrm: (personId: string) => Promise<boolean>;
  /** spec-22 — add a permanent suppression so the person is not re-sourced. */
  addSuppression: (personId: string) => Promise<void>;
  /** Set the permanent do-not-resurrect marker (AC4). */
  setDoNotResurrect: (personId: string) => Promise<void>;
  /** Whether the do-not-resurrect marker is already set (prior erase). */
  hasDoNotResurrect: (personId: string) => Promise<boolean>;
  /** AC5 — scan managed stores for residual personal data; empty = clean. */
  findResidual: (personId: string) => Promise<string[]>;
  /** Audit sink (AC3). */
  audit?: (entry: EraseReport) => void | Promise<void>;
  /** Configured legal window (ms) for AC3 reporting. */
  windowMs?: number;
  /** Request receipt time, to measure against the window. */
  requestedAt?: number;
  now?: () => number;
}

export interface EraseReport {
  personId: string;
  erasedCaches: string[];
  crmPropagated: boolean;
  suppressed: boolean;
  doNotResurrect: boolean;
  /** AC5 — verification result. */
  verified: boolean;
  residual: string[];
  /** True when the subject was already erased (re-run no-op). */
  idempotentNoop: boolean;
  completedAt: number;
  withinWindow: boolean;
}

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** AC2–AC5 — erase a subject across all managed stores and verify. */
export async function eraseSubject(personId: string, deps: EraseDeps): Promise<EraseReport> {
  const now = deps.now ?? (() => Date.now());
  const alreadyErased = await deps.hasDoNotResurrect(personId);

  // ORDER MATTERS (no transaction spans these stores): suppress + mark
  // do-not-resurrect FIRST, BEFORE the destructive delete. If eraseCanonical then
  // fails, the subject is already suppressed (never re-contacted) and the delete —
  // which is idempotent — can be safely retried. The reverse order would leave a
  // window where the PII is gone but the subject is still re-sourceable.
  await deps.addSuppression(personId); // AC2 — not re-sourced
  await deps.setDoNotResurrect(personId); // AC4 — permanent

  await deps.eraseCanonical(personId); // idempotent
  const erasedCaches = await deps.eraseCaches(personId);
  const crmPropagated = await deps.propagateCrm(personId);

  // AC5 — verify no residual personal data remains.
  const residual = await deps.findResidual(personId);
  const verified = residual.length === 0;

  const completedAt = now();
  const requestedAt = deps.requestedAt ?? completedAt;
  const withinWindow = completedAt - requestedAt <= (deps.windowMs ?? DEFAULT_WINDOW_MS);

  const report: EraseReport = {
    personId,
    erasedCaches,
    crmPropagated,
    suppressed: true,
    doNotResurrect: true,
    verified,
    residual,
    idempotentNoop: alreadyErased,
    completedAt,
    withinWindow,
  };
  await deps.audit?.(report); // AC3
  return report;
}

export type ResurrectionDecision = "re_suppressed" | "allowed";

/**
 * AC4 — a re-sourced person who was previously erased is re-suppressed (never
 * re-contacted). The do-not-resurrect marker survives re-sourcing.
 */
export async function checkResurrection(
  personId: string,
  deps: Pick<EraseDeps, "hasDoNotResurrect" | "addSuppression">,
): Promise<ResurrectionDecision> {
  if (await deps.hasDoNotResurrect(personId)) {
    await deps.addSuppression(personId);
    return "re_suppressed";
  }
  return "allowed";
}
