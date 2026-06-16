import { db } from "@/db";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { sql } from "drizzle-orm";
import { apiError } from "@/lib/infra/api-errors";
import { classifyIndustryFamilies, familyCounts, FAMILY_LABELS } from "@/lib/search/industry-family";

/**
 * Sector-family facet for the Filtres panel. Lazy on purpose: the LLM
 * classification of the tenant's distinct industries takes seconds, so it must
 * NOT sit on the list's critical path — the panel fetches this when it opens
 * (with a loading state). Cached (per tenant + industry set) inside the
 * classifier, so repeat opens are instant.
 *
 * `entity=account` counts companies per family; `entity=contact` counts
 * contacts per family (via their company's industry).
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return apiError("UNAUTHORIZED", "Authentication required");

  try {
    const entity = new URL(req.url).searchParams.get("entity") === "contact" ? "contact" : "account";
    const indCounts: Record<string, number> = {};

    if (entity === "account") {
      const rows = await db.execute(sql`
        SELECT industry AS v, count(*)::int AS n FROM companies
        WHERE tenant_id = ${authCtx.tenantId} AND deleted_at IS NULL
          AND industry IS NOT NULL AND industry <> ''
        GROUP BY 1
      `);
      for (const r of rows as unknown as Array<{ v: string; n: number }>) indCounts[r.v] = Number(r.n);
    } else {
      const rows = await db.execute(sql`
        SELECT co.industry AS v, count(*)::int AS n
        FROM contacts c JOIN companies co ON co.id = c.company_id
        WHERE c.tenant_id = ${authCtx.tenantId} AND c.deleted_at IS NULL AND co.deleted_at IS NULL
          AND co.industry IS NOT NULL AND co.industry <> ''
        GROUP BY 1
      `);
      for (const r of rows as unknown as Array<{ v: string; n: number }>) indCounts[r.v] = Number(r.n);
    }

    const map = await classifyIndustryFamilies(Object.keys(indCounts), authCtx.tenantId);
    const counts = familyCounts(map, indCounts);
    const families = Object.entries(counts)
      .map(([key, count]) => ({ key, label: FAMILY_LABELS[key as keyof typeof FAMILY_LABELS] ?? key, count }))
      .sort((a, b) => b.count - a.count);

    return Response.json({ families });
  } catch (e) {
    console.error("industry-families failed", e);
    return apiError("INTERNAL_ERROR", "Failed to classify industries");
  }
}
