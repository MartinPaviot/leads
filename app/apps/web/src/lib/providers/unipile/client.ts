/**
 * Spec 36 — Unipile HTTP client seam. The transport is injected so the adapter
 * (./linkedin-adapter) stays pure and unit-testable, exactly like HeyReachClient
 * in lib/providers/heyreach/linkedin-adapter.ts. A live implementation wraps the
 * Unipile Node SDK (`new UnipileClient(dsn, apiKey)`) or fetch against the DSN.
 *
 * Verified endpoints (developer.unipile.com): POST /users/invite, POST /chats,
 * POST /chats/{id}/messages, GET /users/{identifier}. Unipile targets an opaque,
 * VIEWER-SCOPED `provider_id` — never `profileUrl` — so resolution must use the
 * same sending account that will act (see TargetResolver in ./linkedin-adapter).
 *
 * WIRE FORMAT (live client's responsibility, from the API completeness pass):
 * POST /chats and POST /chats/{id}/messages are **multipart/form-data**, not JSON.
 * InMail is NOT a separate endpoint — it is POST /chats with the multipart fields
 * `linkedin[inmail]=true` and `linkedin[api]=classic|recruiter|sales_navigator`.
 * The live UnipileClient maps `UnipileNewChatPayload.inmail`/`.api` onto those
 * nested `linkedin[...]` form fields; `attachments` are file-upload form parts.
 *
 * Blast radius: lib/providers/unipile/* only.
 */

import { LinkedInError } from "@/lib/sending/linkedin/port"; // gitleaks:allow (LinkedInError is a TS type name, not a credential)

/** A typed Unipile HTTP failure. The adapter maps it to a LinkedInError. */
export class UnipileApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "UnipileApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Map a Unipile transport failure to the port's typed error. 429 (rate-limited)
 * and 5xx are retryable (`server_error`); every other 4xx — including
 * `422 cannot_resend_yet` — is terminal (`client_error`). Non-Unipile throws
 * bubble unchanged so the orchestrator's retry path (linkedin.ts:88) sees them.
 */
export function mapUnipileError(e: unknown): unknown {
  if (e instanceof LinkedInError) return e;
  if (e instanceof UnipileApiError) {
    const kind = e.status === 429 || e.status >= 500 ? "server_error" : "client_error";
    return new LinkedInError(e.message, kind, e.status);
  }
  return e;
}

export interface UnipileInvitePayload {
  account_id: string;
  provider_id: string;
  /** Connection note — LinkedIn caps this at 300 chars (adapter clamps). */
  message?: string;
}

export interface UnipileNewChatPayload {
  account_id: string;
  attendees_ids: string[];
  text: string;
  /** When true, send as InMail (premium/Sales-Nav/Recruiter seat + credits). */
  inmail?: boolean;
  /** Seat API surface the InMail rides — must match the connected seat. */
  api?: "classic" | "recruiter" | "sales_navigator";
}

export interface UnipileReplyPayload {
  chat_id: string;
  text: string;
}

/** Unipile responses vary the id field by action; the adapter normalizes them. */
export interface UnipileActionResponse {
  id?: string;
  invitation_id?: string;
  chat_id?: string;
  message_id?: string;
  object?: string;
}

/**
 * The injected transport. A live adapter implements these against the Unipile
 * SDK; tests inject a fake. Each may throw `UnipileApiError` on an HTTP failure.
 */
export interface UnipileClient {
  sendInvitation(payload: UnipileInvitePayload): Promise<UnipileActionResponse>;
  startNewChat(payload: UnipileNewChatPayload): Promise<UnipileActionResponse>;
  sendMessage(payload: UnipileReplyPayload): Promise<UnipileActionResponse>;
}
