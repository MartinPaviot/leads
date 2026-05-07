import type { IntelligenceBrief, WarmPath, PreviousOutreach, StrategyType } from "./types";

interface Signal {
  type: string;
  confidence: "high" | "medium" | "indeterminate";
  detectedAt: string;
  isNew: boolean;
}

interface ScoringInput {
  brief: IntelligenceBrief;
  warmPath: WarmPath | null;
  signals: Signal[];
  previousOutreach: PreviousOutreach | null;
  contactsAvailable: number;
  companyScore: number;
  hasInboundVisit: boolean;
}

interface PlaybookScore {
  score: number;
  reason: string;
  factors: string[];
}

export function scoreWarmIntro(input: ScoringInput): PlaybookScore {
  if (!input.warmPath) return { score: 0, reason: "No warm path available", factors: [] };
  if (input.warmPath.distance > 2) return { score: 0, reason: "Warm path too distant", factors: [] };

  const factors: string[] = [];
  let score = 90;

  if (input.warmPath.distance === 1) {
    score += 5;
    factors.push("Direct 1st-degree connection");
  } else {
    factors.push(`2nd-degree via ${input.warmPath.connectorName}`);
  }

  if (input.warmPath.lastActiveAt) {
    const daysAgo = daysSince(input.warmPath.lastActiveAt);
    if (daysAgo > 90) {
      score -= 15;
      factors.push("Connector inactive >90 days");
    } else {
      factors.push("Connector recently active");
    }
  }

  return { score, reason: `Warm path via ${input.warmPath.connectorName} (${input.warmPath.distance}-degree)`, factors };
}

export function scoreTriggerBased(input: ScoringInput): PlaybookScore {
  const freshSignals = input.signals.filter(
    (s) => s.isNew && s.confidence === "high" && hoursSince(s.detectedAt) < 48
  );

  if (freshSignals.length === 0) return { score: 0, reason: "No fresh high-confidence signals", factors: [] };

  const factors = freshSignals.map((s) => `${s.type} (${hoursSince(s.detectedAt)}h ago)`);
  const stackingBonus = Math.min(freshSignals.length * 3, 12);

  return {
    score: 85 + stackingBonus,
    reason: `Fresh signal: ${freshSignals.map((s) => s.type).join(", ")}`,
    factors,
  };
}

export function scoreSmykm(input: ScoringInput): PlaybookScore {
  const depth = input.brief.publicContentDepth;
  if (depth < 2) return { score: 0, reason: "Insufficient public content for SMYKM", factors: [] };

  const factors: string[] = [`${depth} citable content pieces`];
  let score = 70 + Math.min(depth * 2, 10);

  if (input.brief.linkedinActivity && input.brief.linkedinActivity.postsPerWeek >= 1) {
    score += 5;
    factors.push("Active LinkedIn poster");
  }

  return { score, reason: `Rich public content (${depth} pieces)`, factors };
}

export function scoreDisplacement(input: ScoringInput): PlaybookScore {
  if (!input.brief.competitorDetected) return { score: 0, reason: "No competitor detected", factors: [] };

  const factors = [`Competitor: ${input.brief.competitorDetected}`];
  const score = 80;

  return { score, reason: `Competitor detected: ${input.brief.competitorDetected}`, factors };
}

export function scoreValueFirst(input: ScoringInput): PlaybookScore {
  // Value-first works if we have enough context to generate something useful
  const hasWebsite = !!input.brief.websiteSummary;
  const hasTechStack = input.brief.techStack.length >= 3;
  const hasJobs = input.brief.jobPostings.length >= 2;

  if (!hasWebsite && !hasTechStack) return { score: 0, reason: "Not enough data to generate value deliverable", factors: [] };

  const factors: string[] = [];
  let score = 70;

  if (hasWebsite) { score += 2; factors.push("Website data available"); }
  if (hasTechStack) { score += 3; factors.push(`${input.brief.techStack.length} tech tools detected`); }
  if (hasJobs) { score += 2; factors.push(`${input.brief.jobPostings.length} open roles`); }

  return { score, reason: "Can generate value deliverable from available data", factors };
}

export function scoreSocialFirst(input: ScoringInput): PlaybookScore {
  const activity = input.brief.linkedinActivity;
  if (!activity || activity.postsPerWeek < 2) {
    return { score: 0, reason: "Prospect not active enough on LinkedIn", factors: [] };
  }

  const factors = [`${activity.postsPerWeek} posts/week`, `Tone: ${activity.tone}`];
  let score = 75;

  if (activity.postsPerWeek >= 4) { score += 5; factors.push("Very active poster"); }
  if (input.brief.publicContentDepth >= 2) { score += 3; factors.push("Content to reference"); }

  return { score, reason: `Active on LinkedIn (${activity.postsPerWeek} posts/week)`, factors };
}

export function scoreMultiThread(input: ScoringInput): PlaybookScore {
  if (input.companyScore < 85) return { score: 0, reason: "Company score too low for multi-thread", factors: [] };
  if (input.contactsAvailable < 3) return { score: 0, reason: "Not enough contacts identified", factors: [] };

  const factors = [`Company score: ${input.companyScore}`, `${input.contactsAvailable} contacts available`];
  return { score: 78, reason: `High-value target with ${input.contactsAvailable} contacts`, factors };
}

export function scoreReEngagement(input: ScoringInput): PlaybookScore {
  if (!input.previousOutreach) return { score: 0, reason: "No previous outreach history", factors: [] };
  if (input.previousOutreach.outcome !== "not_now") return { score: 0, reason: "Previous outcome not 'not now'", factors: [] };

  const days = daysSince(input.previousOutreach.date);
  if (days < 60) return { score: 0, reason: `Only ${days} days since last contact (need 60+)`, factors: [] };

  const factors = [`${days} days since "not now" reply`];
  let score = 65;

  // Bonus if new signals exist that change the context
  const newSignals = input.signals.filter((s) => s.isNew);
  if (newSignals.length > 0) {
    score += 10;
    factors.push(`New context: ${newSignals.map((s) => s.type).join(", ")}`);
  }

  return { score, reason: `Re-engagement opportunity (${days}d since "not now")`, factors };
}

export function scoreEventTriggered(input: ScoringInput): PlaybookScore {
  if (!input.hasInboundVisit) return { score: 0, reason: "No inbound activity detected", factors: [] };

  return {
    score: 92,
    reason: "Prospect visited our website (inbound signal)",
    factors: ["Website visit detected", "High-urgency: they came to us"],
  };
}

export function scoreLongGame(_input: ScoringInput): PlaybookScore {
  return {
    score: 30,
    reason: "No strong activation signal — nurture mode",
    factors: ["Fallback strategy"],
  };
}

export const ALL_PLAYBOOK_SCORERS: Record<StrategyType, (input: ScoringInput) => PlaybookScore> = {
  warm_intro: scoreWarmIntro,
  trigger_based: scoreTriggerBased,
  smykm: scoreSmykm,
  displacement: scoreDisplacement,
  value_first: scoreValueFirst,
  social_first: scoreSocialFirst,
  multi_thread: scoreMultiThread,
  re_engagement: scoreReEngagement,
  event_triggered: scoreEventTriggered,
  long_game: scoreLongGame,
};

export type { ScoringInput, PlaybookScore, Signal };

// --- Utility ---

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function hoursSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
}
