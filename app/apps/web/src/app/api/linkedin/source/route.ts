import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { readUnipileConfig, type LinkedInSearchApi, type LinkedInSearchCategory } from "@/lib/providers/unipile/http";
import { sourceFromSalesNav } from "@/lib/linkedin/sales-nav-sourcing";
import { rematchStoredRelations } from "@/lib/sending/linkedin/graph-sync";
import {
  resolveIcpToSalesNavQuery,
  previewSalesNavCount,
  type IcpSearchCriteria,
  type SalesNavSearchBody,
} from "@/lib/linkedin/icp-to-salesnav";
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

  // The connected seat is the search viewer. Prefer this user's connected seat;
  // fall back to any connected seat in the tenant (a shared SDR seat).
  const rows = await db
    .select({
      id: linkedinAccount.id,
      status: linkedinAccount.status,
      unipileAccountId: linkedinAccount.unipileAccountId,
      seatType: linkedinAccount.seatType,
      userId: linkedinAccount.userId,
    })
    .from(linkedinAccount)
    .where(eq(linkedinAccount.tenantId, authCtx.tenantId))
    .orderBy(desc(linkedinAccount.updatedAt));

  const seat =
    rows.find((r) => r.status === "connected" && r.unipileAccountId && r.userId === authCtx.userId) ??
    rows.find((r) => r.status === "connected" && r.unipileAccountId) ??
    null;

  if (!seat || !seat.unipileAccountId) {
    return NextResponse.json(
      { error: "Connect a LinkedIn / Sales Navigator seat first (Settings → Sending infrastructure)." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & {
    url?: string;
    keywords?: string;
    category?: LinkedInSearchCategory;
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

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const keywords = typeof body.keywords === "string" ? body.keywords.trim() : "";

  const icp: IcpSearchCriteria = {
    industries: asList(body.industries),
    locations: asList(body.locations),
    jobTitles: asList(body.jobTitles),
    companies: asList(body.companies),
    pastCompanies: asList(body.pastCompanies),
    schools: asList(body.schools),
    functions: asList(body.functions),
    seniorities: asList(body.seniorities),
    companyTypes: asList(body.companyTypes),
    companyHeadcount: asRanges(body.companyHeadcount),
    tenure: asRanges(body.tenure),
    profileLanguages: asList(body.profileLanguages),
    recentActivities: asList(body.recentActivities),
    leadListIds: asList(body.leadListIds),
    accountListIds: asList(body.accountListIds),
    savedSearchId: typeof body.savedSearchId === "string" ? body.savedSearchId.trim() : undefined,
    changedJobs: asBool(body.changedJobs),
    postedOnLinkedin: asBool(body.postedOnLinkedin),
    mentionedInNews: asBool(body.mentionedInNews),
    hasJobOffers: asBool(body.hasJobOffers),
    keywords: keywords || undefined,
    networkDistance: Array.isArray(body.networkDistance)
      ? body.networkDistance.map(Number).filter((n) => Number.isFinite(n))
      : undefined,
  };

  // Did the caller give any real targeting beyond a bare keyword/url?
  const hasStructured = [
    icp.industries,
    icp.locations,
    icp.jobTitles,
    icp.companies,
    icp.pastCompanies,
    icp.schools,
    icp.functions,
    icp.seniorities,
    icp.companyTypes,
    icp.companyHeadcount,
    icp.tenure,
    icp.profileLanguages,
    icp.recentActivities,
    icp.leadListIds,
    icp.accountListIds,
  ].some((a) => Array.isArray(a) && a.length > 0) ||
    !!icp.savedSearchId ||
    !!icp.changedJobs ||
    !!icp.postedOnLinkedin ||
    !!icp.mentionedInNews ||
    !!icp.hasJobOffers;

  if (!url && !keywords && !hasStructured) {
    return NextResponse.json(
      { error: "Provide a Sales Navigator search URL, keywords, or ICP criteria (industries / titles / seniority / company size / spotlights / saved lists)." },
      { status: 400 },
    );
  }

  // Run the search with the API tier the seat actually has. A classic seat
  // can't use the sales_navigator endpoint, so never force it.
  const api: LinkedInSearchApi =
    seat.seatType === "sales_navigator" ? "sales_navigator" : seat.seatType === "recruiter" ? "recruiter" : "classic";
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
