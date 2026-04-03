/**
 * Pure scoring functions — no DB, no side effects, fully testable.
 * Extracted from score/route.ts and score-contacts/route.ts.
 */

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

/** Score a company against an ICP. Pure function, no DB. */
export function calculateFitScore(
  company: Record<string, unknown>,
  props: Record<string, unknown>,
  icp?: FitIcp
): FitScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // Industry match (0-20)
  const industry = company.industry as string | null;
  if (industry) {
    const targetIndustries = icp?.industries;
    if (targetIndustries && targetIndustries.length > 0) {
      if (targetIndustries.some((t) => industry.toLowerCase().includes(t.toLowerCase()))) {
        score += 20;
        reasons.push(`Industry match: ${industry}`);
      } else {
        score += 3;
      }
    } else {
      score += 5; // No industry preference set — neutral
    }
  }

  // Size in range (0-20)
  const employeeCount = props.employee_count as number | null;
  if (employeeCount) {
    if (icp?.sizeRange) {
      const [minSize, maxSize] = icp.sizeRange;
      if (employeeCount >= minSize && employeeCount <= maxSize) {
        score += 20;
        reasons.push(`Size in range: ${employeeCount} employees`);
      } else if (employeeCount >= minSize * 0.5 && employeeCount <= maxSize * 2) {
        score += 10;
      } else {
        score += 3;
      }
    } else {
      score += 5; // No size preference set — neutral
    }
  }

  // Revenue in range (0-15)
  const annualRevenue = props.annual_revenue as number | null;
  if (annualRevenue) {
    if (icp?.revenueRange) {
      const [minRev, maxRev] = icp.revenueRange;
      if (annualRevenue >= minRev && annualRevenue <= maxRev) {
        score += 15;
        reasons.push(`Revenue in range: ${props.annual_revenue_printed || `$${(annualRevenue / 1_000_000).toFixed(0)}M`}`);
      } else if (annualRevenue >= minRev * 0.5) {
        score += 7;
      }
    } else {
      score += 5; // No revenue preference — neutral
    }
  }

  // Tech stack match (0-15)
  const technologies = (props.technologies as string[]) || [];
  if (technologies.length > 0 && icp?.technologies && icp.technologies.length > 0) {
    const matches = technologies.filter((t) =>
      icp.technologies!.some((tt) => t.toLowerCase().includes(tt.toLowerCase()))
    );
    if (matches.length >= 3) {
      score += 15;
      reasons.push(`Tech stack match: ${matches.slice(0, 3).join(", ")}`);
    } else if (matches.length >= 1) {
      score += 8;
      reasons.push(`Some tech overlap: ${matches.join(", ")}`);
    }
  }

  // Recent funding (0-10)
  const totalFunding = props.total_funding as number | null;
  const fundingStage = props.latest_funding_stage as string | null;
  if (totalFunding && totalFunding > 0) {
    score += 10;
    reasons.push(`Funded: ${props.total_funding_printed || `$${(totalFunding / 1_000_000).toFixed(0)}M`} (${fundingStage || "undisclosed"})`);
  }

  // LinkedIn presence (0-5)
  if (props.linkedin_url) {
    score += 5;
  }
  // Apollo enrichment (0-5)
  if (props.enrichment_source === "apollo") {
    score += 5;
    reasons.push("Verified by Apollo.io enrichment");
  }

  // Location (0-10)
  const country = props.country as string | null;
  if (country) {
    const preferredGeos = icp?.geographies || [];
    if (preferredGeos.length > 0) {
      if (preferredGeos.some((g) => country.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(country.toLowerCase()))) {
        score += 10;
        reasons.push(`Geography match: ${country}`);
      } else {
        score += 3;
      }
    } else {
      score += 5; // No geo preference set — neutral score
    }
  }

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

  let grade: string;
  if (score >= 80) grade = "A";
  else if (score >= 60) grade = "B";
  else if (score >= 40) grade = "C";
  else if (score >= 20) grade = "D";
  else grade = "F";

  return { score, reasons, grade };
}
