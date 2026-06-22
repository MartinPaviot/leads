/**
 * Spec 23 — the send orchestration. Hard preconditions (verified email 17,
 * suppression 22), idempotency per (stepId, contactId), capacity/rotation (21),
 * a send window, then a metered provider call that emits a send event (29/27).
 * Every precondition is a hard gate, not a warning.
 *
 * The guards are injected predicates so this builds off main decoupled from the
 * exact spec-17/21/22 modules. Deterministic except the external send, which is
 * idempotency-keyed.
 */

import type { SendPort, SendRequest, SendResult, SendContact, SendMailbox } from "./port";
import { SendError } from "./port";
import { isWithinSendWindow, type SendWindow } from "./rotation";

export type RefuseReason = "unverified" | "suppressed" | "no-capacity" | "outside-window";

export interface SendEvent {
  stepId: string;
  contactId: string;
  mailboxId: string;
  providerMessageId: string;
  at: number;
}

export interface IdempotencyStore {
  get(key: string): Promise<SendResult | null>;
  set(key: string, result: SendResult): Promise<void>;
}

export interface MeterOp {
  workspace: string;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
}

export interface SendDeps {
  port: SendPort;
  /** spec-17 — true iff the contact's email is verified-sendable. */
  isEmailSendable: (contact: SendContact) => boolean;
  /** spec-22 — true iff the contact/domain is suppressed. */
  isSuppressed: (contact: SendContact) => boolean;
  idempotency: IdempotencyStore;
  /** spec-02 meter wrapping the provider call (AC5). */
  meter: <R>(op: MeterOp, fn: () => Promise<R>) => Promise<R>;
  emitSendEvent?: (event: SendEvent) => void | Promise<void>;
  sendWindow?: SendWindow;
  tenantId: string;
  now?: () => number;
}

export interface SendOutcome {
  sent: boolean;
  result?: SendResult;
  refusedReason?: RefuseReason;
  error?: SendError;
  /** True when idempotency returned a prior result (no second provider call). */
  deduped?: boolean;
}

function capacityOk(mailbox: SendMailbox): boolean {
  return mailbox.authSendable && mailbox.available > 0;
}

/**
 * Send one message through the port with all guards. Order matters: dedupe first
 * (a retry must never re-send), then the hard refusals, then window/capacity,
 * then the metered send.
 */
export async function sendEmail(req: SendRequest, deps: SendDeps): Promise<SendOutcome> {
  const now = deps.now ?? (() => Date.now());
  const key = req.idempotencyKey || `${req.stepId}:${req.contact.id}`;

  // AC4 — idempotency: a prior success short-circuits, no second send.
  const prior = await deps.idempotency.get(key);
  if (prior) return { sent: true, result: prior, deduped: true };

  // AC3 — hard preconditions (refuse, do not warn).
  if (!deps.isEmailSendable(req.contact)) return { sent: false, refusedReason: "unverified" };
  if (deps.isSuppressed(req.contact)) return { sent: false, refusedReason: "suppressed" };

  // AC2 — human-like window + remaining capacity.
  if (deps.sendWindow && !isWithinSendWindow(new Date(now()), deps.sendWindow)) {
    return { sent: false, refusedReason: "outside-window" };
  }
  if (!capacityOk(req.mailbox)) return { sent: false, refusedReason: "no-capacity" };

  // AC5 — metered send + event. A 4xx is terminal; a 5xx bubbles to retry under
  // the same key (the adapter forwards the key for provider-side dedup).
  try {
    const result = await deps.meter(
      { workspace: deps.tenantId, kind: "send.email", provider: req.mailbox.provider, amount: 1, ref: key },
      () => deps.port.send({ ...req, idempotencyKey: key }),
    );
    await deps.idempotency.set(key, result);
    await deps.emitSendEvent?.({ stepId: req.stepId, contactId: req.contact.id, mailboxId: result.mailboxId, providerMessageId: result.providerMessageId, at: now() });
    return { sent: true, result };
  } catch (e) {
    if (e instanceof SendError && e.kind === "client_error") return { sent: false, error: e };
    throw e; // server_error / unknown: retryable, not stored
  }
}
