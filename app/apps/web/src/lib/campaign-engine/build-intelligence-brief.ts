import { db } from "@/db";
import { intelligenceBriefs, companies, contacts } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { IntelligenceBrief, FirmographicFacts, FieldProvenance } from "./types";
import type { ResearchBriefContext } from "@/lib/context/prospect-context";
import { scrapeCompanyWebsite } from "./sources/website";
import { fetchRecentNews } from "./sources/news";
import { scrapeJobPostings } from "./sources/jobs";
import { detectTechStack } from "./sources/tech-stack";
import { fetchLinkedInActivity } from "./sources/linkedin";
import { synthesizeBrief } from "./brief-synthesizer";
import { runResearchAgent } from "./research-agent";
import { enrichFirmographics } from "./sources/apollo-enrich";

/** True for the tenant-budget cap error thrown by enforceLlmBudget (traced-ai). */
function isBudgetError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "BudgetExceededError";
}

interface BuildOptions {
  forceRefresh?: boolean;
}

const BRIEF_TTL_DAYS = 14;

export async function buildIntelligenceBrief(
  companyId: string,
  tenantId: string,
  contactId?: string,
  options?: BuildOptions
): Promise<IntelligenceBrief | null> {
  // Check cache unless force refresh
  if (!options?.forceRefresh) {
    const cached = await getCachedBrief(tenantId, companyId, contactId || null);
    if (cached) return cached;
  }

  // Load company + contact from DB
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.tenantId, tenantId)))
    .limit(1);

  if (!company) return null;

  let contact: { firstName: string | null; lastName: string | null; title: string | null; linkedinUrl: string | null } | null = null;
  if (contactId) {
    const [c] = await db
      .select({ firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title, linkedinUrl: contacts.linkedinUrl })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    contact = c || null;
  }

  // P1-9 — research path: the agentic loop (RESEARCH_AGENT_ENABLED) drives the
  // sources and produces the synthesized fields, with the deterministic
  // fetchAllSources + synthesizeBrief as a fail-open fallback. A budget cap is
  // fail-CLOSED (re-trying in fallback would burn more of an over-cap tenant).
  let sources: Awaited<ReturnType<typeof fetchAllSources>>;
  let synthesized: Awaited<ReturnType<typeof synthesizeBrief>>;
  // P1-10 — verified firmographics, populated only on the agent path (the
  // deterministic fallback has no Apollo waterfall). Null when no provider hit.
  let firmographics: FirmographicFacts | null = null;
  let firmographicProvenance: FieldProvenance[] = [];

  const runDeterministic = async () => {
    const s = await fetchAllSources(company.domain, contact?.linkedinUrl || null, company.name);
    const syn = await synthesizeBrief(
      { website: s.website, news: s.news, jobs: s.jobs, techStack: s.techStack, linkedin: s.linkedin },
      { name: company.name, domain: company.domain, industry: company.industry, size: company.size },
      contact,
    );
    return { s, syn };
  };

  if (process.env.RESEARCH_AGENT_ENABLED === "1") {
    try {
      const r = await runResearchAgent({
        tenantId,
        companyName: company.name,
        domain: company.domain,
        contact,
        // P1-10 — Apollo/registry firmographics via the existing waterfall, as
        // the agent's enrichApollo tool. The model folds funding/headcount in.
        enrichApollo: ({ domain }) => enrichFirmographics({ domain, companyName: company.name, tenantId }),
      });
      synthesized = r.synthesized;
      // P1-10 — the agent's enrichApollo result, captured in the ledger.
      if (r.collected.firmographics) {
        firmographics = r.collected.firmographics.facts;
        firmographicProvenance = r.collected.firmographics.provenance;
      }
      sources = {
        website: r.collected.website,
        news: r.collected.news,
        jobs: r.collected.jobs,
        techStack: r.collected.techStack,
        linkedin: null,
        attempted: r.attempted,
        succeeded: r.succeeded,
        errors: r.errors,
      };
    } catch (err) {
      if (isBudgetError(err)) throw err; // fail-closed on budget
      const { s, syn } = await runDeterministic();
      sources = s;
      synthesized = syn;
    }
  } else {
    const { s, syn } = await runDeterministic();
    sources = s;
    synthesized = syn;
  }

  // Build the full brief
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + BRIEF_TTL_DAYS);

  const briefData = {
    tenantId,
    companyId,
    contactId: contactId || null,
    websiteSummary: synthesized.websiteSummary,
    recentNews: sources.news,
    jobPostings: sources.jobs,
    techStack: sources.techStack,
    linkedinActivity: sources.linkedin,
    publicContent: synthesized.publicContent,
    competitorDetected: synthesized.competitorDetected,
    communicationStyle: synthesized.communicationStyle,
    painPoints: synthesized.painPoints,
    bestAngle: synthesized.bestAngle,
    warmthSignals: synthesized.warmthSignals,
    publicContentDepth: synthesized.publicContentDepth,
    sourcesAttempted: sources.attempted,
    sourcesSucceeded: sources.succeeded,
    sourceErrors: sources.errors,
    // P1-10 — persisted so the prompt can cite verified firmographics with source.
    firmographics,
    firmographicProvenance,
    researchedAt: new Date(),
    expiresAt,
  };

  // Upsert
  const [row] = await db
    .insert(intelligenceBriefs)
    .values(briefData)
    .onConflictDoUpdate({
      target: [intelligenceBriefs.tenantId, intelligenceBriefs.companyId, intelligenceBriefs.contactId],
      set: briefData,
    })
    .returning();

  return rowToBrief(row);
}

async function getCachedBrief(
  tenantId: string,
  companyId: string,
  contactId: string | null
): Promise<IntelligenceBrief | null> {
  const conditions = [
    eq(intelligenceBriefs.tenantId, tenantId),
    eq(intelligenceBriefs.companyId, companyId),
    gt(intelligenceBriefs.expiresAt, new Date()),
  ];

  if (contactId) {
    conditions.push(eq(intelligenceBriefs.contactId, contactId));
  }

  const [row] = await db
    .select()
    .from(intelligenceBriefs)
    .where(and(...conditions))
    .limit(1);

  return row ? rowToBrief(row) : null;
}

/**
 * P0-2 — read-only cache accessor for the prospect-context wiring. NEVER
 * scrapes; delegates to the TTL + tenant-scoped getCachedBrief. The generation
 * path reads the brief through this so research can lead the copy without
 * blocking on a cold scrape (that stays in buildIntelligenceBrief).
 */
export async function readCachedBrief(
  tenantId: string,
  companyId: string,
  contactId: string | null,
): Promise<IntelligenceBrief | null> {
  return getCachedBrief(tenantId, companyId, contactId);
}

/** True when firmographics carries at least one verifiable fact worth citing. */
function firmographicsHaveSignal(f: FirmographicFacts | null): boolean {
  if (!f) return false;
  return (
    f.employeeCount != null ||
    f.sizeRange != null ||
    f.fundingStage != null ||
    f.totalFunding != null ||
    f.annualRevenue != null ||
    f.revenueRange != null ||
    f.foundedYear != null ||
    f.industry != null ||
    f.investors.length > 0 ||
    f.technologies.length > 0 ||
    f.city != null ||
    f.country != null
  );
}

/** Map a full brief to the trimmed shape the generation prompt consumes. */
export function toResearchBriefContext(b: IntelligenceBrief): ResearchBriefContext {
  return {
    bestAngle: b.bestAngle,
    painPoints: b.painPoints ?? [],
    competitorDetected: b.competitorDetected,
    // Keep up to 6 (was 2) so VERIFIED crawled facts/metrics survive into the
    // judge's fact sheet — otherwise a real "3,848 projects" the agent read but
    // that fell past the 2-item cap reads as ungrounded and the fabrication gate
    // wrongly strips it. "metric"-typed entries are prioritised over prose.
    publicContent: [...(b.publicContent ?? [])]
      .sort((a, c) => (a.type === "metric" ? -1 : 0) - (c.type === "metric" ? -1 : 0))
      .slice(0, 6)
      .map((p) => ({
        type: p.type,
        title: p.title,
        quote: (p.quote ?? "").slice(0, 200),
      })),
    warmthSignals: (b.warmthSignals ?? []).map((w) => ({ type: w.type, detail: w.detail })),
    // P1-10 — only attach when there's a real fact (so briefIsEmpty stays honest
    // and the prompt's FIRMOGRAPHICS section never renders empty).
    firmographics: firmographicsHaveSignal(b.firmographics)
      ? { facts: b.firmographics as FirmographicFacts, provenance: b.firmographicProvenance ?? [] }
      : undefined,
  };
}

/** True when the mapped brief carries nothing usable — don't inject it. */
export function briefIsEmpty(c: ResearchBriefContext): boolean {
  return (
    !c.bestAngle &&
    c.painPoints.length === 0 &&
    !c.competitorDetected &&
    c.publicContent.length === 0 &&
    c.warmthSignals.length === 0 &&
    !c.firmographics
  );
}

interface FetchResult {
  website: Awaited<ReturnType<typeof scrapeCompanyWebsite>>;
  news: Awaited<ReturnType<typeof fetchRecentNews>>;
  jobs: Awaited<ReturnType<typeof scrapeJobPostings>>;
  techStack: Awaited<ReturnType<typeof detectTechStack>>;
  linkedin: Awaited<ReturnType<typeof fetchLinkedInActivity>>;
  attempted: number;
  succeeded: number;
  errors: Array<{ source: string; error: string }>;
}

async function fetchAllSources(
  domain: string | null,
  linkedinUrl: string | null,
  companyName: string
): Promise<FetchResult> {
  const errors: Array<{ source: string; error: string }> = [];
  let attempted = 0;
  let succeeded = 0;

  const tasks: Array<{ name: string; fn: () => Promise<unknown> }> = [];

  if (domain) {
    tasks.push({ name: "website", fn: () => scrapeCompanyWebsite(domain) });
    tasks.push({ name: "jobs", fn: () => scrapeJobPostings(domain) });
    tasks.push({ name: "techStack", fn: () => detectTechStack(domain) });
  }

  tasks.push({ name: "news", fn: () => fetchRecentNews(companyName) });

  if (linkedinUrl) {
    tasks.push({ name: "linkedin", fn: () => fetchLinkedInActivity(linkedinUrl) });
  }

  attempted = tasks.length;

  const results = await Promise.allSettled(tasks.map((t) => t.fn()));

  const resolved: Record<string, unknown> = {};
  results.forEach((r, i) => {
    const taskName = tasks[i].name;
    if (r.status === "fulfilled" && r.value !== null) {
      resolved[taskName] = r.value;
      succeeded++;
    } else {
      const errMsg = r.status === "rejected" ? String(r.reason) : "returned null";
      errors.push({ source: taskName, error: errMsg });
    }
  });

  return {
    website: (resolved.website as FetchResult["website"]) || null,
    news: (resolved.news as FetchResult["news"]) || [],
    jobs: (resolved.jobs as FetchResult["jobs"]) || [],
    techStack: (resolved.techStack as FetchResult["techStack"]) || [],
    linkedin: (resolved.linkedin as FetchResult["linkedin"]) || null,
    attempted,
    succeeded,
    errors,
  };
}

function rowToBrief(row: typeof intelligenceBriefs.$inferSelect): IntelligenceBrief {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    contactId: row.contactId,
    websiteSummary: row.websiteSummary,
    recentNews: (row.recentNews || []) as IntelligenceBrief["recentNews"],
    jobPostings: (row.jobPostings || []) as IntelligenceBrief["jobPostings"],
    techStack: (row.techStack || []) as IntelligenceBrief["techStack"],
    linkedinActivity: row.linkedinActivity as IntelligenceBrief["linkedinActivity"],
    publicContent: (row.publicContent || []) as IntelligenceBrief["publicContent"],
    competitorDetected: row.competitorDetected,
    communicationStyle: row.communicationStyle as IntelligenceBrief["communicationStyle"],
    painPoints: (row.painPoints || []) as string[],
    bestAngle: row.bestAngle,
    warmthSignals: (row.warmthSignals || []) as IntelligenceBrief["warmthSignals"],
    publicContentDepth: row.publicContentDepth || 0,
    sourcesAttempted: row.sourcesAttempted || 0,
    sourcesSucceeded: row.sourcesSucceeded || 0,
    sourceErrors: (row.sourceErrors || []) as IntelligenceBrief["sourceErrors"],
    firmographics: (row.firmographics ?? null) as FirmographicFacts | null,
    firmographicProvenance: (row.firmographicProvenance ?? []) as FieldProvenance[],
    researchedAt: row.researchedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function invalidateBrief(tenantId: string, companyId: string): Promise<void> {
  await db
    .update(intelligenceBriefs)
    .set({ expiresAt: new Date() })
    .where(and(eq(intelligenceBriefs.tenantId, tenantId), eq(intelligenceBriefs.companyId, companyId)));
}
