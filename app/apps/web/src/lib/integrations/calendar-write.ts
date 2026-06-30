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
import { toRRule, toGraphRecurrence, type MeetingRecurrence } from "./recurrence";
import { isValidTimeZone, toZonedNaiveIso } from "./tz";

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
  /** Extra invitees beyond the prospect (the founder, a colleague, more on the
   *  prospect side). Merged into each provider's attendee list. */
  attendees?: Array<{ email: string; name?: string }>;
  /** Free agenda / notes, prepended to the auto join-link line in the invite. */
  agenda?: string;
  /** Physical location / room. When set it fills the calendar LOCATION field
   *  (the visio link still rides in the description); otherwise LOCATION is the
   *  join link so the sovereign visio stays clickable from the calendar. */
  location?: string;
  /** Minutes before start for a reminder (Google popup / Graph / ICS VALARM).
   *  Omitted = the calendar's default (no explicit reminder set by us). */
  reminderMinutes?: number;
  /** Recurrence (structured subset, recurrence.ts). Omitted = single meeting. */
  recurrence?: MeetingRecurrence;
  /** Organizer IANA zone. Used ONLY for a RECURRING series, so occurrences hold
   *  their local wall-clock across DST instead of drifting with a UTC instant.
   *  Single events stay UTC (an instant is unambiguous). */
  organizerTimeZone?: string;
}

/**
 * The organizer zone to expand a RECURRING series in — the IANA string only when
 * the event is recurring AND the zone is valid; else null (a single event, or a
 * missing/invalid zone, keeps the UTC basis: byte-identical to before).
 */
function recurrenceZone(core: EventCore): string | null {
  return core.recurrence && isValidTimeZone(core.organizerTimeZone) ? core.organizerTimeZone! : null;
}

/** The contact + any extra invitees, deduped by lowercased email. */
function allAttendees(core: EventCore): Array<{ email: string; name?: string }> {
  const out: Array<{ email: string; name?: string }> = [{ email: core.contactEmail, name: core.contactName }];
  const seen = new Set([core.contactEmail.toLowerCase()]);
  for (const a of core.attendees ?? []) {
    const e = (a.email || "").trim();
    if (!e || seen.has(e.toLowerCase())) continue;
    seen.add(e.toLowerCase());
    out.push({ email: e, name: a.name });
  }
  return out;
}

/**
 * The extra invitees' emails — everyone in the attendee list except the
 * prospect — for the Cc envelope on the CalDAV / SMTP paths, where the calendar
 * backend does NOT email attendees itself (Google/Microsoft notify natively via
 * sendUpdates/Graph, so they don't need this). `exclude` drops addresses already
 * on the envelope (e.g. the organiser, who is Cc'd separately). Comma-joined for
 * nodemailer; "" when there's no one to add.
 */
export function extraCcEmails(core: EventCore, exclude: string[] = []): string {
  const skip = new Set([core.contactEmail.toLowerCase(), ...exclude.map((e) => e.toLowerCase())]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of allAttendees(core)) {
    const k = a.email.toLowerCase();
    if (skip.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(a.email);
  }
  return out.join(", ");
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

function descriptionText(joinUrl: string, agenda?: string): string {
  const visio = `Rejoindre la visio : ${joinUrl}`;
  return agenda?.trim() ? `${agenda.trim()}\n\n${visio}` : visio;
}
function htmlBody(title: string, joinUrl: string, agenda?: string): string {
  const agendaHtml = agenda?.trim()
    ? `<p>${escapeHtml(agenda.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  return `<p>${escapeHtml(title)}</p>${agendaHtml}<p><a href="${joinUrl}">Rejoindre la visio</a><br>${joinUrl}</p>`;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/** The calendar LOCATION value: a physical location if the user gave one, else
 *  the sovereign join link (so it stays clickable from the calendar's Location).
 *  For native Meet/Teams pass undefined as joinUrl — only a physical place lands. */
function locationText(joinUrl: string | undefined, core: EventCore): string | undefined {
  return core.location?.trim() || joinUrl || undefined;
}
/** Google reminders override (a popup N min before start); undefined leaves the
 *  calendar's default reminders in place. */
function googleReminders(core: EventCore) {
  return typeof core.reminderMinutes === "number" && core.reminderMinutes >= 0
    ? { useDefault: false, overrides: [{ method: "popup", minutes: Math.floor(core.reminderMinutes) }] }
    : undefined;
}
/** Google recurrence array (["RRULE:…"]); undefined = a single (non-recurring) event. */
function googleRecurrence(core: EventCore): string[] | undefined {
  return core.recurrence ? [`RRULE:${toRRule(core.recurrence)}`] : undefined;
}
/** Native Meet/Teams mint their own join button, so the body/description carries
 *  only the agenda (no "Rejoindre la visio" line). Undefined when there's none. */
export function nativeAgendaText(agenda?: string): string | undefined {
  return agenda?.trim() || undefined;
}
export function nativeHtmlBody(title: string, agenda?: string): string {
  const agendaHtml = agenda?.trim()
    ? `<p>${escapeHtml(agenda.trim()).replace(/\n/g, "<br>")}</p>`
    : "";
  return `<p>${escapeHtml(title)}</p>${agendaHtml}`;
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
  /** Extra invitees beyond the prospect (founder, colleagues). */
  attendees?: Array<{ email: string; name?: string }>;
  /** Free agenda / notes added to the invite body. */
  agenda?: string;
  /** Physical location / room (else the join link fills LOCATION). */
  location?: string;
  /** Minutes before start for a reminder; omitted = calendar default. */
  reminderMinutes?: number;
  /** Recurrence (structured subset); omitted = single meeting. */
  recurrence?: MeetingRecurrence;
  /** Organizer IANA zone (recurring only; singles stay UTC). */
  organizerTimeZone?: string;
}): Promise<BookResult> {
  const requested = opts.conferencing ?? "sovereign";
  const meeting = createSovereignMeeting({ prefix: opts.roomPrefix ?? "elevay" });
  const core: EventCore = {
    contactEmail: opts.contactEmail,
    contactName: opts.contactName,
    startTime: opts.startTime,
    durationMinutes: opts.durationMinutes,
    title: opts.title,
    attendees: opts.attendees,
    agenda: opts.agenda,
    location: opts.location,
    reminderMinutes: opts.reminderMinutes,
    recurrence: opts.recurrence,
    organizerTimeZone: opts.organizerTimeZone,
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
  // For a RECURRING series, express start/end as LOCAL time in the organizer's
  // zone so Google expands the RRULE on the wall-clock (no DST drift). A single
  // event (zone === null) stays UTC — an instant is unambiguous, and timeZone
  // stays "UTC" because Google REQUIRES timeZone on recurring inserts.
  const zone = recurrenceZone(core);
  const start = zone
    ? { dateTime: toZonedNaiveIso(core.startTime, zone), timeZone: zone }
    : { dateTime: core.startTime.toISOString(), timeZone: "UTC" };
  const endTime = zone
    ? { dateTime: toZonedNaiveIso(end, zone), timeZone: zone }
    : { dateTime: end.toISOString(), timeZone: "UTC" };
  const attendees = allAttendees(core).map((a) => ({ email: a.email, displayName: a.name }));

  if (wopts.native) {
    const event = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      conferenceDataVersion: 1,
      requestBody: {
        summary: core.title,
        description: nativeAgendaText(core.agenda),
        location: locationText(undefined, core),
        start,
        end: endTime,
        attendees,
        reminders: googleReminders(core),
        recurrence: googleRecurrence(core),
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
      description: descriptionText(wopts.link, core.agenda),
      location: locationText(wopts.link, core),
      start,
      end: endTime,
      attendees,
      reminders: googleReminders(core),
      recurrence: googleRecurrence(core),
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
  // ONE zone drives BOTH the dateTime zone and the patternedRecurrence weekday/
  // dayOfMonth/range — so they can never disagree with the start. Recurring →
  // local time in the organizer's zone (DST-stable); single → naive-UTC (Graph's
  // expected shape for an instant).
  const zone = recurrenceZone(core);
  const base: Record<string, unknown> = {
    subject: core.title,
    start: zone
      ? { dateTime: toZonedNaiveIso(core.startTime, zone), timeZone: zone }
      : { dateTime: core.startTime.toISOString().replace("Z", ""), timeZone: "UTC" },
    end: zone
      ? { dateTime: toZonedNaiveIso(end, zone), timeZone: zone }
      : { dateTime: end.toISOString().replace("Z", ""), timeZone: "UTC" },
    attendees: allAttendees(core).map((a) => ({
      emailAddress: { address: a.email, name: a.name },
      type: "required",
    })),
    // Reminder (Graph default applies when we don't set one) + recurrence.
    ...(typeof core.reminderMinutes === "number" && core.reminderMinutes >= 0
      ? { isReminderOn: true, reminderMinutesBeforeStart: Math.floor(core.reminderMinutes) }
      : {}),
    ...(core.recurrence ? { recurrence: toGraphRecurrence(core.recurrence, core.startTime, zone) } : {}),
  };

  const requestBody = wopts.native
    ? {
        ...base,
        body: { contentType: "HTML", content: nativeHtmlBody(core.title, core.agenda) },
        // Teams mints the join; only a physical place (if any) goes in location.
        ...(core.location?.trim() ? { location: { displayName: core.location.trim() } } : {}),
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      }
    : {
        ...base,
        body: { contentType: "HTML", content: htmlBody(core.title, wopts.link, core.agenda) },
        location: { displayName: locationText(wopts.link, core) },
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
    description: descriptionText(link, core.agenda),
    location: locationText(link, core),
    url: link,
    organizer: { email: box.email, name: box.displayName },
    attendees: allAttendees(core),
    recurrenceRule: core.recurrence ? toRRule(core.recurrence) : null,
    reminderMinutes: core.reminderMinutes ?? null,
    // Zone the .ics ONLY for a recurring series (singles stay UTC). buildIcs
    // further gates on the zone being in its verified VTIMEZONE table.
    timeZone: core.recurrence ? (core.organizerTimeZone ?? null) : null,
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

  // CalDAV does not notify the attendees — send the invitation ourselves. The
  // event is already on the organiser's own calendar, so Cc only the EXTRA
  // invitees (the prospect is on To); without this they'd be in the .ics
  // ATTENDEE list but never receive the email.
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
          cc: extraCcEmails(core, [box.email]) || undefined,
          subject: core.title,
          html: htmlBody(core.title, link, core.agenda),
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
    description: descriptionText(link, core.agenda),
    location: locationText(link, core),
    url: link,
    organizer: { email: box.email, name: box.displayName },
    attendees: allAttendees(core),
    recurrenceRule: core.recurrence ? toRRule(core.recurrence) : null,
    reminderMinutes: core.reminderMinutes ?? null,
    // Zone the .ics ONLY for a recurring series (singles stay UTC). buildIcs
    // further gates on the zone being in its verified VTIMEZONE table.
    timeZone: core.recurrence ? (core.organizerTimeZone ?? null) : null,
    method: "REQUEST",
  });

  // The invitation IS the booking here — there's no calendar API. Send the iTIP
  // REQUEST from the user's own mailbox to the prospect, Cc the organiser (so it
  // also files onto their calendar) AND any extra invitees (who'd otherwise only
  // be in the .ics ATTENDEE list, never emailed). A send failure means the
  // booking failed (so we throw, unlike CalDAV where the event is already
  // written). The body carries the agenda too — not just the .ics description.
  const cc = [box.email, extraCcEmails(core, [box.email])].filter(Boolean).join(", ");
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
      cc,
      subject: core.title,
      html: htmlBody(core.title, link, core.agenda),
      icsInvite: { method: "REQUEST", content: ics, filename: "invite.ics" },
    },
  );

  return { provider: "smtp", eventId: uid, joinUrl: link, calendarLink: null };
}
