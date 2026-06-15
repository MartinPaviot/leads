/**
 * Microsoft Graph API integration for Outlook email + calendar sync.
 * G28: Pre-built Microsoft OAuth integration.
 *
 * Works when MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are set.
 * Uses the same SyncedEmail/SyncedMeeting types as gmail.ts for compatibility.
 */

import { db } from "@/db";
import { authAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  decryptOAuthToken,
  encryptOAuthToken,
} from "@/lib/crypto/oauth-token-crypto";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface SyncedEmail {
  gmailMessageId: string; // reused field name for compatibility — stores MS message ID
  threadId: string;
  subject: string;
  from: string;
  to: string[];
  snippet: string;
  date: Date;
  direction: "inbound" | "outbound";
}

export interface SyncedMeeting {
  calendarEventId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  attendees: Array<{ email: string; displayName: string | null; responseStatus: string }>;
  location: string | null;
  meetingLink: string | null;
}

/** Get a valid access token for the user, refreshing if needed */
async function getAccessToken(userId: string): Promise<string | null> {
  const [account] = await db
    .select()
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.provider, "microsoft-entra-id")))
    .limit(1);

  if (!account?.access_token) return null;

  // Check if token needs refresh
  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  if (Date.now() < expiresAt - 60000) {
    return decryptOAuthToken(account.access_token);
  }

  // Refresh token
  const refreshToken = decryptOAuthToken(account.refresh_token);
  if (!refreshToken || !process.env.MICROSOFT_CLIENT_ID) return null;

  try {
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        // Mirror auth.ts: Calendars.ReadWrite so a refreshed token can also
        // create events (sovereign visio booking), not just read.
        scope: "openid email profile offline_access Mail.Read Calendars.ReadWrite",
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();

    // Update stored tokens (encrypted at rest)
    await db.update(authAccounts).set({
      access_token: encryptOAuthToken(data.access_token),
      refresh_token: encryptOAuthToken(data.refresh_token) || account.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    }).where(and(eq(authAccounts.userId, userId), eq(authAccounts.provider, "microsoft-entra-id")));

    return data.access_token;
  } catch {
    return null;
  }
}

/** Fetch recent emails from Outlook via Microsoft Graph API */
export async function fetchOutlookEmails(
  userId: string,
  userEmail: string,
  daysBack: number = 30
): Promise<SyncedEmail[]> {
  const token = await getAccessToken(userId);
  if (!token) return [];

  const since = new Date(Date.now() - daysBack * 86400000).toISOString();

  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/messages?$filter=receivedDateTime ge ${since}&$top=100&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,bodyPreview,receivedDateTime`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const messages = data.value || [];

    return messages.map((msg: any) => {
      const fromEmail = msg.from?.emailAddress?.address || "";
      const fromName = msg.from?.emailAddress?.name || "";
      const toEmails = (msg.toRecipients || []).map((r: any) =>
        r.emailAddress?.name ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress?.address || ""
      );
      const isInbound = fromEmail.toLowerCase() !== userEmail.toLowerCase();

      return {
        gmailMessageId: msg.id, // MS message ID stored in this field
        threadId: msg.conversationId || msg.id,
        subject: msg.subject || "(No subject)",
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to: toEmails,
        snippet: msg.bodyPreview || "",
        date: new Date(msg.receivedDateTime),
        direction: isInbound ? "inbound" as const : "outbound" as const,
      };
    });
  } catch (err) {
    console.error("Outlook email fetch failed:", err);
    return [];
  }
}

/** Fetch recent calendar events from Outlook via Microsoft Graph API */
export async function fetchOutlookMeetings(
  userId: string,
  daysBack: number = 30,
  daysForward: number = 14
): Promise<SyncedMeeting[]> {
  const token = await getAccessToken(userId);
  if (!token) return [];

  const startDate = new Date(Date.now() - daysBack * 86400000).toISOString();
  const endDate = new Date(Date.now() + daysForward * 86400000).toISOString();

  try {
    const res = await fetch(
      `${GRAPH_BASE}/me/calendarview?startdatetime=${startDate}&enddatetime=${endDate}&$top=100&$select=id,subject,body,start,end,attendees,location,onlineMeeting`,
      { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const events = data.value || [];

    return events.map((event: any) => ({
      calendarEventId: event.id,
      title: event.subject || "(No title)",
      description: event.body?.content?.replace(/<[^>]*>/g, "").slice(0, 2000) || null,
      startTime: new Date(event.start?.dateTime || Date.now()),
      endTime: new Date(event.end?.dateTime || Date.now()),
      attendees: (event.attendees || []).map((a: any) => ({
        email: a.emailAddress?.address || "",
        displayName: a.emailAddress?.name || null,
        responseStatus: a.status?.response || "none",
      })),
      location: event.location?.displayName || null,
      meetingLink: event.onlineMeeting?.joinUrl || null,
    }));
  } catch (err) {
    console.error("Outlook calendar fetch failed:", err);
    return [];
  }
}
