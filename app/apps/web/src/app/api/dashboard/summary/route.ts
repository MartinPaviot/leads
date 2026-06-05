import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, deals, tasks, sequenceEnrollments, companies, contacts, outboundEmails } from "@/db/schema";
import { sql, eq, and, gte, lte, ne, desc, isNull } from "drizzle-orm";
import { getTenantSettings } from "@/lib/config/tenant-settings";

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
  // H6 — same-shape window one week earlier. The "7d ago" threshold
  // is good enough — we never try to align to ISO-week boundaries,
  // just to a rolling 7-day window so the delta is comparable even
  // when the user loads the page mid-week.
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // Weekly activity counts — current + previous windows fetched in
    // parallel so H6 delta rendering doesn't add a round-trip.
    const [weeklyActivities, prevWeeklyActivities] = await Promise.all([
      db
        .select({
          type: activities.activityType,
          count: sql<number>`count(*)::int`,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            gte(activities.occurredAt, weekStart),
            isNull(activities.deletedAt),
          ),
        )
        .groupBy(activities.activityType),
      db
        .select({
          type: activities.activityType,
          count: sql<number>`count(*)::int`,
        })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            gte(activities.occurredAt, prevWeekStart),
            lte(activities.occurredAt, weekStart),
            isNull(activities.deletedAt),
          )
        )
        .groupBy(activities.activityType),
    ]);

    const activityCounts: Record<string, number> = {};
    for (const row of weeklyActivities) activityCounts[row.type] = row.count;
    const prevActivityCounts: Record<string, number> = {};
    for (const row of prevWeeklyActivities) prevActivityCounts[row.type] = row.count;

    // Weekly sequence enrollments — current + previous.
    const [enrollments, prevEnrollments] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sequenceEnrollments)
        .where(gte(sequenceEnrollments.enrolledAt, weekStart)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sequenceEnrollments)
        .where(
          and(
            gte(sequenceEnrollments.enrolledAt, prevWeekStart),
            lte(sequenceEnrollments.enrolledAt, weekStart)
          )
        ),
    ]);

    // Weekly deals won — current + previous.
    const [dealsWon, prevDealsWon] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, authCtx.tenantId),
            eq(deals.stage, "won"),
            gte(deals.updatedAt, weekStart),
            isNull(deals.deletedAt),
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, authCtx.tenantId),
            eq(deals.stage, "won"),
            gte(deals.updatedAt, prevWeekStart),
            lte(deals.updatedAt, weekStart),
            isNull(deals.deletedAt),
          )
        ),
    ]);

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
          // Due today OR overdue == dueDate <= end of today. Kept as a
          // single typed comparison so the Date is mapped to the column's
          // driver value (ISO string); a raw sql`${date}` fragment skips
          // that mapping and makes postgres-js throw on the Date param.
          lte(tasks.dueDate, todayEnd),
          isNull(tasks.deletedAt),
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
            .where(
              and(
                eq(companies.id, task.entityId),
                eq(companies.tenantId, authCtx.tenantId),
                isNull(companies.deletedAt),
              ),
            )
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
          lte(activities.occurredAt, todayEnd),
          isNull(activities.deletedAt),
        )
      )
      .orderBy(activities.occurredAt);

    // ── Founder metrics (parallel) ──
    const [
      pipelineData,
      contactsCount,
      accountsCount,
      emailHealthData,
      dealsAtRisk,
      settings,
    ] = await Promise.all([
      // Pipeline value + deal counts
      db
        .select({
          totalValue: sql<number>`COALESCE(SUM(${deals.value}), 0)::int`,
          activeDeals: sql<number>`count(*)::int`,
          wonValue: sql<number>`COALESCE(SUM(CASE WHEN ${deals.stage} = 'won' THEN ${deals.value} ELSE 0 END), 0)::int`,
          wonCount: sql<number>`SUM(CASE WHEN ${deals.stage} = 'won' THEN 1 ELSE 0 END)::int`,
          lostCount: sql<number>`SUM(CASE WHEN ${deals.stage} = 'lost' THEN 1 ELSE 0 END)::int`,
        })
        .from(deals)
        .where(and(eq(deals.tenantId, authCtx.tenantId), isNull(deals.deletedAt))),
      // Total contacts
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt))),
      // Total accounts
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(and(eq(companies.tenantId, authCtx.tenantId), isNull(companies.deletedAt))),
      // Email deliverability (last 7 days)
      db
        .select({
          sent: sql<number>`count(*)::int`,
          opened: sql<number>`SUM(CASE WHEN ${outboundEmails.openedAt} IS NOT NULL THEN 1 ELSE 0 END)::int`,
          replied: sql<number>`SUM(CASE WHEN ${outboundEmails.repliedAt} IS NOT NULL THEN 1 ELSE 0 END)::int`,
          bounced: sql<number>`SUM(CASE WHEN ${outboundEmails.bouncedAt} IS NOT NULL THEN 1 ELSE 0 END)::int`,
        })
        .from(outboundEmails)
        .where(
          and(
            eq(outboundEmails.tenantId, authCtx.tenantId),
            eq(outboundEmails.status, "sent"),
            gte(outboundEmails.sentAt, new Date(Date.now() - 7 * 86400000))
          )
        ),
      // Top deals at risk (stalled 7+ days)
      db
        .select({
          id: deals.id,
          name: deals.name,
          stage: deals.stage,
          value: deals.value,
          updatedAt: deals.updatedAt,
        })
        .from(deals)
        .where(
          and(
            eq(deals.tenantId, authCtx.tenantId),
            ne(deals.stage, "won"),
            ne(deals.stage, "lost"),
            lte(deals.updatedAt, new Date(Date.now() - 7 * 86400000)),
            isNull(deals.deletedAt),
          )
        )
        .orderBy(desc(deals.value))
        .limit(5),
      // Tenant settings
      getTenantSettings(authCtx.tenantId),
    ]);

    const pipeline = pipelineData[0];
    const wonCount = pipeline?.wonCount || 0;
    const lostCount = pipeline?.lostCount || 0;
    const winRate = wonCount + lostCount > 0
      ? Math.round((wonCount / (wonCount + lostCount)) * 100)
      : null;

    const emailHealth = emailHealthData[0];
    const openRate = emailHealth?.sent > 0
      ? Math.round((emailHealth.opened / emailHealth.sent) * 100)
      : null;

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
      // H6 — prev-window counterparts. Home renders delta arrows by
      // subtracting current − previous; keeping the two objects
      // separate avoids breaking clients that only read weekSummary.
      weekSummaryPrev: {
        sequencesLaunched: prevEnrollments[0]?.count || 0,
        responsesReceived: (prevActivityCounts["email_replied"] || 0) + (prevActivityCounts["email_received"] || 0),
        meetingsBooked: prevActivityCounts["meeting_scheduled"] || 0,
        opportunitiesClosed: prevDealsWon[0]?.count || 0,
      },
      // Founder metrics
      founderMetrics: {
        pipelineValue: pipeline?.totalValue || 0,
        activeDeals: pipeline?.activeDeals || 0,
        wonValue: pipeline?.wonValue || 0,
        winRate,
        totalContacts: contactsCount[0]?.count || 0,
        totalAccounts: accountsCount[0]?.count || 0,
        emailsSent7d: emailHealth?.sent || 0,
        openRate,
        dealsAtRisk: dealsAtRisk.map((d) => ({
          id: d.id,
          name: d.name,
          stage: d.stage,
          value: d.value,
          daysSilent: Math.floor((Date.now() - (d.updatedAt?.getTime() || 0)) / 86400000),
        })),
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
