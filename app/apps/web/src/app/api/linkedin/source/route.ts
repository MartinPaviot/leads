import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { readUnipileConfig, type LinkedInSearchApi, type LinkedInSearchCategory } from "@/lib/providers/unipile/http";
import { resolveConnectedSeat, apiForSeat } from "@/lib/linkedin/seat";
import { sourceFromSalesNav } from "@/lib/linkedin/sales-nav-sourcing";
import { rematchStoredRelations } from "@/lib/sending/linkedin/graph-sync";
import {
  resolveIcpToSalesNavQuery,
  previewSalesNavCount,
  type IcpSearchCriteria,
  type SalesNavSearchBody,
} from "@/lib/linkedin/icp-to-salesnav";
import { resolveJobsQuery, buildPostsSearchBody, type JobsSearchCriteria } from "@/lib/linkedin/jobs-posts";
import { sourceHiringSignals, sourcePostAuthors } from "@/lib/linkedin/jobs-posts-sourcing";
import logger from "@/lib/observability/logger";

/**
 * POST /api/linkedin/source — spec 36 (T11), the user-facing trigger that turns
 * the connected LinkedIn/Sales-Nav seat into TAM rows.
 *
 * Three ways to target, in precedence order:
 *   1. `url`        — paste a Sales-Navigator search URL built in LinkedIn's UI.
 *   2. ICP criteria — industries / locations / titles / companies / schools /
 *      functions (resolved to LinkedIn filter ids) + structured filters
 *      (seniority, company size, tenure, spotlights, saved lists) that we
 *      assemble into a precise SN search body. See icp-to-salesnav.ts.
 *   3. `keywords`   — free-text fallback.
 *
 * `preview: true` resolves + returns the segment's `total` (TAM size) WITHOUT
 * sourcing — the pre-flight the founder sees before committing a run.
 *
 * Every sourced row goes through the canonical layer (provider=unipile), so it
 * dedups with Apollo and its linkedin_url matches the seat's relations → warm
 * path. `hydrateAccounts` (default on) enriches each employer with its LinkedIn
 * company profile (domain, industries, HQ, size, headcount-growth).
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = readUnipileConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Unipile is not configured. Set UNIPILE_API_KEY and UNIPILE_DSN." },
      { status: 503 },
    );
  }

  // The connected seat is the search viewer (filter ids are viewer-scoped).
  const seat = await resolveConnectedSeat(authCtx.tenantId, authCtx.userId);
  if (!seat) {
    return NextResponse.json(
      { error: "Connect a LinkedIn / Sales Navigator seat first (Settings → Sending infrastructure)." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & {
    url?: string;
    keywords?: string;
    category?: string;
    maxResults?: number;
    preview?: boolean;
    hydrateAccounts?: boolean;
    networkDistance?: number[];
  };

  // Accept arrays OR comma-separated strings for the free-text criteria.
  const asList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((s) => String(s).trim()).filter(Boolean)
      : typeof v === "string"
        ? v.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
  const asRanges = (v: unknown): { min?: number; max?: number }[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const out = v
      .map((x) => {
        const o = (x ?? {}) as { min?: unknown; max?: unknown };
        const min = Number(o.min);
        const max = Number(o.max);
        return { min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined };
      })
      .filter((r) => r.min !== undefined || r.max !== undefined);
    return out.length ? out : undefined;
  };
  const asBool = (v: unknown): boolean | undefined => (v === true ? true : undefined);
  const asStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const asNum = (v: unknown): number | undefined => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const asRange1 = (v: unknown): { min?: number; max?: number } | undefined => {
    const o = (v ?? {}) as { min?: unknown; max?: unknown };
    const min = asNum(o.min);
    const max = asNum(o.max);
    return min === undefined && max === undefined ? undefined : { min, max };
  };
  const asRevenue = (v: unknown): { currency?: string; min?: number; max?: number } | undefined => {
    const o = (v ?? {}) as { currency?: unknown; min?: unknown; max?: unknown };
    const min = asNum(o.min);
    const max = asNum(o.max);
    if (min === undefined && max === undefined) return undefined;
    return { currency: asStr(o.currency), min, max };
  };
  const asDeptHc = (v: unknown): { departments?: string[]; min?: number; max?: number } | undefined => {
    const o = (v ?? {}) as { departments?: unknown; min?: unknown; max?: unknown };
    const departments = asList(o.departments);
    if (!departments.length) return undefined;
    return { departments, min: asNum(o.min), max: asNum(o.max) };
  };

  const previewMode = body.preview === true;
  const maxResultsCap = Math.min(500, Math.max(1, Number(body.maxResults) || 100));
  const hydrate = body.hydrateAccounts !== false; // default on

  // JOBS / POSTS run on the `classic` api tier (the SN tier has no jobs/posts
  // search), regardless of the seat type. Handled here, separate from the
  // people/companies ICP path.
  if (body.category === "jobs") {
    const criteria: JobsSearchCriteria = {
      keywords: asStr(body.keywords),
      sortBy: body.sortBy === "date" ? "date" : undefined,
      datePostedDays: asNum(body.datePostedDays),
      locations: asList(body.locations),
      withinAreaMiles: asNum(body.withinAreaMiles),
      industries: asList(body.industries),
      functions: asList(body.functions),
      roles: asList(body.roles ?? body.jobTitles),
      companies: asList(body.companies),
      seniorities: asList(body.seniorities),
      jobTypes: asList(body.jobTypes),
      presence: asList(body.presence),
      easyApply: asBool(body.easyApply),
      under10Applicants: asBool(body.under10Applicants),
      inYourNetwork: asBool(body.inYourNetwork),
    };
    try {
      const { body: jobsBody, report, usable } = await resolveJobsQuery(cfg, seat.unipileAccountId, criteria);
      if (!usable) {
        return NextResponse.json(
          { error: "Add at least a keyword, role, location, or company for the jobs search.", resolution: report },
          { status: 422 },
        );
      }
      if (previewMode) {
        const total = await previewSalesNavCount(cfg, seat.unipileAccountId, jobsBody as never);
        return NextResponse.json({ ok: true, preview: true, total, resolution: report });
      }
      const result = await sourceHiringSignals({
        cfg,
        tenantId: authCtx.tenantId,
        unipileAccountId: seat.unipileAccountId,
        body: jobsBody,
        maxResults: maxResultsCap,
        hydrateAccounts: hydrate,
      });
      return NextResponse.json({ ok: true, ...result, resolution: report });
    } catch (err) {
      logger.error("linkedin/source: jobs sourcing failed", { tenantId: authCtx.tenantId, err });
      return NextResponse.json({ error: "LinkedIn jobs search failed. Check the seat is still connected." }, { status: 502 });
    }
  }

  if (body.category === "posts") {
    const postsBody = buildPostsSearchBody({
      keywords: asStr(body.keywords),
      sortBy: body.sortBy === "date" ? "date" : undefined,
      datePosted: asStr(body.datePosted),
      contentType: asStr(body.contentType),
    });
    if (!postsBody.keywords) {
      return NextResponse.json({ error: "Posts search needs at least a keyword." }, { status: 400 });
    }
    try {
      if (previewMode) {
        const total = await previewSalesNavCount(cfg, seat.unipileAccountId, postsBody as never);
        return NextResponse.json({ ok: true, preview: true, total });
      }
      const result = await sourcePostAuthors({
        cfg,
        tenantId: authCtx.tenantId,
        unipileAccountId: seat.unipileAccountId,
        body: postsBody,
        maxResults: Math.min(100, maxResultsCap),
        includeEngagers: body.includeEngagers === true,
      });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      logger.error("linkedin/source: posts sourcing failed", { tenantId: authCtx.tenantId, err });
      return NextResponse.json({ error: "LinkedIn posts search failed. Check the seat is still connected." }, { status: 502 });
    }
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const keywords = typeof body.keywords === "string" ? body.keywords.trim() : "";

  const icp: IcpSearchCriteria = {
    industries: asList(body.industries),
    locations: asList(body.locations),
    jobTitles: asList(body.jobTitles),
    companies: asList(body.companies),
    pastCompanies: asList(body.pastCompanies),
    pastRoles: asList(body.pastRoles),
    schools: asList(body.schools),
    functions: asList(body.functions),
    companyHqLocations: asList(body.companyHqLocations),
    connectionsOf: asList(body.connectionsOf),
    postalCodes: asList(body.postalCodes),
    seniorities: asList(body.seniorities),
    companyTypes: asList(body.companyTypes),
    companyHeadcount: asRanges(body.companyHeadcount),
    tenure: asRanges(body.tenure),
    tenureAtCompany: asRanges(body.tenureAtCompany),
    tenureAtRole: asRanges(body.tenureAtRole),
    profileLanguages: asList(body.profileLanguages),
    firstName: asStr(body.firstName),
    lastName: asStr(body.lastName),
    withinAreaMiles: asNum(body.withinAreaMiles),
    recentActivities: asList(body.recentActivities),
    annualRevenue: asRevenue(body.annualRevenue),
    headcountGrowth: asRange1(body.headcountGrowth),
    departmentHeadcount: asDeptHc(body.departmentHeadcount),
    departmentHeadcountGrowth: asDeptHc(body.departmentHeadcountGrowth),
    followersCount: asRanges(body.followersCount),
    fortune: asRanges(body.fortune),
    leadListIds: asList(body.leadListIds),
    accountListIds: asList(body.accountListIds),
    personaIds: asList(body.personaIds),
    groupIds: asList(body.groupIds),
    technologyIds: asList(body.technologyIds),
    savedAccountIds: asList(body.savedAccountIds),
    savedSearchId: asStr(body.savedSearchId),
    recentSearchId: asStr(body.recentSearchId),
    changedJobs: asBool(body.changedJobs),
    postedOnLinkedin: asBool(body.postedOnLinkedin),
    mentionedInNews: asBool(body.mentionedInNews),
    followingYourCompany: asBool(body.followingYourCompany),
    viewedYourProfileRecently: asBool(body.viewedYourProfileRecently),
    viewedProfileRecently: asBool(body.viewedProfileRecently),
    messagedRecently: asBool(body.messagedRecently),
    pastColleague: asBool(body.pastColleague),
    sharedExperiences: asBool(body.sharedExperiences),
    hasJobOffers: asBool(body.hasJobOffers),
    includeSavedLeads: asBool(body.includeSavedLeads),
    includeSavedAccounts: asBool(body.includeSavedAccounts),
    keywords: keywords || undefined,
    networkDistance: Array.isArray(body.networkDistance)
      ? body.networkDistance.map(Number).filter((n) => Number.isFinite(n))
      : undefined,
  };

  // Did the caller give any real targeting beyond a bare keyword/url? Any array
  // filter with entries, any range/object, any spotlight boolean, or a saved id.
  const arrayFilters = [
    icp.industries, icp.locations, icp.jobTitles, icp.companies, icp.pastCompanies, icp.pastRoles,
    icp.schools, icp.functions, icp.companyHqLocations, icp.connectionsOf, icp.postalCodes,
    icp.seniorities, icp.companyTypes, icp.companyHeadcount, icp.tenure, icp.tenureAtCompany,
    icp.tenureAtRole, icp.profileLanguages, icp.recentActivities, icp.followersCount, icp.fortune,
    icp.leadListIds, icp.accountListIds, icp.personaIds, icp.groupIds, icp.technologyIds, icp.savedAccountIds,
  ];
  const boolFilters = [
    icp.changedJobs, icp.postedOnLinkedin, icp.mentionedInNews, icp.followingYourCompany,
    icp.viewedYourProfileRecently, icp.viewedProfileRecently, icp.messagedRecently, icp.pastColleague,
    icp.sharedExperiences, icp.hasJobOffers, icp.includeSavedLeads, icp.includeSavedAccounts,
  ];
  const objFilters = [
    icp.annualRevenue, icp.headcountGrowth, icp.departmentHeadcount, icp.departmentHeadcountGrowth,
  ];
  const hasStructured =
    arrayFilters.some((a) => Array.isArray(a) && a.length > 0) ||
    boolFilters.some(Boolean) ||
    objFilters.some((o) => o !== undefined) ||
    !!icp.firstName ||
    !!icp.lastName ||
    !!icp.savedSearchId ||
    !!icp.recentSearchId;

  if (!url && !keywords && !hasStructured) {
    return NextResponse.json(
      { error: "Provide a Sales Navigator search URL, keywords, or ICP criteria (industries / titles / seniority / company size / spotlights / saved lists)." },
      { status: 400 },
    );
  }

  // Run the search with the API tier the seat actually has.
  const api: LinkedInSearchApi = apiForSeat(seat.seatType);
  const category: LinkedInSearchCategory = body.category === "companies" ? "companies" : "people";
  const maxResults = Math.min(500, Math.max(1, Number(body.maxResults) || 100));
  const preview = body.preview === true;
  const hydrateAccounts = body.hydrateAccounts !== false; // default on

  try {
    // Build the search body. A pasted URL wins; else resolve the ICP criteria;
    // else free-text keywords.
    let query: SalesNavSearchBody & { url?: string };
    let resolution: unknown = undefined;
    let dropped: string[] | undefined = undefined;
    if (url) {
      query = { api, category, url };
    } else if (hasStructured) {
      const resolved = await resolveIcpToSalesNavQuery(cfg, seat.unipileAccountId, icp, { api, category });
      if (!resolved.usable) {
        return NextResponse.json(
          {
            error: "Couldn't turn those filters into a LinkedIn search. Try different wording, add a structured filter (seniority / company size / spotlight), or paste a Sales Navigator URL.",
            resolution: resolved.report,
            dropped: resolved.dropped,
          },
          { status: 422 },
        );
      }
      query = resolved.body;
      resolution = resolved.report;
      dropped = resolved.dropped?.length ? resolved.dropped : undefined;
    } else {
      query = { api, category, keywords };
    }

    // Pre-flight: just report the segment size, don't source.
    if (preview) {
      const total = await previewSalesNavCount(cfg, seat.unipileAccountId, query);
      return NextResponse.json({
        ok: true,
        preview: true,
        total,
        ...(resolution ? { resolution } : {}),
        ...(dropped ? { dropped } : {}),
      });
    }

    const result = await sourceFromSalesNav({
      tenantId: authCtx.tenantId,
      unipileAccountId: seat.unipileAccountId,
      query,
      maxResults,
      hydrateAccounts,
    });
    // Light up warm paths on the freshly-sourced contacts from the seat's stored
    // relation snapshot (no Unipile calls). Best-effort — never fail the source.
    let warmEdges = 0;
    try {
      const warm = await rematchStoredRelations(authCtx.tenantId);
      warmEdges = warm.edgesCreated + warm.edgesUpdated;
    } catch (e) {
      logger.warn("linkedin/source: warm-path rematch failed (non-fatal)", { e });
    }
    return NextResponse.json({
      ok: true,
      ...result,
      warmEdges,
      ...(resolution ? { resolution } : {}),
      ...(dropped ? { dropped } : {}),
    });
  } catch (err) {
    logger.error("linkedin/source: sourcing failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json(
      { error: "LinkedIn sourcing failed. Check the seat is still connected and the search URL is valid." },
      { status: 502 },
    );
  }
}
