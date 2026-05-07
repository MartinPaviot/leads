import { db } from "@/db";
import { intelligenceBriefs, companies, contacts } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import type { IntelligenceBrief } from "./types";
import { scrapeCompanyWebsite } from "./sources/website";
import { fetchRecentNews } from "./sources/news";
import { scrapeJobPostings } from "./sources/jobs";
import { detectTechStack } from "./sources/tech-stack";
import { fetchLinkedInActivity } from "./sources/linkedin";
import { synthesizeBrief } from "./brief-synthesizer";

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

  // Parallel source fetching — soft-fail each
  const sources = await fetchAllSources(company.domain, contact?.linkedinUrl || null, company.name);

  // LLM synthesis
  const synthesized = await synthesizeBrief(
    {
      website: sources.website,
      news: sources.news,
      jobs: sources.jobs,
      techStack: sources.techStack,
      linkedin: sources.linkedin,
    },
    {
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      size: company.size,
    },
    contact
  );

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
