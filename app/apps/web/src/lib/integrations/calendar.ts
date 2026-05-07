import { google } from "googleapis";
import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function getCalendarClient(userId: string) {
  const [account] = await db
    .select()
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.provider, "google")
      )
    )
    .limit(1);

  if (!account?.access_token) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  // Handle token refresh — persist new access_token and expiry to DB
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      const updates: Record<string, unknown> = { access_token: tokens.access_token };
      if (tokens.expiry_date) {
        updates.expires_at = Math.floor(tokens.expiry_date / 1000);
      }
      await db
        .update(authAccounts)
        .set(updates)
        .where(
          and(
            eq(authAccounts.userId, userId),
            eq(authAccounts.provider, "google")
          )
        );
    }
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export interface SyncedMeeting {
  calendarEventId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  attendees: Array<{
    email: string;
    displayName: string | null;
    responseStatus: string;
  }>;
  location: string | null;
  meetingLink: string | null;
  status: string; // confirmed, tentative, cancelled
  isAllDay: boolean;
  organizer: { email: string; displayName: string | null } | null;
  recurrence: string[] | null; // RRULE strings if recurring
}

export async function fetchRecentMeetings(
  userId: string,
  daysBack: number = 30,
  daysForward: number = 7
): Promise<SyncedMeeting[]> {
  const calendar = await getCalendarClient(userId);
  // M3 — Users with only a Microsoft Entra ID OAuth connection don't
  // have a `google` account row, so the calendar client is null. Until
  // the Graph API integration lands, silently return an empty list
  // instead of throwing "Google Calendar not connected" — the UI then
  // falls back to the activities table and the meetings list still
  // renders.
  if (!calendar) return [];

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - daysBack);

  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + daysForward);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const events = res.data.items || [];
  const meetings: SyncedMeeting[] = [];

  for (const event of events) {
    if (!event.id || !event.start) continue;

    const isAllDay = !event.start.dateTime;

    // Extract meeting link from conferenceData or description
    let meetingLink: string | null = null;
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find(
        (ep) => ep.entryPointType === "video"
      );
      meetingLink = videoEntry?.uri || null;
    }
    if (!meetingLink && event.hangoutLink) {
      meetingLink = event.hangoutLink;
    }

    // For all-day events, use the date field; for timed events, use dateTime
    const startTime = event.start.dateTime
      ? new Date(event.start.dateTime)
      : new Date(event.start.date + "T00:00:00");
    const endTime = event.end?.dateTime
      ? new Date(event.end.dateTime)
      : event.end?.date
        ? new Date(event.end.date + "T23:59:59")
        : startTime;

    meetings.push({
      calendarEventId: event.id,
      title: event.summary || "Untitled meeting",
      description: event.description || null,
      startTime,
      endTime,
      attendees: (event.attendees || []).map((a) => ({
        email: a.email || "",
        displayName: a.displayName || null,
        responseStatus: a.responseStatus || "needsAction",
      })),
      location: event.location || null,
      meetingLink,
      status: event.status || "confirmed",
      isAllDay,
      organizer: event.organizer
        ? { email: event.organizer.email || "", displayName: event.organizer.displayName || null }
        : null,
      recurrence: event.recurrence || null,
    });
  }

  return meetings;
}
