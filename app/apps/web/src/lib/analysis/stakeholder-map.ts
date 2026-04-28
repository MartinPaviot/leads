/**
 * Multi-Stakeholder Deal Mapping
 *
 * Automatically identifies and classifies stakeholders in a deal
 * based on their interaction patterns:
 *
 * Roles detected:
 * - Champion: high engagement, positive sentiment, forwards info internally
 * - Economic Buyer: discusses budget/pricing, decision authority signals
 * - Technical Evaluator: asks technical questions, requests demos
 * - Coach: provides insider info, warns about internal dynamics
 * - Blocker: negative sentiment, raises objections, delays
 * - End User: will use the product, practical questions
 *
 * Detection signals:
 * - Email frequency and sentiment per contact
 * - Meeting attendance patterns
 * - Types of questions asked (from email intelligence)
 * - Seniority level (from enrichment)
 * - Response latency
 * - Who CC's whom (influence network)
 */

import { db } from "@/db";
import { activities, contacts, companies, deals } from "@/db/schema";
import { and, desc, eq, or, gte, sql } from "drizzle-orm";
import { tracedGenerateText } from "@/lib/traced-ai";
import { anthropic } from "@/lib/ai-provider";
import { openai } from "@ai-sdk/openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StakeholderRole =
  | "champion"
  | "economic_buyer"
  | "technical_evaluator"
  | "coach"
  | "blocker"
  | "end_user"
  | "unknown";

export type Sentiment = "positive" | "neutral" | "negative";
export type Influence = "high" | "medium" | "low";

export interface StakeholderSignal {
  type: string;
  evidence: string;
}

export interface Stakeholder {
  contactId: string;
  name: string;
  title: string;
  role: StakeholderRole;
  confidence: number;
  signals: StakeholderSignal[];
  engagementScore: number;
  sentiment: Sentiment;
  influence: Influence;
  lastInteraction: string;
  recommendedAction: string;
}

export interface StakeholderCoverage {
  hasChampion: boolean;
  hasEconomicBuyer: boolean;
  hasTechnicalEval: boolean;
  hasBlocker: boolean;
}

export interface StakeholderMap {
  dealId: string;
  stakeholders: Stakeholder[];
  coverage: StakeholderCoverage;
  gaps: string[];
  strategy: string;
}

// ---------------------------------------------------------------------------
// Keyword dictionaries for deterministic role classification
// ---------------------------------------------------------------------------

const ECONOMIC_BUYER_KEYWORDS = [
  "budget", "pricing", "cost", "roi", "investment", "approval",
  "authorize", "sign off", "procurement", "contract", "spend",
  "license", "subscription", "discount", "quote", "proposal",
  "business case", "payback", "total cost", "negotiate",
];

const TECHNICAL_EVALUATOR_KEYWORDS = [
  "api", "integration", "sdk", "technical", "architecture",
  "scalability", "performance", "latency", "security", "soc",
  "compliance", "demo", "poc", "proof of concept", "sandbox",
  "documentation", "endpoint", "webhook", "migration", "deploy",
  "infrastructure", "stack", "database", "uptime", "sla",
];

const CHAMPION_KEYWORDS = [
  "excited", "love", "perfect", "exactly what", "solve",
  "advocate", "push for", "sponsor", "internal buy-in",
  "rally", "get everyone on board", "priority", "urgent",
  "asap", "fast-track", "convinced", "believe in",
];

const COACH_KEYWORDS = [
  "heads up", "fyi", "between us", "internal", "politics",
  "careful", "watch out", "competitor", "incumbent", "hurdle",
  "process", "committee", "board", "approval chain", "timeline",
  "realistic", "honestly", "off the record", "context",
];

const BLOCKER_KEYWORDS = [
  "concern", "risk", "not sure", "hesitant", "delay",
  "postpone", "push back", "revisit", "not convinced",
  "already have", "satisfied with", "no need", "too early",
  "wait", "not a priority", "premature", "unnecessary",
];

const END_USER_KEYWORDS = [
  "daily", "workflow", "use case", "training", "onboarding",
  "how do i", "can it", "feature", "usability", "interface",
  "report", "dashboard", "export", "import", "notification",
  "permission", "role", "team", "setup",
];

/** Seniority tiers: C-level and VP roles map to higher influence. */
const SENIORITY_TIERS: Record<string, Influence> = {
  c_suite: "high",
  vp: "high",
  director: "high",
  manager: "medium",
  senior: "medium",
  individual: "low",
};

function inferSeniority(title: string | null): string {
  if (!title) return "unknown";
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cio|cmo|cro|chief|founder|co-founder|president)\b/.test(t)) return "c_suite";
  if (/\b(vp|vice president|svp|evp)\b/.test(t)) return "vp";
  if (/\bdirector\b/.test(t)) return "director";
  if (/\b(manager|head of|lead)\b/.test(t)) return "manager";
  if (/\bsenior\b/.test(t)) return "senior";
  return "individual";
}

// ---------------------------------------------------------------------------
// Score computation helpers
// ---------------------------------------------------------------------------

interface ContactActivityData {
  contactId: string;
  name: string;
  title: string;
  email: string | null;
  seniority: string;
  totalActivities: number;
  emailsSent: number;
  emailsReceived: number;
  meetingsAttended: number;
  avgResponseLatencyHours: number | null;
  lastInteraction: Date | null;
  sentiments: Sentiment[];
  rawTexts: string[];
  ccPatterns: string[]; // who this contact CC'd
}

function countKeywordMatches(texts: string[], keywords: string[]): number {
  let count = 0;
  const lowerTexts = texts.map((t) => t.toLowerCase());
  for (const kw of keywords) {
    for (const text of lowerTexts) {
      if (text.includes(kw)) {
        count++;
        break; // count each keyword once across all texts
      }
    }
  }
  return count;
}

function computeRoleScores(data: ContactActivityData): Record<StakeholderRole, number> {
  const texts = data.rawTexts;

  const economicScore =
    countKeywordMatches(texts, ECONOMIC_BUYER_KEYWORDS) * 3 +
    (["c_suite", "vp", "director"].includes(data.seniority) ? 5 : 0) +
    (/\b(finance|procurement|operations|business)\b/i.test(data.title) ? 4 : 0);

  const technicalScore =
    countKeywordMatches(texts, TECHNICAL_EVALUATOR_KEYWORDS) * 3 +
    (/\b(engineer|developer|architect|cto|technical|devops|infra|security)\b/i.test(data.title) ? 5 : 0) +
    (data.meetingsAttended >= 2 ? 2 : 0);

  const championScore =
    countKeywordMatches(texts, CHAMPION_KEYWORDS) * 3 +
    (data.emailsSent >= 5 ? 3 : data.emailsSent >= 3 ? 1 : 0) +
    (data.meetingsAttended >= 3 ? 3 : data.meetingsAttended >= 2 ? 1 : 0) +
    (data.avgResponseLatencyHours !== null && data.avgResponseLatencyHours < 4 ? 3 : 0) +
    (data.sentiments.filter((s) => s === "positive").length >= 2 ? 3 : 0) +
    (data.ccPatterns.length >= 2 ? 2 : 0); // forwards info internally

  const coachScore =
    countKeywordMatches(texts, COACH_KEYWORDS) * 4 +
    (data.emailsReceived >= 3 && data.emailsSent <= 1 ? 3 : 0); // gives info without being asked

  const blockerScore =
    countKeywordMatches(texts, BLOCKER_KEYWORDS) * 3 +
    (data.sentiments.filter((s) => s === "negative").length >= 2 ? 5 : 0) +
    (data.avgResponseLatencyHours !== null && data.avgResponseLatencyHours > 72 ? 3 : 0);

  const endUserScore =
    countKeywordMatches(texts, END_USER_KEYWORDS) * 3 +
    (/\b(analyst|specialist|coordinator|associate|rep|agent)\b/i.test(data.title) ? 3 : 0);

  return {
    economic_buyer: economicScore,
    technical_evaluator: technicalScore,
    champion: championScore,
    coach: coachScore,
    blocker: blockerScore,
    end_user: endUserScore,
    unknown: 0,
  };
}

function classifyRole(scores: Record<StakeholderRole, number>): { role: StakeholderRole; confidence: number } {
  const entries = Object.entries(scores)
    .filter(([r]) => r !== "unknown")
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0 || entries[0][1] === 0) {
    return { role: "unknown", confidence: 0 };
  }

  const [topRole, topScore] = entries[0];
  const secondScore = entries.length > 1 ? entries[1][1] : 0;

  // Confidence: how much the top role dominates
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const rawConfidence = total > 0 ? topScore / total : 0;

  // Penalize confidence when top two roles are very close
  const separationPenalty = secondScore > 0 ? Math.min(1, (topScore - secondScore) / topScore) : 1;
  const confidence = Math.round(rawConfidence * separationPenalty * 100) / 100;

  return { role: topRole as StakeholderRole, confidence: Math.max(0.1, Math.min(1, confidence)) };
}

function computeEngagementScore(data: ContactActivityData): number {
  // Weighted engagement: emails + meetings + recency
  const emailScore = Math.min(data.emailsSent + data.emailsReceived, 20) * 2;
  const meetingScore = Math.min(data.meetingsAttended, 10) * 5;
  const responseScore = data.avgResponseLatencyHours !== null
    ? Math.max(0, 20 - data.avgResponseLatencyHours)
    : 0;

  // Recency bonus: interactions in the last 7 days
  const daysSinceLastInteraction = data.lastInteraction
    ? (Date.now() - data.lastInteraction.getTime()) / 86400000
    : 999;
  const recencyScore = daysSinceLastInteraction < 7 ? 15
    : daysSinceLastInteraction < 14 ? 10
    : daysSinceLastInteraction < 30 ? 5
    : 0;

  const raw = emailScore + meetingScore + responseScore + recencyScore;
  return Math.round(Math.min(100, raw));
}

function computeSentiment(sentiments: Sentiment[]): Sentiment {
  if (sentiments.length === 0) return "neutral";
  const pos = sentiments.filter((s) => s === "positive").length;
  const neg = sentiments.filter((s) => s === "negative").length;
  if (pos > neg + 1) return "positive";
  if (neg > pos + 1) return "negative";
  return "neutral";
}

function computeInfluence(seniority: string, ccPatterns: string[], meetingsAttended: number): Influence {
  const seniorityInfluence = SENIORITY_TIERS[seniority] || "low";
  if (seniorityInfluence === "high") return "high";
  // People who CC many others or attend many meetings have medium+ influence
  if (ccPatterns.length >= 3 || meetingsAttended >= 4) return "medium";
  if (seniorityInfluence === "medium") return "medium";
  return "low";
}

function buildSignals(data: ContactActivityData, role: StakeholderRole): StakeholderSignal[] {
  const signals: StakeholderSignal[] = [];

  if (data.emailsSent > 0) {
    signals.push({
      type: "email_frequency",
      evidence: `${data.emailsSent} emails sent, ${data.emailsReceived} received`,
    });
  }
  if (data.meetingsAttended > 0) {
    signals.push({
      type: "meeting_attendance",
      evidence: `Attended ${data.meetingsAttended} meeting(s)`,
    });
  }
  if (data.avgResponseLatencyHours !== null) {
    signals.push({
      type: "response_speed",
      evidence: `Avg response time: ${Math.round(data.avgResponseLatencyHours)}h`,
    });
  }
  if (data.ccPatterns.length > 0) {
    signals.push({
      type: "influence_network",
      evidence: `CC'd ${data.ccPatterns.length} internal contact(s)`,
    });
  }
  if (data.seniority !== "unknown") {
    signals.push({
      type: "seniority",
      evidence: `Title "${data.title}" maps to ${data.seniority} seniority`,
    });
  }

  const positiveSentiments = data.sentiments.filter((s) => s === "positive").length;
  const negativeSentiments = data.sentiments.filter((s) => s === "negative").length;
  if (positiveSentiments > 0 || negativeSentiments > 0) {
    signals.push({
      type: "sentiment_pattern",
      evidence: `${positiveSentiments} positive, ${negativeSentiments} negative interaction(s)`,
    });
  }

  // Role-specific keyword evidence
  const texts = data.rawTexts;
  const matchKeywords = (keywords: string[]) =>
    keywords.filter((kw) => texts.some((t) => t.toLowerCase().includes(kw)));

  if (role === "economic_buyer") {
    const matches = matchKeywords(ECONOMIC_BUYER_KEYWORDS);
    if (matches.length > 0) {
      signals.push({ type: "budget_language", evidence: `Used keywords: ${matches.slice(0, 5).join(", ")}` });
    }
  } else if (role === "technical_evaluator") {
    const matches = matchKeywords(TECHNICAL_EVALUATOR_KEYWORDS);
    if (matches.length > 0) {
      signals.push({ type: "technical_language", evidence: `Used keywords: ${matches.slice(0, 5).join(", ")}` });
    }
  } else if (role === "champion") {
    const matches = matchKeywords(CHAMPION_KEYWORDS);
    if (matches.length > 0) {
      signals.push({ type: "advocacy_language", evidence: `Used keywords: ${matches.slice(0, 5).join(", ")}` });
    }
  } else if (role === "blocker") {
    const matches = matchKeywords(BLOCKER_KEYWORDS);
    if (matches.length > 0) {
      signals.push({ type: "objection_language", evidence: `Used keywords: ${matches.slice(0, 5).join(", ")}` });
    }
  }

  return signals;
}

function generateRecommendedAction(stakeholder: Stakeholder): string {
  const daysSince = stakeholder.lastInteraction
    ? Math.floor((Date.now() - new Date(stakeholder.lastInteraction).getTime()) / 86400000)
    : null;

  switch (stakeholder.role) {
    case "champion":
      if (daysSince !== null && daysSince > 7)
        return `Re-engage ${stakeholder.name} -- champion has been silent for ${daysSince} days`;
      return `Arm ${stakeholder.name} with materials to advocate internally`;

    case "economic_buyer":
      if (stakeholder.engagementScore < 30)
        return `Increase touchpoints with ${stakeholder.name} -- economic buyer has low engagement`;
      return `Present ROI analysis and business case to ${stakeholder.name}`;

    case "technical_evaluator":
      return `Schedule technical deep-dive or POC with ${stakeholder.name}`;

    case "coach":
      return `Nurture relationship with ${stakeholder.name} -- they provide valuable internal context`;

    case "blocker":
      if (stakeholder.sentiment === "negative")
        return `Address ${stakeholder.name}'s objections directly -- negative sentiment detected`;
      return `Proactively engage ${stakeholder.name} to understand and resolve concerns`;

    case "end_user":
      return `Share product demo or training materials with ${stakeholder.name}`;

    default:
      if (daysSince !== null && daysSince > 14)
        return `Reach out to ${stakeholder.name} -- no interaction in ${daysSince} days`;
      return `Identify ${stakeholder.name}'s role in the buying process`;
  }
}

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

function identifyGaps(stakeholders: Stakeholder[]): string[] {
  const gaps: string[] = [];
  const roles = new Set(stakeholders.map((s) => s.role));

  if (!roles.has("champion")) {
    gaps.push(
      "No champion identified -- without an internal advocate, the deal relies entirely on your push. Find someone who loves the product and empower them.",
    );
  }
  if (!roles.has("economic_buyer")) {
    gaps.push(
      "No economic buyer identified -- the deal may stall at the proposal stage. Identify who controls the budget and engage them early.",
    );
  }
  if (!roles.has("technical_evaluator") && stakeholders.length >= 2) {
    gaps.push(
      "No technical evaluator identified -- if the product requires implementation, someone will need to validate feasibility. Request a technical review session.",
    );
  }

  const blockers = stakeholders.filter((s) => s.role === "blocker");
  if (blockers.length > 0) {
    for (const b of blockers) {
      gaps.push(
        `${b.name} (${b.title}) is a potential blocker -- address their concerns before advancing the deal.`,
      );
    }
  }

  if (stakeholders.length < 3) {
    gaps.push(
      `Only ${stakeholders.length} stakeholder(s) mapped -- complex deals typically involve 5-7 people. You may be single-threaded.`,
    );
  }

  // Check for stale engagement
  const activeStakeholders = stakeholders.filter((s) => {
    if (!s.lastInteraction) return false;
    const daysSince = (Date.now() - new Date(s.lastInteraction).getTime()) / 86400000;
    return daysSince < 14;
  });
  if (activeStakeholders.length === 0 && stakeholders.length > 0) {
    gaps.push(
      "All stakeholders have gone silent (no interaction in 14+ days) -- the deal is at risk of dying. Immediate re-engagement needed.",
    );
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Strategy generation via Haiku (single LLM call)
// ---------------------------------------------------------------------------

async function generateStrategy(
  stakeholders: Stakeholder[],
  gaps: string[],
  dealName: string,
  tenantId: string,
): Promise<string> {
  if (stakeholders.length === 0) {
    return "No stakeholders identified yet. Start by connecting contacts to this deal and logging interactions.";
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-haiku-4-5-20251001")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    // Fallback: deterministic strategy
    return buildDeterministicStrategy(stakeholders, gaps);
  }

  const stakeholderSummary = stakeholders.map((s) =>
    `- ${s.name} (${s.title}): ${s.role} (confidence: ${Math.round(s.confidence * 100)}%, engagement: ${s.engagementScore}/100, sentiment: ${s.sentiment}, influence: ${s.influence})`
  ).join("\n");

  const gapSummary = gaps.length > 0 ? `Gaps:\n${gaps.map((g) => `- ${g}`).join("\n")}` : "No critical gaps.";

  try {
    const result = await tracedGenerateText({
      model,
      prompt: `You are a sales strategist. Given the stakeholder map for the deal "${dealName}", write a concise 2-3 sentence strategy recommendation. Be specific: name people, suggest concrete actions, and identify the critical path to closing.

Stakeholders:
${stakeholderSummary}

${gapSummary}

Strategy (2-3 sentences, no bullet points):`,
      // @ts-expect-error maxTokens exists in AI SDK but type definition may lag
      maxTokens: 200,
      temperature: 0.3,
      _trace: { agentId: "stakeholder-strategy", tenantId },
    });
    return result.text.trim();
  } catch {
    return buildDeterministicStrategy(stakeholders, gaps);
  }
}

function buildDeterministicStrategy(stakeholders: Stakeholder[], gaps: string[]): string {
  const champion = stakeholders.find((s) => s.role === "champion");
  const buyer = stakeholders.find((s) => s.role === "economic_buyer");
  const blocker = stakeholders.find((s) => s.role === "blocker");

  const parts: string[] = [];

  if (champion && buyer) {
    parts.push(`Leverage ${champion.name} (champion) to build the case for ${buyer.name} (economic buyer).`);
  } else if (champion && !buyer) {
    parts.push(`${champion.name} is your champion -- use them to identify the economic buyer.`);
  } else if (!champion && buyer) {
    parts.push(`You have access to the economic buyer (${buyer.name}) but lack an internal champion. Find one.`);
  } else {
    parts.push("Priority: identify a champion and the economic buyer to advance this deal.");
  }

  if (blocker) {
    parts.push(`Address ${blocker.name}'s concerns before they derail the deal.`);
  }

  if (gaps.length > 0 && parts.length < 3) {
    parts.push(gaps[0].split(" -- ")[1] || gaps[0]);
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function buildStakeholderMap(
  dealId: string,
  tenantId: string,
): Promise<StakeholderMap> {
  // 1. Load the deal
  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)))
    .limit(1);

  if (!deal) {
    return {
      dealId,
      stakeholders: [],
      coverage: { hasChampion: false, hasEconomicBuyer: false, hasTechnicalEval: false, hasBlocker: false },
      gaps: ["Deal not found"],
      strategy: "Deal not found in your CRM.",
    };
  }

  // 2. Load all contacts associated with the deal
  //    - Direct deal.contactId link
  //    - All contacts at the deal's company
  const contactConditions = [];
  if (deal.contactId) {
    contactConditions.push(
      and(eq(contacts.id, deal.contactId), eq(contacts.tenantId, tenantId)),
    );
  }
  if (deal.companyId) {
    contactConditions.push(
      and(eq(contacts.companyId, deal.companyId), eq(contacts.tenantId, tenantId)),
    );
  }

  if (contactConditions.length === 0) {
    return {
      dealId,
      stakeholders: [],
      coverage: { hasChampion: false, hasEconomicBuyer: false, hasTechnicalEval: false, hasBlocker: false },
      gaps: ["No contacts linked to this deal. Associate contacts or a company to map stakeholders."],
      strategy: "Add contacts to this deal to begin stakeholder mapping.",
    };
  }

  const dealContacts = await db
    .select()
    .from(contacts)
    .where(or(...contactConditions)!)
    .limit(50);

  if (dealContacts.length === 0) {
    return {
      dealId,
      stakeholders: [],
      coverage: { hasChampion: false, hasEconomicBuyer: false, hasTechnicalEval: false, hasBlocker: false },
      gaps: ["No contacts found for this deal."],
      strategy: "Import or create contacts associated with this deal's company to enable stakeholder mapping.",
    };
  }

  // 3. Load all activities per contact (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const contactIds = dealContacts.map((c) => c.id);

  const contactActivities = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        sql`${activities.entityId} = ANY(${contactIds})`,
        gte(activities.occurredAt, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(500);

  // Also load deal-level activities
  const dealActivities = await db
    .select()
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "deal"),
        eq(activities.entityId, dealId),
        gte(activities.occurredAt, ninetyDaysAgo),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(100);

  // 4. Build per-contact activity data
  const contactDataMap = new Map<string, ContactActivityData>();

  for (const contact of dealContacts) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unknown";
    contactDataMap.set(contact.id, {
      contactId: contact.id,
      name,
      title: contact.title || "",
      email: contact.email,
      seniority: inferSeniority(contact.title),
      totalActivities: 0,
      emailsSent: 0,
      emailsReceived: 0,
      meetingsAttended: 0,
      avgResponseLatencyHours: null,
      lastInteraction: null,
      sentiments: [],
      rawTexts: [],
      ccPatterns: [],
    });
  }

  // Process contact-level activities
  for (const activity of contactActivities) {
    const data = contactDataMap.get(activity.entityId);
    if (!data) continue;

    data.totalActivities++;

    if (activity.occurredAt) {
      if (!data.lastInteraction || activity.occurredAt > data.lastInteraction) {
        data.lastInteraction = activity.occurredAt;
      }
    }

    if (activity.sentiment) {
      data.sentiments.push(activity.sentiment);
    }

    const textContent = [activity.summary, activity.rawContent].filter(Boolean).join(" ");
    if (textContent) {
      data.rawTexts.push(textContent);
    }

    const meta = (activity.metadata || {}) as Record<string, unknown>;

    switch (activity.activityType) {
      case "email_sent":
        data.emailsSent++;
        break;
      case "email_received":
        data.emailsReceived++;
        break;
      case "meeting_completed":
      case "meeting_scheduled":
        data.meetingsAttended++;
        break;
    }

    // Extract CC patterns from email metadata
    if (meta.cc && Array.isArray(meta.cc)) {
      for (const ccAddr of meta.cc as string[]) {
        if (!data.ccPatterns.includes(ccAddr)) {
          data.ccPatterns.push(ccAddr);
        }
      }
    }

    // Response latency from metadata
    if (typeof meta.responseLatencyHours === "number") {
      // Running average
      if (data.avgResponseLatencyHours === null) {
        data.avgResponseLatencyHours = meta.responseLatencyHours;
      } else {
        data.avgResponseLatencyHours =
          (data.avgResponseLatencyHours + meta.responseLatencyHours) / 2;
      }
    }
  }

  // Include deal-level activities for contacts mentioned in metadata
  for (const activity of dealActivities) {
    const meta = (activity.metadata || {}) as Record<string, unknown>;
    const relatedContactId = meta.contactId as string | undefined;
    if (relatedContactId && contactDataMap.has(relatedContactId)) {
      const data = contactDataMap.get(relatedContactId)!;
      const textContent = [activity.summary, activity.rawContent].filter(Boolean).join(" ");
      if (textContent) data.rawTexts.push(textContent);
      if (activity.sentiment) data.sentiments.push(activity.sentiment);
    }
  }

  // 5. Score each contact and classify roles
  const stakeholders: Stakeholder[] = [];

  for (const data of contactDataMap.values()) {
    const roleScores = computeRoleScores(data);
    const { role, confidence } = classifyRole(roleScores);
    const engagementScore = computeEngagementScore(data);
    const sentiment = computeSentiment(data.sentiments);
    const influence = computeInfluence(data.seniority, data.ccPatterns, data.meetingsAttended);
    const signals = buildSignals(data, role);

    const stakeholder: Stakeholder = {
      contactId: data.contactId,
      name: data.name,
      title: data.title,
      role,
      confidence,
      signals,
      engagementScore,
      sentiment,
      influence,
      lastInteraction: data.lastInteraction?.toISOString() || "",
      recommendedAction: "", // filled below
    };

    stakeholder.recommendedAction = generateRecommendedAction(stakeholder);
    stakeholders.push(stakeholder);
  }

  // Sort by engagement score descending
  stakeholders.sort((a, b) => b.engagementScore - a.engagementScore);

  // 6. Identify gaps
  const gaps = identifyGaps(stakeholders);

  // 7. Coverage map
  const coverage: StakeholderCoverage = {
    hasChampion: stakeholders.some((s) => s.role === "champion"),
    hasEconomicBuyer: stakeholders.some((s) => s.role === "economic_buyer"),
    hasTechnicalEval: stakeholders.some((s) => s.role === "technical_evaluator"),
    hasBlocker: stakeholders.some((s) => s.role === "blocker"),
  };

  // 8. Generate strategy (1 LLM call via Haiku)
  const strategy = await generateStrategy(stakeholders, gaps, deal.name, tenantId);

  // 9. Cache in deal properties
  try {
    const existingProps = (deal.properties || {}) as Record<string, unknown>;
    await db
      .update(deals)
      .set({
        properties: {
          ...existingProps,
          stakeholderMap: {
            stakeholders: stakeholders.map((s) => ({
              contactId: s.contactId,
              name: s.name,
              role: s.role,
              confidence: s.confidence,
              engagementScore: s.engagementScore,
              sentiment: s.sentiment,
              influence: s.influence,
            })),
            coverage,
            gaps,
            strategy,
            computedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId));
  } catch {
    // Cache failure is non-fatal
  }

  return { dealId, stakeholders, coverage, gaps, strategy };
}
