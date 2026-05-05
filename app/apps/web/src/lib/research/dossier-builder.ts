/**
 * Autonomous Research Dossier Builder
 *
 * Given a company name or domain, builds a comprehensive intelligence
 * dossier WITHOUT any human input. Orchestrates multiple data sources
 * and AI analysis steps:
 *
 * 1. Company basics: name, domain, industry, size, revenue (Apollo)
 * 2. Leadership: key executives with titles and LinkedIn (Apollo)
 * 3. Funding history: rounds, investors, total raised (Apollo)
 * 4. Tech stack: technologies used (Apollo/web analysis)
 * 5. Hiring signals: open roles, growth areas (Apollo)
 * 6. Competitive landscape: who they compete with (LLM analysis)
 * 7. Potential fit: how they match the user's ICP (LLM analysis)
 * 8. Recommended approach: best contact, messaging angle, timing (LLM)
 *
 * The dossier is self-contained -- a founder can read it before a
 * meeting and know everything relevant in 2 minutes.
 */

import {
  enrichOrganization,
  searchPeople,
  isApolloAvailable,
  employeeCountToRange,
  revenueToRange,
  type ApolloOrganization,
  type ApolloPerson,
} from "@/lib/integrations/apollo-client";
import { withCircuitBreaker, APOLLO_CIRCUIT } from "@/lib/infra/circuit-breaker";
import { retryWithBackoff } from "@/lib/infra/retry";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { getModelForTask } from "@/lib/ai/ai-provider";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import logger from "@/lib/observability/logger";

// ── Types ────────────────────────────────────────────────────

export interface Dossier {
  company: {
    name: string;
    domain: string;
    industry: string;
    size: string;
    revenue: string;
    description: string;
  };
  leadership: Array<{
    name: string;
    title: string;
    linkedin?: string;
    relevance: string;
  }>;
  funding: {
    totalRaised: string;
    lastRound: string;
    investors: string[];
    date: string;
  } | null;
  techStack: string[];
  hiringSignals: Array<{
    role: string;
    department: string;
    signal: string;
  }>;
  competitiveLandscape: string;
  icpFit: {
    score: number;
    reasoning: string;
    gaps: string[];
  };
  recommendedApproach: {
    bestContact: string;
    messagingAngle: string;
    timing: string;
    openingLine: string;
  };
  sources: string[];
  generatedAt: string;
}

// ── Cache check ─────────────────────────────────────────────

const CACHE_TTL_DAYS = 7;

async function getCachedDossier(
  domain: string,
  tenantId: string,
): Promise<Dossier | null> {
  const [company] = await db
    .select({ properties: companies.properties })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, domain)))
    .limit(1);

  if (!company) return null;

  const props = (company.properties || {}) as Record<string, unknown>;
  const dossier = props.dossier as Dossier | undefined;
  if (!dossier?.generatedAt) return null;

  const generatedAt = new Date(dossier.generatedAt).getTime();
  const ageMs = Date.now() - generatedAt;
  if (ageMs > CACHE_TTL_DAYS * 86400000) return null;

  return dossier;
}

async function cacheDossier(
  domain: string,
  tenantId: string,
  dossier: Dossier,
): Promise<void> {
  const [company] = await db
    .select({ id: companies.id, properties: companies.properties })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, domain)))
    .limit(1);

  if (!company) return;

  const props = (company.properties || {}) as Record<string, unknown>;
  await db
    .update(companies)
    .set({
      properties: { ...props, dossier },
      updatedAt: new Date(),
    })
    .where(eq(companies.id, company.id));
}

// ── Domain extraction ───────────────────────────────────────

function extractDomain(input: string): string | null {
  const trimmed = input.trim();
  // If it looks like a domain already
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // If it looks like a URL
  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
    );
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

// ── Step 1: Company basics via Apollo ───────────────────────

async function fetchCompanyBasics(
  domain: string,
): Promise<{
  org: ApolloOrganization | null;
  sources: string[];
}> {
  if (!isApolloAvailable()) {
    return { org: null, sources: [] };
  }

  try {
    const org = await retryWithBackoff(
      () => enrichOrganization(domain),
      { attempts: 2, baseDelayMs: 500 },
    );
    return {
      org,
      sources: org ? ["Apollo organization enrichment"] : [],
    };
  } catch (err) {
    logger.warn("[dossier] Apollo org enrichment failed", { domain, error: String(err) });
    return { org: null, sources: [] };
  }
}

// ── Step 2: Leadership via Apollo people search ─────────────

async function fetchLeadership(
  domain: string,
): Promise<{
  people: ApolloPerson[];
  sources: string[];
}> {
  if (!isApolloAvailable()) {
    return { people: [], sources: [] };
  }

  try {
    const result = await retryWithBackoff(
      () =>
        searchPeople({
          q_organization_domains: domain,
          person_seniorities: [
            "c_suite",
            "founder",
            "owner",
            "vp",
            "director",
          ],
          per_page: 10,
        }),
      { attempts: 2, baseDelayMs: 500 },
    );
    return {
      people: result.people || [],
      sources: result.people?.length ? ["Apollo people search"] : [],
    };
  } catch (err) {
    logger.warn("[dossier] Apollo people search failed", { domain, error: String(err) });
    return { people: [], sources: [] };
  }
}

// ── Step 3: LLM analysis ───────────────────────────────────

const analysisSchema = z.object({
  competitiveLandscape: z
    .string()
    .describe(
      "2-3 sentence analysis of the competitive landscape and positioning",
    ),
  icpFit: z.object({
    score: z
      .number()
      .min(0)
      .max(100)
      .describe("ICP fit score 0-100"),
    reasoning: z
      .string()
      .describe("Why this company does or does not match the ICP"),
    gaps: z
      .array(z.string())
      .describe("Specific gaps or mismatches with the ICP"),
  }),
  recommendedApproach: z.object({
    bestContact: z
      .string()
      .describe(
        "Name and title of the best person to reach out to, with reasoning",
      ),
    messagingAngle: z
      .string()
      .describe(
        "The specific value proposition angle to lead with for this company",
      ),
    timing: z
      .string()
      .describe(
        "Recommended timing and urgency based on signals (funding, hiring, etc.)",
      ),
    openingLine: z
      .string()
      .describe(
        "A specific, non-generic opening line referencing something about this company",
      ),
  }),
  hiringSignals: z
    .array(
      z.object({
        role: z.string(),
        department: z.string(),
        signal: z
          .string()
          .describe("What this hire indicates about company direction"),
      }),
    )
    .describe("Inferred hiring signals and what they mean"),
});

async function runLlmAnalysis(
  companyInfo: {
    name: string;
    domain: string;
    industry: string;
    size: string;
    revenue: string;
    description: string;
    techStack: string[];
    fundingInfo: string;
  },
  leadershipSummary: string,
  tenantContext: {
    productDescription: string;
    targetIndustries: string[];
    targetCompanySizes: string[];
    targetRoles: string;
  },
  tenantId: string,
): Promise<z.infer<typeof analysisSchema> | null> {
  const model = getModelForTask("lightweight");
  if (!model) return null;

  try {
    const { object } = await tracedGenerateObject({
      model,
      schema: analysisSchema,
      prompt: `You are a sales intelligence analyst. Analyze this target company and provide strategic recommendations.

COMPANY:
- Name: ${companyInfo.name}
- Domain: ${companyInfo.domain}
- Industry: ${companyInfo.industry}
- Size: ${companyInfo.size}
- Revenue: ${companyInfo.revenue}
- Description: ${companyInfo.description}
- Tech Stack: ${companyInfo.techStack.join(", ") || "Unknown"}
- Funding: ${companyInfo.fundingInfo}

LEADERSHIP:
${leadershipSummary || "No leadership data available"}

OUR PRODUCT:
${tenantContext.productDescription || "Sales automation and GTM platform"}

OUR ICP:
- Target Industries: ${tenantContext.targetIndustries.join(", ") || "Not specified"}
- Target Company Sizes: ${tenantContext.targetCompanySizes.join(", ") || "Not specified"}
- Target Roles: ${tenantContext.targetRoles || "Not specified"}

Provide:
1. Competitive landscape analysis (who are they competing with, where are they positioned)
2. ICP fit score (0-100) with specific reasoning and gaps
3. Recommended outreach approach (best contact, messaging angle, timing, opening line)
4. Hiring signal interpretation (if any tech stack or company data suggests growth areas)

Be specific and actionable. No generic advice.`,
      _trace: {
        agentId: "dossier-builder",
        tenantId,
        inputPreview: `Dossier analysis for ${companyInfo.name}`,
      },
    });
    return object;
  } catch (err) {
    logger.warn("[dossier] LLM analysis failed", { error: String(err) });
    return null;
  }
}

// ── Main builder ────────────────────────────────────────────

export async function buildDossier(
  companyNameOrDomain: string,
  tenantId: string,
): Promise<Dossier> {
  const domain = extractDomain(companyNameOrDomain);

  // Check cache first (if we have a domain)
  if (domain) {
    const cached = await getCachedDossier(domain, tenantId);
    if (cached) {
      logger.info("[dossier] Returning cached dossier", { domain });
      return cached;
    }
  }

  // Step 1 & 2: Fetch company basics and leadership in parallel
  const [companyResult, leadershipResult] = await Promise.all([
    domain ? fetchCompanyBasics(domain) : { org: null, sources: [] as string[] },
    domain ? fetchLeadership(domain) : { people: [] as ApolloPerson[], sources: [] as string[] },
  ]);

  const { org } = companyResult;
  const { people } = leadershipResult;

  // Build company section
  const companyData = {
    name: org?.name || companyNameOrDomain,
    domain: domain || companyNameOrDomain,
    industry: org?.industry || "Unknown",
    size: org?.estimated_num_employees
      ? employeeCountToRange(org.estimated_num_employees)
      : "Unknown",
    revenue: org?.annual_revenue_printed || revenueToRange(org?.annual_revenue ?? null) || "Unknown",
    description: org?.description || "No description available",
  };

  // Build leadership section
  const leadership = people
    .filter((p) => p.name && p.title)
    .slice(0, 5)
    .map((p) => ({
      name: p.name!,
      title: p.title!,
      linkedin: p.linkedin_url || undefined,
      relevance: inferRelevance(p),
    }));

  // Build funding section
  const funding = org?.total_funding
    ? {
        totalRaised: org.total_funding_printed || `$${(org.total_funding / 1_000_000).toFixed(1)}M`,
        lastRound: org.latest_funding_stage || "Unknown",
        investors: org.investor_names || [],
        date: org.latest_funding_raised_at || "Unknown",
      }
    : null;

  // Build tech stack
  const techStack = org?.technology_names || [];

  // Load tenant context for ICP matching
  const settings = await getTenantSettings(tenantId);
  const tenantContext = {
    productDescription: settings.productDescription || "",
    targetIndustries: settings.targetIndustries || [],
    targetCompanySizes: settings.targetCompanySizes || [],
    targetRoles: settings.targetRoles || "",
  };

  // Build leadership summary for LLM
  const leadershipSummary = leadership
    .map((l) => `- ${l.name}, ${l.title}${l.linkedin ? ` (${l.linkedin})` : ""}`)
    .join("\n");

  const fundingInfo = funding
    ? `${funding.totalRaised} raised (last round: ${funding.lastRound}${funding.investors.length > 0 ? `, investors: ${funding.investors.join(", ")}` : ""})`
    : "No funding data available";

  // Step 3: LLM analysis
  const analysis = await runLlmAnalysis(
    {
      name: companyData.name,
      domain: companyData.domain,
      industry: companyData.industry,
      size: companyData.size,
      revenue: companyData.revenue,
      description: companyData.description,
      techStack,
      fundingInfo,
    },
    leadershipSummary,
    tenantContext,
    tenantId,
  );

  // Assemble dossier
  const dossier: Dossier = {
    company: companyData,
    leadership,
    funding,
    techStack,
    hiringSignals: analysis?.hiringSignals || inferHiringSignals(org),
    competitiveLandscape:
      analysis?.competitiveLandscape || "No competitive analysis available (LLM unavailable)",
    icpFit: analysis?.icpFit || {
      score: 50,
      reasoning: "Automated ICP fit scoring unavailable (LLM not configured)",
      gaps: [],
    },
    recommendedApproach: analysis?.recommendedApproach || {
      bestContact: leadership[0]
        ? `${leadership[0].name}, ${leadership[0].title}`
        : "Unknown",
      messagingAngle: "General value proposition",
      timing: "No specific timing signals detected",
      openingLine: `Hi, I noticed ${companyData.name} is in the ${companyData.industry} space...`,
    },
    sources: [
      ...companyResult.sources,
      ...leadershipResult.sources,
      ...(analysis ? ["Haiku LLM analysis"] : []),
    ],
    generatedAt: new Date().toISOString(),
  };

  // Cache the dossier in company properties
  if (domain) {
    cacheDossier(domain, tenantId, dossier).catch((err) =>
      logger.warn("[dossier] Failed to cache dossier", { error: String(err) }),
    );
  }

  return dossier;
}

// ── Helper functions ────────────────────────────────────────

function inferRelevance(person: ApolloPerson): string {
  const title = (person.title || "").toLowerCase();
  const seniority = (person.seniority || "").toLowerCase();

  if (seniority.includes("c_suite") || seniority.includes("founder")) {
    return "Decision maker - final budget authority";
  }
  if (seniority.includes("vp") || title.includes("vp") || title.includes("vice president")) {
    return "Senior leader - likely sponsor or champion";
  }
  if (seniority.includes("director") || title.includes("director")) {
    return "Director - operational decision maker";
  }
  if (title.includes("head of") || title.includes("lead")) {
    return "Team lead - potential champion or evaluator";
  }
  return "Potential stakeholder";
}

function inferHiringSignals(
  org: ApolloOrganization | null,
): Dossier["hiringSignals"] {
  if (!org) return [];

  const signals: Dossier["hiringSignals"] = [];

  if (org.num_current_job_openings && org.num_current_job_openings > 0) {
    signals.push({
      role: `${org.num_current_job_openings} open positions`,
      department: "Multiple",
      signal: "Active hiring indicates growth phase - budget likely available",
    });
  }

  // Infer from tech stack
  if (org.technology_names?.some((t) => t.toLowerCase().includes("salesforce"))) {
    signals.push({
      role: "CRM users",
      department: "Sales/RevOps",
      signal: "Using Salesforce - may be looking for alternatives or supplements",
    });
  }

  if (org.technology_names?.some((t) => t.toLowerCase().includes("hubspot"))) {
    signals.push({
      role: "Marketing/Sales",
      department: "Growth",
      signal: "Using HubSpot - may need more advanced sales automation",
    });
  }

  return signals;
}
