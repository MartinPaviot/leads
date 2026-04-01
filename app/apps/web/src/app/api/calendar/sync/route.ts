import { auth } from "@/auth";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchRecentMeetings } from "@/lib/calendar";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const meetings = await fetchRecentMeetings(session.user.id, 30, 14);

    // Get all contacts for attendee matching
    const allContacts = await db.select().from(contacts);
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
            eq(activities.tenantId, "default"),
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
        tenantId: "default",
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
    return Response.json({ error: `Calendar sync failed: ${message}` }, { status: 500 });
  }
}
