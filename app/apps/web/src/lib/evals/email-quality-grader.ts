/**
 * Email Quality Grader — Data-backed scoring.
 *
 * Replaces subjective LLM-as-judge with measurable criteria
 * derived from Instantly 2026 benchmark (50k inboxes),
 * Lavender (100M emails), and Close.com BASHO data.
 *
 * Score interpretation:
 *   0.9+ = matches characteristics of 10%+ reply rate emails
 *   0.7-0.9 = matches characteristics of 5%+ reply rate emails
 *   0.5-0.7 = average (3.4% reply rate territory)
 *   <0.5 = below average, likely problems
 */

import {
  WHAT_WORKS,
  WHAT_FAILS,
  FRAMEWORKS,
  type FrameworkSpec,
} from "../../skills/outreach/knowledge/email-benchmarks";

// ─── Types ───────────────────────────────────────────────────

export interface EmailGradeResult {
  score: number;
  dimensions: DimensionScore[];
  issues: string[];
  strengths: string[];
}

interface DimensionScore {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

interface EmailGradeInput {
  email: string;
  subjectLine?: string;
  framework?: keyof typeof FRAMEWORKS;
  prospectContext?: {
    name?: string;
    company?: string;
    signal?: string;
    seniority?: string;
  };
}

// ─── Main Grader ─────────────────────────────────────────────

export function gradeEmail(input: EmailGradeInput): EmailGradeResult {
  const { email, subjectLine, framework, prospectContext } = input;
  const spec = framework ? FRAMEWORKS[framework] : null;
  const dimensions: DimensionScore[] = [];
  const issues: string[] = [];
  const strengths: string[] = [];

  // 1. Word count (weight: 0.15)
  const wordCount = email.split(/\s+/).filter(Boolean).length;
  const maxWords = spec?.maxWords || WHAT_WORKS.wordCount.optimal;
  let wordScore: number;
  if (wordCount <= maxWords) {
    wordScore = 1.0;
    strengths.push(`${wordCount} words (within ${maxWords} limit)`);
  } else if (wordCount <= maxWords * 1.2) {
    wordScore = 0.6;
    issues.push(`${wordCount} words — ${wordCount - maxWords} over limit`);
  } else {
    wordScore = 0.2;
    issues.push(`${wordCount} words — significantly over ${maxWords} word limit`);
  }
  dimensions.push({ name: "word_count", score: wordScore, weight: 0.15, detail: `${wordCount}/${maxWords} words` });

  // 2. Anti-pattern check (weight: 0.20)
  let antiPatternScore = 1.0;
  const lowerEmail = email.toLowerCase();
  const foundAntiPatterns: string[] = [];
  for (const opener of WHAT_FAILS.openers) {
    if (lowerEmail.includes(opener.toLowerCase())) {
      antiPatternScore -= 0.2;
      foundAntiPatterns.push(opener);
    }
  }
  if (email.includes("!!!") || (email.match(/!/g) || []).length > 2) {
    antiPatternScore -= 0.15;
    foundAntiPatterns.push("excessive exclamation marks");
  }
  if (/\*\*.*\*\*/.test(email) || /<[a-z]/.test(email)) {
    antiPatternScore -= 0.1;
    foundAntiPatterns.push("markdown/HTML formatting (should be plain text)");
  }
  // Framework-specific anti-patterns
  if (spec) {
    const flattery = /\b(congrats|congratulations|impressive|love what you|amazing work)\b/i;
    const productFirst = /\b(we built|we offer|we provide|our platform|our product|our solution)\b/i;
    if (spec.name === "BASHO") {
      if (flattery.test(email)) {
        antiPatternScore -= 0.2;
        foundAntiPatterns.push("flattery (forbidden in BASHO)");
      }
      if (productFirst.test(email)) {
        antiPatternScore -= 0.2;
        foundAntiPatterns.push("product-first language (BASHO = peer insight, not pitch)");
      }
    }
    if (productFirst.test(email) && spec.name === "Challenger") {
      antiPatternScore -= 0.15;
      foundAntiPatterns.push("product mention before insight (Challenger = teach first)");
    }
  }
  antiPatternScore = Math.max(0, antiPatternScore);
  if (foundAntiPatterns.length > 0) {
    issues.push(`Anti-patterns: ${foundAntiPatterns.join(", ")}`);
  } else {
    strengths.push("No dead openers or anti-patterns");
  }
  dimensions.push({ name: "anti_patterns", score: antiPatternScore, weight: 0.20, detail: foundAntiPatterns.length === 0 ? "clean" : foundAntiPatterns.join("; ") });

  // 3. Personalization (weight: 0.25)
  let personalizationScore = 0;
  const personalizationHits: string[] = [];
  if (prospectContext?.name && email.includes(prospectContext.name.split(" ")[0])) {
    personalizationScore += 0.3;
    personalizationHits.push("prospect name");
  }
  if (prospectContext?.company && email.toLowerCase().includes(prospectContext.company.toLowerCase())) {
    personalizationScore += 0.3;
    personalizationHits.push("company name");
  }
  if (prospectContext?.signal && email.toLowerCase().includes(prospectContext.signal.toLowerCase().split(" ")[0])) {
    personalizationScore += 0.4;
    personalizationHits.push("signal reference");
  } else if (!prospectContext?.signal) {
    personalizationScore += 0.2; // no signal available, don't penalize
  }
  personalizationScore = Math.min(1.0, personalizationScore);
  if (personalizationScore >= 0.7) {
    strengths.push(`Personalized: ${personalizationHits.join(", ")}`);
  } else {
    issues.push(`Weak personalization: only ${personalizationHits.join(", ") || "nothing"} referenced`);
  }
  dimensions.push({ name: "personalization", score: personalizationScore, weight: 0.25, detail: personalizationHits.join(", ") || "none" });

  // 4. CTA clarity (weight: 0.15)
  const lines = email.split("\n").filter((l) => l.trim().length > 0);
  const lastLines = lines.slice(-3).join(" ").toLowerCase();
  const hasQuestion = lastLines.includes("?");
  const hasSingleCTA = (email.match(/\?/g) || []).length <= 2;
  let ctaScore = 0;
  if (hasQuestion && hasSingleCTA) {
    ctaScore = 1.0;
    strengths.push("Clear single CTA as question");
  } else if (hasQuestion) {
    ctaScore = 0.7;
    issues.push("Multiple questions dilute CTA");
  } else {
    ctaScore = 0.3;
    issues.push("No question-based CTA in final lines");
  }
  dimensions.push({ name: "cta_clarity", score: ctaScore, weight: 0.15, detail: hasQuestion ? "question CTA present" : "no question CTA" });

  // 5. Subject line (weight: 0.10)
  let subjectScore = 0.5; // neutral if no subject
  if (subjectLine) {
    const subjectWords = subjectLine.split(/\s+/).length;
    const subjectChars = subjectLine.length;
    if (subjectWords >= 2 && subjectWords <= 4) subjectScore = 1.0;
    else if (subjectWords <= 6 && subjectChars <= 50) subjectScore = 0.8;
    else subjectScore = 0.4;

    if (subjectLine === subjectLine.toLowerCase()) subjectScore = Math.min(1.0, subjectScore + 0.1);
    if (subjectLine.includes("?")) subjectScore = Math.min(1.0, subjectScore + 0.1);

    for (const killer of WHAT_FAILS.subjectLineKillers) {
      if (subjectLine.toLowerCase().includes(killer.toLowerCase())) {
        subjectScore = Math.max(0, subjectScore - 0.3);
        issues.push(`Subject line contains spam trigger: "${killer}"`);
      }
    }
  }
  dimensions.push({ name: "subject_line", score: subjectScore, weight: 0.10, detail: subjectLine || "not provided" });

  // 6. Framework compliance (weight: 0.15)
  let frameworkScore = 0.5; // neutral if no framework specified
  if (spec) {
    frameworkScore = 1.0;
    for (const antiPattern of spec.antiPatterns) {
      if (lowerEmail.includes(antiPattern.toLowerCase().slice(0, 20))) {
        frameworkScore -= 0.2;
        issues.push(`Framework violation: ${antiPattern}`);
      }
    }
    frameworkScore = Math.max(0, frameworkScore);
    if (frameworkScore >= 0.8) {
      strengths.push(`${spec.name} framework compliance`);
    }
  }
  dimensions.push({ name: "framework_compliance", score: frameworkScore, weight: 0.15, detail: spec?.name || "none" });

  // Composite score
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const score = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight;

  return { score, dimensions, issues, strengths };
}
