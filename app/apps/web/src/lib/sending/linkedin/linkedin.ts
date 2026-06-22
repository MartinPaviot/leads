/**
 * Spec 24 — LinkedIn action orchestration. Hard preconditions (suppression 22,
 * anti-collision 14, a known profileUrl), per-sender-account daily limits,
 * idempotency per (stepId, contactId), then a metered provider action that emits
 * an event (analytics 29). Deterministic except the external action.
 *
 * Guards are injected predicates so this builds off main decoupled.
 */

import type { LinkedInPort, LinkedInRequest, LinkedInResult, LinkedInContact } from "./port";
import { LinkedInError } from "./port";
import { withinDailyLimit, type LinkedInDailyLimits } from "./limits";

export type LinkedInRefuseReason = "suppressed" | "collision-locked" | "no-profile" | "daily-limit";

export interface LinkedInActionEvent {
  stepId: string;
  contactId: string;
  senderAccountId: string;
  action: LinkedInRequest["action"];
  providerActionId: string;
  at: number;
}

export interface LinkedInIdempotencyStore {
  get(key: string): Promise<LinkedInResult | null>;
  set(key: string, result: LinkedInResult): Promise<void>;
}

export interface MeterOp {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

export interface LinkedInDeps {
  port: LinkedInPort;
  /** spec-22 — true iff the contact is suppressed. */
  isSuppressed: (contact: LinkedInContact) => boolean;
  /** spec-14 — true iff the contact is locked by another active enrollment. */
  isCollisionLocked: (contact: LinkedInContact) => boolean;
  /** Actions of this type already taken today by the sender account (AC2). */
  actionsToday: (senderAccountId: string, action: LinkedInRequest["action"]) => Promise<number> | number;
  idempotency: LinkedInIdempotencyStore;
  meter: <R>(op: MeterOp, fn: () => Promise<R>) => Promise<R>;
  emitEvent?: (event: LinkedInActionEvent) => void | Promise<void>;
  limits?: LinkedInDailyLimits;
  tenantId: string;
  now?: () => number;
}

export interface LinkedInOutcome {
  acted: boolean;
  result?: LinkedInResult;
  refusedReason?: LinkedInRefuseReason;
  error?: LinkedInError;
  deduped?: boolean;
}

export async function runLinkedInAction(req: LinkedInRequest, deps: LinkedInDeps): Promise<LinkedInOutcome> {
  const now = deps.now ?? (() => Date.now());
  const key = req.idempotencyKey || `${req.stepId}:${req.contact.id}`;

  // AC4 — idempotency: a prior success short-circuits, no second action.
  const prior = await deps.idempotency.get(key);
  if (prior) return { acted: true, result: prior, deduped: true };

  // AC3 — hard preconditions.
  if (deps.isSuppressed(req.contact)) return { acted: false, refusedReason: "suppressed" };
  if (deps.isCollisionLocked(req.contact)) return { acted: false, refusedReason: "collision-locked" };
  if (!req.contact.profileUrl || !req.contact.profileUrl.trim()) return { acted: false, refusedReason: "no-profile" };

  // AC2 — per-sender-account daily limit.
  const done = await deps.actionsToday(req.senderAccountId, req.action);
  if (!withinDailyLimit(req.action, done, deps.limits)) return { acted: false, refusedReason: "daily-limit" };

  // AC5 — metered action + event. 4xx terminal, 5xx bubbles for retry.
  try {
    const result = await deps.meter(
      { workspace: deps.tenantId, kind: `linkedin.${req.action}`, provider: "heyreach", amount: 1, ref: key },
      () => (req.action === "connect" ? deps.port.connect({ ...req, idempotencyKey: key }) : deps.port.message({ ...req, idempotencyKey: key })),
    );
    await deps.idempotency.set(key, result);
    await deps.emitEvent?.({ stepId: req.stepId, contactId: req.contact.id, senderAccountId: req.senderAccountId, action: req.action, providerActionId: result.providerActionId, at: now() });
    return { acted: true, result };
  } catch (e) {
    if (e instanceof LinkedInError && e.kind === "client_error") return { acted: false, error: e };
    throw e;
  }
}
