import { withAuthRLS } from "@/lib/auth/auth-utils";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { deactivateSuppressionDb } from "@/lib/suppression/db-store";
import { z } from "zod";

/**
 * Spec 35 — admin deactivation of a REVERSIBLE suppression (R4.2/R7.6):
 * manual_dnc / existing_customer / hard_bounce. opt_out and complaint are
 * permanent (R4.1): the helper refuses them (and the DB trigger blocks them
 * regardless), returning 409. Admin-only (settings:write). Full history is kept
 * (status -> inactive + deactivated_at/by + audit).
 *
 * POST /api/accounts/suppress/deactivate
 *   { level: "address"|"domain"|"account", value: string }
 */

const bodySchema = z.object({
  level: z.enum(["address", "domain", "account"]),
  value: z.string().trim().min(1),
});

export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requirePermission(authCtx.role, "settings:write");
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    const { level, value } = parsed.data;

    try {
      const ok = await deactivateSuppressionDb({
        tenantId: authCtx.tenantId,
        level,
        value,
        deactivatedBy: authCtx.appUserId,
      });
      if (!ok) return Response.json({ error: "No active suppression matched" }, { status: 404 });

      await logAudit({
        tenantId: authCtx.tenantId,
        userId: authCtx.appUserId,
        action: "deactivate",
        entityType: "suppression",
        entityId: `${level}:${value}`,
        metadata: { level, value },
      });
      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "suppression_permanent_immutable") {
        await logAudit({
          tenantId: authCtx.tenantId,
          userId: authCtx.appUserId,
          action: "deactivate",
          entityType: "suppression",
          entityId: `${level}:${value}`,
          metadata: { level, value, outcome: "rejected_permanent" },
        });
        return Response.json(
          { error: "This suppression is permanent (opt-out or complaint) and cannot be deactivated." },
          { status: 409 },
        );
      }
      console.error("Failed to deactivate suppression:", error);
      return Response.json({ error: "Failed to deactivate suppression" }, { status: 500 });
    }
  });
}
