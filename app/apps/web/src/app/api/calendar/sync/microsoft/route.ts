import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { fetchMicrosoftMeetings } from "@/lib/calendar-microsoft";

export async function POST() {
  const authCtx = await getAuthContext();
  const session = await auth();
  if (!authCtx || !session?.user?.id || !session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const meetings = await fetchMicrosoftMeetings(session.user.id, 30, 14);

    const allContacts = await db.select().from(contacts).where(eq(contacts.tenantId, authCtx.tenantId));
    const contactByEmail = new Map(
      allContacts
        .filter((c) => c.email)
        .map((c) => [c.email!.toLowerCase(), c])
    );

    let created = 0;
    let skipped = 0;

    for (const meeting of meetings) {
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

      const matchedAttendees = meeting.attendees
        .filter((a) => a.email.toLowerCase() !== session.user!.email!.toLowerCase())
        .map((a) => ({
          ...a,
          contact: contactByEmail.get(a.email.toLowerCase()) || null,
        }));

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
          calendarSource: "microsoft",
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

    return Response.json({ success: true, created, skipped, total: meetings.length });
  } catch (error) {
    console.error("Microsoft calendar sync failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Microsoft Calendar not connected") {
      return Response.json(
        { status: "not_connected", message: "Microsoft Calendar is not connected. Please connect your Microsoft account first." },
        { status: 200 }
      );
    }

    // Upstream Graph API errors may contain tokens / user GUIDs; log
    // server-side and return a generic message.
    return Response.json({ error: "Microsoft calendar sync failed" }, { status: 500 });
  }
}
