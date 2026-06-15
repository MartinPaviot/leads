/**
 * Sovereign calendar write — books a meeting on whichever calendar the user
 * connected (CalDAV, Microsoft, or Google) and injects an open-source visio
 * link (Jitsi, see video-meeting.ts) into the event's standard fields
 * (location + description + URL). We never create a Google Meet / Teams room:
 * those proprietary US conferencing widgets would contradict Elevay's
 * sovereign + open-source positioning. The prospect still gets a first-class
 * calendar invite with a one-click join link, exactly like a native meeting.
 *
 * Resolution order favours the most sovereign backend first (CalDAV), then the
 * user's OAuth calendar. In practice a user has exactly one connected, so the
 * order only matters when several coexist.
 */

import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { createDAVClient } from "tsdav";
import type { calendar_v3 } from "googleapis";
import { getCalendarClient } from "./calendar";
import { getMicrosoftAccessToken } from "./calendar-microsoft";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { buildIcs } from "./ics";
import { sendViaSmtp } from "./smtp-send";
import { createSovereignMeeting } from "./video-meeting";

export type CalendarProvider = "google" | "microsoft" | "caldav";

export class CalendarNotConnectedError extends Error {
  constructor() {
    super("No calendar connected");
    this.name = "CalendarNotConnectedError";
  }
}

export interface BookResult {
  provider: CalendarProvider;
  eventId: string;
  joinUrl: string;
  calendarLink: string | null;
}

interface EventCore {
  contactEmail: string;
  contactName: string;
  startTime: Date;
  durationMinutes: number;
  title: string;
  joinUrl: string;
}

/** Human-readable description + HTML body, carrying the sovereign join link. */
function descriptionText(joinUrl: string): string {
  return `Rejoindre la visio : ${joinUrl}`;
}
function htmlBody(title: string, joinUrl: string): string {
  return `<p>${escapeHtml(title)}</p><p><a href="${joinUrl}">Rejoindre la visio</a><br>${joinUrl}</p>`;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                        */
/* ------------------------------------------------------------------ */

export async function bookSovereignMeeting(opts: {
  userId: string;
  tenantId: string;
  contactEmail: string;
  contactName: string;
  startTime: Date;
  durationMinutes: number;
  title: string;
  /** Room-name prefix (e.g. tenant slug "pilae"). */
  roomPrefix?: string;
}): Promise<BookResult> {
  const meeting = createSovereignMeeting({ prefix: opts.roomPrefix ?? "elevay" });
  const core: EventCore = {
    contactEmail: opts.contactEmail,
    contactName: opts.contactName,
    startTime: opts.startTime,
    durationMinutes: opts.durationMinutes,
    title: opts.title,
    joinUrl: meeting.joinUrl,
  };

  const caldav = await findCalDavMailbox(opts.userId, opts.tenantId);
  if (caldav) return writeCalDavEvent(caldav, core, meeting.roomName);

  const msToken = await getMicrosoftAccessToken(opts.userId);
  if (msToken) return writeMicrosoftEvent(msToken, core);

  const google = await getCalendarClient(opts.userId);
  if (google) return writeGoogleEvent(google, core);

  throw new CalendarNotConnectedError();
}

/* ------------------------------------------------------------------ */
/*  Google                                                             */
/* ------------------------------------------------------------------ */

async function writeGoogleEvent(
  calendar: calendar_v3.Calendar,
  core: EventCore,
): Promise<BookResult> {
  const end = new Date(core.startTime.getTime() + core.durationMinutes * 60_000);
  const event = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all", // Google emails the invite to the attendee
    requestBody: {
      summary: core.title,
      description: descriptionText(core.joinUrl),
      location: core.joinUrl,
      start: { dateTime: core.startTime.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: [{ email: core.contactEmail, displayName: core.contactName }],
    },
  });
  return {
    provider: "google",
    eventId: event.data.id || "",
    joinUrl: core.joinUrl,
    calendarLink: event.data.htmlLink || null,
  };
}

/* ------------------------------------------------------------------ */
/*  Microsoft Graph                                                    */
/* ------------------------------------------------------------------ */

async function writeMicrosoftEvent(token: string, core: EventCore): Promise<BookResult> {
  const end = new Date(core.startTime.getTime() + core.durationMinutes * 60_000);
  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: core.title,
      body: { contentType: "HTML", content: htmlBody(core.title, core.joinUrl) },
      // Naive UTC datetime + explicit timeZone is Graph's expected shape.
      start: { dateTime: core.startTime.toISOString().replace("Z", ""), timeZone: "UTC" },
      end: { dateTime: end.toISOString().replace("Z", ""), timeZone: "UTC" },
      location: { displayName: core.joinUrl },
      attendees: [
        {
          emailAddress: { address: core.contactEmail, name: core.contactName },
          type: "required",
        },
      ],
      // Deliberately NOT isOnlineMeeting: that would mint a Teams meeting.
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph event create failed ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { id?: string; webLink?: string };
  return {
    provider: "microsoft",
    eventId: data.id || "",
    joinUrl: core.joinUrl,
    calendarLink: data.webLink || null,
  };
}

/* ------------------------------------------------------------------ */
/*  CalDAV (Infomaniak / Zimbra / any RFC 4791 server)                 */
/* ------------------------------------------------------------------ */

interface CalDavBox {
  email: string;
  password: string;
  calendarUrl: string;
  smtpHost: string | null;
  smtpPort: number | null;
  displayName: string | null;
}

/**
 * Find a CalDAV-capable custom mailbox for the user. Mailboxes are personal
 * (per-user); we prefer the caller's own, falling back to any in the tenant
 * for legacy rows whose userId wasn't backfilled.
 */
async function findCalDavMailbox(
  userId: string,
  tenantId: string,
): Promise<CalDavBox | null> {
  const boxes = await db
    .select()
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, tenantId),
        eq(connectedMailboxes.provider, "smtp_custom"),
        isNotNull(connectedMailboxes.caldavUrl),
      ),
    );
  if (boxes.length === 0) return null;

  const box = boxes.find((b) => b.userId === userId) ?? boxes[0];
  if (!box.secretEncrypted || !box.caldavUrl) return null;

  let password: string;
  try {
    password = decryptSecret(box.secretEncrypted);
  } catch {
    return null;
  }
  return {
    email: box.emailAddress,
    password,
    calendarUrl: box.caldavUrl,
    smtpHost: box.smtpHost,
    smtpPort: box.smtpPort,
    displayName: box.displayName,
  };
}

async function writeCalDavEvent(
  box: CalDavBox,
  core: EventCore,
  roomName: string,
): Promise<BookResult> {
  const end = new Date(core.startTime.getTime() + core.durationMinutes * 60_000);
  const uid = `${roomName}@elevay.dev`;
  const ics = buildIcs({
    uid,
    start: core.startTime,
    end,
    summary: core.title,
    description: descriptionText(core.joinUrl),
    location: core.joinUrl,
    url: core.joinUrl,
    organizer: { email: box.email, name: box.displayName },
    attendees: [{ email: core.contactEmail, name: core.contactName }],
    method: "REQUEST",
  });

  // PUT the event into the user's CalDAV collection.
  const origin = new URL(box.calendarUrl).origin + "/";
  const client = await createDAVClient({
    serverUrl: origin,
    credentials: { username: box.email, password: box.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  await client.createCalendarObject({
    calendar: { url: box.calendarUrl } as never,
    filename: `${uid}.ics`,
    iCalString: ics,
  });

  // CalDAV does not notify the attendee — send the invitation ourselves from
  // the user's own mailbox (sovereign path). A failed email must not undo the
  // booking: the event is already on the calendar.
  if (box.smtpHost) {
    try {
      await sendViaSmtp(
        {
          emailAddress: box.email,
          smtpHost: box.smtpHost,
          smtpPort: box.smtpPort,
          password: box.password,
          displayName: box.displayName,
        },
        {
          to: core.contactEmail,
          subject: core.title,
          html: htmlBody(core.title, core.joinUrl),
          icsInvite: { method: "REQUEST", content: ics, filename: "invite.ics" },
        },
      );
    } catch {
      /* booking stands; invite email is best-effort */
    }
  }

  return { provider: "caldav", eventId: uid, joinUrl: core.joinUrl, calendarLink: null };
}
