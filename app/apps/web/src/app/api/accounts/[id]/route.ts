import { auth } from "@/auth";
import { db } from "@/db";
import { companies, deals } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [account] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id))
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
    .where(eq(deals.companyId, id));

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
