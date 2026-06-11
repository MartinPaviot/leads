/**
 * GET  /api/icps   — list the tenant's ICPs (+ criteria count, fit count)
 * POST /api/icps   — create an ICP with criteria
 *
 * Multi-ICP CRUD (P2, _specs/multi-icp). Create routes through
 * validateIcpInput against the resolved catalog so no incoherent
 * criterion persists. On success, emits icp/recompute-tenant so the
 * matrix + companies.score reflect the new ICP.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { icps, icpCriteria, companyIcpFit } from "@/db/schema";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { validateIcpInput } from "@/lib/icp/validation";
import { resolveCatalogForValidation } from "@/lib/icp/catalog-db";
import { syncRankOneMirror } from "@/lib/icp/mirror";
import { inngest } from "@/inngest/client";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Excludes soft-deleted ICPs by default; `?deleted=true` returns only the
  // deleted ones (the Archive view, for review + restore).
  const showDeleted = new URL(req.url).searchParams.get("deleted") === "true";

  const rows = await db
    .select({
      id: icps.id,
      name: icps.name,
      description: icps.description,
      status: icps.status,
      priority: icps.priority,
      createdAt: icps.createdAt,
      // NOTE: reference the outer table as the literal "icps"."id".
      // Interpolating ${icps.id} renders an UNqualified "id", which
      // inside these subqueries binds to icp_criteria.id / company_icp_fit.id
      // (both have their own id column) instead of the outer icps row —
      // making every count silently 0. Keep the qualifier hardcoded.
      criteriaCount: sql<number>`(SELECT count(*)::int FROM icp_criteria WHERE icp_criteria.icp_id = "icps"."id")`,
      fitCount: sql<number>`(SELECT count(*)::int FROM company_icp_fit WHERE company_icp_fit.icp_id = "icps"."id" AND company_icp_fit.fit_score >= 0.5)`,
    })
    .from(icps)
    .where(and(eq(icps.tenantId, authCtx.tenantId), showDeleted ? isNotNull(icps.deletedAt) : isNull(icps.deletedAt)))
    .orderBy(icps.priority, icps.createdAt);

  return Response.json({ icps: rows });
}

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // R4.10: members create/edit profiles (parity with the legacy ICP
  // page's documented decision); only DELETE stays admin-gated.
  // Viewers are blocked upstream by the middleware write gate.

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const catalog = await resolveCatalogForValidation(authCtx.tenantId);
  const validation = validateIcpInput(body as Record<string, unknown>, catalog);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }
  const { name, status, priority, description, criteria, uiState, sourcingFilters } =
    validation.value;

  const icpId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(icps).values({
      id: icpId,
      tenantId: authCtx.tenantId,
      name,
      description,
      status,
      priority,
      metadata: {
        ...(uiState ? { uiState } : {}),
        ...(sourcingFilters ? { sourcingFilters } : {}),
      },
      // createdByUserId FK -> users.id (APP id), not the auth-user id.
      createdByUserId: authCtx.appUserId,
    });
    if (criteria.length > 0) {
      await tx.insert(icpCriteria).values(
        criteria.map((c) => ({
          icpId,
          fieldKey: c.fieldKey,
          operator: c.operator,
          value: c.value as object,
          weight: c.weight,
          isRequired: c.isRequired,
        })),
      );
    }
  });

  // The flats mirror follows whoever is rank 1 now (R5.2).
  await syncRankOneMirror(authCtx.tenantId);

  // Recompute the matrix for this tenant so the new ICP scores.
  inngest
    .send({ name: "icp/recompute-tenant", data: { tenantId: authCtx.tenantId } })
    .catch(() => {});

  // When the ICP is active, also propose net-new accounts that match it
  // (queued for approval — nothing is inserted or enriched without an OK).
  if (status === "active") {
    inngest
      .send({ name: "icp/source-tenant", data: { tenantId: authCtx.tenantId, icpId } })
      .catch(() => {});
  }

  return Response.json({ id: icpId, name, status, priority }, { status: 201 });
}
