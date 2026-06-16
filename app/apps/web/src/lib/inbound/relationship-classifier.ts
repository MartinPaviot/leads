/**
 * Inbound relationship classifier — stage 2 of the inbound-lead funnel
 * (see _specs/inbound-lead-recognition/).
 *
 * Stage 1 (lead-classification.ts) is deterministic and answers "machine vs
 * human". This stage answers the SEMANTIC question that only makes sense
 * against the tenant's own ICP: of the humans who got through, which are
 * genuine LEADS (someone who could become OUR customer) vs. noise — a vendor
 * we pay, a salesperson selling TO us, a recruiter, spam?
 *
 * This is the matchIndustries pattern (feedback_no-hardcoded-matching): the
 * judgement is delegated to the LLM reasoning over the tenant's real ICP +
 * product labels, never a hardcoded vendor/keyword list.
 *
 * Pure of the DB: the tenant's product description + ICP summary are passed in
 * as strings so this stays unit-testable. The DB orchestration (loading the
 * contact, last inbound message and settings) lives in `relationship-check.ts`.
 *
 * Cost: reuses the shared lightweight model (Haiku) via getModelForTask, same
 * as email-intelligence.ts (~$0.001/call). Fails OPEN — returns null when no
 * model is configured or the call throws, so the caller treats "unknown" as
 * "don't block", never dropping a possible lead on an infra hiccup.
 */

import { z } from "zod";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import { truncateForLLM } from "@/lib/enrichment/email-extract";

export type RelationshipToUs =
  | "prospect"
  | "customer"
  | "vendor"
  | "partner"
  | "recruiter"
  | "spam"
  | "unknown";

export type InboundIntent =
  | "buying"
  | "support"
  | "billing"
  | "newsletter"
  | "notification"
  | "cold_outreach_to_us"
  | "personal"
  | "other";

export interface RelationshipVerdict {
  relationshipToUs: RelationshipToUs;
  /** true only if a human who could become OUR customer is engaging. */
  isInboundLead: boolean;
  intent: InboundIntent;
  confidence: number;
  /** One short product-language sentence — feeds the "why" line + audit. */
  reason: string;
}

const verdictSchema = z.object({
  relationshipToUs: z
    .enum(["prospect", "customer", "vendor", "partner", "recruiter", "spam", "unknown"])
    .describe(
      "The sender's commercial relationship to US. 'vendor' = a service/tool WE are a customer of. 'prospect' = a person who could buy from us.",
    ),
  isInboundLead: z
    .boolean()
    .describe(
      "true ONLY if a human who could become OUR customer is reaching out or replying with potential buying interest. A vendor/recruiter/newsletter/notification is false.",
    ),
  intent: z.enum([
    "buying",
    "support",
    "billing",
    "newsletter",
    "notification",
    "cold_outreach_to_us",
    "personal",
    "other",
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().describe("One short product-language sentence explaining the verdict."),
});

export interface ClassifyRelationshipInput {
  fromHeader: string;
  subject?: string | null;
  text?: string | null;
  senderTitle?: string | null;
  senderCompany?: string | null;
  /** Tenant's product description (Settings → Product & Voice). */
  productDescription?: string | null;
  /** Short human-readable ICP summary (industries, seniority, geography). */
  icpSummary?: string | null;
  tenantId?: string;
}

/**
 * Decide the inbound sender's relationship to the tenant. Returns null on
 * fail-open (no model / error) so the caller does not block on infra.
 */
export async function classifyInboundRelationship(
  input: ClassifyRelationshipInput,
): Promise<RelationshipVerdict | null> {
  const model = getModelForTask("lightweight");
  if (!model) return null;

  const product = input.productDescription?.trim() || "(our product — not specified)";
  const icp = input.icpSummary?.trim() || "(our ideal customer — not specified)";
  const body = truncateForLLM(input.text || "", 2000);

  const prompt = `You decide whether an inbound email is a genuine SALES LEAD for us, or noise.

WE SELL: ${product}
OUR IDEAL CUSTOMER (ICP): ${icp}

An inbound email is a LEAD only if the SENDER is a HUMAN who could become OUR
customer — a person at an organisation that fits our ICP, reaching out or
replying with potential buying interest.

It is NOT a lead when the sender is:
- a service/tool/vendor that WE are a customer of (receipts, account or security
  notices, product updates from software we subscribe to),
- a salesperson or vendor trying to sell something TO us,
- a recruiter, a newsletter, an automated notification, or spam.

The decisive question is the DIRECTION of the relationship: would they buy FROM
us (lead), or are we their customer / are they selling TO us (not a lead)?

EMAIL
From: ${input.fromHeader}
Sender title: ${input.senderTitle || "(unknown)"}
Sender company: ${input.senderCompany || "(unknown)"}
Subject: ${input.subject || "(no subject)"}
Body:
${body}

Return relationshipToUs, isInboundLead, intent, confidence (0-1), and a one
short sentence reason in product language. Never invent buying interest that is
not actually present in the email.`;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: verdictSchema,
      prompt,
      _trace: {
        agentId: "inbound-relationship-classifier",
        tenantId: input.tenantId,
        inputPreview: `Relationship for inbound from ${input.fromHeader}`,
      },
    });
    return {
      relationshipToUs: object.relationshipToUs,
      isInboundLead: object.isInboundLead,
      intent: object.intent,
      confidence: object.confidence,
      reason: object.reason,
    };
  } catch (err) {
    console.warn("inbound relationship classification failed:", err);
    return null;
  }
}
