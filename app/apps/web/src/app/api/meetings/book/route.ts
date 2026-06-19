import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { contacts, activities, tenants } from "@/db/schema";
import { eq, and, gte, isNull, lt, sql } from "drizzle-orm";
import { bookSovereignMeeting, CalendarNotConnectedError } from "@/lib/integrations/calendar-write";
import { apiError } from "@/lib/infra/api-errors";
import {
  DEEP_DIVE_METADATA_KEY,
  DEEP_DIVE_METADATA_VALUE,
  decideDeepDiveBooking,
  getDeepDiveCap,
  getIsoWeekBounds,
} from "@/lib/calendar/capacity";
import { z } from "zod";

const bookMeetingSchema = z.object({
  contactId: z.string().min(1, "contactId is required"),
  startTime: z.string().min(1, "startTime is required"),
  durationMinutes: z.number().int().min(5).max(480).optional().default(30),
  title: z.string().max(500).optional(),
  // B7 — tag the meeting type for capacity tracking. When 'deep_dive',
  // the route enforces the per-tenant weekly cap unless override=true.
  // Other types pass through unchecked. The metadata is also written
  // to activities so the weekly cron (meeting-capacity-check) can
  // recount.
  meetingType: z
    .enum(["intro", "qualification", "deep_dive", "follow_up"])
    .optional()
    .default("intro"),
  // Founder force-book past the cap when a critical deal demands it.
  // The dashboard badge will surface the saturation regardless, so the
  // goulot stays visible after override.
  override: z.boolean().optional().default(false),
  // Default sovereign Jitsi. "google_meet"/"teams" use the calendar's native
  // conference; "zoom" uses Zoom (if configured). Unavailable choices fall
  // back to sovereign.
  conferencing: z
    .enum(["sovereign", "google_meet", "teams", "zoom"])
    .optional()
    .default("sovereign"),
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
    const { contactId, startTime, durationMinutes, title, meetingType, override, conferencing } = parsed.data;

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

    // B7 — deep-dive capacity gate. Only enforced when meetingType is
    // explicitly 'deep_dive'. Other types pass through. Inline COUNT
    // catches the latest snapshot; the weekly cron persists a cached
    // value on tenants.settings.deepDiveLoad for the dashboard badge.
    if (meetingType === "deep_dive") {
      const { weekStart, weekEnd } = getIsoWeekBounds(new Date());
      const [tenantRow] = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, authCtx.tenantId))
        .limit(1);
      const cap = getDeepDiveCap(
        tenantRow?.settings as Record<string, unknown> | null,
      );

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activities)
        .where(
          and(
            eq(activities.tenantId, authCtx.tenantId),
            gte(activities.occurredAt, weekStart),
            lt(activities.occurredAt, weekEnd),
            sql`${activities.metadata}->>${DEEP_DIVE_METADATA_KEY} = ${DEEP_DIVE_METADATA_VALUE}`,
          ),
        );
      const currentWeekCount = Number(countRow?.count ?? 0);

      const decision = decideDeepDiveBooking({
        currentWeekCount,
        cap,
        hasOverride: override,
      });

      if (!decision.allowed) {
        return Response.json(
          {
            error: "Deep-dive weekly cap reached. Pass `override: true` to force-book past the cap.",
            cap,
            currentWeekCount,
            reason: decision.reason,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
          },
          { status: 409 },
        );
      }
    }

    // Create the calendar event on whichever calendar the user connected
    // (CalDAV / Microsoft / Google), carrying a sovereign open-source visio
    // link — never a Google Meet / Teams room. See calendar-write.ts.
    let booking;
    try {
      booking = await bookSovereignMeeting({
        userId: authCtx.userId,
        tenantId: authCtx.tenantId,
        contactEmail: contact.email,
        contactName,
        startTime: new Date(startTime),
        durationMinutes: durationMinutes || 30,
        title: title || `Rendez-vous avec ${contactName}`,
        roomPrefix: "rdv",
        conferencing,
      });
    } catch (err) {
      if (err instanceof CalendarNotConnectedError) {
        return apiError(
          "VALIDATION_ERROR",
          "Aucune boîte connectée. Connecte Google, Microsoft, ou ta boîte email (IMAP/SMTP — Zimbra, Infomaniak…) dans Réglages → Mail & Calendar pour planifier une visio.",
        );
      }
      throw err;
    }

    // Log activity. metadata.meetingType is read by the B7 weekly cron
    // (meeting-capacity-check) AND the next deep-dive booking attempt
    // — same source of truth, no drift.
    await db.insert(activities).values({
      tenantId: authCtx.tenantId,
      actorType: "user",
      actorId: authCtx.appUserId,
      entityType: "contact",
      entityId: contactId,
      activityType: "meeting_scheduled",
      channel: "meeting",
      direction: "outbound",
      summary: `Meeting booked: ${title || `Rendez-vous avec ${contactName}`}`,
      metadata: {
        eventId: booking.eventId,
        joinUrl: booking.joinUrl,
        // Back-compat: older readers keyed on `meetLink`.
        meetLink: booking.joinUrl,
        calendarProvider: booking.provider,
        conferencing: booking.conferencing,
        // Correlates the sovereign recording webhook back to this meeting
        // (null for native Teams/Meet meetings).
        roomName: booking.roomName,
        startTime,
        durationMinutes: durationMinutes || 30,
        meetingType,
        override: meetingType === "deep_dive" ? override : false,
      },
    });

    return Response.json({
      booked: true,
      eventId: booking.eventId,
      joinUrl: booking.joinUrl,
      meetLink: booking.joinUrl,
      calendarLink: booking.calendarLink,
      provider: booking.provider,
      conferencing: booking.conferencing,
    });
  } catch (error: any) {
    console.error("Meeting booking failed:", error);
    return Response.json({ error: error.message || "Meeting booking failed" }, { status: 500 });
  }
}
