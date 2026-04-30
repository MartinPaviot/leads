/**
 * Real-Time Signal Detection
 *
 * Evaluates signals immediately when events occur, instead of
 * waiting for a weekly/daily batch scan.
 *
 * Event triggers:
 * - Email synced (new inbound/outbound email)
 * - Meeting completed (transcript processed)
 * - Enrichment completed (company data updated via Apollo)
 * - Contact updated (profile changes)
 * - Deal stage changed
 *
 * For each event, evaluates (fast heuristics only, no LLM):
 * - Hiring signals (new job postings in enrichment data)
 * - Funding signals (new funding rounds)
 * - Engagement velocity (response time, meeting frequency)
 * - Competitor mentions (keyword scan on email/meeting content)
 * - Champion emergence (repeated positive engagement in 14 days)
 * - Expansion signals (multi-department engagement)
 * - Risk signals (declining engagement, negative sentiment)
 */

import { db } from "@/db";
import { activities, contacts, companies, deals, notifications, users } from "@/db/schema";
import { and, eq, gte, desc, sql, notInArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalTriggerEvent =
  | { type: "email_synced"; tenantId: string; activityId: string; contactId?: string; companyId?: string }
  | { type: "meeting_completed"; tenantId: string; activityId: string; dealId?: string }
  | { type: "enrichment_completed"; tenantId: string; companyId: string }
  | { type: "contact_updated"; tenantId: string; contactId: string }
  | { type: "deal_stage_changed"; tenantId: string; dealId: string; fromStage: string; toStage: string };

export interface DetectedSignal {
  type: string;
  entityType: "contact" | "company" | "deal";
  entityId: string;
  confidence: number;
  detail: string;
}

export interface EvaluationResult {
  signalsDetected: DetectedSignal[];
  notificationsSent: number;
}

// ---------------------------------------------------------------------------
// Competitor keywords (configurable per tenant in future)
// ---------------------------------------------------------------------------

const DEFAULT_COMPETITOR_KEYWORDS = [
  "hubspot", "salesforce", "pipedrive", "close.com", "apollo",
  "outreach", "salesloft", "gong", "chorus", "clari",
  "rox", "monaco", "attio", "folk", "affinity",
];

// Hiring role keywords that indicate growth / buying intent
const HIRING_ROLE_KEYWORDS = [
  "sales", "account executive", "sdr", "bdr", "revenue",
  "growth", "marketing", "demand gen", "customer success",
  "head of", "vp of", "director of", "chief",
];

// Risk keywords in email content
const RISK_KEYWORDS = [
  "cancel", "not interested", "unsubscribe", "remove me",
  "going with", "chose", "decided against", "no longer",
  "budget cut", "freeze", "postpone", "delay",
];

// ---------------------------------------------------------------------------
// Core evaluation function
// ---------------------------------------------------------------------------

export async function evaluateSignalsRealTime(
  event: SignalTriggerEvent,
): Promise<EvaluationResult> {
  const signals: DetectedSignal[] = [];

  switch (event.type) {
    case "email_synced":
      signals.push(...(await evaluateEmailSignals(event)));
      break;

    case "meeting_completed":
      signals.push(...(await evaluateMeetingSignals(event)));
      break;

    case "enrichment_completed":
      signals.push(...(await evaluateEnrichmentSignals(event)));
      break;

    case "contact_updated":
      signals.push(...(await evaluateContactUpdateSignals(event)));
      break;

    case "deal_stage_changed":
      signals.push(...(await evaluateDealStageSignals(event)));
      break;
  }

  // Send notifications for high-confidence signals
  let notificationsSent = 0;
  if (signals.length > 0) {
    notificationsSent = await sendSignalNotifications(event.tenantId, signals);
  }

  return { signalsDetected: signals, notificationsSent };
}

// ---------------------------------------------------------------------------
// Email signal evaluation
// ---------------------------------------------------------------------------

async function evaluateEmailSignals(
  event: Extract<SignalTriggerEvent, { type: "email_synced" }>,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  // Load the activity
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, event.activityId))
    .limit(1);

  if (!activity) return signals;

  const content = ((activity.rawContent || "") + " " + (activity.summary || "")).toLowerCase();
  const contactId = event.contactId || activity.entityId;
  const companyId = event.companyId;

  // 1. Competitor mentions
  const mentionedCompetitors = DEFAULT_COMPETITOR_KEYWORDS.filter((kw) =>
    content.includes(kw.toLowerCase()),
  );
  if (mentionedCompetitors.length > 0) {
    signals.push({
      type: "competitor_mention",
      entityType: "contact",
      entityId: contactId || "unknown",
      confidence: Math.min(0.9, 0.6 + mentionedCompetitors.length * 0.1),
      detail: `Competitor${mentionedCompetitors.length > 1 ? "s" : ""} mentioned in email: ${mentionedCompetitors.join(", ")}`,
    });
  }

  // 2. Risk signals from content
  const matchedRiskKeywords = RISK_KEYWORDS.filter((kw) =>
    content.includes(kw.toLowerCase()),
  );
  if (matchedRiskKeywords.length > 0 && activity.direction === "inbound") {
    signals.push({
      type: "risk_negative_reply",
      entityType: "contact",
      entityId: contactId || "unknown",
      confidence: Math.min(0.85, 0.5 + matchedRiskKeywords.length * 0.15),
      detail: `Risk keywords detected in inbound email: ${matchedRiskKeywords.join(", ")}`,
    });
  }

  // 3. Sentiment-based risk
  if (activity.sentiment === "negative" && activity.direction === "inbound") {
    signals.push({
      type: "risk_negative_sentiment",
      entityType: "contact",
      entityId: contactId || "unknown",
      confidence: 0.7,
      detail: `Negative sentiment detected in inbound email: "${(activity.summary || "").slice(0, 80)}"`,
    });
  }

  // 4. Champion emergence: check if this contact has 3+ positive inbound
  //    interactions in the last 14 days
  if (contactId && contactId !== "unknown" && activity.direction === "inbound") {
    const championSignals = await detectChampionEmergence(
      event.tenantId,
      contactId,
    );
    signals.push(...championSignals);
  }

  // 5. Engagement velocity: fast response time
  if (
    contactId &&
    contactId !== "unknown" &&
    activity.direction === "inbound" &&
    activity.threadId
  ) {
    const velocitySignals = await detectEngagementVelocity(
      event.tenantId,
      contactId,
      activity.threadId,
      activity.occurredAt || new Date(),
    );
    signals.push(...velocitySignals);
  }

  // 6. Expansion: multi-department engagement
  if (companyId) {
    const expansionSignals = await detectExpansionSignals(
      event.tenantId,
      companyId,
    );
    signals.push(...expansionSignals);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Meeting signal evaluation
// ---------------------------------------------------------------------------

async function evaluateMeetingSignals(
  event: Extract<SignalTriggerEvent, { type: "meeting_completed" }>,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, event.activityId))
    .limit(1);

  if (!activity) return signals;

  const content = ((activity.rawContent || "") + " " + (activity.summary || "")).toLowerCase();
  const meta = (activity.metadata || {}) as Record<string, unknown>;
  const attendees = (meta.attendees || []) as Array<{
    email: string;
    contactId?: string;
  }>;

  // 1. Competitor mentions in meeting notes
  const mentionedCompetitors = DEFAULT_COMPETITOR_KEYWORDS.filter((kw) =>
    content.includes(kw.toLowerCase()),
  );
  if (mentionedCompetitors.length > 0) {
    signals.push({
      type: "competitor_mention",
      entityType: activity.entityType === "deal" ? "deal" : "contact",
      entityId: event.dealId || activity.entityId,
      confidence: Math.min(0.9, 0.65 + mentionedCompetitors.length * 0.1),
      detail: `Competitor${mentionedCompetitors.length > 1 ? "s" : ""} discussed in meeting: ${mentionedCompetitors.join(", ")}`,
    });
  }

  // 2. Multi-attendee meetings (engagement breadth)
  if (attendees.length >= 3) {
    signals.push({
      type: "multi_stakeholder_meeting",
      entityType: activity.entityType === "deal" ? "deal" : "contact",
      entityId: event.dealId || activity.entityId,
      confidence: Math.min(0.85, 0.5 + attendees.length * 0.1),
      detail: `Meeting with ${attendees.length} attendees -- multi-stakeholder engagement`,
    });
  }

  // 3. Positive meeting sentiment
  if (activity.sentiment === "positive") {
    signals.push({
      type: "positive_meeting",
      entityType: activity.entityType === "deal" ? "deal" : "contact",
      entityId: event.dealId || activity.entityId,
      confidence: 0.75,
      detail: `Meeting completed with positive sentiment: "${(activity.summary || "").slice(0, 80)}"`,
    });
  }

  // 4. Risk from meeting content
  const matchedRiskKeywords = RISK_KEYWORDS.filter((kw) =>
    content.includes(kw.toLowerCase()),
  );
  if (matchedRiskKeywords.length > 0) {
    signals.push({
      type: "risk_meeting_concern",
      entityType: activity.entityType === "deal" ? "deal" : "contact",
      entityId: event.dealId || activity.entityId,
      confidence: Math.min(0.8, 0.45 + matchedRiskKeywords.length * 0.15),
      detail: `Risk keywords in meeting notes: ${matchedRiskKeywords.join(", ")}`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Enrichment signal evaluation
// ---------------------------------------------------------------------------

async function evaluateEnrichmentSignals(
  event: Extract<SignalTriggerEvent, { type: "enrichment_completed" }>,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, event.companyId))
    .limit(1);

  if (!company) return signals;

  const props = (company.properties || {}) as Record<string, unknown>;

  // 1. Funding signals
  const fundingStage = props.latest_funding_stage as string | undefined;
  const enrichedAt = props.enriched_at as string | undefined;
  if (fundingStage && enrichedAt) {
    const enrichDate = new Date(enrichedAt);
    const daysSinceEnriched = (Date.now() - enrichDate.getTime()) / 86_400_000;
    // Only signal if enrichment is recent (within 7 days -- indicates fresh data)
    if (daysSinceEnriched <= 7) {
      signals.push({
        type: "funding_detected",
        entityType: "company",
        entityId: event.companyId,
        confidence: 0.8,
        detail: `Funding stage detected: ${fundingStage} (total: ${props.total_funding_printed || "unknown"})`,
      });
    }
  }

  // 2. Hiring signals from job posting data
  const jobPostingIntent = props.jobPostingIntent as {
    signalStrength?: string;
    roles?: string[];
    detectedAt?: string;
  } | undefined;
  if (jobPostingIntent?.signalStrength) {
    const matchedRoles = (jobPostingIntent.roles || []).filter((role) =>
      HIRING_ROLE_KEYWORDS.some((kw) => role.toLowerCase().includes(kw)),
    );
    if (matchedRoles.length > 0 || jobPostingIntent.signalStrength === "high") {
      signals.push({
        type: "hiring_signal",
        entityType: "company",
        entityId: event.companyId,
        confidence: jobPostingIntent.signalStrength === "high" ? 0.85 : 0.65,
        detail: `Hiring signal (${jobPostingIntent.signalStrength}): ${matchedRoles.length > 0 ? matchedRoles.join(", ") : "general growth hiring"}`,
      });
    }
  }

  // 3. Tech stack change
  const techStackChange = props.techStackChange as {
    detectedAt?: string;
    added?: string[];
    removed?: string[];
  } | undefined;
  if (techStackChange?.detectedAt) {
    const changeDate = new Date(techStackChange.detectedAt);
    const daysSinceChange = (Date.now() - changeDate.getTime()) / 86_400_000;
    if (daysSinceChange <= 30) {
      const added = techStackChange.added || [];
      const removed = techStackChange.removed || [];
      signals.push({
        type: "tech_stack_change",
        entityType: "company",
        entityId: event.companyId,
        confidence: 0.7,
        detail: `Tech stack change: ${added.length > 0 ? `added ${added.join(", ")}` : ""}${removed.length > 0 ? ` removed ${removed.join(", ")}` : ""}`.trim(),
      });
    }
  }

  // 4. Leadership change
  const leadershipChange = props.leadershipChange as {
    detectedAt?: string;
    role?: string;
    name?: string;
  } | undefined;
  if (leadershipChange?.detectedAt) {
    const changeDate = new Date(leadershipChange.detectedAt);
    const daysSinceChange = (Date.now() - changeDate.getTime()) / 86_400_000;
    if (daysSinceChange <= 30) {
      signals.push({
        type: "leadership_change",
        entityType: "company",
        entityId: event.companyId,
        confidence: 0.75,
        detail: `Leadership change: ${leadershipChange.name || "unknown"} (${leadershipChange.role || "unknown role"})`,
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Contact update signal evaluation
// ---------------------------------------------------------------------------

async function evaluateContactUpdateSignals(
  event: Extract<SignalTriggerEvent, { type: "contact_updated" }>,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, event.contactId))
    .limit(1);

  if (!contact) return signals;

  const props = (contact.properties || {}) as Record<string, unknown>;

  // 1. Title change (seniority increase = champion/decision-maker)
  const previousTitle = props.previousTitle as string | undefined;
  if (previousTitle && contact.title && previousTitle !== contact.title) {
    const seniorityKeywords = ["vp", "director", "head", "chief", "c-level", "svp", "evp"];
    const isPromotion = seniorityKeywords.some(
      (kw) => contact.title!.toLowerCase().includes(kw) && !previousTitle.toLowerCase().includes(kw),
    );
    if (isPromotion) {
      signals.push({
        type: "contact_promoted",
        entityType: "contact",
        entityId: event.contactId,
        confidence: 0.75,
        detail: `Contact promoted: "${previousTitle}" -> "${contact.title}"`,
      });
    }
  }

  // 2. Champion check on contact update
  const championSignals = await detectChampionEmergence(
    event.tenantId,
    event.contactId,
  );
  signals.push(...championSignals);

  return signals;
}

// ---------------------------------------------------------------------------
// Deal stage change signal evaluation
// ---------------------------------------------------------------------------

async function evaluateDealStageSignals(
  event: Extract<SignalTriggerEvent, { type: "deal_stage_changed" }>,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  // Regression: deal moved backward
  const stageOrder = ["lead", "qualified", "demo", "proposal", "negotiation", "won", "lost"];
  const fromIdx = stageOrder.indexOf(event.fromStage);
  const toIdx = stageOrder.indexOf(event.toStage);

  if (fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx && event.toStage !== "lost") {
    signals.push({
      type: "deal_regression",
      entityType: "deal",
      entityId: event.dealId,
      confidence: 0.8,
      detail: `Deal moved backward: ${event.fromStage} -> ${event.toStage}`,
    });
  }

  // Forward progression
  if (fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx && event.toStage !== "lost") {
    signals.push({
      type: "deal_progression",
      entityType: "deal",
      entityId: event.dealId,
      confidence: 0.9,
      detail: `Deal advanced: ${event.fromStage} -> ${event.toStage}`,
    });
  }

  // Deal lost
  if (event.toStage === "lost") {
    signals.push({
      type: "deal_lost",
      entityType: "deal",
      entityId: event.dealId,
      confidence: 1.0,
      detail: `Deal lost (was at stage: ${event.fromStage})`,
    });
  }

  // Deal won
  if (event.toStage === "won") {
    signals.push({
      type: "deal_won",
      entityType: "deal",
      entityId: event.dealId,
      confidence: 1.0,
      detail: `Deal won (was at stage: ${event.fromStage})`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Champion emergence detector
// ---------------------------------------------------------------------------

export async function detectChampionEmergence(
  tenantId: string,
  contactId: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000);

  const recentPositive = await db
    .select({ id: activities.id, sentiment: activities.sentiment })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityId, contactId),
        eq(activities.entityType, "contact"),
        eq(activities.direction, "inbound"),
        gte(activities.occurredAt, fourteenDaysAgo),
      ),
    );

  const positiveCount = recentPositive.filter(
    (a) => a.sentiment === "positive",
  ).length;
  const totalInbound = recentPositive.length;

  if (positiveCount >= 3) {
    signals.push({
      type: "champion_emergence",
      entityType: "contact",
      entityId: contactId,
      confidence: Math.min(0.9, 0.5 + positiveCount * 0.1),
      detail: `${positiveCount} positive inbound interactions in 14 days (${totalInbound} total) -- possible champion`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Engagement velocity detector
// ---------------------------------------------------------------------------

export async function detectEngagementVelocity(
  tenantId: string,
  contactId: string,
  threadId: string,
  replyTime: Date,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];

  // Find the most recent outbound email in this thread before the reply
  const [lastOutbound] = await db
    .select({ occurredAt: activities.occurredAt })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.threadId, threadId),
        eq(activities.direction, "outbound"),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(1);

  if (!lastOutbound?.occurredAt) return signals;

  const responseTimeHours =
    (replyTime.getTime() - lastOutbound.occurredAt.getTime()) / 3_600_000;

  // Fast response: under 2 hours on a business day
  if (responseTimeHours > 0 && responseTimeHours < 2) {
    signals.push({
      type: "fast_response",
      entityType: "contact",
      entityId: contactId,
      confidence: Math.min(0.85, 0.6 + (2 - responseTimeHours) * 0.15),
      detail: `Response in ${responseTimeHours < 1 ? `${Math.round(responseTimeHours * 60)} minutes` : `${responseTimeHours.toFixed(1)} hours`} -- high engagement velocity`,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Expansion signal detector
// ---------------------------------------------------------------------------

export async function detectExpansionSignals(
  tenantId: string,
  companyId: string,
): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

  // Find contacts at this company who had recent inbound activity
  const companyContacts = await db
    .select({ id: contacts.id, title: contacts.title })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.companyId, companyId),
      ),
    );

  if (companyContacts.length < 2) return signals;

  // Count how many distinct contacts had inbound activity recently
  const contactIds = companyContacts.map((c) => c.id);
  const recentInbound = await db
    .select({ entityId: activities.entityId })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.direction, "inbound"),
        gte(activities.occurredAt, thirtyDaysAgo),
        sql`${activities.entityId} = ANY(${contactIds})`,
      ),
    );

  const uniqueActiveContacts = new Set(recentInbound.map((a) => a.entityId));

  if (uniqueActiveContacts.size >= 2) {
    // Check for department diversity
    const activeTitles = companyContacts
      .filter((c) => uniqueActiveContacts.has(c.id) && c.title)
      .map((c) => c.title!.toLowerCase());

    const departments = new Set<string>();
    for (const title of activeTitles) {
      if (title.includes("sales") || title.includes("revenue")) departments.add("sales");
      if (title.includes("marketing") || title.includes("growth")) departments.add("marketing");
      if (title.includes("engineer") || title.includes("developer") || title.includes("cto")) departments.add("engineering");
      if (title.includes("product") || title.includes("pm")) departments.add("product");
      if (title.includes("finance") || title.includes("cfo")) departments.add("finance");
      if (title.includes("ceo") || title.includes("founder") || title.includes("chief")) departments.add("executive");
    }

    if (departments.size >= 2) {
      signals.push({
        type: "expansion_multi_department",
        entityType: "company",
        entityId: companyId,
        confidence: Math.min(0.85, 0.5 + departments.size * 0.12),
        detail: `Engagement across ${departments.size} departments (${[...departments].join(", ")}): ${uniqueActiveContacts.size} active contacts`,
      });
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Notification sender
// ---------------------------------------------------------------------------

async function sendSignalNotifications(
  tenantId: string,
  signals: DetectedSignal[],
): Promise<number> {
  // Only notify for high-confidence signals
  const notifiable = signals.filter((s) => s.confidence >= 0.7);
  if (notifiable.length === 0) return 0;

  try {
    const tenantUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(5);

    if (tenantUsers.length === 0) return 0;

    let sent = 0;
    for (const signal of notifiable) {
      for (const user of tenantUsers) {
        await db.insert(notifications).values({
          tenantId,
          userId: user.id,
          type: "system" as const,
          title: formatSignalTitle(signal),
          body: signal.detail,
          entityType: signal.entityType,
          entityId: signal.entityId,
        });
        sent++;
      }
    }
    return sent;
  } catch (err) {
    console.warn("realtime-signals: notification send failed", err);
    return 0;
  }
}

function formatSignalTitle(signal: DetectedSignal): string {
  const labels: Record<string, string> = {
    competitor_mention: "Competitor Mentioned",
    risk_negative_reply: "Risk: Negative Reply",
    risk_negative_sentiment: "Risk: Negative Sentiment",
    risk_meeting_concern: "Risk: Meeting Concern",
    champion_emergence: "Champion Emerging",
    fast_response: "High Engagement Velocity",
    expansion_multi_department: "Expansion: Multi-Department",
    funding_detected: "Funding Detected",
    hiring_signal: "Hiring Signal",
    tech_stack_change: "Tech Stack Change",
    leadership_change: "Leadership Change",
    contact_promoted: "Contact Promoted",
    deal_regression: "Deal Moved Backward",
    deal_progression: "Deal Advanced",
    deal_won: "Deal Won",
    deal_lost: "Deal Lost",
    positive_meeting: "Positive Meeting",
    multi_stakeholder_meeting: "Multi-Stakeholder Meeting",
  };
  return labels[signal.type] || signal.type.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Exported constants for testing
// ---------------------------------------------------------------------------

export {
  DEFAULT_COMPETITOR_KEYWORDS,
  HIRING_ROLE_KEYWORDS,
  RISK_KEYWORDS,
};
