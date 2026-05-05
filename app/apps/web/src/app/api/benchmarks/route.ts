/**
 * GET /api/benchmarks — Returns anonymized cross-tenant signal benchmarks.
 *
 * Returns benchmarks filtered by the current tenant's industry and company
 * size (from their ICP settings). If the tenant has no ICP configured,
 * returns all available benchmarks.
 *
 * Privacy: this endpoint only returns pre-aggregated, k-anonymized data
 * from the `anonymized_signal_benchmarks` table. No per-tenant data is
 * exposed. Every bucket has >= 10 contributing tenants.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { getTenantSettings } from "@/lib/config/tenant-settings";
import {
  getAnonymizedBenchmark,
  getAllBenchmarks,
} from "@/lib/scoring/anonymized-signals";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getTenantSettings(authCtx.tenantId);

    // Use the tenant's ICP industry and company size to filter benchmarks.
    // targetIndustries is an array — use the first one as the primary.
    const industry = settings.targetIndustries?.[0];
    const companySize = settings.targetCompanySizes?.[0];

    if (industry && companySize) {
      const benchmarks = await getAnonymizedBenchmark(industry, companySize);
      return Response.json({
        benchmarks,
        filters: { industry, companySize },
        filtered: true,
      });
    }

    if (industry) {
      // Has industry but no size — get all sizes for that industry
      const benchmarks = await getAnonymizedBenchmark(industry, "");
      return Response.json({
        benchmarks,
        filters: { industry },
        filtered: true,
      });
    }

    // No ICP configured — return all benchmarks
    const benchmarks = await getAllBenchmarks();
    return Response.json({
      benchmarks,
      filters: {},
      filtered: false,
    });
  } catch (error) {
    console.error("[benchmarks] Error fetching benchmarks:", error);
    return Response.json(
      { error: "Failed to fetch benchmarks" },
      { status: 500 },
    );
  }
}
