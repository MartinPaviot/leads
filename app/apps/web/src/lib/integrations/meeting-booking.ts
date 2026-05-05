/**
 * Meeting Booking Module
 *
 * Queries Google Calendar for availability, formats slots for email insertion,
 * and creates calendar events with Meet links.
 */

import { getCalendarClient } from "@/lib/integrations/calendar";

export interface AvailableSlot {
  start: Date;
  end: Date;
  formatted: string;
}

/**
 * Get available 30-min meeting slots by querying Google Calendar freebusy.
 */
export async function getAvailableSlots(
  userId: string,
  options?: {
    daysAhead?: number;
    slotDurationMinutes?: number;
    windowStart?: string; // "09:00"
    windowEnd?: string;   // "17:00"
  }
): Promise<AvailableSlot[]> {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return [];

  const {
    daysAhead = 5,
    slotDurationMinutes = 30,
    windowStart = "09:00",
    windowEnd = "17:00",
  } = options || {};

  const now = new Date();
  const timeMin = new Date(now);
  // Start from tomorrow if it's past windowEnd today
  const [startH] = windowStart.split(":").map(Number);
  if (now.getHours() >= Number(windowEnd.split(":")[0])) {
    timeMin.setDate(timeMin.getDate() + 1);
  }
  timeMin.setHours(startH, 0, 0, 0);

  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + daysAhead);
  timeMax.setHours(23, 59, 59, 999);

  // Query freebusy
  let busyPeriods: Array<{ start: string; end: string }> = [];
  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    busyPeriods = (res.data.calendars?.primary?.busy || []) as Array<{ start: string; end: string }>;
  } catch {
    return [];
  }

  // Generate candidate slots within business hours, excluding busy periods
  const slots: AvailableSlot[] = [];
  const [endH] = windowEnd.split(":").map(Number);

  for (let d = 0; d <= daysAhead; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);

    // Skip weekends
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;

    // Generate slots for this day
    for (let h = startH; h < endH; h++) {
      for (let m = 0; m < 60; m += slotDurationMinutes) {
        const slotStart = new Date(day);
        slotStart.setHours(h, m, 0, 0);

        // Skip if in the past
        if (slotStart <= now) continue;

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + slotDurationMinutes);

        // Skip if past window end
        if (slotEnd.getHours() > endH || (slotEnd.getHours() === endH && slotEnd.getMinutes() > 0)) continue;

        // Check against busy periods
        const isBusy = busyPeriods.some((busy) => {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);
          return slotStart < busyEnd && slotEnd > busyStart;
        });

        if (!isBusy) {
          slots.push({
            start: slotStart,
            end: slotEnd,
            formatted: formatSlot(slotStart),
          });
        }
      }
    }
  }

  return slots;
}

function formatSlot(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  const minStr = minutes === 0 ? "" : `:${minutes.toString().padStart(2, "0")}`;

  return `${dayName} ${monthName} ${dayNum} at ${h12}${minStr} ${ampm}`;
}

/**
 * Format top N available slots as a human-readable string for email insertion.
 */
export function formatSlotsForEmail(slots: AvailableSlot[], count: number = 3): string {
  if (slots.length === 0) return "";
  const selected = slots.slice(0, count);

  if (selected.length === 1) return selected[0].formatted;
  if (selected.length === 2) return `${selected[0].formatted} or ${selected[1].formatted}`;

  const last = selected.pop()!;
  return `${selected.map((s) => s.formatted).join(", ")}, or ${last.formatted}`;
}

/**
 * Create a Google Calendar event with a Meet link and invite the contact.
 */
export async function createCalendarEvent(
  userId: string,
  params: {
    contactEmail: string;
    contactName: string;
    startTime: Date;
    durationMinutes?: number;
    title?: string;
    description?: string;
  }
): Promise<{
  eventId: string;
  meetLink: string | null;
  htmlLink: string | null;
} | null> {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;

  const {
    contactEmail,
    contactName,
    startTime,
    durationMinutes = 30,
    title,
    description,
  } = params;

  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + durationMinutes);

  const event = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    requestBody: {
      summary: title || `Meeting with ${contactName}`,
      description: description || `Scheduled via Elevay`,
      start: { dateTime: startTime.toISOString() },
      end: { dateTime: endTime.toISOString() },
      attendees: [{ email: contactEmail, displayName: contactName }],
      conferenceData: {
        createRequest: {
          requestId: `elevay-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const meetLink = event.data.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video"
  )?.uri || event.data.hangoutLink || null;

  return {
    eventId: event.data.id || "",
    meetLink,
    htmlLink: event.data.htmlLink || null,
  };
}
