/**
 * Buyer Intent Scoring
 *
 * Scores individual contacts based on their behavioral signals:
 * - Email response time (faster = higher intent)
 * - Meeting acceptance rate
 * - Number of questions asked (more questions = more engaged)
 * - Email length trend (getting longer = more invested)
 * - Forwarded to colleagues (expansion signal)
 * - Document requests (pricing, case studies)
 * - After-hours engagement (urgency signal)
 *
 * Score: 0-100. Updated after every interaction.
 *
 * Pure heuristic scoring -- no LLM needed. Analyze activity patterns
 * from the activities table.
 */

import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { and, eq, desc, sql, gte } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────

export interface BuyerIntentSignal {
  type: string;
  value: number;
  weight: number;
  evidence: string;
}

export interface BuyerIntentScore {
  contactId: string;
  score: number;
  signals: BuyerIntentSignal[];
  trend: "heating" | "stable" | "cooling";
  lastUpdated: string;
}

// ── Configuration ────────────────────────────────────────────

/** Weights for each signal type, summing to a max potential of 100. */
const SIGNAL_WEIGHTS = {
  responseTime: 20,       // Faster reply = higher intent
  meetingAcceptance: 15,  // Accepts meetings = engaged
  questionDensity: 15,    // Asks questions = evaluating
  emailLengthTrend: 10,  // Longer emails = more invested
  forwarding: 10,         // Forwarded to others = expansion
  documentRequests: 10,   // Asks for pricing/case studies = buying
  afterHours: 5,          // Engages outside work hours = urgent
  volumeRecency: 15,      // Recent + frequent = active
} as const;

/** Business hours: 8am-6pm local. We don't know timezone, so use UTC as proxy. */
const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 18;

// ── Signal Detectors ─────────────────────────────────────────

/**
 * Response time signal: measures how quickly the contact replies to outbound emails.
 * Faster responses indicate higher intent/urgency.
 *
 * Score: 1.0 (< 1 hour) to 0.0 (> 7 days or never replied)
 */
function scoreResponseTime(
  outboundDates: Date[],
  inboundDates: Date[],
): { value: number; evidence: string } {
  if (outboundDates.length === 0 || inboundDates.length === 0) {
    return { value: 0, evidence: "No email exchange to measure response time" };
  }

  // Match each inbound reply to the closest preceding outbound email
  const responseTimes: number[] = [];
  for (const inbound of inboundDates) {
    // Find the most recent outbound before this inbound
    const precedingOutbound = outboundDates
      .filter((o) => o.getTime() < inbound.getTime())
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (precedingOutbound) {
      const diffHours =
        (inbound.getTime() - precedingOutbound.getTime()) / (1000 * 60 * 60);
      if (diffHours < 168) {
        // Only count if within 7 days
        responseTimes.push(diffHours);
      }
    }
  }

  if (responseTimes.length === 0) {
    return { value: 0, evidence: "No matched responses found" };
  }

  const avgHours =
    responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

  // Score: <1h = 1.0, 1-4h = 0.8, 4-12h = 0.6, 12-24h = 0.4, 24-72h = 0.2, >72h = 0.1
  let value: number;
  if (avgHours < 1) value = 1.0;
  else if (avgHours < 4) value = 0.8;
  else if (avgHours < 12) value = 0.6;
  else if (avgHours < 24) value = 0.4;
  else if (avgHours < 72) value = 0.2;
  else value = 0.1;

  const formatted =
    avgHours < 1
      ? `${Math.round(avgHours * 60)} minutes`
      : avgHours < 24
        ? `${Math.round(avgHours)} hours`
        : `${Math.round(avgHours / 24)} days`;

  return {
    value,
    evidence: `Average response time: ${formatted} (from ${responseTimes.length} replies)`,
  };
}

/**
 * Meeting acceptance signal: ratio of meeting_scheduled to meeting requests.
 * Since we don't track explicit declines, we use scheduled+completed vs total
 * meeting-related activities.
 */
function scoreMeetingAcceptance(
  meetingsScheduled: number,
  meetingsCompleted: number,
  meetingsCancelled: number,
): { value: number; evidence: string } {
  const total = meetingsScheduled + meetingsCancelled;
  if (total === 0) {
    return { value: 0, evidence: "No meeting activity" };
  }

  const rate = meetingsScheduled / total;
  // Bonus for completed meetings (they showed up)
  const completionBonus = meetingsCompleted > 0 ? 0.1 : 0;
  const value = Math.min(1.0, rate + completionBonus);

  return {
    value,
    evidence: `${meetingsScheduled} scheduled, ${meetingsCompleted} completed, ${meetingsCancelled} cancelled (${Math.round(rate * 100)}% acceptance)`,
  };
}

/**
 * Question density signal: counts question marks in inbound emails.
 * More questions = actively evaluating the solution.
 */
function scoreQuestionDensity(
  inboundContents: string[],
): { value: number; evidence: string } {
  if (inboundContents.length === 0) {
    return { value: 0, evidence: "No inbound email content to analyze" };
  }

  let totalQuestions = 0;
  for (const content of inboundContents) {
    totalQuestions += (content.match(/\?/g) || []).length;
  }

  const avgPerEmail = totalQuestions / inboundContents.length;

  // Score: 0 = 0.0, 1-2 = 0.4, 3-4 = 0.7, 5+ = 1.0
  let value: number;
  if (avgPerEmail < 0.5) value = 0.0;
  else if (avgPerEmail < 2) value = 0.4;
  else if (avgPerEmail < 4) value = 0.7;
  else value = 1.0;

  return {
    value,
    evidence: `${totalQuestions} questions across ${inboundContents.length} emails (avg ${avgPerEmail.toFixed(1)}/email)`,
  };
}

/**
 * Email length trend: are the contact's emails getting longer?
 * Longer emails suggest deeper engagement and investment.
 */
function scoreEmailLengthTrend(
  inboundContents: Array<{ content: string; date: Date }>,
): { value: number; evidence: string } {
  if (inboundContents.length < 3) {
    return { value: 0, evidence: "Not enough emails to compute trend (need 3+)" };
  }

  // Sort by date ascending
  const sorted = [...inboundContents].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  // Split into first half and second half
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const avgFirst =
    firstHalf.reduce((s, e) => s + e.content.length, 0) / firstHalf.length;
  const avgSecond =
    secondHalf.reduce((s, e) => s + e.content.length, 0) / secondHalf.length;

  // Calculate growth ratio
  const growthRatio = avgFirst > 0 ? avgSecond / avgFirst : 1;

  // Score: shrinking = 0.0, stable = 0.3, growing 20%+ = 0.7, growing 50%+ = 1.0
  let value: number;
  if (growthRatio < 0.8) value = 0.0;
  else if (growthRatio < 1.2) value = 0.3;
  else if (growthRatio < 1.5) value = 0.7;
  else value = 1.0;

  const trendWord =
    growthRatio > 1.2
      ? "increasing"
      : growthRatio < 0.8
        ? "decreasing"
        : "stable";

  return {
    value,
    evidence: `Email length ${trendWord}: avg ${Math.round(avgFirst)} chars (early) to ${Math.round(avgSecond)} chars (recent)`,
  };
}

/**
 * Forwarding signal: detect when the contact forwards emails to colleagues
 * or CCs new people. This is an expansion/buying committee signal.
 */
function scoreForwarding(
  inboundSummaries: string[],
): { value: number; evidence: string } {
  const forwardKeywords = [
    "forwarded",
    "fw:",
    "fwd:",
    "looping in",
    "adding",
    "cc'ing",
    "cc-ing",
    "i've included",
    "i've added",
    "meet my colleague",
    "our team",
    "my manager",
    "my director",
  ];

  let forwardCount = 0;
  for (const summary of inboundSummaries) {
    const lower = (summary || "").toLowerCase();
    if (forwardKeywords.some((kw) => lower.includes(kw))) {
      forwardCount++;
    }
  }

  if (forwardCount === 0) {
    return { value: 0, evidence: "No forwarding or team expansion signals detected" };
  }

  // Score: 1 forward = 0.5, 2+ = 0.8, 3+ = 1.0
  const value = forwardCount >= 3 ? 1.0 : forwardCount >= 2 ? 0.8 : 0.5;

  return {
    value,
    evidence: `${forwardCount} forwarding/team expansion signal(s) detected`,
  };
}

/**
 * Document request signal: detect when the contact asks for pricing,
 * proposals, case studies, or technical documentation.
 */
function scoreDocumentRequests(
  inboundContents: string[],
): { value: number; evidence: string } {
  const docKeywords = [
    "pricing",
    "price list",
    "how much",
    "cost",
    "quote",
    "proposal",
    "case study",
    "case studies",
    "white paper",
    "whitepaper",
    "datasheet",
    "data sheet",
    "documentation",
    "technical specs",
    "roi calculator",
    "roi",
    "comparison",
    "vs ",
    "versus",
    "contract",
    "terms",
    "sla",
    "security questionnaire",
    "soc2",
    "soc 2",
    "gdpr",
    "implementation",
    "onboarding",
    "timeline",
  ];

  const matched = new Set<string>();
  for (const content of inboundContents) {
    const lower = content.toLowerCase();
    for (const kw of docKeywords) {
      if (lower.includes(kw)) {
        matched.add(kw);
      }
    }
  }

  if (matched.size === 0) {
    return { value: 0, evidence: "No document or pricing requests detected" };
  }

  // Score: 1 type = 0.4, 2-3 types = 0.7, 4+ types = 1.0
  const value = matched.size >= 4 ? 1.0 : matched.size >= 2 ? 0.7 : 0.4;

  return {
    value,
    evidence: `${matched.size} document/pricing request type(s): ${[...matched].slice(0, 5).join(", ")}`,
  };
}

/**
 * After-hours engagement: emails sent outside business hours suggest urgency.
 * Weekend emails are extra strong signals.
 */
function scoreAfterHours(
  inboundDates: Date[],
): { value: number; evidence: string } {
  if (inboundDates.length === 0) {
    return { value: 0, evidence: "No inbound emails to check timing" };
  }

  let afterHoursCount = 0;
  let weekendCount = 0;

  for (const date of inboundDates) {
    const hour = date.getUTCHours();
    const day = date.getUTCDay(); // 0=Sun, 6=Sat

    if (day === 0 || day === 6) {
      weekendCount++;
      afterHoursCount++;
    } else if (hour < BUSINESS_HOURS_START || hour >= BUSINESS_HOURS_END) {
      afterHoursCount++;
    }
  }

  const ratio = afterHoursCount / inboundDates.length;

  // Score: 0% = 0.0, <20% = 0.3, 20-40% = 0.6, >40% = 1.0
  let value: number;
  if (ratio < 0.05) value = 0.0;
  else if (ratio < 0.2) value = 0.3;
  else if (ratio < 0.4) value = 0.6;
  else value = 1.0;

  return {
    value,
    evidence: `${afterHoursCount}/${inboundDates.length} emails outside business hours (${weekendCount} on weekends)`,
  };
}

/**
 * Volume + recency signal: combines how much and how recently
 * the contact has been active. Decays over time.
 */
function scoreVolumeRecency(
  allDates: Date[],
  now: Date,
): { value: number; evidence: string } {
  if (allDates.length === 0) {
    return { value: 0, evidence: "No activity recorded" };
  }

  // Recency: days since last activity
  const mostRecent = Math.max(...allDates.map((d) => d.getTime()));
  const daysSinceLastActivity = Math.max(
    0,
    (now.getTime() - mostRecent) / (1000 * 60 * 60 * 24),
  );

  // Volume: activities in last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentActivities = allDates.filter(
    (d) => d.getTime() >= thirtyDaysAgo.getTime(),
  ).length;

  // Recency score (0-0.5): <3d = 0.5, 3-7d = 0.4, 7-14d = 0.3, 14-30d = 0.1, >30d = 0.0
  let recencyScore: number;
  if (daysSinceLastActivity < 3) recencyScore = 0.5;
  else if (daysSinceLastActivity < 7) recencyScore = 0.4;
  else if (daysSinceLastActivity < 14) recencyScore = 0.3;
  else if (daysSinceLastActivity < 30) recencyScore = 0.1;
  else recencyScore = 0.0;

  // Volume score (0-0.5): 0 = 0, 1-3 = 0.2, 4-8 = 0.35, 9+ = 0.5
  let volumeScore: number;
  if (recentActivities === 0) volumeScore = 0;
  else if (recentActivities <= 3) volumeScore = 0.2;
  else if (recentActivities <= 8) volumeScore = 0.35;
  else volumeScore = 0.5;

  const value = recencyScore + volumeScore;

  return {
    value,
    evidence: `${recentActivities} activities in last 30d, last activity ${Math.round(daysSinceLastActivity)}d ago`,
  };
}

// ── Trend Detection ──────────────────────────────────────────

/**
 * Compare recent activity intensity (last 14d) vs previous period (14-28d).
 * Used to detect heating/cooling patterns.
 */
function detectTrend(allDates: Date[], now: Date): "heating" | "stable" | "cooling" {
  const fourteenDaysAgo = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  );
  const twentyEightDaysAgo = new Date(
    now.getTime() - 28 * 24 * 60 * 60 * 1000,
  );

  const recentCount = allDates.filter(
    (d) => d.getTime() >= fourteenDaysAgo.getTime(),
  ).length;
  const previousCount = allDates.filter(
    (d) =>
      d.getTime() >= twentyEightDaysAgo.getTime() &&
      d.getTime() < fourteenDaysAgo.getTime(),
  ).length;

  if (previousCount === 0 && recentCount === 0) return "stable";
  if (previousCount === 0 && recentCount > 0) return "heating";
  if (recentCount === 0 && previousCount > 0) return "cooling";

  const ratio = recentCount / previousCount;
  if (ratio > 1.3) return "heating";
  if (ratio < 0.7) return "cooling";
  return "stable";
}

// ── Main Scoring Function ────────────────────────────────────

export async function scoreBuyerIntent(
  contactId: string,
  tenantId: string,
): Promise<BuyerIntentScore> {
  const now = new Date();

  // Fetch all activities for this contact (last 90 days for relevant window)
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const contactActivities = await db
    .select({
      activityType: activities.activityType,
      direction: activities.direction,
      occurredAt: activities.occurredAt,
      rawContent: activities.rawContent,
      summary: activities.summary,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        eq(activities.entityId, contactId),
        gte(activities.occurredAt, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(activities.occurredAt));

  // Categorize activities
  const outboundEmailDates: Date[] = [];
  const inboundEmailDates: Date[] = [];
  const inboundContents: string[] = [];
  const inboundWithDates: Array<{ content: string; date: Date }> = [];
  const inboundSummaries: string[] = [];
  const allActivityDates: Date[] = [];

  let meetingsScheduled = 0;
  let meetingsCompleted = 0;
  let meetingsCancelled = 0;

  for (const act of contactActivities) {
    if (act.occurredAt) {
      allActivityDates.push(act.occurredAt);
    }

    switch (act.activityType) {
      case "email_sent":
        if (act.occurredAt) outboundEmailDates.push(act.occurredAt);
        break;
      case "email_received":
      case "email_replied":
        if (act.occurredAt) inboundEmailDates.push(act.occurredAt);
        if (act.rawContent) {
          inboundContents.push(act.rawContent);
          if (act.occurredAt) {
            inboundWithDates.push({
              content: act.rawContent,
              date: act.occurredAt,
            });
          }
        }
        if (act.summary) inboundSummaries.push(act.summary);
        break;
      case "meeting_scheduled":
        meetingsScheduled++;
        break;
      case "meeting_completed":
        meetingsCompleted++;
        break;
      case "meeting_cancelled":
        meetingsCancelled++;
        break;
    }
  }

  // Compute each signal
  const responseTimeResult = scoreResponseTime(
    outboundEmailDates,
    inboundEmailDates,
  );
  const meetingResult = scoreMeetingAcceptance(
    meetingsScheduled,
    meetingsCompleted,
    meetingsCancelled,
  );
  const questionResult = scoreQuestionDensity(inboundContents);
  const lengthTrendResult = scoreEmailLengthTrend(inboundWithDates);
  const forwardingResult = scoreForwarding(inboundSummaries);
  const docRequestResult = scoreDocumentRequests(inboundContents);
  const afterHoursResult = scoreAfterHours(inboundEmailDates);
  const volumeRecencyResult = scoreVolumeRecency(allActivityDates, now);

  // Build signal array with weighted scores
  const signals: BuyerIntentSignal[] = [
    {
      type: "response_time",
      value: responseTimeResult.value,
      weight: SIGNAL_WEIGHTS.responseTime,
      evidence: responseTimeResult.evidence,
    },
    {
      type: "meeting_acceptance",
      value: meetingResult.value,
      weight: SIGNAL_WEIGHTS.meetingAcceptance,
      evidence: meetingResult.evidence,
    },
    {
      type: "question_density",
      value: questionResult.value,
      weight: SIGNAL_WEIGHTS.questionDensity,
      evidence: questionResult.evidence,
    },
    {
      type: "email_length_trend",
      value: lengthTrendResult.value,
      weight: SIGNAL_WEIGHTS.emailLengthTrend,
      evidence: lengthTrendResult.evidence,
    },
    {
      type: "forwarding",
      value: forwardingResult.value,
      weight: SIGNAL_WEIGHTS.forwarding,
      evidence: forwardingResult.evidence,
    },
    {
      type: "document_requests",
      value: docRequestResult.value,
      weight: SIGNAL_WEIGHTS.documentRequests,
      evidence: docRequestResult.evidence,
    },
    {
      type: "after_hours",
      value: afterHoursResult.value,
      weight: SIGNAL_WEIGHTS.afterHours,
      evidence: afterHoursResult.evidence,
    },
    {
      type: "volume_recency",
      value: volumeRecencyResult.value,
      weight: SIGNAL_WEIGHTS.volumeRecency,
      evidence: volumeRecencyResult.evidence,
    },
  ];

  // Compute total score (weighted sum)
  const totalScore = Math.round(
    signals.reduce((sum, s) => sum + s.value * s.weight, 0),
  );

  // Detect trend
  const trend = detectTrend(allActivityDates, now);

  return {
    contactId,
    score: Math.min(100, Math.max(0, totalScore)),
    signals,
    trend,
    lastUpdated: now.toISOString(),
  };
}

/**
 * Batch score multiple contacts. Runs in parallel with a concurrency
 * cap to avoid overwhelming the database.
 */
export async function batchScoreBuyerIntent(
  contactIds: string[],
  tenantId: string,
): Promise<BuyerIntentScore[]> {
  const CONCURRENCY = 5;
  const results: BuyerIntentScore[] = [];

  for (let i = 0; i < contactIds.length; i += CONCURRENCY) {
    const batch = contactIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((id) => scoreBuyerIntent(id, tenantId)),
    );
    results.push(...batchResults);
  }

  return results;
}
