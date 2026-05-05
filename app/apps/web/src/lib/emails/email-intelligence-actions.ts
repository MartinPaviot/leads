/**
 * Email Intelligence Action Chains
 *
 * When email thread intelligence detects specific signals,
 * automatically trigger CRM updates:
 *
 * Signal -> Action mapping:
 * - budget_mentioned     -> update deal value estimate + create task "Confirm budget"
 * - timeline_discussed   -> update deal expectedCloseDate + create task "Lock timeline"
 * - authority_identified -> tag contact as decision_maker
 * - competitor_mentioned -> add competitor to deal metadata + send alert
 * - objection_raised     -> create task "Address objection: {summary}"
 * - urgency_high         -> bump deal priority + send notification
 * - positive_sentiment_shift -> suggest deal stage progression
 * - negative_sentiment_shift -> flag deal as at_risk
 *
 * All actions go through the approval mode system. Auto-execute
 * only at sufficient trust level. This ensures the tenant always
 * has visibility into what the agent is doing on their behalf.
 */

import { db } from "@/db";
import { deals, contacts, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  enforceAgentApprovalMode,
  readApprovalMode,
  type GuardedAction,
} from "@/lib/guardrails/approval-mode";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { recordAgentAction } from "@/lib/agents/agent-actions";
import { sendNotification } from "@/lib/emails/notifications";
import type { ThreadIntelligence, BuyingSignal, Objection } from "@/lib/emails/email-intelligence";
import { autofillDealFromIntelligence } from "@/lib/deals/deal-autofill";
import logger from "@/lib/observability/logger";

// ── Public Types ──────────────────────────────────────────────

export interface IntelligenceActionResult {
  /** Total actions created (both auto-executed and queued) */
  actionsCreated: number;
  /** Actions that were auto-dispatched (high confidence + auto mode) */
  actionsAutoExecuted: number;
  /** Actions queued for human review */
  actionsQueued: number;
  /** Details of each action taken */
  details: ActionDetail[];
}

interface ActionDetail {
  signal: string;
  action: string;
  status: "auto-executed" | "queued" | "skipped";
  reason: string;
}

// ── Confidence scores for each signal type ────────────────────
// These represent how confident we are that the action is correct
// given the signal. Higher confidence = more likely to auto-execute.

const SIGNAL_CONFIDENCE: Record<string, number> = {
  // BANT signals: well-defined, high confidence
  budget_mentioned: 0.75,
  timeline_discussed: 0.75,
  authority_identified: 0.80,
  need_identified: 0.70,

  // Competitor intelligence: reliable extraction
  competitor_mentioned: 0.85,

  // Objection handling: always needs human attention
  objection_raised: 0.70,

  // Urgency: clear from the intelligence
  urgency_high: 0.80,

  // Sentiment shifts: inferred, lower confidence
  positive_sentiment_shift: 0.65,
  negative_sentiment_shift: 0.70,
};

// ── Main processor ────────────────────────────────────────────

/**
 * Process thread intelligence and create appropriate CRM actions.
 *
 * This is called after `extractAndPersistThreadIntelligence` completes.
 * It reads the intelligence, maps signals to actions, and routes each
 * action through the approval mode guardrail.
 *
 * @param intelligence - The extracted thread intelligence
 * @param tenantId - Tenant this intelligence belongs to
 * @param dealId - Optional deal to update (if thread is linked to a deal)
 * @param contactId - Optional contact to update (if thread is linked to a contact)
 */
export async function processIntelligenceActions(
  intelligence: ThreadIntelligence,
  tenantId: string,
  dealId?: string,
  contactId?: string,
): Promise<IntelligenceActionResult> {
  const result: IntelligenceActionResult = {
    actionsCreated: 0,
    actionsAutoExecuted: 0,
    actionsQueued: 0,
    details: [],
  };

  try {
    // Load tenant settings for approval mode
    const settings = await getTenantSettings(tenantId);
    const mode = readApprovalMode(settings);

    // Find the first user in the tenant for notifications/assignments
    // (for single-user tenants like founder-led sales, this is the founder)
    const tenantUserId = await getFirstTenantUser(tenantId);

    // Process each signal type
    const processors: Array<() => Promise<void>> = [];

    // 1. BANT signals from buying signals
    for (const signal of intelligence.signals) {
      switch (signal.type) {
        case "budget":
          processors.push(() =>
            processBudgetSignal(signal, tenantId, dealId, mode, tenantUserId, result),
          );
          break;
        case "timeline":
          processors.push(() =>
            processTimelineSignal(signal, tenantId, dealId, mode, tenantUserId, result),
          );
          break;
        case "authority":
          processors.push(() =>
            processAuthoritySignal(signal, tenantId, contactId, mode, tenantUserId, result),
          );
          break;
      }
    }

    // 2. Competitor mentions
    if (intelligence.competitors.length > 0) {
      processors.push(() =>
        processCompetitorSignals(
          intelligence.competitors,
          tenantId,
          dealId,
          mode,
          tenantUserId,
          result,
        ),
      );
    }

    // 3. Objections
    for (const objection of intelligence.objections) {
      if (objection.status === "raised" || objection.status === "unresolved") {
        processors.push(() =>
          processObjectionSignal(objection, tenantId, dealId, mode, tenantUserId, result),
        );
      }
    }

    // 4. Urgency
    if (intelligence.urgencyLevel === "high") {
      processors.push(() =>
        processUrgencySignal(tenantId, dealId, mode, tenantUserId, result),
      );
    }

    // 5. Sentiment shifts
    if (intelligence.sentimentTrend === "improving" && intelligence.sentiment === "positive") {
      processors.push(() =>
        processPositiveSentimentShift(tenantId, dealId, mode, tenantUserId, result),
      );
    }
    if (intelligence.sentimentTrend === "declining" && intelligence.sentiment === "negative") {
      processors.push(() =>
        processNegativeSentimentShift(tenantId, dealId, mode, tenantUserId, result),
      );
    }

    // Execute all processors sequentially (to avoid race conditions on the same deal)
    for (const processor of processors) {
      await processor();
    }

    // ── Deal auto-fill: update deal fields directly from signals ──
    // This closes competitive gap #2 — Rox/Monaco auto-populate deal
    // fields from conversations; without this, Elevay requires manual entry.
    if (dealId) {
      try {
        const autofillResult = await autofillDealFromIntelligence({
          dealId,
          tenantId,
          intelligence,
          sourceType: "email",
          contactId,
        });
        logger.info("email-intelligence-actions: deal autofill complete", {
          dealId,
          fieldsUpdated: autofillResult.fieldsUpdated,
          suggestionsCreated: autofillResult.suggestionsCreated,
        });
      } catch (err) {
        logger.warn("email-intelligence-actions: deal autofill failed", {
          dealId,
          err,
        });
      }
    }
  } catch (err) {
    logger.warn("email-intelligence-actions: processing failed", {
      tenantId,
      threadId: intelligence.threadId,
      err,
    });
  }

  return result;
}

// ── Signal processors ─────────────────────────────────────────

async function processBudgetSignal(
  signal: BuyingSignal,
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  // Create task: "Confirm budget"
  await createIntelligenceTask({
    tenantId,
    dealId,
    userId,
    mode,
    title: `Confirm budget: "${signal.evidence.slice(0, 80)}"`,
    description:
      `Budget signal detected in email thread (confidence: ${(signal.confidence * 100).toFixed(0)}%).\n\n` +
      `Evidence: "${signal.evidence}"\n\n` +
      `Action: Follow up to confirm the budget figure and timeline for allocation.`,
    priority: "high",
    confidence: SIGNAL_CONFIDENCE.budget_mentioned,
    signalName: "budget_mentioned",
    result,
  });

  // If we have a deal, try to extract a numeric value from the evidence
  if (dealId) {
    const extractedValue = extractNumericValue(signal.evidence);
    if (extractedValue !== null) {
      await createDealUpdateAction({
        tenantId,
        dealId,
        userId,
        mode,
        updateField: "value",
        updateValue: extractedValue,
        confidence: signal.confidence * 0.8, // Discount: extracted value may be imprecise
        signalName: "budget_mentioned",
        reason: `Budget of ~$${extractedValue.toLocaleString()} mentioned: "${signal.evidence.slice(0, 100)}"`,
        result,
      });
    }
  }
}

async function processTimelineSignal(
  signal: BuyingSignal,
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  // Create task: "Lock timeline"
  await createIntelligenceTask({
    tenantId,
    dealId,
    userId,
    mode,
    title: `Lock timeline: "${signal.evidence.slice(0, 80)}"`,
    description:
      `Timeline signal detected (confidence: ${(signal.confidence * 100).toFixed(0)}%).\n\n` +
      `Evidence: "${signal.evidence}"\n\n` +
      `Action: Confirm the timeline and get a specific date commitment.`,
    priority: "high",
    confidence: SIGNAL_CONFIDENCE.timeline_discussed,
    signalName: "timeline_discussed",
    result,
  });

  // If we have a deal, try to extract a date from the evidence
  if (dealId) {
    const extractedDate = extractDateFromText(signal.evidence);
    if (extractedDate) {
      await createDealUpdateAction({
        tenantId,
        dealId,
        userId,
        mode,
        updateField: "expectedCloseDate",
        updateValue: extractedDate.toISOString(),
        confidence: signal.confidence * 0.7, // Discount: extracted date may be approximate
        signalName: "timeline_discussed",
        reason: `Timeline mentioned: "${signal.evidence.slice(0, 100)}"`,
        result,
      });
    }
  }
}

async function processAuthoritySignal(
  signal: BuyingSignal,
  tenantId: string,
  contactId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  if (!contactId) {
    result.details.push({
      signal: "authority_identified",
      action: "tag_decision_maker",
      status: "skipped",
      reason: "No contact linked to this thread",
    });
    return;
  }

  const decision = enforceAgentApprovalMode({
    mode,
    action: "contact-update",
    confidence: SIGNAL_CONFIDENCE.authority_identified,
  });

  const actionPayload = {
    contactId,
    update: { tag: "decision_maker" },
    evidence: signal.evidence,
  };

  if (decision.allowed) {
    // Auto-execute: tag the contact as decision maker
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

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "contact-update",
        payload: actionPayload,
      });

      result.actionsCreated++;
      result.actionsAutoExecuted++;
      result.details.push({
        signal: "authority_identified",
        action: "tag_decision_maker",
        status: "auto-executed",
        reason: decision.reason,
      });
    } catch (err) {
      logger.warn("email-intelligence-actions: authority signal failed", { err });
    }
  } else {
    // Queue for review
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "contact-update",
      payload: { ...actionPayload, queuedReason: decision.reason },
      graceMs: 0,
    });

    result.actionsCreated++;
    result.actionsQueued++;
    result.details.push({
      signal: "authority_identified",
      action: "tag_decision_maker",
      status: "queued",
      reason: decision.reason,
    });
  }
}

async function processCompetitorSignals(
  competitors: string[],
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  if (!dealId) {
    result.details.push({
      signal: "competitor_mentioned",
      action: "add_competitors_to_deal",
      status: "skipped",
      reason: "No deal linked to this thread",
    });
    return;
  }

  // Add competitors to deal metadata
  const decision = enforceAgentApprovalMode({
    mode,
    action: "deal-stage-change", // Using deal-stage-change as the closest guarded action
    confidence: SIGNAL_CONFIDENCE.competitor_mentioned,
  });

  const actionPayload = {
    dealId,
    update: { competitors },
    type: "competitor_metadata_update",
  };

  if (decision.allowed) {
    try {
      const [deal] = await db
        .select({ properties: deals.properties })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);

      if (deal) {
        const props = (deal.properties || {}) as Record<string, unknown>;
        const existing = Array.isArray(props.competitors) ? props.competitors : [];
        const merged = [...new Set([...existing.map(String), ...competitors])];

        await db
          .update(deals)
          .set({
            properties: { ...props, competitors: merged },
            updatedAt: new Date(),
          })
          .where(eq(deals.id, dealId));
      }

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-metadata-update",
        payload: actionPayload,
      });

      result.actionsCreated++;
      result.actionsAutoExecuted++;
      result.details.push({
        signal: "competitor_mentioned",
        action: `add_competitors: ${competitors.join(", ")}`,
        status: "auto-executed",
        reason: decision.reason,
      });
    } catch (err) {
      logger.warn("email-intelligence-actions: competitor signal failed", { err });
    }
  } else {
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "deal-metadata-update",
      payload: { ...actionPayload, queuedReason: decision.reason },
    });

    result.actionsCreated++;
    result.actionsQueued++;
    result.details.push({
      signal: "competitor_mentioned",
      action: `add_competitors: ${competitors.join(", ")}`,
      status: "queued",
      reason: decision.reason,
    });
  }

  // Send alert notification about competitor mention
  if (userId) {
    await sendNotification({
      tenantId,
      userId,
      type: "deal_risk",
      title: `Competitor mentioned: ${competitors.join(", ")}`,
      body: `Competitors were mentioned in an email thread${dealId ? " linked to a deal" : ""}. Review the conversation for competitive positioning.`,
      entityType: dealId ? "deal" : undefined,
      entityId: dealId,
    }).catch((err) =>
      logger.warn("email-intelligence-actions: notification failed", { err }),
    );
  }
}

async function processObjectionSignal(
  objection: Objection,
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  await createIntelligenceTask({
    tenantId,
    dealId,
    userId,
    mode,
    title: `Address objection (${objection.category}): ${objection.summary.slice(0, 80)}`,
    description:
      `Objection detected in email thread.\n\n` +
      `Category: ${objection.category}\n` +
      `Status: ${objection.status}\n` +
      `Summary: ${objection.summary}\n\n` +
      `Action: Prepare a response that directly addresses this concern.`,
    priority: objection.status === "unresolved" ? "high" : "medium",
    confidence: SIGNAL_CONFIDENCE.objection_raised,
    signalName: "objection_raised",
    result,
  });
}

async function processUrgencySignal(
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  // Bump deal priority if we have a deal
  if (dealId) {
    const decision = enforceAgentApprovalMode({
      mode,
      action: "deal-stage-change",
      confidence: SIGNAL_CONFIDENCE.urgency_high,
    });

    const actionPayload = {
      dealId,
      update: { priority: "high" },
      type: "priority_bump",
    };

    if (decision.allowed) {
      try {
        const [deal] = await db
          .select({ properties: deals.properties })
          .from(deals)
          .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
          .limit(1);

        if (deal) {
          const props = (deal.properties || {}) as Record<string, unknown>;
          await db
            .update(deals)
            .set({
              properties: { ...props, priority: "high", urgencyDetectedAt: new Date().toISOString() },
              updatedAt: new Date(),
            })
            .where(eq(deals.id, dealId));
        }

        await recordAgentAction({
          tenantId,
          userId,
          actionType: "deal-priority-update",
          payload: actionPayload,
        });

        result.actionsCreated++;
        result.actionsAutoExecuted++;
        result.details.push({
          signal: "urgency_high",
          action: "bump_deal_priority",
          status: "auto-executed",
          reason: decision.reason,
        });
      } catch (err) {
        logger.warn("email-intelligence-actions: urgency signal failed", { err });
      }
    } else {
      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-priority-update",
        payload: { ...actionPayload, queuedReason: decision.reason },
      });

      result.actionsCreated++;
      result.actionsQueued++;
      result.details.push({
        signal: "urgency_high",
        action: "bump_deal_priority",
        status: "queued",
        reason: decision.reason,
      });
    }
  }

  // Send notification regardless
  if (userId) {
    await sendNotification({
      tenantId,
      userId,
      type: "deal_risk",
      title: "High urgency detected in email thread",
      body: "Explicit time pressure detected (deadline, board meeting, contract expiry). Consider prioritizing this deal.",
      entityType: dealId ? "deal" : undefined,
      entityId: dealId,
    }).catch((err) =>
      logger.warn("email-intelligence-actions: urgency notification failed", { err }),
    );
  }
}

async function processPositiveSentimentShift(
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  if (!dealId) {
    result.details.push({
      signal: "positive_sentiment_shift",
      action: "suggest_stage_progression",
      status: "skipped",
      reason: "No deal linked to this thread",
    });
    return;
  }

  // Create a task suggesting deal stage progression (never auto-execute stage changes)
  await createIntelligenceTask({
    tenantId,
    dealId,
    userId,
    mode,
    title: "Review deal for stage progression",
    description:
      `Positive sentiment shift detected in email conversation.\n\n` +
      `The prospect's tone has improved over the course of the thread. ` +
      `Consider whether the deal should be advanced to the next stage.\n\n` +
      `Action: Review the conversation and decide whether to progress the deal.`,
    priority: "medium",
    confidence: SIGNAL_CONFIDENCE.positive_sentiment_shift,
    signalName: "positive_sentiment_shift",
    result,
  });
}

async function processNegativeSentimentShift(
  tenantId: string,
  dealId: string | undefined,
  mode: ReturnType<typeof readApprovalMode>,
  userId: string | null,
  result: IntelligenceActionResult,
): Promise<void> {
  if (!dealId) {
    result.details.push({
      signal: "negative_sentiment_shift",
      action: "flag_deal_at_risk",
      status: "skipped",
      reason: "No deal linked to this thread",
    });
    return;
  }

  // Flag deal as at-risk
  const decision = enforceAgentApprovalMode({
    mode,
    action: "deal-stage-change",
    confidence: SIGNAL_CONFIDENCE.negative_sentiment_shift,
  });

  const actionPayload = {
    dealId,
    update: { atRisk: true },
    type: "risk_flag",
  };

  if (decision.allowed) {
    try {
      const [deal] = await db
        .select({ properties: deals.properties })
        .from(deals)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
        .limit(1);

      if (deal) {
        const props = (deal.properties || {}) as Record<string, unknown>;
        await db
          .update(deals)
          .set({
            properties: { ...props, atRisk: true, riskDetectedAt: new Date().toISOString() },
            updatedAt: new Date(),
          })
          .where(eq(deals.id, dealId));
      }

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-risk-flag",
        payload: actionPayload,
      });

      result.actionsCreated++;
      result.actionsAutoExecuted++;
      result.details.push({
        signal: "negative_sentiment_shift",
        action: "flag_deal_at_risk",
        status: "auto-executed",
        reason: decision.reason,
      });
    } catch (err) {
      logger.warn("email-intelligence-actions: risk flag failed", { err });
    }
  } else {
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "deal-risk-flag",
      payload: { ...actionPayload, queuedReason: decision.reason },
    });

    result.actionsCreated++;
    result.actionsQueued++;
    result.details.push({
      signal: "negative_sentiment_shift",
      action: "flag_deal_at_risk",
      status: "queued",
      reason: decision.reason,
    });
  }

  // Always notify about risk
  if (userId) {
    await sendNotification({
      tenantId,
      userId,
      type: "deal_risk",
      title: "Deal at risk: negative sentiment detected",
      body: "Prospect sentiment is declining in the email conversation. Review the thread for concerns that need addressing.",
      entityType: "deal",
      entityId: dealId,
    }).catch((err) =>
      logger.warn("email-intelligence-actions: risk notification failed", { err }),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Create a task through the approval mode system.
 * Tasks are lower-risk actions, so they are more likely to auto-execute.
 */
async function createIntelligenceTask(params: {
  tenantId: string;
  dealId: string | undefined;
  userId: string | null;
  mode: ReturnType<typeof readApprovalMode>;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  confidence: number;
  signalName: string;
  result: IntelligenceActionResult;
}): Promise<void> {
  const { tenantId, dealId, userId, mode, title, description, priority, confidence, signalName, result } = params;

  const decision = enforceAgentApprovalMode({
    mode,
    action: "task-create",
    confidence,
  });

  const taskPayload = {
    title,
    description,
    priority,
    entityType: dealId ? "deal" : undefined,
    entityId: dealId,
    source: `email-intelligence:${signalName}`,
  };

  if (decision.allowed) {
    try {
      await db.insert(tasks).values({
        tenantId,
        assigneeId: userId,
        entityType: dealId ? "deal" : undefined,
        entityId: dealId,
        title,
        description,
        priority,
        status: "pending",
      });

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "task-create",
        payload: taskPayload,
      });

      result.actionsCreated++;
      result.actionsAutoExecuted++;
      result.details.push({
        signal: signalName,
        action: `create_task: ${title.slice(0, 60)}`,
        status: "auto-executed",
        reason: decision.reason,
      });
    } catch (err) {
      logger.warn("email-intelligence-actions: task creation failed", { err });
    }
  } else {
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "task-create",
      payload: { ...taskPayload, queuedReason: decision.reason },
    });

    result.actionsCreated++;
    result.actionsQueued++;
    result.details.push({
      signal: signalName,
      action: `create_task: ${title.slice(0, 60)}`,
      status: "queued",
      reason: decision.reason,
    });
  }
}

/**
 * Create a deal update action through the approval mode system.
 */
async function createDealUpdateAction(params: {
  tenantId: string;
  dealId: string;
  userId: string | null;
  mode: ReturnType<typeof readApprovalMode>;
  updateField: string;
  updateValue: unknown;
  confidence: number;
  signalName: string;
  reason: string;
  result: IntelligenceActionResult;
}): Promise<void> {
  const { tenantId, dealId, userId, mode, updateField, updateValue, confidence, signalName, reason, result } = params;

  // Deal value and date updates use "deal-stage-change" threshold as the closest
  // high-impact action type
  const decision = enforceAgentApprovalMode({
    mode,
    action: "deal-stage-change",
    confidence,
  });

  const actionPayload = {
    dealId,
    update: { [updateField]: updateValue },
    type: "deal_field_update",
    reason,
    source: `email-intelligence:${signalName}`,
  };

  if (decision.allowed) {
    try {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updateField === "value" && typeof updateValue === "number") {
        updateData.value = updateValue;
      } else if (updateField === "expectedCloseDate" && typeof updateValue === "string") {
        updateData.expectedCloseDate = new Date(updateValue);
      }

      await db
        .update(deals)
        .set(updateData)
        .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));

      await recordAgentAction({
        tenantId,
        userId,
        actionType: "deal-field-update",
        payload: actionPayload,
      });

      result.actionsCreated++;
      result.actionsAutoExecuted++;
      result.details.push({
        signal: signalName,
        action: `update_deal.${updateField}`,
        status: "auto-executed",
        reason: decision.reason,
      });
    } catch (err) {
      logger.warn("email-intelligence-actions: deal update failed", { err });
    }
  } else {
    await recordAgentAction({
      tenantId,
      userId,
      actionType: "deal-field-update",
      payload: { ...actionPayload, queuedReason: decision.reason },
    });

    result.actionsCreated++;
    result.actionsQueued++;
    result.details.push({
      signal: signalName,
      action: `update_deal.${updateField}`,
      status: "queued",
      reason: decision.reason,
    });
  }
}

/**
 * Get the first user in a tenant (for single-user founder-led sales).
 * Returns null if no users exist.
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

/**
 * Extract a numeric dollar value from text.
 * Handles formats like "$50,000", "$50K", "50k", "$1.2M", etc.
 */
function extractNumericValue(text: string): number | null {
  // Match patterns like $50,000 or $50K or 50k or $1.2M
  const patterns = [
    /\$\s*([\d,]+(?:\.\d+)?)\s*(?:million|m)\b/i,
    /\$\s*([\d,]+(?:\.\d+)?)\s*(?:thousand|k)\b/i,
    /\$\s*([\d,]+(?:\.\d+)?)\b/,
    /([\d,]+(?:\.\d+)?)\s*(?:million|m)\s*(?:dollars?|usd|eur|gbp)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:thousand|k)\s*(?:dollars?|usd|eur|gbp)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:dollars?|usd)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, "");
      const num = parseFloat(numStr);
      if (!isFinite(num) || num <= 0) continue;

      const fullMatch = match[0].toLowerCase();
      if (fullMatch.includes("million") || fullMatch.match(/\bm\b/)) {
        return Math.round(num * 1_000_000);
      }
      if (fullMatch.includes("thousand") || fullMatch.match(/\bk\b/)) {
        return Math.round(num * 1_000);
      }
      return Math.round(num);
    }
  }

  return null;
}

/**
 * Extract a date from text.
 * Handles patterns like "by end of Q2", "next month", "January 15th",
 * "by end of quarter", "in 2 weeks", etc.
 */
function extractDateFromText(text: string): Date | null {
  const now = new Date();
  const lower = text.toLowerCase();

  // Explicit dates: "January 15", "Jan 15, 2026", "2026-01-15"
  const explicitDate = new Date(text);
  if (!isNaN(explicitDate.getTime()) && explicitDate > now) {
    return explicitDate;
  }

  // Quarter references
  const quarterMatch = lower.match(/(?:end of |by )?\bq([1-4])\b/);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1], 10);
    const year = now.getMonth() >= (quarter - 1) * 3 ? now.getFullYear() + 1 : now.getFullYear();
    const endMonth = quarter * 3;
    return new Date(year, endMonth, 0); // Last day of the quarter
  }

  // Relative time: "next month", "in 2 weeks", "next week"
  if (lower.includes("next month")) {
    return new Date(now.getFullYear(), now.getMonth() + 2, 0);
  }
  if (lower.includes("next week")) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  const weeksMatch = lower.match(/in (\d+) weeks?/);
  if (weeksMatch) {
    return new Date(now.getTime() + parseInt(weeksMatch[1], 10) * 7 * 24 * 60 * 60 * 1000);
  }
  if (lower.includes("end of year")) {
    return new Date(now.getFullYear(), 11, 31);
  }

  return null;
}
