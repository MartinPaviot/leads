/**
 * Pure scoring functions — no DB, no side effects, fully testable.
 * Extracted from score/route.ts and score-contacts/route.ts.
 */

// ── Single source of truth for grade thresholds ──────────────────
// Used by both backend (score/route.ts) and frontend (ui-utils.ts).
// Ordered descending by min — first match wins.
export const GRADE_THRESHOLDS = [
  { min: 90, grade: "A+", heat: "Burning" as const, icon: "🔥" },
  { min: 80, grade: "A",  heat: "Burning" as const, icon: "🔥" },
  { min: 60, grade: "B",  heat: "Warm" as const,    icon: "☀️" },
  { min: 40, grade: "C",  heat: "Cool" as const,    icon: "" },
  { min: 20, grade: "D",  heat: "Cold" as const,    icon: "" },
  { min: 0,  grade: "F",  heat: "Cold" as const,    icon: "" },
] as const;

export type HeatLevel = "Burning" | "Warm" | "Cool" | "Cold";

export interface GradeInfo {
  grade: string;
  heat: HeatLevel;
  icon: string;
  min: number;
}

/** Get grade info from a numeric score. Single source of truth. */
export function getGrade(score: number): GradeInfo {
  const s = Math.round(score);
  for (const t of GRADE_THRESHOLDS) {
    if (s >= t.min) return { grade: t.grade, heat: t.heat, icon: t.icon, min: t.min };
  }
  return { grade: "F", heat: "Cold", icon: "", min: 0 };
}

export interface FitIcp {
  industries?: string[];
  sizeRange?: [number, number];
  revenueRange?: [number, number];
  technologies?: string[];
  geographies?: string[];
}

export interface FitScoreResult {
  score: number;
  reasons: string[];
}

/**
 * Score a company against an ICP. Pure function, no DB.
 *
 * Scoring (100 pts total):
 *   Industry:   30 pts — core ICP signal
 *   Size:       25 pts — core ICP signal
 *   Geography:  20 pts — core ICP signal
 *   Funding:    10 pts — budget/growth signal
 *   Revenue:    10 pts — scale signal
 *   Data:        5 pts — enrichment completeness
 *
 * 75 pts depend on ICP criteria. No free "neutral" points — a mismatch scores 0.
 */
export function calculateFitScore(
  company: Record<string, unknown>,
  props: Record<string, unknown>,
  icp?: FitIcp
): FitScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // ── Industry (0-30) ──
  const industry = company.industry as string | null;
  const targetIndustries = icp?.industries;
  if (targetIndustries && targetIndustries.length > 0) {
    if (industry && targetIndustries.some((t) => industry.toLowerCase().includes(t.toLowerCase()))) {
      score += 30;
      reasons.push(`Industry match: ${industry}`);
    } else if (industry) {
      reasons.push(`Industry mismatch: ${industry}`);
    }
  } else if (industry) {
    score += 15; // No preference set — moderate credit
  }

  // ── Size (0-25) ──
  let employeeCount = props.employee_count as number | null;
  if (!employeeCount && company.size) {
    const nums = String(company.size).replace(/,/g, "").split("-").map(Number).filter((n) => !isNaN(n) && n > 0);
    if (nums.length > 0) employeeCount = Math.round((Math.min(...nums) + Math.max(...nums)) / 2);
  }
  if (icp?.sizeRange) {
    const [minSize, maxSize] = icp.sizeRange;
    if (employeeCount) {
      if (employeeCount >= minSize && employeeCount <= maxSize) {
        score += 25;
        reasons.push(`Size match: ${employeeCount} employees`);
      } else if (employeeCount >= minSize * 0.5 && employeeCount <= maxSize * 2) {
        score += 12;
        reasons.push(`Size adjacent: ${employeeCount} employees`);
      } else {
        reasons.push(`Size mismatch: ${employeeCount} (target: ${minSize}-${maxSize})`);
      }
    }
  } else if (employeeCount) {
    score += 12;
  }

  // ── Geography (0-20) ──
  const country = props.country as string | null;
  const city = props.city as string | null;
  const loc = [city, country].filter(Boolean).join(", ").toLowerCase();
  const preferredGeos = icp?.geographies || [];
  if (preferredGeos.length > 0) {
    if (loc && preferredGeos.some((g) => loc.includes(g.toLowerCase()) || g.toLowerCase().includes(loc))) {
      score += 20;
      reasons.push(`Geography match: ${[city, country].filter(Boolean).join(", ")}`);
    } else if (loc) {
      reasons.push(`Geography mismatch: ${[city, country].filter(Boolean).join(", ")}`);
    }
  } else if (loc) {
    score += 10;
  }

  // ── Funding (0-10) ──
  const totalFunding = props.total_funding as number | null;
  const fundingStage = props.latest_funding_stage as string | null;
  if (totalFunding && totalFunding > 0) {
    const pts = totalFunding >= 10_000_000 ? 10 : totalFunding >= 1_000_000 ? 7 : 3;
    score += pts;
    reasons.push(`Funded: ${props.total_funding_printed || `$${(totalFunding / 1_000_000).toFixed(1)}M`} (${fundingStage || "undisclosed"})`);
  }

  // ── Revenue (0-10) ──
  const annualRevenue = props.annual_revenue as number | null;
  if (annualRevenue) {
    if (icp?.revenueRange) {
      const [minRev, maxRev] = icp.revenueRange;
      if (annualRevenue >= minRev && annualRevenue <= maxRev) {
        score += 10;
        reasons.push(`Revenue in range: ${props.annual_revenue_printed || `$${(annualRevenue / 1_000_000).toFixed(0)}M`}`);
      } else if (annualRevenue >= minRev * 0.5) {
        score += 5;
      }
    } else {
      score += annualRevenue >= 10_000_000 ? 8 : annualRevenue >= 1_000_000 ? 5 : 2;
    }
  }

  // ── Data quality (0-5) ──
  let dq = 0;
  if (company.industry) dq++;
  if (employeeCount) dq++;
  if (company.description) dq++;
  if (props.linkedin_url) dq++;
  if (props.enrichment_source === "apollo") dq++;
  score += dq;

  return { score: Math.min(100, score), reasons };
}

/** Score a contact against target role keywords. Pure function, no DB. */
export function calculateContactFitScore(
  contact: Record<string, unknown>,
  props: Record<string, unknown>,
  company: Record<string, unknown> | null,
  targetRoleKeywords: string[] = []
): { score: number; reasons: string[]; grade: string } {
  let score = 0;
  const reasons: string[] = [];

  // Seniority scoring (0-30)
  const seniority = (props?.seniority as string)?.toLowerCase() || "";
  if (seniority.includes("c-suite") || seniority.includes("founder") || seniority.includes("owner")) {
    score += 30;
    reasons.push(`Decision maker: ${seniority}`);
  } else if (seniority.includes("vp") || seniority.includes("vice president")) {
    score += 25;
    reasons.push(`Senior leader: ${seniority}`);
  } else if (seniority.includes("director")) {
    score += 20;
    reasons.push(`Director level: ${seniority}`);
  } else if (seniority.includes("manager") || seniority.includes("head")) {
    score += 15;
    reasons.push(`Manager level: ${seniority}`);
  } else if (seniority.includes("senior") || seniority.includes("lead")) {
    score += 10;
  } else if (seniority) {
    score += 5;
  }

  // Title match against ICP target roles (0-10)
  const title = ((contact.title as string) || "").toLowerCase();
  if (targetRoleKeywords.length > 0) {
    if (targetRoleKeywords.some((kw) => title.includes(kw))) {
      score += 10;
      reasons.push(`ICP role match: ${contact.title}`);
    }
  } else {
    if (title) score += 3;
  }

  // Department relevance (0-15)
  const department = ((props?.department as string) || (props?.departments as string[])?.join(", ") || "").toLowerCase();
  if (department && targetRoleKeywords.length > 0) {
    if (targetRoleKeywords.some((kw) => department.includes(kw))) {
      score += 15;
      reasons.push(`Target department: ${department}`);
    } else {
      score += 5;
    }
  } else if (department) {
    score += 5;
  }

  // Email verification (0-10)
  if (props?.email_status === "verified") {
    score += 10;
    reasons.push("Email verified");
  } else if (props?.email_status === "likely") {
    score += 5;
  }

  // LinkedIn (0-5)
  if (contact.linkedinUrl) score += 5;
  // Phone (0-5)
  if (contact.phone) score += 5;
  // Apollo (0-5)
  if (props?.enrichment_source === "apollo") {
    score += 5;
    reasons.push("Verified by Apollo enrichment");
  }

  // Company score (0-20)
  if (company) {
    const companyScore = company.score as number | null;
    if (companyScore && companyScore >= 60) {
      score += 20;
      reasons.push(`High-scoring company: ${company.name} (${companyScore})`);
    } else if (companyScore && companyScore >= 40) {
      score += 10;
    } else if (companyScore && companyScore >= 20) {
      score += 5;
    }
  }

  score = Math.min(100, score);

  const { grade } = getGrade(score);

  return { score, reasons, grade };
}
