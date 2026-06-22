/**
 * Spec 24 — provider-agnostic LinkedIn outreach port. The `LinkedInPort` is the
 * seam every adapter (HeyReach first) implements; the orchestration in
 * ./linkedin enforces daily limits, suppression, anti-collision, idempotency,
 * and metering around it. Identity is `profileUrl` (per data-contract).
 *
 * Blast radius: sending/linkedin/* only.
 */

export type LinkedInActionType = "connect" | "message";

export interface LinkedInContact {
  id: string;
  /** The data-contract identity for LinkedIn. */
  profileUrl?: string | null;
  tenantId?: string;
  /** Personalization fields — keys validated `[a-z0-9_]`, scalar values. */
  customUserFields?: Record<string, unknown>;
}

export interface LinkedInRequest {
  stepId: string;
  action: LinkedInActionType;
  contact: LinkedInContact;
  /** The sender LinkedIn account the action runs from (daily limits are per this). */
  senderAccountId: string;
  /** Connection note (connect) / message body (message). */
  note?: string;
  message?: string;
  idempotencyKey: string;
}

export interface LinkedInResult {
  providerActionId: string;
  action: LinkedInActionType;
  status: "sent" | "queued" | "connected";
  senderAccountId: string;
}

export type LinkedInErrorKind = "client_error" | "server_error";

export class LinkedInError extends Error {
  readonly kind: LinkedInErrorKind;
  readonly status?: number;
  constructor(message: string, kind: LinkedInErrorKind, status?: number) {
    super(message);
    this.name = "LinkedInError";
    this.kind = kind;
    this.status = status;
  }
  get retryable(): boolean {
    return this.kind === "server_error";
  }
}

export interface LinkedInPort {
  connect(req: LinkedInRequest): Promise<LinkedInResult>;
  message(req: LinkedInRequest): Promise<LinkedInResult>;
  status?(providerActionId: string): Promise<string>;
}
