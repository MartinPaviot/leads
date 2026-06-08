/**
 * POST /api/icp/apply
 *
 * Persist a parsed persona/ICP (from /api/icp/parse-nl, after the user
 * confirms/edits it) into the tenant's ICP settings, so it drives everything
 * downstream: TAM build, the daily call-list top-up, and fit scoring.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { updateTenantSettings } from "@/lib/config/tenant-settings";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    industries?: string[];
    keywords?: string[];
    companySizes?: string[];
    geographies?: string[];
    excludeGeographies?: string[];
    technologies?: string[];
    revenueMin?: number | null;
    revenueMax?: number | null;
    fundingRecencyDays?: number | null;
    titles?: string[];
    seniorities?: string[];
  };

  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);

  await updateTenantSettings(authCtx.tenantId, {
    targetIndustries: arr(body.industries),
    targetKeywords: arr(body.keywords),
    targetCompanySizes: arr(body.companySizes),
    targetGeographies: arr(body.geographies),
    excludeGeographies: arr(body.excludeGeographies),
    targetTechnologies: arr(body.technologies),
    targetSeniorities: arr(body.seniorities),
    // targetRoles is the free-text persona line consumed by scoring + TAM.
    targetRoles: arr(body.titles).join(", "),
    targetRevenueMin: typeof body.revenueMin === "number" ? body.revenueMin : undefined,
    targetRevenueMax: typeof body.revenueMax === "number" ? body.revenueMax : undefined,
    fundingRecencyDays: typeof body.fundingRecencyDays === "number" ? body.fundingRecencyDays : undefined,
  });

  return Response.json({ ok: true });
}
