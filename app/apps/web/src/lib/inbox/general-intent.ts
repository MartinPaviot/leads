/**
 * General-intent resolution (INBOX-S06 core). Pure + unit-tested.
 *
 * The CLASSIFICATION itself is the model's call over the real message (NO
 * hardcoded synonym map — per the no-hardcoded-matching principle; that LLM pass
 * is residual). This is the deterministic layer around it: normalize the model's
 * label into the known taxonomy, and apply the two structural gates —
 *   1. unambiguous machine mail → `automated_no_reply` (reusing classifyInboundSender), and
 *   2. the sales sub-intent applies ONLY when general intent is `sales_reply` AND
 *      the conversation has matched outbound (the gate INBOX-T08 needs).
 */

export const GENERAL_INTENTS = [
  "meeting_request", "scheduling", "question", "request_action", "fyi_update",
  "notification", "promotion_newsletter", "invoice_billing", "receipt_confirmation",
  "security_account", "support_request", "personal", "social", "automated_no_reply",
  "sales_reply",
] as const;

export type GeneralIntent = (typeof GENERAL_INTENTS)[number];

/** Coerce a model-produced label into the taxonomy; unknown/unsure → fyi_update. */
export function normalizeIntent(raw: string | null | undefined): GeneralIntent {
  const v = (raw ?? "").trim().toLowerCase();
  return (GENERAL_INTENTS as readonly string[]).includes(v) ? (v as GeneralIntent) : "fyi_update";
}

export interface IntentResolution {
  generalIntent: GeneralIntent;
  /** The sales sub-taxonomy (pricing_inquiry, objection_*, …) may legitimately apply. */
  salesSubIntentApplies: boolean;
}

export function resolveGeneralIntent(input: {
  modelIntent?: string | null;
  isMachineSent?: boolean;
  hasOutbound?: boolean;
}): IntentResolution {
  // Deterministic post-rule: unambiguous machine mail is never a sales reply.
  if (input.isMachineSent) {
    return { generalIntent: "automated_no_reply", salesSubIntentApplies: false };
  }
  const generalIntent = normalizeIntent(input.modelIntent);
  const salesSubIntentApplies = generalIntent === "sales_reply" && !!input.hasOutbound;
  return { generalIntent, salesSubIntentApplies };
}
