import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { contacts, companies, tenants } from "@/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Count contacts discovered from email sync
  const [contactCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(contacts)
    .where(eq(contacts.tenantId, authCtx.tenantId));

  // Count companies with contacts (active conversations proxy)
  const [conversationCount] = await db
    .select({ count: sql<number>`count(distinct ${contacts.companyId})` })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, authCtx.tenantId),
        isNotNull(contacts.companyId)
      )
    );

  // Get tenant ICP settings to cross-reference
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, authCtx.tenantId));

  const settings = (tenant?.settings || {}) as Record<string, unknown>;
  const targetIndustries = (settings.targetIndustries || []) as string[];

  // Cross-reference: companies from email that match ICP industries
  let icpMatches = 0;
  if (targetIndustries.length > 0) {
    const [matchCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(companies)
      .where(
        and(
          eq(companies.tenantId, authCtx.tenantId),
          sql`${companies.industry} = ANY(${targetIndustries})`
        )
      );
    icpMatches = Number(matchCount?.count || 0);
  }

  return Response.json({
    contacts: Number(contactCount?.count || 0),
    conversations: Number(conversationCount?.count || 0),
    icpMatches,
    followUps: 0, // TODO: detect stale conversations once email sync stores timestamps
  });
}
