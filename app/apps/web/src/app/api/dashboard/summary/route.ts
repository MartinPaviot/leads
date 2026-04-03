import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { activities, deals, tasks, sequenceEnrollments, companies } from "@/db/schema";
import { sql, eq, and, gte, lte, or } from "drizzle-orm";
import { getTenantSettings } from "@/lib/tenant-settings";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getStartOfWeek(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export async function GET() {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekStart = getStartOfWeek();
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // Weekly activity counts
    const weeklyActivities = await db
      .select({
        type: activities.activityType,
        count: sql<number>`count(*)::int`,
      })
      .from(activities)
      .where(and(eq(activities.tenantId, authCtx.tenantId), gte(activities.occurredAt, weekStart)))
      .groupBy(activities.activityType);

    const activityCounts: Record<string, number> = {};
    for (const row of weeklyActivities) {
      activityCounts[row.type] = row.count;
    }

    // Weekly sequence enrollments
    const enrollments = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sequenceEnrollments)
      .where(gte(sequenceEnrollments.enrolledAt, weekStart));

    // Weekly deals won
    const dealsWon = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, authCtx.tenantId),
          eq(deals.stage, "won"),
          gte(deals.updatedAt, weekStart)
        )
      );

    // Today's tasks (due today + overdue)
    const todayTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        status: tasks.status,
        priority: tasks.priority,
        entityType: tasks.entityType,
        entityId: tasks.entityId,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, authCtx.tenantId),
          eq(tasks.status, "pending"),
          or(
            and(gte(tasks.dueDate, todayStart), lte(tasks.dueDate, todayEnd)),
            sql`${tasks.dueDate} < ${todayStart}`
          )
        )
      )
      .orderBy(tasks.dueDate);

    // Enrich tasks with account names
    const enrichedTasks = await Promise.all(
      todayTasks.map(async (task) => {
        let accountName = null;
        if (task.entityType === "company" && task.entityId) {
          const company = await db
            .select({ name: companies.name })
            .from(companies)
            .where(and(eq(companies.id, task.entityId), eq(companies.tenantId, authCtx.tenantId)))
            .limit(1);
          accountName = company[0]?.name || null;
        }
        return {
          id: task.id,
          title: task.title,
          dueDate: task.dueDate?.toISOString() || null,
          priority: task.priority,
          account: accountName,
          overdue: task.dueDate ? task.dueDate < todayStart : false,
        };
      })
    );

    // Today's meetings (from activities with type meeting_scheduled)
    const todayMeetings = await db
      .select({
        id: activities.id,
        summary: activities.summary,
        occurredAt: activities.occurredAt,
        metadata: activities.metadata,
      })
      .from(activities)
      .where(
        and(
          eq(activities.tenantId, authCtx.tenantId),
          eq(activities.activityType, "meeting_scheduled"),
          gte(activities.occurredAt, todayStart),
          lte(activities.occurredAt, todayEnd)
        )
      )
      .orderBy(activities.occurredAt);

    const settings = await getTenantSettings(authCtx.tenantId);
    const firstName = settings.onboardingFullName?.split(" ")[0]
      || (await auth())?.user?.name?.split(" ")[0]
      || "there";

    return Response.json({
      greeting: getGreeting(),
      firstName,
      role: settings.onboardingRole || null,
      challenge: settings.primaryChallenge || null,
      weekSummary: {
        sequencesLaunched: enrollments[0]?.count || 0,
        responsesReceived: (activityCounts["email_replied"] || 0) + (activityCounts["email_received"] || 0),
        meetingsBooked: activityCounts["meeting_scheduled"] || 0,
        opportunitiesClosed: dealsWon[0]?.count || 0,
      },
      todayTasks: enrichedTasks,
      todayMeetings: todayMeetings.map((m) => ({
        id: m.id,
        title: m.summary || "Meeting",
        time: m.occurredAt?.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) || "",
      })),
    });
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return Response.json({
      greeting: getGreeting(),
      firstName: (await auth())?.user?.name?.split(" ")[0] || "there",
      role: null,
      challenge: null,
      weekSummary: { sequencesLaunched: 0, responsesReceived: 0, meetingsBooked: 0, opportunitiesClosed: 0 },
      todayTasks: [],
      todayMeetings: [],
    });
  }
}
