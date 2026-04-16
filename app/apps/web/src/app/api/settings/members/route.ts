import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit-log";

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
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
      .where(eq(users.tenantId, authCtx.tenantId));

    return Response.json({
      members: members.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email,
        email: m.email,
        role: m.role || "member",
        avatarUrl: m.avatarUrl,
        createdAt: m.createdAt,
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

  try {
    const body = await req.json();
    const { memberId, role } = body;

    if (!memberId || !role) {
      return Response.json({ error: "memberId and role required" }, { status: 400 });
    }
    if (!["admin", "member"].includes(role)) {
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
