/**
 * Lead status — the human-in-the-loop layer of the inbound-lead funnel
 * (tranche 3, see _specs/inbound-lead-recognition/).
 *
 * Two verdicts live on `contacts.properties` (jsonb, no migration), mirroring
 * the role-status.ts pattern:
 *   - `leadFeedback`     — the USER's explicit "this is / isn't a lead" call.
 *   - `leadRelationship` — the LLM relationship verdict persisted from the
 *                          hot-inbound confirmation (relationship-check.ts).
 *
 * Precedence (Lightfield data-approval principle): a human override ALWAYS
 * wins. Only when the user has not ruled does the LLM verdict apply. Absent
 * both, the contact is shown (we never hide on no signal).
 *
 * Pure helpers only (no DB, immutable updates) so they're unit-testable and
 * safe to import from server reads (rankWarmLeads, hot-inbounds) and the
 * write endpoint alike.
 */

export const LEAD_FEEDBACK_KEY = "leadFeedback";
export const LEAD_RELATIONSHIP_KEY = "leadRelationship";

type Props = Record<string, unknown> | null | undefined;

/** The user's explicit verdict on whether this inbound is a real lead. */
export interface LeadFeedback {
  isLead: boolean;
  /** ISO timestamp of the user's call. */
  at: string;
  /** Optional free-text reason the user gave. */
  reason?: string | null;
}

/** The persisted LLM relationship verdict (from relationship-classifier). */
export interface StoredLeadRelationship {
  isInboundLead: boolean;
  relationshipToUs: string;
  intent?: string | null;
  reason: string;
  /** ISO timestamp of the classification. */
  at: string;
}

function asObject(properties: Props): Record<string, unknown> | null {
  return properties && typeof properties === "object"
    ? (properties as Record<string, unknown>)
    : null;
}

export function getLeadFeedback(properties: Props): LeadFeedback | null {
  const p = asObject(properties);
  const v = p?.[LEAD_FEEDBACK_KEY];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.isLead !== "boolean" || typeof o.at !== "string") return null;
  return {
    isLead: o.isLead,
    at: o.at,
    reason: typeof o.reason === "string" ? o.reason : null,
  };
}

export function getLeadRelationship(properties: Props): StoredLeadRelationship | null {
  const p = asObject(properties);
  const v = p?.[LEAD_RELATIONSHIP_KEY];
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.isInboundLead !== "boolean") return null;
  if (typeof o.relationshipToUs !== "string" || typeof o.reason !== "string") return null;
  if (typeof o.at !== "string") return null;
  return {
    isInboundLead: o.isInboundLead,
    relationshipToUs: o.relationshipToUs,
    intent: typeof o.intent === "string" ? o.intent : null,
    reason: o.reason,
    at: o.at,
  };
}

/** Immutable: attach the user's lead verdict. */
export function withLeadFeedback(
  properties: Props,
  feedback: LeadFeedback,
): Record<string, unknown> {
  return { ...(properties ?? {}), [LEAD_FEEDBACK_KEY]: feedback };
}

/** Immutable: attach the persisted LLM relationship verdict. */
export function withLeadRelationship(
  properties: Props,
  relationship: StoredLeadRelationship,
): Record<string, unknown> {
  return { ...(properties ?? {}), [LEAD_RELATIONSHIP_KEY]: relationship };
}

/**
 * Should this contact be hidden from the lead surfaces (Warm leads / Hot
 * inbounds)? Human override wins; otherwise the LLM verdict; otherwise no.
 */
export function isExcludedAsLead(properties: Props): boolean {
  const feedback = getLeadFeedback(properties);
  if (feedback) return !feedback.isLead; // human ruled — obey them
  const rel = getLeadRelationship(properties);
  if (rel) return rel.isInboundLead === false;
  return false;
}

/**
 * The product-language reason a contact is/was treated as not-a-lead, for the
 * "why" line. Prefers the human's note, then the LLM's reason. null when the
 * contact is a valid lead or unjudged.
 */
export function leadExclusionReason(properties: Props): string | null {
  const feedback = getLeadFeedback(properties);
  if (feedback && !feedback.isLead) return feedback.reason || "Marked not a lead";
  const rel = getLeadRelationship(properties);
  if (rel && rel.isInboundLead === false) return rel.reason;
  return null;
}
