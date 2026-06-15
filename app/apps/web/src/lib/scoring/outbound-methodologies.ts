/**
 * Outbound Intelligence — Methodology Library
 *
 * Encodes proven cold outreach frameworks mapped to persona seniority,
 * signal-driven email angles, and a 5-step strategic sequence structure.
 *
 * Pure TypeScript — no DB, no side effects, fully testable.
 */

// ── Seniority → Methodology mapping ──

export interface Methodology {
  name: string;
  description: string;
  maxWords: number;
  structure: string;
  toneNotes: string;
  ctaType: string;
  whatNotToDo: string[];
  exampleOpener: string;
}

export const METHODOLOGIES: Record<string, Methodology> = {
  // BASHO: Jeff Hoffman's methodology — ultra-short, insight-led, executive-level
  "c-suite": {
    name: "BASHO",
    description: "Business-outcome only. 3-4 sentences. Lead with an insight about THEIR business, not yours.",
    maxWords: 80,
    structure: "Insight about their business → Business implication → One strategic question",
    toneNotes: "Peer-to-peer. You're a peer advisor, not a vendor. No subordination. No flattery.",
    ctaType: "Strategic question that reveals a pain point — not a meeting request",
    whatNotToDo: [
      "Never mention product features",
      "Never use 'I'd love to' or 'Would you be open to'",
      "Never exceed 4 sentences",
      "Never start with your company name",
      "Never use exclamation marks",
    ],
    exampleOpener: "Companies scaling past $[X]M ARR typically hit a wall where [specific problem]. Curious if that's playing out at [Company] as you [signal-based observation]?",
  },

  // Challenger Sale: teach, tailor, take control
  vp: {
    name: "Challenger",
    description: "Teach something non-obvious about their domain. Reframe a problem they think they understand.",
    maxWords: 120,
    structure: "Non-obvious insight → 'Most [role]s assume X, but Y' → Quantified impact → Relevant proof point → Question CTA",
    toneNotes: "Authoritative but not arrogant. You know something they don't — share it generously.",
    ctaType: "Offer to share a case study or specific data point — not a demo",
    whatNotToDo: [
      "Never open with product pitch",
      "Never use generic stats ('80% of companies...')",
      "Never be condescending",
      "Never ask for a meeting in the first email",
    ],
    exampleOpener: "Most [VPs of X] I talk to assume [common assumption]. But [company type] that [did Y instead] saw [quantified result]. [Company] is in a similar position given [signal].",
  },

  head: {
    name: "Challenger",
    description: "Same as VP — teach, reframe, prove. Heads own execution so focus on operational impact.",
    maxWords: 120,
    structure: "Operational insight → Reframe → Impact on their team → Proof → Question",
    toneNotes: "Collaborative. You understand their execution challenges.",
    ctaType: "Share a framework or playbook — something they can use immediately",
    whatNotToDo: [
      "Never be overly strategic — they care about execution",
      "Never ignore their team's reality",
      "Never ask for time without offering value first",
    ],
    exampleOpener: "When [similar company] scaled their [department] from [X] to [Y], the first thing that broke was [specific process]. Given [signal at their company], curious how you're handling that.",
  },

  // Problem-Solution: specific pain → peer proof → offer
  director: {
    name: "Problem-Solution",
    description: "Name a specific pain their role faces. Show how peers solved it. Offer proof.",
    maxWords: 150,
    structure: "Specific pain for their role → 'Companies like [comparable] solved this by...' → Result → Offer to share how",
    toneNotes: "Helpful peer. You've seen this problem before and know what works.",
    ctaType: "Short call to walk through how a comparable company solved it, or share a relevant resource",
    whatNotToDo: [
      "Never be vague about the pain ('many companies struggle with...')",
      "Never skip the proof point",
      "Never make the CTA high-friction",
    ],
    exampleOpener: "[Role] at [industry] companies with [size range] employees typically spend [X hours/week] on [pain]. [Comparable company] cut that by [Y]% after [approach].",
  },

  manager: {
    name: "Problem-Solution",
    description: "Same framework, more tactical. Managers care about their daily workflow and team efficiency.",
    maxWords: 150,
    structure: "Daily pain point → Peer comparison → Quick result → Low-friction CTA",
    toneNotes: "Empathetic. You understand their day-to-day grind.",
    ctaType: "2-minute video, quick demo link, or 15-min call — minimal time investment",
    whatNotToDo: [
      "Never talk strategy — they want tactics",
      "Never require multiple steps to engage",
      "Never assume they have decision authority — they may need to sell internally",
    ],
    exampleOpener: "Other [title]s at [similar company type] were spending [X time] on [task] before switching to [approach]. Freed up [Y hours/week] for [what they actually want to do].",
  },

  // Product-Led: feature-specific, show don't tell
  senior: {
    name: "Product-Led",
    description: "Concrete feature angle. Peer comparison. Link to self-serve resource.",
    maxWords: 120,
    structure: "Peer comparison → Specific feature/capability → Self-serve proof → Try-it CTA",
    toneNotes: "Developer/practitioner tone. Respect their technical depth.",
    ctaType: "Link to docs, sandbox, 2-min video, or free tier — zero human interaction required",
    whatNotToDo: [
      "Never be salesy",
      "Never oversimplify — they'll see through it",
      "Never ask for a call as first CTA",
      "Never ignore their tech stack context",
    ],
    exampleOpener: "Noticed [Company] is using [tech from stack]. Other [title]s at [similar companies] plugged in [our approach] alongside it — [specific benefit in their context].",
  },

  entry: {
    name: "Product-Led",
    description: "Same as senior — self-serve, low friction, technical respect.",
    maxWords: 100,
    structure: "Quick value prop → Try-it link → No pressure",
    toneNotes: "Casual, peer-to-peer. No corporate speak.",
    ctaType: "Direct link to try something — free tier, sandbox, video",
    whatNotToDo: [
      "Never be formal",
      "Never ask for meetings",
      "Never CC their manager",
    ],
    exampleOpener: "Built something that [specific thing]. [Similar role] at [company] said it saved them [X]. Worth a look: [link]",
  },
};

// Default fallback
METHODOLOGIES["founder"] = METHODOLOGIES["c-suite"];
METHODOLOGIES["owner"] = METHODOLOGIES["c-suite"];
METHODOLOGIES["partner"] = METHODOLOGIES["c-suite"];

/** Resolve the best methodology for a given seniority string. */
export function getMethodology(seniority: string | null | undefined): Methodology {
  if (!seniority) return METHODOLOGIES["director"]; // safe default
  const key = seniority.toLowerCase().replace(/[^a-z-]/g, "");
  return METHODOLOGIES[key] || METHODOLOGIES["director"];
}

// ── Signal → Angle mapping ──

export interface SignalAngle {
  signalType: string;
  angleTemplate: string;
  businessImplication: string;
  questionSeed: string;
}

export const SIGNAL_ANGLES: Record<string, SignalAngle> = {
  funding: {
    signalType: "funding",
    angleTemplate: "With {fundingDetail}, you're likely investing in {inferredArea}. That's exactly the stage where {painPoint} becomes a bottleneck.",
    businessImplication: "Post-funding companies scale fast — teams grow faster than processes. The tools that worked at 20 people break at 80.",
    questionSeed: "How are you thinking about {inferredArea} as you scale post-raise?",
  },
  hiring: {
    signalType: "hiring",
    angleTemplate: "Noticed you're scaling {department} — typically means {inferredPain} is becoming a priority.",
    businessImplication: "Hiring sprees signal growth but also create process gaps. New hires amplify existing inefficiencies.",
    questionSeed: "As {department} grows, how are you handling {inferredPain}?",
  },
  tech_change: {
    signalType: "tech_change",
    angleTemplate: "Saw you're using {technology}. Teams running {technology} usually hit {specificChallenge} around {companyStage}.",
    businessImplication: "Tech stack choices create downstream constraints. Complementary tools can multiply the value of existing investments.",
    questionSeed: "Are you seeing {specificChallenge} with your {technology} setup?",
  },
  expansion: {
    signalType: "expansion",
    angleTemplate: "As you expand into {geography}, {expansionChallenge} tends to become a real blocker.",
    businessImplication: "Geographic expansion multiplies operational complexity — compliance, timezones, local processes.",
    questionSeed: "How is {expansionChallenge} playing out as you grow into {geography}?",
  },
  leadership_change: {
    signalType: "leadership_change",
    angleTemplate: "New {role} at {company} — first 90 days usually means auditing the current {category} stack.",
    businessImplication: "Leadership transitions are the #1 window for new tool adoption. New leaders want quick wins.",
    questionSeed: "As you evaluate the {category} landscape, curious what's top of mind?",
  },
  news: {
    signalType: "news",
    angleTemplate: "Read about {newsEvent} — that kind of move usually creates {implication} for {department}.",
    businessImplication: "Company news signals strategic priorities. Aligning with those priorities makes outreach relevant.",
    questionSeed: "With {newsEvent}, how is that impacting your approach to {area}?",
  },
  // Warm path, not intent: a shared investor is a standing fact about
  // the relationship, never "news". The template states the overlap
  // factually and avoids any mid-sentence variable so an unfilled
  // field can't fabricate a claim (the old investor_overlap→funding
  // mapping produced "With your recent raise…" for companies that
  // never raised).
  common_investor: {
    signalType: "common_investor",
    angleTemplate: "We're backed by the same investor as {company} — that overlap usually means we're working on the same class of problems.",
    businessImplication: "A shared investor is a warm path: common diligence, common context, and a mutual intro is one message away.",
    questionSeed: "Worth comparing notes on {area}?",
  },
};

/** Pick the strongest signal from an array (highest relevance, prefer funding/hiring). */
export function pickBestSignal(
  signals: Array<{ type: string; relevance: string; title: string; description: string; dataSource?: string }>
): (typeof signals)[number] | null {
  if (!signals || signals.length === 0) return null;

  const priority: Record<string, number> = {
    common_investor: 11, // warm path beats every cold angle
    funding: 10,
    hiring: 9,
    leadership_change: 8,
    expansion: 7,
    tech_change: 6,
    news: 5,
  };
  const relevanceBoost: Record<string, number> = { high: 20, medium: 10, low: 0 };

  return signals.reduce((best, current) => {
    const bestScore = (priority[best.type] || 0) + (relevanceBoost[best.relevance] || 0);
    const currentScore = (priority[current.type] || 0) + (relevanceBoost[current.relevance] || 0);
    return currentScore > bestScore ? current : best;
  });
}

// ── Step Strategies ──

export interface StepStrategy {
  stepNumber: number;
  name: string;
  purpose: string;
  delayDays: number;
  maxWords: number;
  toneNotes: string;
  ctaType: string;
  whatNotToDo: string[];
}

export const STEP_STRATEGIES: StepStrategy[] = [
  {
    stepNumber: 1,
    name: "Signal Hook",
    purpose: "Open with the specific trigger that makes this email timely. Tie to a business implication. End with one question.",
    delayDays: 0,
    maxWords: 100,
    toneNotes: "Confident, specific, no preamble. First sentence must reference their company or situation.",
    ctaType: "One question that reveals a pain point",
    whatNotToDo: ["Never start with 'Hi, I'm [name] from [company]'", "Never use 'I noticed that...' — just state the insight"],
  },
  {
    stepNumber: 2,
    name: "Teach",
    purpose: "Share a non-obvious insight about their industry or role. No product mention. Pure value.",
    delayDays: 3,
    maxWords: 120,
    toneNotes: "Expert sharing knowledge. You're giving, not asking.",
    ctaType: "None — or a soft 'curious if this resonates'",
    whatNotToDo: ["Never mention your product", "Never reference that you emailed before", "Never say 'following up'"],
  },
  {
    stepNumber: 3,
    name: "Proof",
    purpose: "Share how a comparable company (same industry, size, or tech stack) solved the problem. Concrete metrics.",
    delayDays: 4,
    maxWords: 130,
    toneNotes: "Storytelling. 'Company X was dealing with Y. They did Z. Result: W.'",
    ctaType: "Offer to share the full case study or connect them with the reference",
    whatNotToDo: ["Never use fake or vague metrics", "Never say 'just checking in'", "Never repeat step 1's angle"],
  },
  {
    stepNumber: 4,
    name: "Pattern Interrupt",
    purpose: "Break the pattern. Ultra-short, different format. A provocative question, a single stat, or a contrarian take.",
    delayDays: 5,
    maxWords: 50,
    toneNotes: "Surprising. This email should feel different from the others. Can be casual, bold, or witty.",
    ctaType: "Yes/no question or a one-word reply prompt",
    whatNotToDo: ["Never be longer than 3 sentences", "Never repeat previous content", "Never be passive-aggressive"],
  },
  {
    stepNumber: 5,
    name: "Graceful Exit",
    purpose: "Last email. Leave value behind even if they never respond. Make re-engagement easy.",
    delayDays: 7,
    maxWords: 80,
    toneNotes: "Warm, zero pressure. 'No worries if the timing isn't right — here's something useful regardless.'",
    ctaType: "Link to a resource (guide, benchmark, tool) + 'happy to chat whenever it makes sense'",
    whatNotToDo: ["Never guilt trip", "Never say 'this is my last email'", "Never be passive-aggressive about no response"],
  },
];
