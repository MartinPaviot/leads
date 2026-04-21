import { getAuthContext } from "@/lib/auth-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  searchOrganizations,
  isApolloAvailable,
  type OrgSearchParams,
} from "@/lib/apollo-client";
import { sizesToApolloRanges } from "@/lib/icp-constants";

/**
 * POST /api/tam/estimate
 *
 * Returns a live count of Apollo organizations that match the
 * caller's current ICP picker state. Drives the "≈ 12,400 companies
 * match your filters" chip in the onboarding wizard.
 *
 * Cheap by design — hits Apollo with `per_page=1, page=1` and reads
 * `pagination.total_entries`. Rate-limited under the `llm` bucket
 * because even though there's no LLM call, the estimate gets
 * debounce-fired on every filter toggle and we don't want it to
 * blow through the more lenient `enrich` bucket.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("llm", authCtx.userId);
  if (rl) return rl;

  if (!isApolloAvailable()) {
    return Response.json({ error: "Apollo not configured" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    industries?: string[];
    companySizes?: string[];
    geographies?: string[];
  };

  const filters: OrgSearchParams = {
    per_page: 1,
    page: 1,
  };

  if (body.companySizes?.length) {
    // The wizard pre-converts via `sizesToApolloRanges(...)` so we
    // usually receive values already in Apollo's "min,max" form
    // (e.g. "1,10", "51,200"). `sizesToApolloRanges` strips commas
    // before converting — re-running it would mangle "1,10" into
    // "110" (Apollo then 422s with "The range [110] is invalid").
    // Detect Apollo format and pass through; otherwise run the
    // converter to accept raw UI sizes like "1-10" too.
    const alreadyApollo = body.companySizes.every((s) => /^\d+,\d*$/.test(s));
    const ranges = alreadyApollo
      ? body.companySizes
      : sizesToApolloRanges(body.companySizes);
    if (ranges.length > 0) filters.organization_num_employees_ranges = ranges;
  }
  if (body.geographies?.length) {
    // Apollo accepts free-text locations — countries, states, cities.
    filters.organization_locations = body.geographies;
  }
  if (body.industries?.length) {
    // Industries are passed as keyword tags; Apollo's industry filter
    // requires industry IDs which we don't map. Keywords is close
    // enough for an estimate and degrades gracefully.
    filters.q_organization_keyword_tags = body.industries;
  }

  try {
    const result = await searchOrganizations(filters);
    // Apollo caps `total_entries` at 100k even when the real match
    // count is higher. The UI renders "100k+" when we hit the cap.
    const total = result.pagination.total_entries ?? 0;
    return Response.json({
      total,
      capped: total >= 100_000,
      filtersApplied: {
        industries: body.industries?.length ?? 0,
        companySizes: body.companySizes?.length ?? 0,
        geographies: body.geographies?.length ?? 0,
      },
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (msg.includes("API_INACCESSIBLE") || msg.includes("free plan")) {
      return Response.json(
        { error: "Apollo search not available on current plan" },
        { status: 402 },
      );
    }
    console.warn("[tam/estimate] apollo search failed:", msg);
    return Response.json({ total: null, error: msg }, { status: 500 });
  }
}
