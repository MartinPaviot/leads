import { getAuthContext } from "@/lib/auth/auth-utils";
import {
  findWarmPathsToCompanies,
  findWarmPathsToCompany,
} from "@/lib/context/relationship-graph";

/**
 * GET /api/warm-paths?companyId=UUID
 * GET /api/warm-paths?companyIds=UUID1,UUID2,UUID3  ← batched
 *
 * Returns warm paths (one-hop) from any tenant user to contacts at
 * the requested company/companies. Used by the accounts list
 * "Connected to" column (batched to avoid N+1) and the account
 * detail page (single) to surface warm-intro levers.
 */
export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("companyIds");
  const singleId = searchParams.get("companyId");

  try {
    if (idsParam) {
      // Cap at 500 to keep one request predictable; the accounts
      // page never shows more than a couple hundred rows at once.
      const ids = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 500);
      const map = await findWarmPathsToCompanies({
        tenantId: authCtx.tenantId,
        companyIds: ids,
      });
      const pathsByCompany: Record<string, unknown[]> = {};
      for (const [cid, list] of map.entries()) pathsByCompany[cid] = list;
      return Response.json({ pathsByCompany });
    }

    if (!singleId) {
      return Response.json(
        { error: "companyId or companyIds query param required" },
        { status: 400 },
      );
    }

    const paths = await findWarmPathsToCompany({
      tenantId: authCtx.tenantId,
      companyId: singleId,
    });
    return Response.json({ paths });
  } catch (err) {
    console.error("warm-paths: lookup failed", err);
    return Response.json({ error: "warm-paths lookup failed" }, { status: 500 });
  }
}
