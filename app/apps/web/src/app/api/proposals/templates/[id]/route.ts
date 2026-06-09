import { withAuthRLS } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { proposalTemplates } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { validateConfirmedMap } from "@/lib/proposals/component-map";

type Params = { params: Promise<{ id: string }> };

/** GET /api/proposals/templates/[id] — tenant-scoped detail + component map. */
export async function GET(_req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await params;
    const [tpl] = await db
      .select()
      .from(proposalTemplates)
      .where(
        and(
          eq(proposalTemplates.id, id),
          eq(proposalTemplates.tenantId, authCtx.tenantId),
          isNull(proposalTemplates.deletedAt),
        ),
      )
      .limit(1);
    if (!tpl) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({
      template: {
        id: tpl.id,
        name: tpl.name,
        status: tpl.status,
        sourceFormat: tpl.sourceFormat,
        originalFileName: tpl.originalFileName,
        componentMap: tpl.componentMap,
        extractedOutline: tpl.extractedOutline,
        detectionMeta: tpl.detectionMeta,
        mapConfirmed: tpl.mapConfirmed,
        updatedAt: tpl.updatedAt,
      },
    });
  });
}

/**
 * PATCH /api/proposals/templates/[id]
 * Confirm/adjust the component map (mark-once → status='mapped') or rename.
 */
export async function PATCH(req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      componentMap?: unknown;
      name?: unknown;
    };

    const [tpl] = await db
      .select({ id: proposalTemplates.id })
      .from(proposalTemplates)
      .where(
        and(
          eq(proposalTemplates.id, id),
          eq(proposalTemplates.tenantId, authCtx.tenantId),
          isNull(proposalTemplates.deletedAt),
        ),
      )
      .limit(1);
    if (!tpl) return Response.json({ error: "not_found" }, { status: 404 });

    if (body.componentMap !== undefined) {
      const v = validateConfirmedMap(body.componentMap);
      if (!v.ok) {
        return Response.json({ error: "invalid_map", details: v.errors }, { status: 400 });
      }
      await db
        .update(proposalTemplates)
        .set({
          componentMap: body.componentMap,
          mapConfirmed: true,
          status: "mapped",
          mappedByUserId: authCtx.appUserId,
          mappedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(proposalTemplates.id, id),
            eq(proposalTemplates.tenantId, authCtx.tenantId),
          ),
        );
      return Response.json({ id, status: "mapped" });
    }

    if (typeof body.name === "string" && body.name.trim()) {
      const name = body.name.trim().slice(0, 200);
      await db
        .update(proposalTemplates)
        .set({ name, updatedAt: new Date() })
        .where(
          and(
            eq(proposalTemplates.id, id),
            eq(proposalTemplates.tenantId, authCtx.tenantId),
          ),
        );
      return Response.json({ id, name });
    }

    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  });
}

/** DELETE /api/proposals/templates/[id] — soft delete, tenant-scoped. */
export async function DELETE(_req: Request, { params }: Params) {
  return withAuthRLS(async (authCtx) => {
    const { id } = await params;
    await db
      .update(proposalTemplates)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(proposalTemplates.id, id),
          eq(proposalTemplates.tenantId, authCtx.tenantId),
        ),
      );
    return Response.json({ ok: true });
  });
}
