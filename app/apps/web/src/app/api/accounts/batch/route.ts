import { db } from "@/db";
import { companies } from "@/db/schema";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Batch fetch accounts by IDs — replaces N+1 individual fetches.
 * POST /api/accounts/batch { ids: string[] }
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    try {
      const body = await req.json();
      const ids: string[] = body.ids;

      if (!Array.isArray(ids) || ids.length === 0) {
        return Response.json({ error: "ids array required" }, { status: 400 });
      }

      // Cap at 50 to prevent abuse
      const limitedIds = ids.slice(0, 50);

      const accounts = await db
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          score: companies.score,
        })
        .from(companies)
        .where(and(
          eq(companies.tenantId, authCtx.tenantId),
          inArray(companies.id, limitedIds),
        ));

      // Return as a map for easy client-side lookup
      const accountMap: Record<string, typeof accounts[0]> = {};
      for (const a of accounts) {
        accountMap[a.id] = a;
      }

      return Response.json({ accounts: accountMap });
    } catch (error) {
      return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
  });
}
