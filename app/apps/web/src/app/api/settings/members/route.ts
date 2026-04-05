import { getAuthContext, requireAdmin } from "@/lib/auth-utils";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, memberId));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to update member:", error);
    return Response.json({ error: "Failed to update member" }, { status: 500 });
  }
}
