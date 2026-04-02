import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { companies, deals } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [account] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!account) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const accountDeals = await db
    .select({
      id: deals.id,
      name: deals.name,
      stage: deals.stage,
      value: deals.value,
    })
    .from(deals)
    .where(and(eq(deals.companyId, id), eq(deals.tenantId, authCtx.tenantId)));

  return Response.json({
    account: {
      id: account.id,
      name: account.name,
      domain: account.domain,
      industry: account.industry,
      size: account.size,
      revenue: account.revenue,
      description: account.description,
      score: account.score,
      scoreReasons: account.scoreReasons,
    },
    deals: accountDeals,
  });
}
