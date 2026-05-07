import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { SyncedMeeting } from "./calendar";

async function getMicrosoftTokens(userId: string) {
  const [account] = await db
    .select()
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.provider, "microsoft-entra-id")
      )
    )
    .limit(1);

  if (!account?.access_token) return null;
  return account;
}

async function refreshMicrosoftToken(userId: string, refreshToken: string): Promise<string | null> {
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "openid email profile offline_access Calendars.Read",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.access_token) return null;

  await db
    .update(authAccounts)
    .set({
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_at: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : null,
    })
    .where(
      and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.provider, "microsoft-entra-id")
      )
    );

  return data.access_token;
}

async function graphFetch(url: string, accessToken: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

export async function fetchMicrosoftMeetings(
  userId: string,
  daysBack: number = 30,
  daysForward: number = 14
): Promise<SyncedMeeting[]> {
  const account = await getMicrosoftTokens(userId);
  if (!account) throw new Error("Microsoft Calendar not connected");

  let accessToken = account.access_token!;

  // Check if token is expired
  if (account.expires_at && account.expires_at * 1000 < Date.now() + 60000) {
    if (!account.refresh_token) throw new Error("Microsoft token expired, no refresh token");
    const newToken = await refreshMicrosoftToken(userId, account.refresh_token);
    if (!newToken) throw new Error("Failed to refresh Microsoft token");
    accessToken = newToken;
  }

  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - daysBack);

  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + daysForward);

  const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${timeMin.toISOString()}&endDateTime=${timeMax.toISOString()}&$top=250&$select=id,subject,bodyPreview,start,end,attendees,location,webLink,onlineMeeting,isCancelled,isOnlineMeeting,onlineMeetingUrl`;

  let res = await graphFetch(url, accessToken);

  // Auto-refresh on 401
  if (res.status === 401 && account.refresh_token) {
    const newToken = await refreshMicrosoftToken(userId, account.refresh_token);
    if (newToken) {
      accessToken = newToken;
      res = await graphFetch(url, accessToken);
    }
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Microsoft Graph error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const events = data.value || [];
  const meetings: SyncedMeeting[] = [];

  for (const event of events) {
    if (!event.id || !event.start?.dateTime) continue;

    const isAllDay = !!event.isAllDay;

    // Extract meeting link
    let meetingLink: string | null = null;
    if (event.onlineMeetingUrl) {
      meetingLink = event.onlineMeetingUrl;
    } else if (event.onlineMeeting?.joinUrl) {
      meetingLink = event.onlineMeeting.joinUrl;
    }

    const status = event.isCancelled ? "cancelled" : "confirmed";

    // For all-day events, Microsoft returns dateTime without timezone offset
    const startTime = new Date(event.start.dateTime + "Z");
    const endTime = event.end?.dateTime ? new Date(event.end.dateTime + "Z") : startTime;

    meetings.push({
      calendarEventId: event.id,
      title: event.subject || "Untitled meeting",
      description: event.bodyPreview || null,
      startTime,
      endTime,
      attendees: (event.attendees || []).map((a: any) => ({
        email: a.emailAddress?.address || "",
        displayName: a.emailAddress?.name || null,
        responseStatus: a.status?.response || "none",
      })),
      location: event.location?.displayName || null,
      meetingLink,
      status,
      isAllDay,
      organizer: event.organizer?.emailAddress
        ? { email: event.organizer.emailAddress.address || "", displayName: event.organizer.emailAddress.name || null }
        : null,
      recurrence: event.recurrence ? [JSON.stringify(event.recurrence)] : null,
    });
  }

  return meetings;
}
