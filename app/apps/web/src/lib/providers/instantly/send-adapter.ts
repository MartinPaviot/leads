/**
 * Spec 23 — Instantly v2 send adapter behind the provider-agnostic SendPort.
 * Maps canonical message + contact to the Instantly payload, with custom
 * variables coerced to SCALARS ONLY (per the Instantly data-contract: nested
 * objects/arrays are not representable). Webhook payloads map back to a send
 * status. The HTTP client is injected so the adapter stays pure/testable.
 *
 * Blast radius: providers/instantly/* only.
 */

import type { SendPort, SendRequest, SendResult } from "@/lib/sending/send/port";
import { SendError } from "@/lib/sending/send/port";

/**
 * AC1 — Instantly custom_variables are scalar-only. Strings, finite numbers and
 * booleans pass through; null/undefined and nested objects/arrays are dropped
 * (never stringified into a misleading value).
 */
export function toInstantlyCustomVariables(vars: Record<string, unknown> | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(vars ?? {})) {
    if (typeof v === "string" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    // null / undefined / object / array → dropped (not scalar)
  }
  return out;
}

export interface InstantlyV2Payload {
  campaign_id?: string;
  email: string;
  from_mailbox_id: string;
  subject: string;
  body: string;
  custom_variables: Record<string, string | number | boolean>;
  idempotency_key: string;
}

/** Map a canonical SendRequest to the Instantly v2 send payload. */
export function toInstantlyPayload(req: SendRequest, campaignId?: string): InstantlyV2Payload {
  return {
    campaign_id: campaignId,
    email: (req.contact.email ?? "").trim().toLowerCase(),
    from_mailbox_id: req.mailbox.id,
    subject: req.message.subject ?? "",
    body: req.message.body,
    custom_variables: toInstantlyCustomVariables(req.contact.customVariables),
    idempotency_key: req.idempotencyKey,
  };
}

export interface InstantlyClient {
  /** POST the send. Throws on transport failure; returns the provider response. */
  postSend(payload: InstantlyV2Payload): Promise<{ id: string; status?: string }>;
  getStatus?(providerMessageId: string): Promise<{ status: string }>;
}

export class InstantlySendAdapter implements SendPort {
  constructor(
    private readonly client: InstantlyClient,
    private readonly campaignId?: string,
  ) {}

  async send(req: SendRequest): Promise<SendResult> {
    const payload = toInstantlyPayload(req, this.campaignId);
    if (!payload.email) throw new SendError("missing recipient email", "client_error", 400);
    const res = await this.client.postSend(payload);
    return {
      providerMessageId: res.id,
      status: res.status === "queued" ? "queued" : "sent",
      mailboxId: req.mailbox.id,
    };
  }

  async status(providerMessageId: string): Promise<string> {
    if (!this.client.getStatus) return "unknown";
    return (await this.client.getStatus(providerMessageId)).status;
  }
}

/** Map an Instantly webhook event type to a normalized send status. */
export function instantlyWebhookToStatus(eventType: string): "sent" | "bounced" | "opened" | "replied" | "unknown" {
  switch (eventType) {
    case "email_sent":
      return "sent";
    case "email_bounced":
      return "bounced";
    case "email_opened":
      return "opened";
    case "reply_received":
      return "replied";
    default:
      return "unknown";
  }
}
