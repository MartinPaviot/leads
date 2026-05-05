import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, activities } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { createCalendarEvent } from "@/lib/integrations/meeting-booking";
import { apiError } from "@/lib/infra/api-errors";
import { z } from "zod";

const bookMeetingSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  startTime: z.string().min(1, "startTime is required"),
  durationMinutes: z.number().int().min(5).max(480).optional().default(30),
  title: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return apiError("UNAUTHORIZED", "Authentication required");
  }

  try {
    const raw = await req.json();
    const parsed = bookMeetingSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid meeting data", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const { contactId, startTime, durationMinutes, title } = parsed.data;

    // Fetch contact (exclude soft-deleted)
    const [contact] = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, authCtx.tenantId), isNull(contacts.deletedAt)))
      .limit(1);

    if (!contact || !contact.email) {
      return apiError("NOT_FOUND", "Contact not found or has no email");
    }

    const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Prospect";

    // Create calendar event
    const event = await createCalendarEvent(authCtx.userId, {
      contactEmail: contact.email,
      contactName,
      startTime: new Date(startTime),
      durationMinutes: durationMinutes || 30,
      title: title || `Meeting with ${contactName}`,
    });

    if (!event) {
      return Response.json({ error: "Failed to create calendar event — is Google Calendar connected?" }, { status: 500 });
    }

    // Log activity
    await db.insert(activities).values({
      tenantId: authCtx.tenantId,
      actorType: "user",
      actorId: authCtx.appUserId,
      entityType: "contact",
      entityId: contactId,
      activityType: "meeting_scheduled",
      channel: "meeting",
      direction: "outbound",
      summary: `Meeting booked: ${title || `Meeting with ${contactName}`}`,
      metadata: {
        eventId: event.eventId,
        meetLink: event.meetLink,
        startTime,
        durationMinutes: durationMinutes || 30,
      },
    });

    return Response.json({
      booked: true,
      eventId: event.eventId,
      meetLink: event.meetLink,
      calendarLink: event.htmlLink,
    });
  } catch (error: any) {
    console.error("Meeting booking failed:", error);
    return Response.json({ error: error.message || "Meeting booking failed" }, { status: 500 });
  }
}
