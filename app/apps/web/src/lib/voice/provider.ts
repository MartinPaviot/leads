/**
 * VoiceProvider — provider-agnostic interface for outbound voice calls.
 *
 * Twilio is the only impl shipped in Phase 1; Telnyx is on the roadmap
 * for Phase 4 when volume per tenant crosses ~50 000 minutes/month and
 * the -50% on per-minute rates covers the migration sprint. Everything
 * the rest of the app calls into Voice for must go through this
 * interface so the swap is one file (`lib/voice/twilio.ts` →
 * `lib/voice/telnyx.ts`) plus an env flag.
 */

export interface CreateCallInput {
  tenantId: string;
  callId: string; // our internal calls.id, propagated as a custom param
  fromNumber: string; // E.164 — selected from phone_number_pool
  toNumber: string; // E.164
  webhookBaseUrl: string; // public base for twiml + recording-status webhooks
  recordingDisclosureUrl?: string; // when two-party consent region
}

export interface CreatedCall {
  providerCallSid: string;
}

export interface WebRtcTokenInput {
  userId: string;
  tenantId: string;
  ttlSec?: number;
}

export interface WebRtcToken {
  jwt: string;
  identity: string;
  expiresAt: Date;
}

export interface BuyNumberInput {
  countryCode: string;
  areaCode?: string;
  smsCapability?: boolean;
}

export interface PurchasedNumber {
  e164: string;
  providerSid: string;
  countryCode: string;
  areaCode: string | null;
  voiceCapability: boolean;
  smsCapability: boolean;
}

export interface WebhookValidationInput {
  signature: string;
  url: string; // full URL Twilio used to call us, including query
  params: Record<string, string>;
}

export interface RecordingInfo {
  url: string;
  durationSec: number;
}

export interface VoiceProvider {
  name: "twilio" | "telnyx";

  /**
   * Initiates the outbound leg from a provisioned tenant number to the
   * prospect. The provider will call back into our webhooks (twiml,
   * recording-status). Returns once the leg is queued, NOT when the
   * prospect answers.
   */
  createCall(input: CreateCallInput): Promise<CreatedCall>;

  /**
   * Issues a short-lived capability JWT the browser uses with the
   * provider's Voice SDK to attach the local audio device to the call.
   * Identity must encode the tenant so multi-tenant ACL holds.
   */
  signWebRtcToken(input: WebRtcTokenInput): Promise<WebRtcToken>;

  /**
   * Validates an inbound webhook request really came from the provider
   * (HMAC of the URL + body with the auth token). Routes MUST call
   * this before trusting any webhook payload.
   */
  validateWebhookSignature(input: WebhookValidationInput): boolean;

  /**
   * Provisions a new phone number for the tenant pool. Throws if the
   * provider has no inventory matching the area code.
   */
  buyNumber(input: BuyNumberInput): Promise<PurchasedNumber>;

  /**
   * Returns the signed URL + duration for a recording captured by the
   * provider. URL is short-lived (typically 24h) — the calling code
   * should proxy it via /api/calls/[id]/recording to enforce auth.
   */
  getRecording(providerCallSid: string): Promise<RecordingInfo | null>;

  /**
   * Redirects an in-progress call to the supplied TwiML. Used by the
   * voicemail-drop flow: when the caller clicks "Drop voicemail" we
   * swap the live leg's instructions to a <Play> + <Hangup>. The
   * provider returns nothing — failure throws.
   */
  redirectCall(providerCallSid: string, twiml: string): Promise<void>;
}

/**
 * Common runtime error type so route handlers can convert into the
 * right HTTP status without leaking provider internals.
 */
export class VoiceProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "invalid_signature"
      | "no_inventory"
      | "provider_down"
      | "unknown",
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VoiceProviderError";
  }
}
