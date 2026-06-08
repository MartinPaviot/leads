import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";
import { fetchRecentMeetings } from "@/lib/integrations/calendar";
import { fetchCalDavMeetingsForTenant } from "@/lib/integrations/caldav-sync";

export async function POST() {
  const authCtx = await getAuthContext();
  const session = await auth();
  if (!authCtx || !session?.user?.id || !session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // OAuth (Google) calendar + CalDAV (custom IMAP/SMTP mailboxes) are
    // independent sources — fetch both so "Force sync" works regardless of how
    // the user connected. Each is non-fatal so one failing never blocks the other.
    const [oauthMeetings, caldavMeetings] = await Promise.all([
      fetchRecentMeetings(session.user.id, 30, 14).catch(() => []),
      fetchCalDavMeetingsForTenant(authCtx.tenantId, 30, 14).catch(() => []),
    ]);
    const meetings = [...oauthMeetings, ...caldavMeetings];

    // Get all contacts for attendee matching
    const allContacts = await db.select().from(contacts).where(and(eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)));
    const contactByEmail = new Map(
      allContacts
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c])
    );

    let created = 0;
    let skipped = 0;

    for (const meeting of meetings) {
      // Dedup by calendar event ID
      const [existing] = await db
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            sql`metadata->>'calendarEventId' = ${meeting.calendarEventId}`
          )
        )
        .limit(1);

      if (existing) {
        skipped++;
        continue;
      }

      // Match attendees to contacts
      const matchedAttendees = meeting.attendees
        .filter((a) => a.email.toLowerCase() !== session.user!.email!.toLowerCase())
        .map((a) => ({
          ...a,
          contact: contactByEmail.get(a.email.toLowerCase()) || null,
        }));

      // Use the first matched contact as the entity
      const primaryContact = matchedAttendees.find((a) => a.contact)?.contact;

      const isPast = meeting.startTime < new Date();
      const activityType = isPast ? "meeting_completed" : "meeting_scheduled";

      await db.insert(activities).values({
        tenantId: authCtx.tenantId,
        actorType: "user",
        actorId: session.user.id,
        entityType: primaryContact ? "contact" : "company",
        entityId: primaryContact?.id || "unknown",
        activityType,
        channel: "meeting",
        direction: "outbound",
        occurredAt: meeting.startTime,
        summary: meeting.title,
        metadata: {
          calendarEventId: meeting.calendarEventId,
          startTime: meeting.startTime.toISOString(),
          endTime: meeting.endTime.toISOString(),
          attendees: matchedAttendees.map((a) => ({
            email: a.email,
            displayName: a.displayName,
            responseStatus: a.responseStatus,
            contactId: a.contact?.id || null,
          })),
          location: meeting.location,
          meetingLink: meeting.meetingLink,
          status: meeting.status,
        },
      });

      created++;
    }

    return Response.json({
      success: true,
      created,
      skipped,
      total: meetings.length,
    });
  } catch (error) {
    console.error("Calendar sync failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // Google Calendar not connected is not a server error — return a structured response
    if (message === "Google Calendar not connected") {
      return Response.json(
        { status: "not_connected", message: "Google Calendar is not connected. Please connect your Google account first." },
        { status: 200 }
      );
    }

    // `message` can contain Google API error JSON with tokens; log but
    // don't echo it back to the client.
    return Response.json({ error: "Calendar sync failed" }, { status: 500 });
  }
}
