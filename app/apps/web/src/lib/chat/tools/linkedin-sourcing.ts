/**
 * Chat/agent tools for LinkedIn / Sales-Navigator sourcing — so the agent can
 * size and source a segment from ANYWHERE (chat, Slack), not only the settings
 * form. Mirrors the /api/linkedin/source engine, reusing the same resolvers +
 * sourcers and the shared seat resolver.
 *
 * Two tools:
 *  - previewLinkedInSearch (query): the segment size (TAM) for a query — read-only.
 *  - sourceFromLinkedIn (action): source the segment INTO the CRM (canonical
 *    upsert, deduped). This POPULATES the CRM; it does NOT contact anyone —
 *    contacting is a separate, HITL-gated step (enrollAccountListInSequence /
 *    sequence enrollment). So no approval gate here, like account-list creation.
 *
 * Categories: people / companies (ICP→Sales-Nav), jobs (hiring-signal companies),
 * posts (content-lead contacts). Jobs/posts run on the classic tier regardless of
 * the seat.
 */
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import { readUnipileConfig, type LinkedInSearchApi, type LinkedInSearchCategory } from "@/lib/providers/unipile/http";
import { resolveConnectedSeat, apiForSeat } from "@/lib/linkedin/seat";
import {
  resolveIcpToSalesNavQuery,
  previewSalesNavCount,
  type IcpSearchCriteria,
} from "@/lib/linkedin/icp-to-salesnav";
import { sourceFromSalesNav } from "@/lib/linkedin/sales-nav-sourcing";
import { resolveJobsQuery, buildPostsSearchBody, type JobsSearchCriteria } from "@/lib/linkedin/jobs-posts";
import { sourceHiringSignals, sourcePostAuthors } from "@/lib/linkedin/jobs-posts-sourcing";

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

// One input shape covers all four categories; the agent fills what's relevant
// (the description spells out which field applies where).
const sourcingInput = z.object({
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
type SourcingInput = z.infer<typeof sourcingInput>;

interface ResolvedQuery {
  body: { api: LinkedInSearchApi | "classic"; category: string; [k: string]: unknown };
  resolution?: unknown;
  dropped?: string[];
  usable: boolean;
  error?: string;
}

export function buildLinkedInSourcingTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  async function seatAndCfg() {
    const cfg = readUnipileConfig();
    if (!cfg) return { error: "LinkedIn isn't configured for this workspace." as const };
    const seat = await resolveConnectedSeat(tenantId, userId);
    if (!seat) return { error: "No connected LinkedIn / Sales Navigator seat — connect one in Settings → Sending infrastructure." as const };
    return { cfg, seat };
  }

  const list = (a?: string[]) => (a ?? []).map((s) => s.trim()).filter(Boolean);
  const sizes = (a?: string[]) => (a ?? []).map((k) => SIZE_BUCKETS[k]).filter(Boolean);

  // Build the search body for the chosen category (resolving free-text → ids).
  async function resolveQuery(cfg: NonNullable<ReturnType<typeof readUnipileConfig>>, seatType: string | null, accountId: string, input: SourcingInput): Promise<ResolvedQuery> {
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

  return {
    previewLinkedInSearch: makeTool({
      description:
        "Estimate how many prospects / companies / jobs / posts a LinkedIn (Sales Navigator) search would return, WITHOUT sourcing. Use to size a segment before committing — e.g. 'how many VPs of Sales in France at 51-200 person software companies', 'how many companies are hiring a Head of RevOps'. Returns the total + how each free-text filter resolved.",
      inputSchema: sourcingInput,
      execute: async (input) => {
        const sc = await seatAndCfg();
        if ("error" in sc) return { error: sc.error };
        const q = await resolveQuery(sc.cfg, sc.seat.seatType, sc.seat.unipileAccountId, input);
        if (q.error) return { error: q.error };
        if (!q.usable) return { error: "Add at least a keyword or one filter (industry / title / location / seniority).", resolution: q.resolution };
        const total = await previewSalesNavCount(sc.cfg, sc.seat.unipileAccountId, q.body as never);
        return {
          ok: true,
          category: input.category,
          total,
          note: typeof total === "number" && total >= 2500 ? "LinkedIn caps a single search at 2,500 results." : undefined,
          resolution: q.resolution,
          dropped: q.dropped,
        };
      },
    }),

    sourceFromLinkedIn: makeTool({
      description:
        "Source a LinkedIn (Sales Navigator) segment INTO the CRM, deduped against existing rows. people/companies → Accounts & Contacts; jobs → hiring companies as Accounts with a hiring signal (lifts their priority score); posts → post authors as warm-lead Contacts. This POPULATES the CRM only — it does NOT contact anyone (use a sequence enrollment for that). Use when the user says 'source/pull/import X from LinkedIn', 'find companies hiring a CRO and add them', 'bring in people posting about cold outbound'. Preview first if the segment size is unknown.",
      inputSchema: sourcingInput,
      execute: async (input) => {
        const sc = await seatAndCfg();
        if ("error" in sc) return { error: sc.error };
        const { cfg, seat } = sc;
        const q = await resolveQuery(cfg, seat.seatType, seat.unipileAccountId, input);
        if (q.error) return { error: q.error };
        if (!q.usable) return { error: "Add at least a keyword or one filter (industry / title / location / seniority).", resolution: q.resolution };
        const maxResults = Math.min(500, Math.max(1, input.maxResults ?? (input.category === "posts" ? 50 : 100)));

        if (input.category === "jobs") {
          const r = await sourceHiringSignals({ cfg, tenantId, unipileAccountId: seat.unipileAccountId, body: q.body as never, maxResults, hydrateAccounts: true });
          return {
            ok: true,
            category: "jobs",
            hiringCompanies: r.accountsUpserted,
            openRoles: r.signalsRecorded,
            message: `Sourced ${r.accountsUpserted} hiring ${r.accountsUpserted === 1 ? "company" : "companies"} (${r.signalsRecorded} open roles). They now rank higher for the autopilot via a hiring signal.`,
            resolution: q.resolution,
          };
        }
        if (input.category === "posts") {
          const r = await sourcePostAuthors({ cfg, tenantId, unipileAccountId: seat.unipileAccountId, body: q.body as never, maxResults, includeEngagers: input.includeEngagers === true });
          const leads = r.authorsUpserted + r.engagersSourced;
          return {
            ok: true,
            category: "posts",
            contacts: leads,
            message: `Sourced ${leads} warm ${leads === 1 ? "lead" : "leads"} from posts${input.includeEngagers ? " (authors + engagers)" : ""}.`,
          };
        }
        // people / companies
        const r = await sourceFromSalesNav({ tenantId, unipileAccountId: seat.unipileAccountId, query: q.body as never, maxResults, hydrateAccounts: true });
        return {
          ok: true,
          category: input.category,
          accounts: r.accountsUpserted,
          contacts: r.contactsUpserted,
          message: `Sourced ${r.accountsUpserted} ${r.accountsUpserted === 1 ? "account" : "accounts"} and ${r.contactsUpserted} ${r.contactsUpserted === 1 ? "contact" : "contacts"} from LinkedIn.`,
          resolution: q.resolution,
          dropped: q.dropped,
        };
      },
    }),
  };
}
