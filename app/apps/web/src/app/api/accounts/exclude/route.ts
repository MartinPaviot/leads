import { db } from "@/db";
import { companies } from "@/db/schema";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { suppressAccounts, liftSuppression } from "@/lib/accounts/suppression";
import { z } from "zod";

/**
 * Exclude / re-include accounts — the first-class "not a fit" action.
 *
 * Exclude is NOT delete. The row stays (so the company keeps feeding the
 * TAM-build dedup set and is never re-sourced, and so we can learn from
 * the rejection), but `excludedReason`/`excludedAt` are set. That single
 * flag already gates outbound enrollment (lib/sequences/enrollment-
 * eligibility.ts) and now hides the account from the default list. The
 * action is reversible — `action: "include"` clears the flag.
 *
 * POST /api/accounts/exclude
 *   { ids: string[],  action?: "exclude"|"include", reason?, note? }
 *   { all: true,      action?: "exclude"|"include", reason?, note? }
 *
 * Tenant-scoped: the `all` path can never touch another tenant's rows.
 */

const bodySchema = z
  .object({
    ids: z.array(z.string()).max(1000).optional(),
    all: z.boolean().optional(),
    action: z.enum(["exclude", "include"]).default("exclude"),
    // Free-form machine tag, e.g. "not_a_fit", "anti_icp_industry",
    // "do_not_contact_request". Defaults to "not_a_fit".
    reason: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(2000).optional(),
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

    const { ids, all, action, note } = parsed.data;
    const reason = parsed.data.reason ?? "not_a_fit";

    const scope = and(
      eq(companies.tenantId, authCtx.tenantId),
      isNull(companies.deletedAt),
      all === true ? undefined : inArray(companies.id, ids ?? []),
      // Only flip rows that are in the opposite state so the returned
      // count reflects rows actually changed (idempotent re-calls noop).
      action === "include"
        ? isNotNull(companies.excludedReason)
        : isNull(companies.excludedReason),
    );

    try {
      const setClause =
        action === "include"
          ? {
              excludedReason: null,
              excludedAt: null,
              // Spec 35 D5 dual-write: re-including makes the account targetable.
              targetingStatus: "targeted" as const,
              // Drop the historical note key; keep the rest of properties.
              properties: sql`(COALESCE(${companies.properties}, '{}'::jsonb)) - 'excluded_note'`,
              updatedAt: sql`now()`,
            }
          : {
              excludedReason: reason,
              excludedAt: sql`now()`,
              // Spec 35 D5 dual-write: excluding = reversible targeting removal.
              targetingStatus: "archived" as const,
              ...(note
                ? {
                    properties: sql`COALESCE(${companies.properties}, '{}'::jsonb) || ${JSON.stringify(
                      { excluded_note: note },
                    )}::jsonb`,
                  }
                : {}),
              updatedAt: sql`now()`,
            };

      const result = await db
        .update(companies)
        .set(setClause)
        .where(scope)
        .returning({ id: companies.id });

      // Mirror the change into the durable suppression ledger so excluded
      // accounts stay out of sourcing even if their row is later removed, and
      // re-including lifts that block.
      const changedIds = result.map((r) => r.id);
      if (changedIds.length > 0) {
        if (action === "include") {
          await liftSuppression(authCtx.tenantId, changedIds, "excluded").catch((e) =>
            console.error("liftSuppression (include) failed:", e),
          );
        } else {
          const rows = await db
            .select({ id: companies.id, name: companies.name, domain: companies.domain, properties: companies.properties })
            .from(companies)
            .where(and(eq(companies.tenantId, authCtx.tenantId), inArray(companies.id, changedIds)));
          await suppressAccounts({
            tenantId: authCtx.tenantId,
            kind: "excluded",
            reason,
            createdBy: authCtx.appUserId,
            companies: rows,
          }).catch((e) => console.error("suppressAccounts (exclude) failed:", e));
        }
      }

      await logAudit({
        tenantId: authCtx.tenantId,
        userId: authCtx.appUserId,
        action: "update",
        entityType: "company",
        entityId: all === true ? "*" : (ids ?? []).join(","),
        metadata: {
          op: action,
          count: result.length,
          all: all === true,
          ...(action === "exclude" ? { reason } : {}),
        },
      });

      return Response.json({
        success: true,
        action,
        changed: result.length,
      });
    } catch (error) {
      console.error("Failed to exclude/include accounts:", error);
      return Response.json(
        { error: "Failed to update accounts" },
        { status: 500 },
      );
    }
  });
}
