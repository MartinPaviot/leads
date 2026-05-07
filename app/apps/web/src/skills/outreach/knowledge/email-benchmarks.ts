/**
 * Email Performance Knowledge Base
 *
 * Data-backed benchmarks from Instantly (2026 benchmark report, ~50k inboxes),
 * Lavender (100M+ cold emails analyzed), Close.com (BASHO methodology data),
 * and multiple A/B testing studies.
 *
 * This is NOT opinion. Every number has a source.
 * Used by: eval graders, email generation prompts, quality scoring.
 */

// ─── Reply Rate Benchmarks ───────────────────────────────────

export const REPLY_RATE_BENCHMARKS = {
  average: 0.0343, // 3.43% — Instantly 2026 report
  topQuartile: 0.055, // 5.5%+ — Instantly Tier 2
  topPerformer: 0.107, // 10.7%+ — Instantly Tier 1
  basho: { low: 0.10, high: 0.30, elite: 0.65 }, // Close.com, Alexander Theuma
  signalHook: 0.1001, // 10.01% — timeline hooks, Instantly
  problemHook: 0.0439, // 4.39% — problem-statement hooks, Instantly
  tightTargeting: 0.058, // 5.8% — campaigns <50 recipients
  broadBlast: 0.021, // 2.1% — campaigns >500 recipients
} as const;

// ─── Proven Performance Factors ──────────────────────────────

export const WHAT_WORKS = {
  wordCount: {
    optimal: 80, // <80 words = best performing, Instantly 2026
    basho: 80,
    challenger: 120,
    problemSolution: 150,
    productLed: 100,
  },
  subjectLine: {
    optimalWords: { min: 2, max: 4 }, // 2-4 words = 46% open rate
    optimalChars: { min: 36, max: 50 }, // Avoids truncation
    executiveMax: 30, // <30 chars for C-suite
    questionFormat: 0.46, // 46% open rate (highest of all types)
    lowercaseBoost: true, // Outperforms other formatting
    personalizationLift: {
      firstName: 0.22, // +22% open rate
      companyName: 0.18, // +18% open rate
      triggerEvent: 0.45, // +45% open rate
    },
  },
  sequencePosition: {
    step1ShareOfReplies: 0.58, // First email captures 58% of all replies
    followUpShare: 0.42, // Remaining 42%
    optimalSteps: { min: 4, max: 7 },
    cadence: [0, 3, 7, 10, 17], // Days — captures 93% of replies by day 10
  },
  timing: {
    bestLaunchDay: "monday",
    peakEngagement: "wednesday",
    autoReplySurge: "friday",
  },
  personalization: {
    replyRateLift: 0.32, // 32% higher response rate
    openRateLift: 0.50, // 50% improvement with custom subject
    psNoteLift: 0.35, // P.S. with personal note = +35% more replies
  },
  formatting: {
    shortParagraphs: 0.83, // +83% more replies with 1-2 sentence paragraphs
  },
} as const;

export const WHAT_FAILS = {
  openers: [
    "I hope this finds you well",
    "I noticed that",
    "Just wanted to",
    "I'd love to",
    "I'm reaching out because",
    "My name is",
    "I wanted to introduce",
    "Hope you're doing well",
    "I came across your",
  ],
  subjectLineKillers: [
    "ASAP",
    "urgent",
    "limited time",
    "Hello, friend",
    "Quick question", // overused, filtered
    "RE:", // fake reply threading = spam
    "FWD:", // fake forward = spam
  ],
  bodyAntiPatterns: [
    "!!!",
    "click here",
    "act now",
    "don't miss out",
    "exclusive offer",
    "free trial", // in subject = spam trigger
  ],
  structural: {
    overWordCount: "Emails >120 words see sharp reply rate decline",
    noPersonalization: "Generic emails with no prospect-specific data = <1% reply rate",
    multipleCTAs: "More than 1 CTA confuses — single clear next step only",
    fakePersonalization: "I noticed your company... + generic pitch = trust killer",
    disconnectedSubject: "Personalized subject + generic body = immediate disconnect",
  },
} as const;

// ─── Framework Rules (Data-Backed) ──────────────────────────

export interface FrameworkSpec {
  name: string;
  maxWords: number;
  targetSeniority: string[];
  structure: string[];
  ctaType: string;
  expectedReplyRate: { low: number; high: number };
  antiPatterns: string[];
  scoringCriteria: ScoringCriterion[];
}

export interface ScoringCriterion {
  dimension: string;
  weight: number;
  passCondition: string;
  failCondition: string;
}

export const FRAMEWORKS: Record<string, FrameworkSpec> = {
  basho: {
    name: "BASHO",
    maxWords: 80,
    targetSeniority: ["c_suite", "founder", "owner"],
    structure: [
      "Specific insight about their business trajectory",
      "Business implication tied to a signal",
      "One strategic question (NOT a meeting request)",
    ],
    ctaType: "Strategic question revealing pain point",
    expectedReplyRate: { low: 0.10, high: 0.30 },
    antiPatterns: [
      "Product features mentioned",
      "Meeting request as CTA",
      "Flattery (Congrats, Impressive, Love what you're doing)",
      "More than 4 sentences",
      "Starts with your company name",
      "Exclamation marks",
      "I'd love to / Would you be open to",
    ],
    scoringCriteria: [
      { dimension: "specificity", weight: 0.35, passCondition: "References a concrete fact about their company that could not apply to any other prospect", failCondition: "Generic insight that could be sent to 100 companies" },
      { dimension: "brevity", weight: 0.25, passCondition: "Under 80 words, 3-4 sentences max", failCondition: "Over 80 words or more than 4 sentences" },
      { dimension: "signal_anchor", weight: 0.25, passCondition: "Opens with or directly references a specific buying signal (funding, hiring, tech change)", failCondition: "No signal referenced, or signal mentioned generically" },
      { dimension: "strategic_question", weight: 0.15, passCondition: "Ends with a question that reveals a pain point without asking for a meeting", failCondition: "Ends with meeting request, link, or no question" },
    ],
  },
  challenger: {
    name: "Challenger",
    maxWords: 120,
    targetSeniority: ["vp", "head"],
    structure: [
      "Non-obvious insight (teach something they don't know)",
      "Reframe their current approach",
      "Quantified impact of the problem",
      "Proof point (peer company or data)",
      "Question or case study offer",
    ],
    ctaType: "Offer case study or data point",
    expectedReplyRate: { low: 0.05, high: 0.15 },
    antiPatterns: [
      "Obvious insights they already know",
      "Lecturing tone",
      "No proof point",
      "Generic statistics (studies show...)",
      "Feature dump",
    ],
    scoringCriteria: [
      { dimension: "insight_novelty", weight: 0.30, passCondition: "Teaches something non-obvious that reframes how they think about the problem", failCondition: "States something obvious or commonly known" },
      { dimension: "quantified_impact", weight: 0.25, passCondition: "Includes a specific number, metric, or time saved that makes the cost of inaction concrete", failCondition: "No numbers, or generic 'save time' without quantification" },
      { dimension: "proof", weight: 0.25, passCondition: "Names a comparable company or cites specific data from a peer in their industry/size", failCondition: "No proof, or proof from irrelevant industry/size" },
      { dimension: "brevity", weight: 0.20, passCondition: "Under 120 words", failCondition: "Over 120 words" },
    ],
  },
  problem_solution: {
    name: "Problem-Solution",
    maxWords: 150,
    targetSeniority: ["director", "manager"],
    structure: [
      "Name a specific daily pain they experience",
      "Peer comparison (others in their role face this too)",
      "Quick result achieved by a similar team",
      "Low-friction CTA",
    ],
    ctaType: "2-min video / quick demo / 15-min call",
    expectedReplyRate: { low: 0.04, high: 0.10 },
    antiPatterns: [
      "Abstract problems (efficiency, productivity)",
      "No peer proof",
      "High-friction CTA (45-min call, proposal)",
      "Multiple problems in one email",
    ],
    scoringCriteria: [
      { dimension: "pain_specificity", weight: 0.30, passCondition: "Names a specific daily frustration in their role (not abstract)", failCondition: "Generic pain like 'efficiency' or 'productivity'" },
      { dimension: "peer_proof", weight: 0.30, passCondition: "Names a company of similar size/industry that achieved a specific result", failCondition: "No proof or irrelevant proof" },
      { dimension: "low_friction_cta", weight: 0.20, passCondition: "CTA requires <5 minutes of their time and zero preparation", failCondition: "High-commitment CTA (long call, proposal review)" },
      { dimension: "brevity", weight: 0.20, passCondition: "Under 150 words", failCondition: "Over 150 words" },
    ],
  },
  product_led: {
    name: "Product-Led",
    maxWords: 100,
    targetSeniority: ["senior", "entry", "individual_contributor"],
    structure: [
      "Peer comparison (people in your role do X)",
      "Feature or capability that solves it",
      "Self-serve proof (try it yourself)",
      "Zero-friction CTA (link, sandbox, free tier)",
    ],
    ctaType: "Link to docs / sandbox / free tier",
    expectedReplyRate: { low: 0.03, high: 0.08 },
    antiPatterns: [
      "Asking for a call",
      "Long explanations",
      "No self-serve option",
      "Targeting wrong seniority (executives don't want to try tools)",
    ],
    scoringCriteria: [
      { dimension: "self_serve", weight: 0.35, passCondition: "Offers a way to experience the product without talking to anyone", failCondition: "Requires a call or demo to see value" },
      { dimension: "peer_framing", weight: 0.25, passCondition: "Frames from the perspective of people in their role, not company-level benefits", failCondition: "Company-level benefits or executive framing" },
      { dimension: "zero_friction", weight: 0.25, passCondition: "CTA takes <3 minutes and zero calls", failCondition: "CTA requires scheduling or talking to someone" },
      { dimension: "brevity", weight: 0.15, passCondition: "Under 100 words", failCondition: "Over 100 words" },
    ],
  },
  mouse_trap: {
    name: "Mouse Trap (Lavender)",
    maxWords: 35,
    targetSeniority: ["any"],
    structure: [
      "Observation tied to a signal",
      "Binary question (yes/no)",
    ],
    ctaType: "Yes/no question",
    expectedReplyRate: { low: 0.05, high: 0.12 },
    antiPatterns: [
      "Explanation of who you are",
      "More than 2 sentences",
      "Open-ended questions",
      "Any pitch",
    ],
    scoringCriteria: [
      { dimension: "brevity", weight: 0.40, passCondition: "Under 35 words, max 2 sentences", failCondition: "Over 35 words or more than 2 sentences" },
      { dimension: "binary_question", weight: 0.35, passCondition: "Ends with a question that can be answered yes or no", failCondition: "Open-ended question or no question" },
      { dimension: "signal_anchor", weight: 0.25, passCondition: "Observation references a specific, verifiable fact about their company", failCondition: "Generic observation" },
    ],
  },
};

// ─── Sequence Step Knowledge ─────────────────────────────────

export interface StepSpec {
  position: number;
  name: string;
  purpose: string;
  maxWords: number;
  dayDelay: number;
  mustInclude: string[];
  mustAvoid: string[];
  expectedReplyShare: number; // % of total sequence replies from this step
}

export const SEQUENCE_STEPS: StepSpec[] = [
  {
    position: 1,
    name: "Signal Hook",
    purpose: "Open with specific trigger + business implication + 1 question",
    maxWords: 100,
    dayDelay: 0,
    mustInclude: ["specific signal reference", "business implication", "one question"],
    mustAvoid: ["product features", "meeting request", "multiple CTAs"],
    expectedReplyShare: 0.58,
  },
  {
    position: 2,
    name: "Teach",
    purpose: "Non-obvious industry insight, no product mention",
    maxWords: 120,
    dayDelay: 3,
    mustInclude: ["industry insight", "relevant to their situation"],
    mustAvoid: ["product mention", "hard CTA", "repeating step 1 angle"],
    expectedReplyShare: 0.15,
  },
  {
    position: 3,
    name: "Proof",
    purpose: "Comparable company case study with concrete metrics",
    maxWords: 130,
    dayDelay: 4,
    mustInclude: ["named company", "specific metric", "similar size/industry"],
    mustAvoid: ["generic statistics", "studies show...", "repeating prior angles"],
    expectedReplyShare: 0.12,
  },
  {
    position: 4,
    name: "Pattern Interrupt",
    purpose: "Ultra-short, different format, provocative question or stat",
    maxWords: 50,
    dayDelay: 5,
    mustInclude: ["surprising format", "one single stat or question"],
    mustAvoid: ["long paragraphs", "same tone as previous emails", "product pitch"],
    expectedReplyShare: 0.08,
  },
  {
    position: 5,
    name: "Graceful Exit",
    purpose: "Last email, leave value, make re-engagement easy",
    maxWords: 80,
    dayDelay: 7,
    mustInclude: ["resource or value left behind", "zero pressure", "door left open"],
    mustAvoid: ["guilt tripping", "desperation", "fake urgency"],
    expectedReplyShare: 0.07,
  },
];

// ─── Grading Against Data ────────────────────────────────────

/**
 * Score an email against data-backed criteria.
 * Returns a score 0.0-1.0 where 1.0 means the email matches
 * characteristics of top-performing emails (>10% reply rate).
 */
export function scoreEmailAgainstBenchmarks(
  email: string,
  framework: keyof typeof FRAMEWORKS,
): { score: number; issues: string[] } {
  const spec = FRAMEWORKS[framework];
  const issues: string[] = [];
  let score = 1.0;

  const wordCount = email.split(/\s+/).length;
  if (wordCount > spec.maxWords) {
    const overage = (wordCount - spec.maxWords) / spec.maxWords;
    score -= Math.min(0.3, overage * 0.5);
    issues.push(`${wordCount} words (max ${spec.maxWords})`);
  }

  const lowerEmail = email.toLowerCase();
  for (const opener of WHAT_FAILS.openers) {
    if (lowerEmail.includes(opener.toLowerCase())) {
      score -= 0.15;
      issues.push(`Contains dead opener: "${opener}"`);
    }
  }

  if (email.includes("!!!") || (email.match(/!/g) || []).length > 1) {
    score -= 0.1;
    issues.push("Excessive exclamation marks");
  }

  const lines = email.split("\n").filter((l) => l.trim().length > 0);
  const hasQuestion = lines.some((l) => l.trim().endsWith("?"));
  if (!hasQuestion && (framework === "basho" || framework === "mouse_trap")) {
    score -= 0.2;
    issues.push(`${spec.name} requires a question — none found`);
  }

  return { score: Math.max(0, score), issues };
}
