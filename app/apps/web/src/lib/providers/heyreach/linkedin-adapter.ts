/**
 * Spec 24 — HeyReach adapter behind the provider-agnostic LinkedInPort. Identity
 * is `profileUrl`; customUserFields keys are validated against `[a-z0-9_]` (per
 * data-contract) with scalar values. The HTTP client is injected so the adapter
 * stays pure/testable. Blast radius: providers/heyreach/* only.
 */

import type { LinkedInPort, LinkedInRequest, LinkedInResult } from "@/lib/sending/linkedin/port";
import { LinkedInError } from "@/lib/sending/linkedin/port";

const VALID_KEY = /^[a-z0-9_]+$/;

export function isValidCustomFieldKey(key: string): boolean {
  return VALID_KEY.test(key);
}

export interface CustomFieldMapping {
  fields: Record<string, string | number | boolean>;
  /** Keys rejected for not matching [a-z0-9_], surfaced rather than silently lost. */
  droppedKeys: string[];
}

/**
 * AC1 — map customUserFields to HeyReach: keep scalar values under valid keys;
 * drop (and report) keys that violate `[a-z0-9_]` or carry non-scalar values.
 */
export function toHeyReachCustomFields(fields: Record<string, unknown> | undefined): CustomFieldMapping {
  const out: Record<string, string | number | boolean> = {};
  const droppedKeys: string[] = [];
  for (const [k, v] of Object.entries(fields ?? {})) {
    const scalar = typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
    if (isValidCustomFieldKey(k) && scalar) out[k] = v as string | number | boolean;
    else droppedKeys.push(k);
  }
  return { fields: out, droppedKeys };
}

export interface HeyReachPayload {
  campaign_id?: string;
  /** Identity per data-contract. */
  profile_url: string;
  sender_account_id: string;
  custom_user_fields: Record<string, string | number | boolean>;
  idempotency_key: string;
  note?: string;
  message?: string;
}

export function toHeyReachPayload(req: LinkedInRequest, campaignId?: string): HeyReachPayload {
  const { fields } = toHeyReachCustomFields(req.contact.customUserFields);
  return {
    campaign_id: campaignId,
    profile_url: (req.contact.profileUrl ?? "").trim(),
    sender_account_id: req.senderAccountId,
    custom_user_fields: fields,
    idempotency_key: req.idempotencyKey,
    note: req.note,
    message: req.message,
  };
}

export interface HeyReachClient {
  postConnect(payload: HeyReachPayload): Promise<{ id: string; status?: string }>;
  postMessage(payload: HeyReachPayload): Promise<{ id: string; status?: string }>;
  getStatus?(providerActionId: string): Promise<{ status: string }>;
}

export class HeyReachAdapter implements LinkedInPort {
  constructor(
    private readonly client: HeyReachClient,
    private readonly campaignId?: string,
  ) {}

  private requireProfile(req: LinkedInRequest): HeyReachPayload {
    const payload = toHeyReachPayload(req, this.campaignId);
    if (!payload.profile_url) throw new LinkedInError("missing profileUrl", "client_error", 400);
    return payload;
  }

  async connect(req: LinkedInRequest): Promise<LinkedInResult> {
    const res = await this.client.postConnect(this.requireProfile(req));
    return { providerActionId: res.id, action: "connect", status: res.status === "queued" ? "queued" : "sent", senderAccountId: req.senderAccountId };
  }

  async message(req: LinkedInRequest): Promise<LinkedInResult> {
    const res = await this.client.postMessage(this.requireProfile(req));
    return { providerActionId: res.id, action: "message", status: res.status === "queued" ? "queued" : "sent", senderAccountId: req.senderAccountId };
  }

  async status(providerActionId: string): Promise<string> {
    if (!this.client.getStatus) return "unknown";
    return (await this.client.getStatus(providerActionId)).status;
  }
}
