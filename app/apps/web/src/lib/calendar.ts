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

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await db
        .update(authAccounts)
        .set({ access_token: tokens.access_token })
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
}

export async function fetchRecentMeetings(
  userId: string,
  daysBack: number = 30,
  daysForward: number = 7
): Promise<SyncedMeeting[]> {
  const calendar = await getCalendarClient(userId);
  if (!calendar) throw new Error("Google Calendar not connected");

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

    // Skip all-day events (no dateTime)
    if (!event.start.dateTime) continue;

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

    meetings.push({
      calendarEventId: event.id,
      title: event.summary || "Untitled meeting",
      description: event.description || null,
      startTime: new Date(event.start.dateTime),
      endTime: event.end?.dateTime ? new Date(event.end.dateTime) : new Date(event.start.dateTime),
      attendees: (event.attendees || []).map((a) => ({
        email: a.email || "",
        displayName: a.displayName || null,
        responseStatus: a.responseStatus || "needsAction",
      })),
      location: event.location || null,
      meetingLink,
      status: event.status || "confirmed",
    });
  }

  return meetings;
}
