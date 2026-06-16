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
import { createZoomMeeting, zoomConfigured } from "./zoom";

export type CalendarProvider = "google" | "microsoft" | "caldav" | "smtp";
/** "sovereign" = Jitsi visio (default); the rest are opt-in "si besoin". */
export type Conferencing = "sovereign" | "google_meet" | "teams" | "zoom";

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

/**
 * Resolve the effective conferencing for the connected calendar:
 *  - "teams" only on Microsoft, "google_meet" only on Google (native to that
 *    calendar); requesting the wrong one falls back to the sovereign visio.
 *  - "zoom" needs Zoom S2S OAuth configured; otherwise falls back to sovereign.
 *  - "sovereign" (Jitsi) works on any calendar.
 */
export function resolveConferencing(
  requested: Conferencing,
  provider: CalendarProvider,
  zoomOk: boolean,
): Conferencing {
  if (requested === "teams") return provider === "microsoft" ? "teams" : "sovereign";
  if (requested === "google_meet") return provider === "google" ? "google_meet" : "sovereign";
  if (requested === "zoom") return zoomOk ? "zoom" : "sovereign";
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
  /** "sovereign" (default) = Jitsi; or "google_meet" / "teams" / "zoom". */
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

  // 1. The user's explicitly-connected IMAP/SMTP mailbox (Zimbra / Infomaniak /
  //    OVH …). Preferred over OAuth — if they connected it, it's their primary.
  //    CalDAV when the server exposes a calendar collection; otherwise a plain
  //    iTIP (.ics) invitation over their own SMTP, which works for ANY mailbox
  //    with no calendar API and no OAuth re-consent.
  const mailbox = await findSmtpMailbox(opts.userId, opts.tenantId);
  if (mailbox) {
    const provider: CalendarProvider = mailbox.calendarUrl ? "caldav" : "smtp";
    const mode = resolveConferencing(requested, provider, zoomConfigured());
    const link = await injectedLink(mode, meeting.joinUrl, core);
    const w = mailbox.calendarUrl
      ? await writeCalDavEvent(mailbox, core, link, meeting.roomName)
      : await writeSmtpIcsEvent(mailbox, core, link, meeting.roomName);
    return { ...w, conferencing: mode, roomName: mode === "sovereign" ? meeting.roomName : null };
  }

  // 2. Microsoft OAuth (native Teams available).
  const msToken = await getMicrosoftAccessToken(opts.userId);
  if (msToken) {
    const mode = resolveConferencing(requested, "microsoft", zoomConfigured());
    const link = await injectedLink(mode, meeting.joinUrl, core);
    const w = await writeMicrosoftEvent(
      msToken,
      core,
      mode === "teams" ? { native: true } : { native: false, link },
    );
    return { ...w, conferencing: mode, roomName: mode === "sovereign" ? meeting.roomName : null };
  }

  // 3. Google OAuth (native Google Meet available).
  const google = await getCalendarClient(opts.userId);
  if (google) {
    const mode = resolveConferencing(requested, "google", zoomConfigured());
    const link = await injectedLink(mode, meeting.joinUrl, core);
    const w = await writeGoogleEvent(
      google,
      core,
      mode === "google_meet" ? { native: true } : { native: false, link },
    );
    return { ...w, conferencing: mode, roomName: mode === "sovereign" ? meeting.roomName : null };
  }

  throw new CalendarNotConnectedError();
}

/** Non-native modes carry a link in the event: the sovereign Jitsi room, or a
 *  Zoom meeting (native Meet/Teams ignore this). */
async function injectedLink(
  mode: Conferencing,
  jitsiUrl: string,
  core: EventCore,
): Promise<string> {
  return mode === "zoom"
    ? createZoomMeeting({
        topic: core.title,
        startTime: core.startTime,
        durationMinutes: core.durationMinutes,
      })
    : jitsiUrl;
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

interface SmtpBox {
  email: string;
  password: string;
  /** CalDAV collection URL when the server exposes one; null = SMTP iTIP only. */
  calendarUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  displayName: string | null;
}

/**
 * Find the user's connected IMAP/SMTP mailbox (Zimbra / Infomaniak / OVH …).
 * Requires SMTP (to send the invite); CalDAV is optional. Personal (per-user),
 * falling back to any in the tenant for legacy rows whose userId wasn't set.
 */
async function findSmtpMailbox(
  userId: string,
  tenantId: string,
): Promise<SmtpBox | null> {
  const boxes = await db
    .select()
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, tenantId),
        eq(connectedMailboxes.provider, "smtp_custom"),
        isNotNull(connectedMailboxes.smtpHost),
      ),
    );
  if (boxes.length === 0) return null;

  const box = boxes.find((b) => b.userId === userId) ?? boxes[0];
  if (!box.secretEncrypted || !box.smtpHost) return null;

  let password: string;
  try {
    password = decryptSecret(box.secretEncrypted);
  } catch {
    return null;
  }
  return {
    email: box.emailAddress,
    password,
    calendarUrl: box.caldavUrl ?? null,
    smtpHost: box.smtpHost,
    smtpPort: box.smtpPort,
    displayName: box.displayName,
  };
}

async function writeCalDavEvent(
  box: SmtpBox,
  core: EventCore,
  link: string,
  roomName: string,
): Promise<WriteResult> {
  const calendarUrl = box.calendarUrl;
  if (!calendarUrl) throw new Error("writeCalDavEvent: no CalDAV URL");
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

  const origin = new URL(calendarUrl).origin + "/";
  const client = await createDAVClient({
    serverUrl: origin,
    credentials: { username: box.email, password: box.password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
  await client.createCalendarObject({
    calendar: { url: calendarUrl } as never,
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

/* ------------------------------------------------------------------ */
/*  SMTP iTIP invite — any IMAP/SMTP mailbox (Zimbra…), no CalDAV       */
/* ------------------------------------------------------------------ */

async function writeSmtpIcsEvent(
  box: SmtpBox,
  core: EventCore,
  link: string,
  roomName: string,
): Promise<WriteResult> {
  if (!box.smtpHost) throw new Error("writeSmtpIcsEvent: no SMTP host");
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

  // The invitation IS the booking here — there's no calendar API. Send the iTIP
  // REQUEST from the user's own mailbox to the prospect, Cc the organiser so it
  // also files onto their calendar. A send failure means the booking failed
  // (so we throw, unlike the CalDAV path where the event is already written).
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
      cc: box.email,
      subject: core.title,
      html: htmlBody(core.title, link),
      icsInvite: { method: "REQUEST", content: ics, filename: "invite.ics" },
    },
  );

  return { provider: "smtp", eventId: uid, joinUrl: link, calendarLink: null };
}
