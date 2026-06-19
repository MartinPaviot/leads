import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { requireCapabilityForRequest } from "@/lib/auth/permissions";
import { invalidateRoleCache } from "@/lib/auth/fresh-role";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { invalidateSessionGuard } from "@/lib/auth/session-guard";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Only ACTIVE members. A revoked (deactivated) user is no longer a member:
    // they can't authenticate and they drop off this list + count entirely.
    // Re-inviting them restores access (see the invite route).
    const members = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.tenantId, authCtx.tenantId), isNull(users.deactivatedAt)));

    return Response.json({
      members: members.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
        email: m.email,
        role: m.role || "member",
        avatarUrl: m.avatarUrl,
        createdAt: m.createdAt,
        // Lets the client hide the "remove access" action on the acting
        // admin's own row (the DELETE route also rejects self-removal).
        isSelf: m.id === authCtx.appUserId,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch members:", error);
    return Response.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  // CLE-12 — belt-and-braces matrix gate on the fresh DB role (members:invite),
  // alongside the existing requireAdmin. Same verdict, single source of truth.
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return Response.json({ error: "memberId and role required" }, { status: 400 });
    }
    if (!["admin", "member", "viewer"].includes(role)) {
      return Response.json({ error: "Invalid role" }, { status: 400 });
    }

    // Prevent demoting yourself
    if (memberId === authCtx.appUserId && role !== "admin") {
      return Response.json({ error: "Cannot change your own role" }, { status: 400 });
    }

    // Read the previous role before the update so the audit entry
    // records the full before/after transition.
    const [before] = await db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, memberId), eq(users.tenantId, authCtx.tenantId)))
      .limit(1);

    // Scope the update to this tenant — without the tenant clause a
    // tenant-A admin could PUT a userId that belongs to tenant B and
    // flip their role. `returning()` lets us detect the 0-row case and
    // respond with 404 instead of a false 200.
    const updated = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(users.id, memberId), eq(users.tenantId, authCtx.tenantId)))
      .returning({ id: users.id });

    if (updated.length === 0) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    // Apply the new role on this instance immediately (other instances
    // converge within the fresh-role cache TTL, ≤60s).
    invalidateRoleCache(memberId);

    // H7 — role changes cross the SOC 2 CC6.1 / ISO 27001 A.5.15
    // threshold. Always logged, with the before/after pair.
    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: "update",
      entityType: "user",
      entityId: memberId,
      changes: { role: { old: before?.role ?? null, new: role } },
      metadata: { event: "role_changed" },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update member:", error);
    return Response.json({ error: "Failed to update member" }, { status: 500 });
  }
}

/**
 * SOC2 T5 — offboard a member. Soft: sets `users.deactivated_at`, which
 * (1) blocks new sign-ins (credentials authorize + OAuth via the guard)
 * and (2) revokes live sessions through lib/auth/session-guard within
 * 60s (instantly on this instance). Reversible: pass { reactivate: true }
 * to clear the flag. Audit-logged either way.
 */
export async function DELETE(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;
  // CLE-12 — belt-and-braces matrix gate on the fresh DB role (members:manage),
  // alongside the existing requireAdmin. Same verdict, single source of truth.
  const denied = requireCapabilityForRequest(authCtx, req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { memberId, reactivate } = body as {
      memberId?: string;
      reactivate?: boolean;
    };

    if (!memberId) {
      return Response.json({ error: "memberId required" }, { status: 400 });
    }
    if (memberId === authCtx.appUserId) {
      return Response.json(
        { error: "Cannot deactivate your own account" },
        { status: 400 },
      );
    }

    // Tenant-scoped, like PUT — a tenant-A admin must not be able to
    // deactivate a tenant-B user by guessing ids. clerkId is needed to
    // bust the session-guard cache (it is keyed by the AUTH user id).
    const updated = await db
      .update(users)
      .set({
        deactivatedAt: reactivate ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, memberId), eq(users.tenantId, authCtx.tenantId)))
      .returning({ id: users.id, clerkId: users.clerkId });

    if (updated.length === 0) {
      return Response.json({ error: "Member not found" }, { status: 404 });
    }

    invalidateSessionGuard(updated[0].clerkId);

    await logAudit({
      tenantId: authCtx.tenantId,
      userId: authCtx.appUserId,
      action: reactivate ? "reactivate" : "deactivate",
      entityType: "user",
      entityId: memberId,
      metadata: {
        event: reactivate ? "member_reactivated" : "member_deactivated",
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to deactivate member:", error);
    return Response.json(
      { error: "Failed to deactivate member" },
      { status: 500 },
    );
  }
}
