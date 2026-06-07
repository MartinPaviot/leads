import { withAuthRLS } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { decideProposals } from "@/lib/tam/proposals";
import { logAudit } from "@/lib/infra/audit-log";
import { z } from "zod";

/**
 * POST /api/tam/proposals/decide
 *   { ids: string[], action: "approve"|"reject" }
 *   { all: true,     action: "approve"|"reject" }
 *
 * Approving applies the proposal (insert + enrich / refresh / exclude) —
 * the point where credit spend is authorised. Rejecting just records it.
 */
const bodySchema = z
  .object({
    ids: z.array(z.string()).max(500).optional(),
    all: z.boolean().optional(),
    action: z.enum(["approve", "reject"]),
  })
  .refine((b) => b.all === true || (b.ids?.length ?? 0) > 0, {
    message: "ids array or all:true required",
  });

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requirePermission(authCtx.role, "companies:delete");
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid request",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { ids, all, action } = parsed.data;
    const result = await decideProposals({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      ids,
      all,
      action,
    });

    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "update",
      entityType: "tam_proposal",
      entityId: all === true ? "*" : (ids ?? []).join(","),
      metadata: { op: action, ...result },
    });

    return Response.json({ success: true, ...result });
  });
}
