import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, sql, gte, inArray, isNull } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sequenceId: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await params; // consume params even if unused

  const url = new URL(req.url);
  const industries = url.searchParams.getAll("industry");
  const sizes = url.searchParams.getAll("size");
  const geographies = url.searchParams.getAll("geography");
  const minScore = Number(url.searchParams.get("minScore")) || 0;

  // Build WHERE conditions
  const conditions = [
    eq(companies.tenantId, authCtx.tenantId),
    sql`properties->>'source' = 'tam'`,
    isNull(companies.deletedAt),
  ];

  if (minScore > 0) {
    conditions.push(gte(companies.score, minScore));
  }
  if (industries.length > 0) {
    conditions.push(inArray(companies.industry, industries));
  }
  if (sizes.length > 0) {
    conditions.push(inArray(companies.size, sizes));
  }
  if (geographies.length > 0) {
    conditions.push(
      sql`(properties->>'country') IN (${sql.join(geographies.map(g => sql`${g}`), sql`, `)})`
    );
  }

  const [result] = await db
    .select({
      total: sql<number>`count(*)`,
      needsEnrichment: sql<number>`count(*) filter (where properties->>'needs_enrichment' = 'true')`,
    })
    .from(companies)
    .where(and(...conditions));

  return Response.json({
    matchingCompanies: Number(result?.total || 0),
    needsEnrichment: Number(result?.needsEnrichment || 0),
    alreadyEnriched: Number(result?.total || 0) - Number(result?.needsEnrichment || 0),
  });
}
