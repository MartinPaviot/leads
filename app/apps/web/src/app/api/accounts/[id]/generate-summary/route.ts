import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { generateAccountSummary } from "@/lib/ai/ai-account-summary";

/**
 * POST /api/accounts/[id]/generate-summary
 *
 * Regenerate AI account summary and business model description
 * using current enrichment data. Updates properties JSONB in-place.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("llm", authCtx.userId);
  if (rlResponse) return rlResponse;

  const { id } = await params;

  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)))
    .limit(1);

  if (!company) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const props = (company.properties || {}) as Record<string, unknown>;

  const result = await generateAccountSummary(
    {
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      description: company.description,
      size: company.size,
      revenue: company.revenue,
      properties: props,
    },
    authCtx.tenantId,
  );

  if (!result) {
    return Response.json(
      { error: "Unable to generate summary. Insufficient data or no LLM configured." },
      { status: 400 },
    );
  }

  // Merge into existing properties — don't overwrite other fields
  const updatedProps = {
    ...props,
    ai_account_summary: result.ai_account_summary,
    ai_how_they_make_money: result.ai_how_they_make_money,
    ai_summary_generated_at: new Date().toISOString(),
  };

  await db
    .update(companies)
    .set({
      properties: updatedProps,
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, id), eq(companies.tenantId, authCtx.tenantId)));

  return Response.json({
    ai_account_summary: result.ai_account_summary,
    ai_how_they_make_money: result.ai_how_they_make_money,
  });
}
