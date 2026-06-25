import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import {
  users,
  contacts,
  companies,
  deals,
  activities,
  notes,
  tasks,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Admin-only — this streams the ENTIRE workspace (all contacts/companies/
  // deals/activities/notes/tasks) as a downloadable JSON export. A member must
  // not be able to exfiltrate the whole CRM; GETs are never gated by the
  // middleware, so the role check has to live here.
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  try {
    const tenantId = authCtx.tenantId;

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, authCtx.userId), eq(users.tenantId, tenantId)));
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const [
      contactsData,
      companiesData,
      dealsData,
      activitiesData,
      notesData,
      tasksData,
    ] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.tenantId, tenantId)),
      db.select().from(companies).where(eq(companies.tenantId, tenantId)),
      db.select().from(deals).where(eq(deals.tenantId, tenantId)),
      db.select().from(activities).where(eq(activities.tenantId, tenantId)),
      db.select().from(notes).where(eq(notes.tenantId, tenantId)),
      db.select().from(tasks).where(eq(tasks.tenantId, tenantId)),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        createdAt: user.createdAt,
      },
      data: {
        contacts: contactsData,
        companies: companiesData,
        deals: dealsData,
        activities: activitiesData,
        notes: notesData,
        tasks: tasksData,
      },
      metadata: {
        counts: {
          contacts: contactsData.length,
          companies: companiesData.length,
          deals: dealsData.length,
          activities: activitiesData.length,
          notes: notesData.length,
          tasks: tasksData.length,
        },
      },
    };

    // H7 — GDPR data-subject access request. Log what was exported
    // and by whom for SOC 2 CC6.7 / ISO 27001 A.5.34 compliance.
    await logAudit({
      tenantId,
      userId: authCtx.appUserId,
      action: "create",
      entityType: "gdpr_export",
      entityId: user.id,
      metadata: {
        event: "gdpr_export",
        counts: exportData.metadata.counts,
        ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      },
    });

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="elevay-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (error) {
    console.error("GDPR export failed:", error);
    return Response.json({ error: "Export failed" }, { status: 500 });
  }
}
