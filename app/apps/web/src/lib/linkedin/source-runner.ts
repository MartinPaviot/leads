/**
 * The shared resolve→preview/source core for a LinkedIn sourcing request. One
 * input shape (`SourcingInput`) covers all four categories; this module resolves
 * it to a search body and runs the matching sourcer. Reused by the chat tools
 * (lib/chat/tools/linkedin-sourcing.ts) AND the recurring search-monitor cron, so
 * the category dispatch lives in exactly one place.
 */
import { z } from "zod";
import { type LinkedInSearchApi, type LinkedInSearchCategory, type UnipileConfig } from "@/lib/providers/unipile/http";
import { apiForSeat, type ConnectedSeat } from "./seat";
import { resolveIcpToSalesNavQuery, previewSalesNavCount, type IcpSearchCriteria } from "./icp-to-salesnav";
import { sourceFromSalesNav } from "./sales-nav-sourcing";
import { resolveJobsQuery, buildPostsSearchBody, type JobsSearchCriteria } from "./jobs-posts";
import { sourceHiringSignals, sourcePostAuthors } from "./jobs-posts-sourcing";

const SIZE_BUCKETS: Record<string, { min?: number; max?: number }> = {
  "1-10": { min: 1, max: 10 },
  "11-50": { min: 11, max: 50 },
  "51-200": { min: 51, max: 200 },
  "201-500": { min: 201, max: 500 },
  "501-1000": { min: 501, max: 1000 },
  "1001-5000": { min: 1001, max: 5000 },
  "5001-10000": { min: 5001, max: 10000 },
  "10001+": { min: 10001 },
};

/** One input shape covers all four categories; the agent fills what's relevant
 * (the descriptions spell out which field applies where). Also the persisted
 * shape of a search monitor's criteria. */
export const sourcingInputSchema = z.object({
  category: z
    .enum(["people", "companies", "jobs", "posts"])
    .describe(
      "people = decision-makers (ICP); companies = target accounts; jobs = companies HIRING for a role (a buying signal — lands as accounts + a hiring signal); posts = people POSTING about a topic (warm leads — lands as contacts).",
    ),
  keywords: z.string().optional().describe("free-text keywords (required for posts)"),
  industries: z.array(z.string()).optional().describe("e.g. ['software','fintech'] (people/companies/jobs)"),
  locations: z.array(z.string()).optional().describe("e.g. ['France','United States']"),
  titles: z.array(z.string()).optional().describe("people: current job titles; jobs: the role(s) being hired for"),
  companies: z.array(z.string()).optional().describe("company names (people: current employer; jobs: hiring company)"),
  seniorities: z
    .array(z.string())
    .optional()
    .describe(
      "people: cxo/vice_president/director/owner-partner/experienced_manager/senior/entry_level/in_training; jobs: executive/director/mid_senior/associate/entry/intern",
    ),
  companySize: z.array(z.enum(["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"])).optional().describe("employee-count buckets (people/companies)"),
  changedJobs: z.boolean().optional().describe("people: only people who recently changed jobs"),
  postedRecently: z.boolean().optional().describe("people: only people who posted on LinkedIn recently"),
  hiringNow: z.boolean().optional().describe("companies: only companies with open job listings"),
  fastGrowing: z.boolean().optional().describe("companies: only fast-growing (>20% headcount growth)"),
  presence: z.array(z.enum(["on_site", "hybrid", "remote"])).optional().describe("jobs: workplace type"),
  datePostedDays: z.number().int().positive().optional().describe("jobs: only jobs posted within N days"),
  recency: z.enum(["past_day", "past_week", "past_month"]).optional().describe("posts: how recent"),
  includeEngagers: z.boolean().optional().describe("posts: also source everyone who reacted/commented on each post"),
  maxResults: z.number().int().positive().max(500).optional().describe("cap the run (default 100; posts default 50)"),
});
export type SourcingInput = z.infer<typeof sourcingInputSchema>;

const list = (a?: string[]) => (a ?? []).map((s) => s.trim()).filter(Boolean);
const sizes = (a?: string[]) => (a ?? []).map((k) => SIZE_BUCKETS[k]).filter(Boolean);

export interface ResolvedSourcingQuery {
  body: { api: LinkedInSearchApi | "classic"; category: string; [k: string]: unknown };
  resolution?: unknown;
  dropped?: string[];
  usable: boolean;
  error?: string;
}

/** Build the search body for the chosen category (resolving free-text → ids). */
export async function resolveSourcingQuery(
  cfg: UnipileConfig,
  seatType: string | null,
  accountId: string,
  input: SourcingInput,
): Promise<ResolvedSourcingQuery> {
  const api = apiForSeat(seatType);
  if (input.category === "people" || input.category === "companies") {
    const category = input.category as LinkedInSearchCategory;
    const icp: IcpSearchCriteria = {
      keywords: input.keywords,
      industries: list(input.industries),
      locations: list(input.locations),
      companyHeadcount: sizes(input.companySize),
    };
    if (input.category === "people") {
      icp.jobTitles = list(input.titles);
      icp.companies = list(input.companies);
      icp.seniorities = list(input.seniorities);
      icp.changedJobs = input.changedJobs;
      icp.postedOnLinkedin = input.postedRecently;
    } else {
      icp.hasJobOffers = input.hiringNow;
      if (input.fastGrowing) icp.headcountGrowth = { min: 20 };
    }
    const r = await resolveIcpToSalesNavQuery(cfg, accountId, icp, { api, category });
    return { body: r.body, resolution: r.report, dropped: r.dropped, usable: r.usable };
  }
  if (input.category === "jobs") {
    const criteria: JobsSearchCriteria = {
      keywords: input.keywords,
      locations: list(input.locations),
      industries: list(input.industries),
      roles: list(input.titles),
      companies: list(input.companies),
      seniorities: list(input.seniorities),
      presence: list(input.presence),
      datePostedDays: input.datePostedDays,
    };
    const r = await resolveJobsQuery(cfg, accountId, criteria);
    return { body: r.body, resolution: r.report, usable: r.usable };
  }
  // posts
  const body = buildPostsSearchBody({ keywords: input.keywords, datePosted: input.recency });
  return { body, usable: !!body.keywords, error: body.keywords ? undefined : "Posts search needs at least a keyword." };
}

/** A category-normalized sourcing result. */
export interface SourcingRunResult {
  category: string;
  accounts: number;
  contacts: number;
  openRoles?: number;
  resolution?: unknown;
  dropped?: string[];
}

/** Preview the segment size (limit=1 → total_count) without sourcing. */
export async function previewSourcing(
  cfg: UnipileConfig,
  seat: ConnectedSeat,
  input: SourcingInput,
): Promise<{ total: number | null; resolution?: unknown; dropped?: string[] } | { error: string; resolution?: unknown }> {
  const q = await resolveSourcingQuery(cfg, seat.seatType, seat.unipileAccountId, input);
  if (q.error) return { error: q.error };
  if (!q.usable) return { error: "Add at least a keyword or one filter (industry / title / location / seniority).", resolution: q.resolution };
  const total = await previewSalesNavCount(cfg, seat.unipileAccountId, q.body as never);
  return { total, resolution: q.resolution, dropped: q.dropped };
}

/** Resolve + source the segment INTO the CRM (deduped). Returns a normalized
 * count by category, or an `error` string when the query isn't usable. */
export async function runSourcing(
  cfg: UnipileConfig,
  seat: ConnectedSeat,
  tenantId: string,
  input: SourcingInput,
  opts: { hydrateAccounts?: boolean } = {},
): Promise<SourcingRunResult | { error: string; resolution?: unknown }> {
  const q = await resolveSourcingQuery(cfg, seat.seatType, seat.unipileAccountId, input);
  if (q.error) return { error: q.error };
  if (!q.usable) return { error: "Add at least a keyword or one filter (industry / title / location / seniority).", resolution: q.resolution };
  const maxResults = Math.min(500, Math.max(1, input.maxResults ?? (input.category === "posts" ? 50 : 100)));
  const hydrateAccounts = opts.hydrateAccounts !== false;

  if (input.category === "jobs") {
    const r = await sourceHiringSignals({ cfg, tenantId, unipileAccountId: seat.unipileAccountId, body: q.body as never, maxResults, hydrateAccounts });
    return { category: "jobs", accounts: r.accountsUpserted, contacts: 0, openRoles: r.signalsRecorded, resolution: q.resolution };
  }
  if (input.category === "posts") {
    const r = await sourcePostAuthors({ cfg, tenantId, unipileAccountId: seat.unipileAccountId, body: q.body as never, maxResults, includeEngagers: input.includeEngagers === true });
    return { category: "posts", accounts: 0, contacts: r.authorsUpserted + r.engagersSourced };
  }
  const r = await sourceFromSalesNav({ tenantId, unipileAccountId: seat.unipileAccountId, query: q.body as never, maxResults, hydrateAccounts });
  return { category: input.category, accounts: r.accountsUpserted, contacts: r.contactsUpserted, resolution: q.resolution, dropped: q.dropped };
}
