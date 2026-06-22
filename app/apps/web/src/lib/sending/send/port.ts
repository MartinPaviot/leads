/**
 * Spec 23 — provider-agnostic email send port. The `SendPort` is the seam every
 * adapter (Instantly v2 first) implements; the orchestration in ./send enforces
 * the hard preconditions, rotation, idempotency, and metering around it.
 *
 * Blast radius: sending/send/* only.
 */

export interface SendMessage {
  subject?: string;
  body: string;
}

export interface SendContact {
  id: string;
  email?: string | null;
  tenantId?: string;
  /** Personalization variables — scalar-only once mapped (per data-contract). */
  customVariables?: Record<string, unknown>;
}

/** A mailbox the port can send from (structural subset of spec-21's mailbox). */
export interface SendMailbox {
  id: string;
  provider: string;
  /** Remaining sends today (caps + warmup already applied by spec-21). */
  available: number;
  /** Domain auth verified (spec-21). */
  authSendable: boolean;
}

export interface SendRequest {
  stepId: string;
  contact: SendContact;
  message: SendMessage;
  mailbox: SendMailbox;
  /** Idempotency key, defaults to `${stepId}:${contact.id}`. */
  idempotencyKey: string;
}

export interface SendResult {
  providerMessageId: string;
  status: "sent" | "queued";
  mailboxId: string;
}

export type SendErrorKind = "client_error" | "server_error";

/** Typed provider error: 4xx is terminal (no retry); 5xx is retryable. */
export class SendError extends Error {
  readonly kind: SendErrorKind;
  readonly status?: number;
  constructor(message: string, kind: SendErrorKind, status?: number) {
    super(message);
    this.name = "SendError";
    this.kind = kind;
    this.status = status;
  }
  get retryable(): boolean {
    return this.kind === "server_error";
  }
}

export interface SendPort {
  send(req: SendRequest): Promise<SendResult>;
  status?(providerMessageId: string): Promise<string>;
}
