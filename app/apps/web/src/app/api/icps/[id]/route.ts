/**
 * GET    /api/icps/[id]  — one ICP + its criteria
 * PATCH  /api/icps/[id]  — replace name/status/priority/criteria
 * DELETE /api/icps/[id]  — soft-delete the ICP (restorable via /api/icps/restore)
 *
 * All tenant-scoped. PATCH re-validates against the catalog and
 * replaces the criteria set wholesale (simpler + race-free than diffing).
 * Mutations re-trigger the tenant recompute.
 */

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { icps, icpCriteria, companyIcpFit } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { validateIcpInput } from "@/lib/icp/validation";
import { resolveCatalogForValidation } from "@/lib/icp/catalog-db";
import { inngest } from "@/inngest/client";

async function loadOwnedIcp(id: string, tenantId: string) {
  const [icp] = await db
    .select()
    .from(icps)
    .where(and(eq(icps.id, id), eq(icps.tenantId, tenantId), isNull(icps.deletedAt)))
    .limit(1);
  return icp ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const icp = await loadOwnedIcp(id, authCtx.tenantId);
  if (!icp) return Response.json({ error: "ICP not found" }, { status: 404 });

  const criteria = await db
    .select()
    .from(icpCriteria)
    .where(eq(icpCriteria.icpId, id));

  return Response.json({ icp, criteria });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  const { id } = await params;

  const icp = await loadOwnedIcp(id, authCtx.tenantId);
  if (!icp) return Response.json({ error: "ICP not found" }, { status: 404 });

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
  const { name, status, priority, description, criteria } = validation.value;

  await db.transaction(async (tx) => {
    await tx
      .update(icps)
      .set({ name, status, priority, description, updatedAt: new Date() })
      .where(eq(icps.id, id));
    // Replace the criteria set wholesale.
    await tx.delete(icpCriteria).where(eq(icpCriteria.icpId, id));
    if (criteria.length > 0) {
      await tx.insert(icpCriteria).values(
        criteria.map((c) => ({
          icpId: id,
          fieldKey: c.fieldKey,
          operator: c.operator,
          value: c.value as object,
          weight: c.weight,
          isRequired: c.isRequired,
        })),
      );
    }
  });

  inngest
    .send({ name: "icp/recompute-tenant", data: { tenantId: authCtx.tenantId } })
    .catch(() => {});

  return Response.json({ id, name, status, priority });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  const { id } = await params;

  const icp = await loadOwnedIcp(id, authCtx.tenantId);
  if (!icp) return Response.json({ error: "ICP not found" }, { status: 404 });

  // Soft-delete: keep the ICP row + its criteria so it stays restorable, but
  // stop it scoring immediately by dropping its fit cells (rebuilt on restore)
  // and recomputing the tenant — which now excludes deleted ICPs and
  // re-resolves each company's primary ICP + companies.score without it.
  const now = new Date();
  await db.update(icps).set({ deletedAt: now, updatedAt: now }).where(eq(icps.id, id));
  await db.delete(companyIcpFit).where(eq(companyIcpFit.icpId, id));

  inngest
    .send({ name: "icp/recompute-tenant", data: { tenantId: authCtx.tenantId } })
    .catch(() => {});

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "delete",
    entityType: "icp",
    entityId: id,
    metadata: { name: icp.name, softDeleted: true },
  });

  return Response.json({ deleted: id });
}
