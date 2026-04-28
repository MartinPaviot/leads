/**
 * Signal detection for the autonomous deal progression engine.
 *
 * Analyzes a deal's recent activities to detect progression signals —
 * patterns that indicate the deal should move forward (or be flagged
 * as stalled / at-risk). Each detector returns a typed Signal with a
 * confidence score and human-readable evidence.
 *
 * Activity types consumed (from db/schema.ts activityTypeEnum):
 *   email_sent, email_received, email_replied, meeting_scheduled,
 *   meeting_completed, call_completed, deal_stage_changed,
 *   task_created, task_completed, note_created, form_submitted
 *
 * Sentiment consumed (from db/schema.ts sentimentEnum):
 *   positive, neutral, negative
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType =
  | "first_meeting_scheduled"
  | "demo_completed_positive"
  | "proposal_sent"
  | "positive_reply_to_proposal"
  | "contract_or_verbal_yes"
  | "stalled_no_activity"
  | "at_risk_negative"
  | "meeting_completed_positive"
  | "follow_up_sent_after_demo"
  | "multiple_positive_interactions"
  | "champion_engagement";

export interface Signal {
  type: SignalType;
  confidence: number; // 0.0 – 1.0
  evidence: string; // human-readable
  detectedAt: Date;
}

/** Minimal activity shape consumed by signal detectors. Matches the
 *  columns selected from the activities table. */
export interface ActivityRecord {
  id?: string;
  activityType: string;
  channel?: string | null;
  direction?: string | null;
  occurredAt: Date | null;
  sentiment?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
  intent?: string[] | null;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function activitiesSince(
  activities: ActivityRecord[],
  since: Date,
): ActivityRecord[] {
  return activities.filter(
    (a) => a.occurredAt && a.occurredAt.getTime() >= since.getTime(),
  );
}

function hasActivity(
  activities: ActivityRecord[],
  type: string,
  filter?: Partial<Pick<ActivityRecord, "sentiment" | "direction">>,
): ActivityRecord | undefined {
  return activities.find((a) => {
    if (a.activityType !== type) return false;
    if (filter?.sentiment && a.sentiment !== filter.sentiment) return false;
    if (filter?.direction && a.direction !== filter.direction) return false;
    return true;
  });
}

function countActivities(
  activities: ActivityRecord[],
  type: string,
  filter?: Partial<Pick<ActivityRecord, "sentiment" | "direction">>,
): number {
  return activities.filter((a) => {
    if (a.activityType !== type) return false;
    if (filter?.sentiment && a.sentiment !== filter.sentiment) return false;
    if (filter?.direction && a.direction !== filter.direction) return false;
    return true;
  }).length;
}

function mostRecent(
  activities: ActivityRecord[],
  type: string,
): ActivityRecord | undefined {
  return activities
    .filter((a) => a.activityType === type && a.occurredAt)
    .sort((a, b) => b.occurredAt!.getTime() - a.occurredAt!.getTime())[0];
}

// ---------------------------------------------------------------------------
// Individual detectors
// ---------------------------------------------------------------------------

/**
 * Signal: first meeting has been scheduled — deal can move from lead
 * to qualification.
 */
export function detectFirstMeetingScheduled(
  activities: ActivityRecord[],
): Signal | null {
  const meeting =
    hasActivity(activities, "meeting_scheduled") ||
    hasActivity(activities, "meeting_completed");
  if (!meeting) return null;

  return {
    type: "first_meeting_scheduled",
    confidence: 0.85,
    evidence: `Meeting ${meeting.activityType === "meeting_completed" ? "completed" : "scheduled"}: ${meeting.summary || "no summary"}`,
    detectedAt: meeting.occurredAt ?? new Date(),
  };
}

/**
 * Signal: a meeting was completed with positive sentiment — suitable
 * for qualification-to-demo progression.
 */
export function detectMeetingCompletedPositive(
  activities: ActivityRecord[],
): Signal | null {
  const meeting = hasActivity(activities, "meeting_completed", {
    sentiment: "positive",
  });
  if (!meeting) return null;

  return {
    type: "meeting_completed_positive",
    confidence: 0.8,
    evidence: `Meeting completed with positive sentiment: ${meeting.summary || "no summary"}`,
    detectedAt: meeting.occurredAt ?? new Date(),
  };
}

/**
 * Signal: demo completed AND a follow-up was sent afterward. Drives
 * demo-to-proposal progression.
 */
export function detectDemoCompletedWithFollowUp(
  activities: ActivityRecord[],
): Signal | null {
  const demo = hasActivity(activities, "meeting_completed");
  if (!demo) return null;

  // Look for a positive or neutral sentiment on the demo itself,
  // or any follow-up email sent after the demo.
  const followUp = activities.find(
    (a) =>
      (a.activityType === "email_sent" || a.activityType === "email_replied") &&
      a.occurredAt &&
      demo.occurredAt &&
      a.occurredAt.getTime() > demo.occurredAt.getTime(),
  );

  if (!followUp) return null;

  const demoPositive = demo.sentiment === "positive";
  const confidence = demoPositive ? 0.85 : 0.7;

  return {
    type: "follow_up_sent_after_demo",
    confidence,
    evidence: `Demo completed${demoPositive ? " (positive)" : ""} and follow-up sent: ${followUp.summary || "email sent"}`,
    detectedAt: followUp.occurredAt ?? new Date(),
  };
}

/**
 * Signal: a proposal email was sent (detected by activity type or
 * "proposal" keyword in summary/metadata).
 */
export function detectProposalSent(
  activities: ActivityRecord[],
): Signal | null {
  // Explicit activity type check first
  const emailsSent = activities.filter(
    (a) => a.activityType === "email_sent" || a.activityType === "email_replied",
  );

  const proposalEmail = emailsSent.find((a) => {
    const summaryLower = (a.summary || "").toLowerCase();
    const meta = a.metadata as Record<string, unknown> | null;
    const subject = String(meta?.subject || "").toLowerCase();
    return (
      summaryLower.includes("proposal") ||
      summaryLower.includes("pricing") ||
      summaryLower.includes("quote") ||
      subject.includes("proposal") ||
      subject.includes("pricing") ||
      subject.includes("quote")
    );
  });

  if (!proposalEmail) return null;

  return {
    type: "proposal_sent",
    confidence: 0.8,
    evidence: `Proposal/pricing email sent: ${proposalEmail.summary || "no summary"}`,
    detectedAt: proposalEmail.occurredAt ?? new Date(),
  };
}

/**
 * Signal: a positive reply was received after a proposal was sent.
 * Drives proposal-to-negotiation progression.
 */
export function detectPositiveReplyToProposal(
  activities: ActivityRecord[],
): Signal | null {
  // First, check if a proposal was sent
  const proposalSignal = detectProposalSent(activities);
  if (!proposalSignal) return null;

  // Then look for a positive inbound reply after the proposal
  const positiveReply = activities.find(
    (a) =>
      (a.activityType === "email_received" ||
        a.activityType === "email_replied") &&
      a.direction === "inbound" &&
      a.sentiment === "positive" &&
      a.occurredAt &&
      a.occurredAt.getTime() >= proposalSignal.detectedAt.getTime(),
  );

  if (!positiveReply) return null;

  return {
    type: "positive_reply_to_proposal",
    confidence: 0.85,
    evidence: `Positive reply received after proposal: ${positiveReply.summary || "positive inbound"}`,
    detectedAt: positiveReply.occurredAt ?? new Date(),
  };
}

/**
 * Signal: contract-related activity or verbal yes detected. Drives
 * negotiation-to-won progression. High bar — needs strong evidence.
 */
export function detectContractOrVerbalYes(
  activities: ActivityRecord[],
): Signal | null {
  // Check for deal_won activity already logged
  const wonActivity = hasActivity(activities, "deal_won");
  if (wonActivity) {
    return {
      type: "contract_or_verbal_yes",
      confidence: 0.95,
      evidence: `Deal won activity recorded: ${wonActivity.summary || "deal won"}`,
      detectedAt: wonActivity.occurredAt ?? new Date(),
    };
  }

  // Check for contract/signing keywords in recent emails or notes
  const contractSignals = activities.filter((a) => {
    const summaryLower = (a.summary || "").toLowerCase();
    return (
      summaryLower.includes("contract signed") ||
      summaryLower.includes("agreement signed") ||
      summaryLower.includes("verbal yes") ||
      summaryLower.includes("ready to proceed") ||
      summaryLower.includes("approved to move forward") ||
      summaryLower.includes("deal closed") ||
      summaryLower.includes("purchase order")
    );
  });

  if (contractSignals.length === 0) return null;

  // Multiple contract signals increase confidence
  const confidence = contractSignals.length >= 2 ? 0.9 : 0.75;

  return {
    type: "contract_or_verbal_yes",
    confidence,
    evidence: `Contract/verbal-yes signals (${contractSignals.length}): ${contractSignals[0].summary || "contract signal"}`,
    detectedAt: contractSignals[0].occurredAt ?? new Date(),
  };
}

/**
 * Signal: no activity in the last 30 days — deal is stalled.
 * This is a flag, not a stage move.
 */
export function detectStalledNoActivity(
  activities: ActivityRecord[],
  stalledDays = 30,
): Signal | null {
  const cutoff = daysAgo(stalledDays);
  const recent = activitiesSince(activities, cutoff);

  // If there's any recent activity, the deal is not stalled
  if (recent.length > 0) return null;

  // Check if there is *any* activity at all — a brand-new deal with no
  // activities is not "stalled", just new.
  if (activities.length === 0) return null;

  const lastActivity = activities
    .filter((a) => a.occurredAt)
    .sort((a, b) => b.occurredAt!.getTime() - a.occurredAt!.getTime())[0];

  if (!lastActivity) return null;

  const daysSinceLast = Math.floor(
    (Date.now() - lastActivity.occurredAt!.getTime()) / 86_400_000,
  );

  return {
    type: "stalled_no_activity",
    confidence: Math.min(0.95, 0.6 + daysSinceLast * 0.005),
    evidence: `No activity in ${daysSinceLast} days (last: ${lastActivity.activityType} on ${lastActivity.occurredAt!.toISOString().split("T")[0]})`,
    detectedAt: new Date(),
  };
}

/**
 * Signal: negative reply received and no follow-up within 14 days.
 * Deal is at risk.
 */
export function detectAtRiskNegative(
  activities: ActivityRecord[],
  followUpWindowDays = 14,
): Signal | null {
  // Find the most recent negative inbound activity
  const negativeInbound = activities
    .filter(
      (a) =>
        a.sentiment === "negative" &&
        (a.direction === "inbound" ||
          a.activityType === "email_received" ||
          a.activityType === "call_completed"),
    )
    .sort((a, b) => (b.occurredAt?.getTime() ?? 0) - (a.occurredAt?.getTime() ?? 0))[0];

  if (!negativeInbound || !negativeInbound.occurredAt) return null;

  // Check if there was a follow-up after the negative activity
  const followUpCutoff = new Date(
    negativeInbound.occurredAt.getTime() + followUpWindowDays * 86_400_000,
  );
  const now = new Date();

  // Only flag if the follow-up window has passed
  if (now.getTime() < followUpCutoff.getTime()) return null;

  const followUp = activities.find(
    (a) =>
      (a.activityType === "email_sent" ||
        a.activityType === "email_replied" ||
        a.activityType === "meeting_scheduled" ||
        a.activityType === "call_completed") &&
      a.direction !== "inbound" &&
      a.occurredAt &&
      a.occurredAt.getTime() > negativeInbound.occurredAt!.getTime(),
  );

  if (followUp) return null; // There was a follow-up, not at risk

  const daysSinceNegative = Math.floor(
    (now.getTime() - negativeInbound.occurredAt.getTime()) / 86_400_000,
  );

  return {
    type: "at_risk_negative",
    confidence: Math.min(0.9, 0.65 + daysSinceNegative * 0.005),
    evidence: `Negative ${negativeInbound.activityType} ${daysSinceNegative}d ago with no follow-up: ${negativeInbound.summary || "negative signal"}`,
    detectedAt: new Date(),
  };
}

/**
 * Signal: multiple positive interactions in a short window — strong
 * engagement from the prospect. Boosts confidence of any other signal.
 */
export function detectMultiplePositiveInteractions(
  activities: ActivityRecord[],
  windowDays = 14,
): Signal | null {
  const recent = activitiesSince(activities, daysAgo(windowDays));
  const positiveCount = recent.filter(
    (a) => a.sentiment === "positive",
  ).length;

  if (positiveCount < 2) return null;

  return {
    type: "multiple_positive_interactions",
    confidence: Math.min(0.9, 0.5 + positiveCount * 0.1),
    evidence: `${positiveCount} positive interactions in the last ${windowDays} days`,
    detectedAt: new Date(),
  };
}

/**
 * Signal: champion engagement — the same contact is driving multiple
 * outbound touches (emails sent, meetings). Indicates an internal
 * champion on the prospect side.
 */
export function detectChampionEngagement(
  activities: ActivityRecord[],
): Signal | null {
  const inboundTouches = activities.filter(
    (a) =>
      a.direction === "inbound" &&
      (a.activityType === "email_received" ||
        a.activityType === "email_replied" ||
        a.activityType === "meeting_completed" ||
        a.activityType === "call_completed"),
  );

  if (inboundTouches.length < 3) return null;

  return {
    type: "champion_engagement",
    confidence: Math.min(0.85, 0.5 + inboundTouches.length * 0.08),
    evidence: `${inboundTouches.length} inbound touches detected — possible champion`,
    detectedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Master detector
// ---------------------------------------------------------------------------

/**
 * Run all signal detectors against a set of activities and return
 * every signal found. The engine's progression rules consume these to
 * decide whether (and where) to advance the deal.
 */
export function detectAllSignals(activities: ActivityRecord[]): Signal[] {
  const detectors = [
    detectFirstMeetingScheduled,
    detectMeetingCompletedPositive,
    detectDemoCompletedWithFollowUp,
    detectProposalSent,
    detectPositiveReplyToProposal,
    detectContractOrVerbalYes,
    detectStalledNoActivity,
    detectAtRiskNegative,
    detectMultiplePositiveInteractions,
    detectChampionEngagement,
  ];

  const signals: Signal[] = [];
  for (const detect of detectors) {
    const signal = detect(activities);
    if (signal) signals.push(signal);
  }

  return signals;
}
