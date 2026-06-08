import { getAuthContext } from "@/lib/auth/auth-utils";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { resolveCriteria } from "@/lib/providers/company-enrichment/criteria";
import {
  loadCompanyRow,
  enrichOneCompany,
  type EnrichCompanyResult,
} from "@/lib/enrichment/enrich-company-row";

export type { EnrichCompanyResult } from "@/lib/enrichment/enrich-company-row";

/**
 * POST /api/enrich — run the company-enrichment waterfall on up to 20
 * companies per request, scoped to a chosen set of *criteria*.
 *
 * Body: `{ companyIds: string[], criteria?: string[] }`. `criteria` is a
 * list of criterion keys (see `criteria.ts`); omitted → the base set
 * (the firmographics shown as the accounts table's left columns).
 *
 * The response is honest per company and per criterion: each criterion
 * reports `filled` / `already-present` / `not-found`, and each company a
 * `status` of `enriched` / `already-complete` / `no-data` / `error`. A
 * 200 no longer implies anything changed — callers read the body. For a
 * live, per-cell experience use the streaming sibling `/api/enrich/stream`.
 */
export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlResponse = await checkRateLimit("enrich", authCtx.userId);
  if (rlResponse) return rlResponse;

  try {
    const body = await req.json();
    const { companyIds, criteria } = body as { companyIds?: unknown; criteria?: unknown };

    if (!companyIds || !Array.isArray(companyIds) || companyIds.length === 0) {
      return Response.json({ error: "companyIds array required" }, { status: 400 });
    }

    const requestedCriteria = resolveCriteria(
      Array.isArray(criteria) ? (criteria as string[]) : undefined,
    );

    let enrichedCount = 0;
    let alreadyComplete = 0;
    let noData = 0;
    let failed = 0;
    const perCompany: EnrichCompanyResult[] = [];

    for (const id of companyIds.slice(0, 20)) {
      try {
        const company = await loadCompanyRow(id, authCtx.tenantId);
        if (!company) {
          failed++;
          perCompany.push({ id, ok: false, status: "error", provider: null, costCents: 0, criteria: [] });
          continue;
        }

        const outcome = await enrichOneCompany({
          company,
          requestedCriteria,
          tenantId: authCtx.tenantId,
        });

        if (outcome.status === "enriched") enrichedCount++;
        else if (outcome.status === "already-complete") alreadyComplete++;
        else noData++;

        perCompany.push({ id, ok: true, ...outcome });
      } catch (err) {
        console.warn(`Failed to enrich company ${id}:`, err);
        failed++;
        perCompany.push({ id, ok: false, status: "error", provider: null, costCents: 0, criteria: [] });
      }
    }

    return Response.json({
      success: true,
      // `enriched` keeps its historical meaning (companies that gained at
      // least one field this run) for back-compat with existing callers.
      enriched: enrichedCount,
      alreadyComplete,
      noData,
      failed,
      criteria: requestedCriteria.map((c) => c.key),
      perCompany,
    });
  } catch (error) {
    console.error("Enrichment failed:", error);
    return Response.json({ error: "Enrichment failed" }, { status: 500 });
  }
}
