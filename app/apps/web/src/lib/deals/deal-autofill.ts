/**
 * Deal Auto-Fill -- Updates deal fields from conversation intelligence.
 *
 * When buying signals are detected in emails or meetings:
 * - budget_mentioned   -> update deal.value (extract dollar amount)
 * - timeline_discussed -> update deal.expectedCloseDate (extract date)
 * - authority_identified -> link contact as decision_maker on deal
 * - competitor_mentioned -> add to deal.properties.competitors
 * - positive_sentiment  -> update deal.properties.sentiment = "positive"
 *
 * All updates go through the approval mode system. At review-each,
 * creates a suggestion notification. At auto-high-confidence, executes.
 *
 * Every update is logged as an agentAction for undo capability (WS-7).
 */

import { db } from "@/db";
import { deals, contacts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  enforceAgentApprovalMode,
  readApprovalMode,
  type ApprovalModeV2,
  type GuardedAction,
} from "@/lib/guardrails/approval-mode";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { recordAgentAction } from "@/lib/agents/agent-actions";
import { sendNotification } from "@/lib/emails/notifications";
import type { ThreadIntelligence, BuyingSignal } from "@/lib/emails/email-intelligence";
import logger from "@/lib/observability/logger";

// ── Public Types ──────────────────────────────────────────────

export interface DealAutofillResult {
  /** Fields that were actually written to the deal row */
  fieldsUpdated: string[];
  /** Fields that were queued as suggestions for human review */
  suggestionsCreated: string[];
}

export interface DealAutofillParams {
  dealId: string;
  tenantId: string;
  intelligence: ThreadIntelligence;
  sourceType: "email" | "meeting";
  /** Optional contactId for authority signal linking */
  contactId?: string;
}

// ── Confidence modifiers ──────────────────────────────────────
// The signal's own confidence is multiplied by these to reflect
// how reliably we can extract a structured value from evidence text.

const EXTRACTION_CONFIDENCE_MODIFIER: Record<string, number> = {
  budget: 0.8,       // dollar extraction is regex-based, may be imprecise
  timeline: 0.7,     // date extraction is approximate
  authority: 0.9,    // binary — person is or isn't a decision maker
  competitor: 0.95,  // competitor names are literal matches
  sentiment: 0.85,   // sentiment comes from the LLM, reliable
};

// ── Dollar extraction ─────────────────────────────────────────

/**
 * Extract a numeric dollar value from text.
 * Handles: "$50,000", "$50K", "50k", "$1.2M", "50 thousand dollars",
 *          "$XX,XXX", "XX K", "XX thousand"
 */
export function extractDollarAmount(text: string): number | null {
  // Patterns are ordered from most specific (with multiplier suffix)
  // to least specific (bare number). Each pattern captures the numeric
  // part in group 1 and uses a second group for the multiplier.
  const patterns: Array<{ regex: RegExp; multiplier: number }> = [
    // $1.2M, $50M, $1.2 million
    { regex: /\$\s*([\d,]+(?:\.\d+)?)\s*(?:million|m)\b/i, multiplier: 1_000_000 },
    // $50K, $50k, $50 thousand
    { regex: /\$\s*([\d,]+(?:\.\d+)?)\s*(?:thousand|k)\b/i, multiplier: 1_000 },
    // 1.2M dollars, 50M USD
    { regex: /([\d,]+(?:\.\d+)?)\s*(?:million|m)\s*(?:dollars?|usd|eur|gbp)/i, multiplier: 1_000_000 },
    // 50k dollars, 50K USD
    { regex: /([\d,]+(?:\.\d+)?)\s*(?:thousand|k)\s*(?:dollars?|usd|eur|gbp)/i, multiplier: 1_000 },
    // "50 thousand" without currency — common in speech
    { regex: /([\d,]+(?:\.\d+)?)\s+thousand\b/i, multiplier: 1_000 },
    // $50,000 (bare dollar amount — must come AFTER multiplier patterns)
    { regex: /\$\s*([\d,]+(?:\.\d+)?)(?!\s*[kKmM]\b)/, multiplier: 1 },
    // 50 dollars, 200 USD
    { regex: /([\d,]+(?:\.\d+)?)\s*(?:dollars?|usd)\b/i, multiplier: 1 },
  ];

  for (const { regex, multiplier } of patterns) {
    const match = text.match(regex);
    if (match) {
      const numStr = match[1].replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!isFinite(num) || num <= 0) continue;
      return Math.round(num * multiplier);
    }
  }

  return null;
}

// ── Date extraction ───────────────────────────────────────────

/**
 * Extract a date from timeline evidence text.
 * Handles: "Q3 2026", "by end of June", "end of quarter", "next month",
 *          "by January", "January 15, 2026"
 */
export function extractTimelineDate(text: string): Date | null {
  const now = new Date();
  const lower = text.toLowerCase();

  // Quarter + year: "Q3 2026", "q1 2027"
  const quarterYearMatch = lower.match(/q([1-4])\s*(?:of\s+)?(\d{4})/);
  if (quarterYearMatch) {
    const quarter = parseInt(quarterYearMatch[1], 10);
    const year = parseInt(quarterYearMatch[2], 10);
    const endMonth = quarter * 3;
    return new Date(year, endMonth, 0); // last day of quarter
  }

  // Quarter without year: "Q3", "end of Q2", "by Q4"
  const quarterMatch = lower.match(/(?:end of |by )?\bq([1-4])\b/);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1], 10);
    const quarterStartMonth = (quarter - 1) * 3;
    const year = now.getMonth() >= quarterStartMonth
      ? now.getFullYear() + 1
      : now.getFullYear();
    const endMonth = quarter * 3;
    return new Date(year, endMonth, 0);
  }

  // "end of [month]" or "by [month]"
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const endOfMonthMatch = lower.match(
    /(?:end of|by)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
  );
  if (endOfMonthMatch) {
    const monthIndex = monthNames.indexOf(endOfMonthMatch[1].toLowerCase());
    if (monthIndex !== -1) {
      const year = monthIndex < now.getMonth()
        ? now.getFullYear() + 1
        : now.getFullYear();
      return new Date(year, monthIndex + 1, 0); // last day of that month
    }
  }

  // "by [month] [year]"
  const byMonthYearMatch = lower.match(
    /(?:by|end of|before)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
  );
  if (byMonthYearMatch) {
    const monthIndex = monthNames.indexOf(byMonthYearMatch[1].toLowerCase());
    const year = parseInt(byMonthYearMatch[2], 10);
    if (monthIndex !== -1) {
      return new Date(year, monthIndex + 1, 0);
    }
  }

  // Relative: "next month", "next week", "in N weeks"
  if (lower.includes("next month")) {
    return new Date(now.getFullYear(), now.getMonth() + 2, 0);
  }
  if (lower.includes("next week")) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  const weeksMatch = lower.match(/in\s+(\d+)\s+weeks?/);
  if (weeksMatch) {
    return new Date(
      now.getTime() + parseInt(weeksMatch[1], 10) * 7 * 24 * 60 * 60 * 1000,
    );
  }
  if (lower.includes("end of year")) {
    return new Date(now.getFullYear(), 11, 31);
  }

  // Explicit dates as fallback
  const explicitDate = new Date(text);
  if (!isNaN(explicitDate.getTime()) && explicitDate > now) {
    return explicitDate;
  }

  return null;
}

// ── Main autofill function ────────────────────────────────────

/**
 * Scan intelligence for actionable signals and update deal fields.
 *
 * Each update goes through the approval mode guardrail. In review-each
 * mode, creates a suggestion notification. In auto-high-confidence,
 * writes the field directly. Every update (auto or queued) is logged
 * as an agentAction for undo via WS-7.
 */
export async function autofillDealFromIntelligence(
  params: DealAutofillParams,
): Promise<DealAutofillResult> {
  const { dealId, tenantId, intelligence, sourceType, contactId } = params;
  const result: DealAutofillResult = {
    fieldsUpdated: [],
    suggestionsCreated: [],
  };

  // Load deal to check current values
  let deal: {
    value: number | null;
    expectedCloseDate: Date | null;
    properties: Record<string, unknown>;
  } | null = null;

  try {
    const [row] = await db
      .select({
        value: deals.value,
        expectedCloseDate: deals.expectedCloseDate,
        properties: deals.properties,
      })
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
      .limit(1);

    if (!row) {
      logger.warn("deal-autofill: deal not found", { dealId, tenantId });
      return result;
    }
    deal = {
      value: row.value,
      expectedCloseDate: row.expectedCloseDate,
      properties: (row.properties || {}) as Record<string, unknown>,
    };
  } catch (err) {
    logger.warn("deal-autofill: failed to load deal", { dealId, err });
    return result;
  }

  // Load tenant settings for approval mode
  const settings = await getTenantSettings(tenantId);
  const mode = readApprovalMode(settings);

  // Resolve userId for notifications / agent action attribution
  const userId = await getFirstTenantUser(tenantId);

  // ── 1. Budget signals → deal.value ────────────────────────
  for (const signal of intelligence.signals) {
    if (signal.type === "budget") {
      const amount = extractDollarAmount(signal.evidence);
      if (amount === null) continue;

      // Don't overwrite a higher existing value
      if (deal.value !== null && deal.value >= amount) {
        logger.info("deal-autofill: skipping budget — existing value higher", {
          dealId,
          existing: deal.value,
          extracted: amount,
        });
        continue;
      }

      const confidence =
        signal.confidence * (EXTRACTION_CONFIDENCE_MODIFIER.budget ?? 0.8);
      const fieldResult = await applyDealFieldUpdate({
        tenantId,
        dealId,
        userId,
        mode,
        field: "value",
        dbUpdate: { value: amount },
        confidence,
        sourceType,
        signalType: "budget",
        reason: `Budget of ~$${amount.toLocaleString()} extracted from ${sourceType}: "${signal.evidence.slice(0, 120)}"`,
      });
      if (fieldResult === "executed") {
        result.fieldsUpdated.push("value");
        deal.value = amount; // update local state for subsequent checks
      } else if (fieldResult === "queued") {
        result.suggestionsCreated.push("value");
      }
    }
  }

  // ── 2. Timeline signals → deal.expectedCloseDate ──────────
  for (const signal of intelligence.signals) {
    if (signal.type === "timeline") {
      const date = extractTimelineDate(signal.evidence);
      if (!date) continue;

      const confidence =
        signal.confidence * (EXTRACTION_CONFIDENCE_MODIFIER.timeline ?? 0.7);
      const fieldResult = await applyDealFieldUpdate({
        tenantId,
        dealId,
        userId,
        mode,
        field: "expectedCloseDate",
        dbUpdate: { expectedCloseDate: date },
        confidence,
        sourceType,
        signalType: "timeline",
        reason: `Timeline "${signal.evidence.slice(0, 120)}" → ${date.toISOString().split("T")[0]}`,
      });
      if (fieldResult === "executed") {
        result.fieldsUpdated.push("expectedCloseDate");
      } else if (fieldResult === "queued") {
        result.suggestionsCreated.push("expectedCloseDate");
      }
    }
  }

  // ── 3. Authority signals → link contact as decision_maker ─
  if (contactId) {
    for (const signal of intelligence.signals) {
      if (signal.type === "authority") {
        const confidence =
          signal.confidence *
          (EXTRACTION_CONFIDENCE_MODIFIER.authority ?? 0.9);
        const fieldResult = await applyAuthorityLink({
          tenantId,
          dealId,
          contactId,
          userId,
          mode,
          confidence,
          sourceType,
          evidence: signal.evidence,
        });
        if (fieldResult === "executed") {
          result.fieldsUpdated.push("authority_contact");
        } else if (fieldResult === "queued") {
          result.suggestionsCreated.push("authority_contact");
        }
      }
    }
  }

  // ── 4. Competitor mentions → deal.properties.competitors ──
  if (intelligence.competitors.length > 0) {
    const confidence = EXTRACTION_CONFIDENCE_MODIFIER.competitor ?? 0.95;
    const existing = Array.isArray(deal.properties.competitors)
      ? (deal.properties.competitors as string[])
      : [];
    const merged = [
      ...new Set([...existing, ...intelligence.competitors]),
    ];

    // Only update if there are new competitors
    if (merged.length > existing.length) {
      const fieldResult = await applyDealPropertiesUpdate({
        tenantId,
        dealId,
        userId,
        mode,
        propertyKey: "competitors",
        propertyValue: merged,
        confidence,
        sourceType,
        signalType: "competitor",
        reason: `Competitors mentioned in ${sourceType}: ${intelligence.competitors.join(", ")}`,
      });
      if (fieldResult === "executed") {
        result.fieldsUpdated.push("competitors");
        deal.properties.competitors = merged;
      } else if (fieldResult === "queued") {
        result.suggestionsCreated.push("competitors");
      }
    }
  }

  // ── 5. Sentiment → deal.properties.sentiment ─────────────
  if (
    intelligence.sentiment !== "neutral" &&
    intelligence.sentiment !== "mixed"
  ) {
    const currentSentiment = deal.properties.sentiment as string | undefined;
    if (currentSentiment !== intelligence.sentiment) {
      const confidence = EXTRACTION_CONFIDENCE_MODIFIER.sentiment ?? 0.85;
      const fieldResult = await applyDealPropertiesUpdate({
        tenantId,
        dealId,
        userId,
        mode,
        propertyKey: "sentiment",
        propertyValue: intelligence.sentiment,
        confidence,
        sourceType,
        signalType: "sentiment",
        reason: `Sentiment detected as "${intelligence.sentiment}" (trend: ${intelligence.sentimentTrend}) from ${sourceType}`,
      });
      if (fieldResult === "executed") {
        result.fieldsUpdated.push("sentiment");
      } else if (fieldResult === "queued") {
        result.suggestionsCreated.push("sentiment");
      }
    }
  }

  logger.info("deal-autofill: complete", {
    dealId,
    tenantId,
    sourceType,
    fieldsUpdated: result.fieldsUpdated,
    suggestionsCreated: result.suggestionsCreated,
  });

  return result;
}

// ── Internal helpers ──────────────────────────────────────────

type FieldUpdateOutcome = "executed" | "queued" | "skipped";

/**
 * Apply a direct-column deal field update (value, expectedCloseDate)
 * through the approval mode guardrail.
 */
async function applyDealFieldUpdate(params: {
  tenantId: string;
  dealId: string;
  userId: string | null;
  mode: ApprovalModeV2;
  field: string;
  dbUpdate: Record<string, unknown>;
  confidence: number;
  sourceType: "email" | "meeting";
  signalType: string;
  reason: string;
}): Promise<FieldUpdateOutcome> {
  const {
    tenantId, dealId, userId, mode, field, dbUpdate,
    confidence, sourceType, signalType, reason,
  } = params;

  const decision = enforceAgentApprovalMode({
    mode,
    action: "deal-stage-change" as GuardedAction, // deal field updates use the same high-bar threshold
    confidence,
  });

  const actionPayload = {
    dealId,
    update: dbUpdate,
    field,
    type: "deal_autofill",
    sourceType,
    signalType,
    reason,
  };

  if (decision.allowed) {
    try {
      await db
        .update(deals)
        .set({ ...dbUpdate, updatedAt: new Date() })
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-autofill",
        payload: actionPayload,
      });

      return "executed";
    } catch (err) {
      logger.warn("deal-autofill: field update failed", { field, dealId, err });
      return "skipped";
    }
  } else {
    // Queue for review — create suggestion notification
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "deal-autofill",
      payload: { ...actionPayload, queuedReason: decision.reason },
      graceMs: 0,
    });

    if (userId) {
      await sendNotification({
        tenantId,
        userId,
        type: "deal_risk",
        title: `Suggestion: update deal ${field}`,
        body: reason,
        entityType: "deal",
        entityId: dealId,
      }).catch((err) =>
        logger.warn("deal-autofill: notification failed", { err }),
      );
    }

    return "queued";
  }
}

/**
 * Apply a deal.properties sub-field update through approval mode.
 */
async function applyDealPropertiesUpdate(params: {
  tenantId: string;
  dealId: string;
  userId: string | null;
  mode: ApprovalModeV2;
  propertyKey: string;
  propertyValue: unknown;
  confidence: number;
  sourceType: "email" | "meeting";
  signalType: string;
  reason: string;
}): Promise<FieldUpdateOutcome> {
  const {
    tenantId, dealId, userId, mode, propertyKey, propertyValue,
    confidence, sourceType, signalType, reason,
  } = params;

  const decision = enforceAgentApprovalMode({
    mode,
    action: "deal-stage-change" as GuardedAction,
    confidence,
  });

  const actionPayload = {
    dealId,
    update: { [propertyKey]: propertyValue },
    field: `properties.${propertyKey}`,
    type: "deal_autofill",
    sourceType,
    signalType,
    reason,
  };

  if (decision.allowed) {
    try {
      // Read current properties to merge
      const [current] = await db
        .select({ properties: deals.properties })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);

      const props = ((current?.properties || {}) as Record<string, unknown>);
      await db
        .update(deals)
        .set({
          properties: { ...props, [propertyKey]: propertyValue },
          updatedAt: new Date(),
        })
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-autofill",
        payload: actionPayload,
      });

      return "executed";
    } catch (err) {
      logger.warn("deal-autofill: properties update failed", {
        propertyKey,
        dealId,
        err,
      });
      return "skipped";
    }
  } else {
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "deal-autofill",
      payload: { ...actionPayload, queuedReason: decision.reason },
      graceMs: 0,
    });

    if (userId) {
      await sendNotification({
        tenantId,
        userId,
        type: "deal_risk",
        title: `Suggestion: update deal ${propertyKey}`,
        body: reason,
        entityType: "deal",
        entityId: dealId,
      }).catch((err) =>
        logger.warn("deal-autofill: notification failed", { err }),
      );
    }

    return "queued";
  }
}

/**
 * Link a contact as decision_maker on a deal via the contact's tags.
 */
async function applyAuthorityLink(params: {
  tenantId: string;
  dealId: string;
  contactId: string;
  userId: string | null;
  mode: ApprovalModeV2;
  confidence: number;
  sourceType: "email" | "meeting";
  evidence: string;
}): Promise<FieldUpdateOutcome> {
  const {
    tenantId, dealId, contactId, userId, mode,
    confidence, sourceType, evidence,
  } = params;

  const decision = enforceAgentApprovalMode({
    mode,
    action: "contact-update" as GuardedAction,
    confidence,
  });

  const actionPayload = {
    dealId,
    contactId,
    update: { tag: "decision_maker" },
    type: "deal_autofill_authority",
    sourceType,
    evidence: evidence.slice(0, 200),
  };

  if (decision.allowed) {
    try {
      const [contact] = await db
        .select({ properties: contacts.properties })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
        .limit(1);

      if (contact) {
        const props = (contact.properties || {}) as Record<string, unknown>;
        const tags = Array.isArray(props.tags) ? [...props.tags] : [];
        if (!tags.includes("decision_maker")) {
          tags.push("decision_maker");
          await db
            .update(contacts)
            .set({
              properties: { ...props, tags },
              updatedAt: new Date(),
            })
            .where(eq(contacts.id, contactId));
        }
      }

      // Also record the authority on the deal's properties
      const [deal] = await db
        .select({ properties: deals.properties })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);

      if (deal) {
        const dealProps = (deal.properties || {}) as Record<string, unknown>;
        await db
          .update(deals)
          .set({
            properties: {
              ...dealProps,
              decisionMakerContactId: contactId,
            },
            updatedAt: new Date(),
          })
          .where(eq(deals.id, dealId));
      }

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-autofill",
        payload: actionPayload,
      });

      return "executed";
    } catch (err) {
      logger.warn("deal-autofill: authority link failed", { dealId, contactId, err });
      return "skipped";
    }
  } else {
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "deal-autofill",
      payload: { ...actionPayload, queuedReason: decision.reason },
      graceMs: 0,
    });

    return "queued";
  }
}

/**
 * Get the first user in a tenant (for founder-led single-user tenants).
 */
async function getFirstTenantUser(tenantId: string): Promise<string | null> {
  try {
    const { users } = await import("@/db/schema");
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1);
    return user?.id || null;
  } catch {
    return null;
  }
}
