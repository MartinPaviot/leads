/**
 * Calendar write — books a meeting on whichever calendar the user connected
 * (CalDAV, Microsoft, or Google).
 *
 * Two conferencing modes:
 *  - "sovereign" (DEFAULT): inject an open-source Jitsi visio link (see
 *    video-meeting.ts) into the event's standard fields. The prospect's call
 *    runs on our own EU/CH host — coherent with Elevay's sovereign + open-source
 *    positioning, and recordable by self-hosted Jibri.
 *  - "native" (opt-in, "si besoin"): create the calendar's own conference —
 *    Google Meet for Google, Microsoft Teams for Microsoft — for the prospect
 *    who insists on Teams/Meet. Not available on CalDAV (no native
 *    conferencing) → falls back to sovereign there.
 *
 * Resolution order: CalDAV -> Microsoft -> Google. In practice a user has one.
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
export type Conferencing = "sovereign" | "native";

export class CalendarNotConnectedError extends Error {
  constructor() {
    super("No calendar connected");
    this.name = "CalendarNotConnectedError";
  }
}

export interface BookResult {
  provider: CalendarProvider;
  /** What was actually used (native falls back to sovereign on CalDAV). */
  conferencing: Conferencing;
  eventId: string;
  joinUrl: string;
  calendarLink: string | null;
  /** The Jitsi room name for sovereign visios (so the recording webhook can
   *  correlate); null for native Teams/Meet meetings (recorded via Recall). */
  roomName: string | null;
}

type WriteResult = Omit<BookResult, "roomName" | "conferencing">;

interface EventCore {
  contactEmail: string;
  contactName: string;
  startTime: Date;
  durationMinutes: number;
  title: string;
}

/** Native conferencing (Teams/Meet) only exists on Google/Microsoft. */
export function resolveConferencing(
  requested: Conferencing,
  provider: CalendarProvider,
): Conferencing {
  if (requested === "native" && (provider === "google" || provider === "microsoft")) {
    return "native";
  }
  return "sovereign";
}

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
  /** "sovereign" (default) = Jitsi; "native" = Google Meet / Teams. */
  conferencing?: Conferencing;
}): Promise<BookResult> {
  const requested = opts.conferencing ?? "sovereign";
  const meeting = createSovereignMeeting({ prefix: opts.roomPrefix ?? "elevay" });
  const core: EventCore = {
    contactEmail: opts.contactEmail,
    contactName: opts.contactName,
    startTime: opts.startTime,
    durationMinutes: opts.durationMinutes,
    title: opts.title,
  };

  // CalDAV: no native conferencing → always sovereign Jitsi.
  const caldav = await findCalDavMailbox(opts.userId, opts.tenantId);
  if (caldav) {
    const w = await writeCalDavEvent(caldav, core, meeting.joinUrl, meeting.roomName);
    return { ...w, conferencing: "sovereign", roomName: meeting.roomName };
  }

  const msToken = await getMicrosoftAccessToken(opts.userId);
  if (msToken) {
    const conf = resolveConferencing(requested, "microsoft");
    const w = await writeMicrosoftEvent(
      msToken,
      core,
      conf === "native" ? { native: true } : { native: false, link: meeting.joinUrl },
    );
    return { ...w, conferencing: conf, roomName: conf === "sovereign" ? meeting.roomName : null };
  }

  const google = await getCalendarClient(opts.userId);
  if (google) {
    const conf = resolveConferencing(requested, "google");
    const w = await writeGoogleEvent(
      google,
      core,
      conf === "native" ? { native: true } : { native: false, link: meeting.joinUrl },
    );
    return { ...w, conferencing: conf, roomName: conf === "sovereign" ? meeting.roomName : null };
  }

  throw new CalendarNotConnectedError();
}

/** Sovereign: inject the provided Jitsi link. Native: let the provider mint its own. */
type WriteOpts = { native: true } | { native: false; link: string };

/* ------------------------------------------------------------------ */
/*  Google (sovereign Jitsi link, or native Google Meet)              */
/* ------------------------------------------------------------------ */

async function writeGoogleEvent(
  calendar: calendar_v3.Calendar,
  core: EventCore,
  wopts: WriteOpts,
): Promise<WriteResult> {
  const end = new Date(core.startTime.getTime() + core.durationMinutes * 60_000);
  const start = { dateTime: core.startTime.toISOString() };
  const endTime = { dateTime: end.toISOString() };
  const attendees = [{ email: core.contactEmail, displayName: core.contactName }];

  if (wopts.native) {
    const event = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      conferenceDataVersion: 1,
      requestBody: {
        summary: core.title,
        start,
        end: endTime,
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `elevay-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    const meetLink =
      event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ||
      event.data.hangoutLink ||
      "";
    return {
      provider: "google",
      eventId: event.data.id || "",
      joinUrl: meetLink,
      calendarLink: event.data.htmlLink || null,
    };
  }

  const event = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    requestBody: {
      summary: core.title,
      description: descriptionText(wopts.link),
      location: wopts.link,
      start,
      end: endTime,
      attendees,
    },
  });
  return {
    provider: "google",
    eventId: event.data.id || "",
    joinUrl: wopts.link,
    calendarLink: event.data.htmlLink || null,
  };
}

/* ------------------------------------------------------------------ */
/*  Microsoft Graph (sovereign Jitsi link, or native Teams)           */
/* ------------------------------------------------------------------ */

async function writeMicrosoftEvent(
  token: string,
  core: EventCore,
  wopts: WriteOpts,
): Promise<WriteResult> {
  const end = new Date(core.startTime.getTime() + core.durationMinutes * 60_000);
  const base: Record<string, unknown> = {
    subject: core.title,
    // Naive UTC datetime + explicit timeZone is Graph's expected shape.
    start: { dateTime: core.startTime.toISOString().replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: end.toISOString().replace("Z", ""), timeZone: "UTC" },
    attendees: [
      { emailAddress: { address: core.contactEmail, name: core.contactName }, type: "required" },
    ],
  };

  const requestBody = wopts.native
    ? {
        ...base,
        body: { contentType: "HTML", content: `<p>${escapeHtml(core.title)}</p>` },
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      }
    : {
        ...base,
        body: { contentType: "HTML", content: htmlBody(core.title, wopts.link) },
        location: { displayName: wopts.link },
      };

  const res = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Microsoft Graph event create failed ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as {
    id?: string;
    webLink?: string;
    onlineMeeting?: { joinUrl?: string } | null;
  };
  const joinUrl = wopts.native ? data.onlineMeeting?.joinUrl || "" : wopts.link;
  return {
    provider: "microsoft",
    eventId: data.id || "",
    joinUrl,
    calendarLink: data.webLink || null,
  };
}

/* ------------------------------------------------------------------ */
/*  CalDAV (Infomaniak / Zimbra / any RFC 4791 server) — sovereign     */
/* ------------------------------------------------------------------ */

interface CalDavBox {
  email: string;
  password: string;
  calendarUrl: string;
  smtpHost: string | null;
  smtpPort: number | null;
  displayName: string | null;
}

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
  link: string,
  roomName: string,
): Promise<WriteResult> {
  const end = new Date(core.startTime.getTime() + core.durationMinutes * 60_000);
  const uid = `${roomName}@elevay.dev`;
  const ics = buildIcs({
    uid,
    start: core.startTime,
    end,
    summary: core.title,
    description: descriptionText(link),
    location: link,
    url: link,
    organizer: { email: box.email, name: box.displayName },
    attendees: [{ email: core.contactEmail, name: core.contactName }],
    method: "REQUEST",
  });

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

  // CalDAV does not notify the attendee — send the invitation ourselves.
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
          html: htmlBody(core.title, link),
          icsInvite: { method: "REQUEST", content: ics, filename: "invite.ics" },
        },
      );
    } catch {
      /* booking stands; invite email is best-effort */
    }
  }

  return { provider: "caldav", eventId: uid, joinUrl: link, calendarLink: null };
}
