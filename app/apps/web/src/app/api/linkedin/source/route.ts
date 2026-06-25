import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { linkedinAccount } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { readUnipileConfig, type LinkedInSearchApi, type LinkedInSearchCategory } from "@/lib/providers/unipile/http";
import { sourceFromSalesNav } from "@/lib/linkedin/sales-nav-sourcing";
import { rematchStoredRelations } from "@/lib/sending/linkedin/graph-sync";
import { resolveIcpToSalesNavQuery } from "@/lib/linkedin/icp-to-salesnav";
import logger from "@/lib/observability/logger";

/**
 * POST /api/linkedin/source — spec 36 (T11), the user-facing trigger that was
 * missing: turn the connected LinkedIn/Sales-Nav seat into TAM rows.
 *
 * v1 "paste a Sales-Nav search URL": the founder builds a precise search in
 * LinkedIn's own Sales Navigator UI and pastes the URL (no filter-id resolver
 * needed yet); we also accept free-text `keywords`. We run the search AS the
 * connected seat (ids are viewer-scoped) and upsert every hit through the
 * canonical layer (provider=unipile), so sourced rows dedup with Apollo and
 * their linkedin_url matches the seat's relations → warm-path graph.
 *
 * Body: { url?: string; keywords?: string; category?: "people"|"companies"; maxResults?: number }
 *   - one of `url` / `keywords` is required.
 * Returns: { ok, searched, accountsUpserted, contactsUpserted, skippedNoIdentity }
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

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    keywords?: string;
    category?: LinkedInSearchCategory;
    maxResults?: number;
    industries?: string[] | string;
    locations?: string[] | string;
    jobTitles?: string[] | string;
    networkDistance?: number[];
  };
  // Accept arrays OR comma-separated strings for the ICP criteria.
  const asList = (v: string[] | string | undefined): string[] =>
    Array.isArray(v)
      ? v.map((s) => String(s).trim()).filter(Boolean)
      : typeof v === "string"
        ? v.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const keywords = typeof body.keywords === "string" ? body.keywords.trim() : "";
  const industries = asList(body.industries);
  const locations = asList(body.locations);
  const jobTitles = asList(body.jobTitles);
  const hasStructured = industries.length > 0 || locations.length > 0 || jobTitles.length > 0;
  if (!url && !keywords && !hasStructured) {
    return NextResponse.json(
      { error: "Provide a Sales Navigator search URL, keywords, or ICP criteria (industries / locations / titles)." },
      { status: 400 },
    );
  }

  // Run the search with the API tier the seat actually has. A classic seat
  // can't use the sales_navigator endpoint, so never force it.
  const api: LinkedInSearchApi =
    seat.seatType === "sales_navigator" ? "sales_navigator" : seat.seatType === "recruiter" ? "recruiter" : "classic";
  const category: LinkedInSearchCategory = body.category === "companies" ? "companies" : "people";
  const maxResults = Math.min(500, Math.max(1, Number(body.maxResults) || 100));
  const networkDistance = Array.isArray(body.networkDistance)
    ? body.networkDistance.map(Number).filter((n) => Number.isFinite(n))
    : undefined;

  try {
    // Precedence: a pasted Sales-Nav URL wins; else resolve the ICP criteria to
    // LinkedIn filter IDs (#2); else free-text keywords.
    let query: { api: LinkedInSearchApi; category: LinkedInSearchCategory; [k: string]: unknown };
    let resolution: unknown = undefined;
    if (url) {
      query = { api, category, url };
    } else if (hasStructured) {
      const resolved = await resolveIcpToSalesNavQuery(
        cfg,
        seat.unipileAccountId,
        { industries, locations, jobTitles, keywords: keywords || undefined, networkDistance },
        { api, category },
      );
      if (!resolved.usable) {
        return NextResponse.json(
          {
            error: "Couldn't resolve any of those ICP filters on LinkedIn. Try different industry/location/title wording, or paste a Sales Navigator URL.",
            resolution: resolved.report,
          },
          { status: 422 },
        );
      }
      query = resolved.body;
      resolution = resolved.report;
    } else {
      query = { api, category, keywords };
    }

    const result = await sourceFromSalesNav({
      tenantId: authCtx.tenantId,
      unipileAccountId: seat.unipileAccountId,
      query,
      maxResults,
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
    return NextResponse.json({ ok: true, ...result, warmEdges, ...(resolution ? { resolution } : {}) });
  } catch (err) {
    logger.error("linkedin/source: sourcing failed", { tenantId: authCtx.tenantId, err });
    return NextResponse.json(
      { error: "LinkedIn sourcing failed. Check the seat is still connected and the search URL is valid." },
      { status: 502 },
    );
  }
}
