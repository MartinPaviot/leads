/**
 * CalDAV calendar capture for "smtp_custom" mailboxes (Infomaniak, OVH, Gandi,
 * Zimbra, Fastmail, any RFC 4791 server) — the calendar counterpart to
 * `imap.ts`. IMAP/SMTP carries no calendar, so without this a custom mailbox
 * has email sync + sending but no meetings; OAuth (Google/Microsoft) was the
 * only calendar path.
 *
 * Continuity: this returns the SAME `SyncedMeeting` shape as `calendar.ts`
 * (`fetchRecentMeetings`) and `calendar-microsoft.ts`, so the existing
 * consumers — the 15-min `cron-calendar-sync`, `/api/calendar/sync`, the
 * Meetings page and capacity checks — ingest it unchanged. The only difference
 * is the transport: a short-lived CalDAV connection (works inside a Vercel Node
 * function) authenticated with the SAME mailbox password the IMAP path already
 * stores encrypted.
 *
 * Discovery follows RFC 6764 (.well-known/caldav) via tsdav; recurrence is
 * expanded client-side with ical.js (server time-range filters return the
 * recurring master, not the individual occurrences in the window).
 */

import { createDAVClient } from "tsdav";
import ICAL from "ical.js";
import type { SyncedMeeting } from "./calendar";

export interface CalDavCredentials {
  email: string;
  password: string;
  /** Stored collection URL (preferred) — skips re-discovery on each sync. */
  calendarUrl?: string | null;
  /** Connect-time hints used only when no calendarUrl is stored yet. */
  imapHost?: string | null;
  /** A CalDAV URL the user typed by hand, tried before auto-discovery. */
  explicitUrl?: string | null;
}

/** Build a tsdav CalDAV client (Basic auth — the standard for password mailboxes). */
async function makeClient(serverUrl: string, email: string, password: string) {
  return createDAVClient({
    serverUrl,
    credentials: { username: email, password },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

/**
 * Candidate CalDAV entry points to probe, most-specific first. We never hardcode
 * a provider→URL table (those rot): we derive sensible hosts from the address
 * the user already gave us and let RFC 6764 .well-known discovery do the rest.
 */
function candidateServerUrls(email: string, imapHost?: string | null): string[] {
  const domain = (email.split("@")[1] || "").toLowerCase();
  const urls = new Set<string>();
  if (imapHost) {
    const h = imapHost.trim().toLowerCase();
    urls.add(`https://${h}/`);
    // mail.example.com / imap.example.com → try the bare domain too.
    const base = h.replace(/^(imap|mail|mx|in)\./, "");
    if (base && base !== h) urls.add(`https://${base}/`);
  }
  if (domain) {
    urls.add(`https://${domain}/`);
    urls.add(`https://caldav.${domain}/`);
    urls.add(`https://dav.${domain}/`);
  }
  return [...urls];
}

/** Pick the calendar most likely to be the user's primary one. */
function pickPrimaryCalendar(
  calendars: Array<{ url: string; displayName?: unknown; components?: string[] }>,
): string | null {
  // Only calendars that hold events (skip task/VTODO-only collections).
  const eventCals = calendars.filter(
    (c) => !c.components || c.components.length === 0 || c.components.includes("VEVENT"),
  );
  const pool = eventCals.length > 0 ? eventCals : calendars;
  if (pool.length === 0) return null;
  const named = pool.find((c) => {
    const n = String(c.displayName ?? "").toLowerCase();
    return /calendar|default|personal|home|agenda/.test(n);
  });
  return (named ?? pool[0]).url;
}

/**
 * Discover (and validate) the CalDAV calendar collection URL for a mailbox.
 * Returns the URL on success; throws a human-readable error if nothing usable
 * is reachable. Tries an explicit URL first, then derived candidates.
 */
export async function discoverCalDavUrl(
  creds: Pick<CalDavCredentials, "email" | "password" | "imapHost" | "explicitUrl">,
): Promise<string> {
  const { email, password, imapHost, explicitUrl } = creds;
  const candidates = [
    ...(explicitUrl ? [explicitUrl.trim()] : []),
    ...candidateServerUrls(email, imapHost),
  ];

  let lastErr: unknown = null;
  for (const serverUrl of candidates) {
    try {
      const client = await makeClient(serverUrl, email, password);
      const calendars = await client.fetchCalendars();
      const url = pickPrimaryCalendar(calendars as never[]);
      if (url) return url;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(humanCalDavError(lastErr));
}

/**
 * Fetch meetings in a window via CalDAV, mapped to `SyncedMeeting[]`. Recurring
 * masters are expanded to their in-window occurrences.
 */
export async function fetchCalDavMeetings(
  creds: CalDavCredentials,
  daysBack = 30,
  daysForward = 14,
): Promise<SyncedMeeting[]> {
  const calendarUrl =
    creds.calendarUrl?.trim() ||
    (await discoverCalDavUrl(creds).catch(() => null));
  if (!calendarUrl) return [];

  const windowStart = new Date(Date.now() - daysBack * 86_400_000);
  const windowEnd = new Date(Date.now() + daysForward * 86_400_000);

  // tsdav needs an account context, so create the client at the collection's
  // origin; fetchCalendarObjects then targets the stored collection URL.
  const origin = new URL(calendarUrl).origin + "/";
  const client = await makeClient(origin, creds.email, creds.password);

  const objects = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl } as never,
    timeRange: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
  });

  const meetings: SyncedMeeting[] = [];
  for (const obj of objects) {
    const data = (obj as { data?: string }).data;
    if (!data) continue;
    try {
      meetings.push(...mapIcsToMeetings(data, windowStart, windowEnd));
    } catch {
      // One malformed .ics must not sink the whole sync.
      continue;
    }
  }
  return meetings;
}

/* ------------------------------------------------------------------ */
/*  iCalendar → SyncedMeeting                                          */
/* ------------------------------------------------------------------ */

function mapPartstat(partstat: unknown): string {
  switch (String(partstat ?? "").toUpperCase()) {
    case "ACCEPTED":
      return "accepted";
    case "DECLINED":
      return "declined";
    case "TENTATIVE":
      return "tentative";
    default:
      return "needsAction";
  }
}

function addr(value: unknown): string {
  return String(value ?? "").replace(/^mailto:/i, "").trim().toLowerCase();
}

const LINK_RE = /(https?:\/\/[^\s<>"]+)/i;
function extractMeetingLink(parts: Array<string | null | undefined>): string | null {
  for (const p of parts) {
    if (!p) continue;
    const m = p.match(LINK_RE);
    if (m && /(zoom|meet\.google|teams\.microsoft|whereby|webex|gotomeet|meet\.|visio|jitsi|around\.co)/i.test(m[1])) {
      return m[1];
    }
  }
  // Fall back to any URL in the parts (a plain meeting URL still helps the rep).
  for (const p of parts) {
    if (!p) continue;
    const m = p.match(LINK_RE);
    if (m) return m[1];
  }
  return null;
}

function attendeesOf(vevent: ICAL.Component): SyncedMeeting["attendees"] {
  return vevent
    .getAllProperties("attendee")
    .map((prop) => {
      const email = addr(prop.getFirstValue());
      const cn = prop.getParameter("cn");
      return {
        email,
        displayName: cn ? String(cn) : null,
        responseStatus: mapPartstat(prop.getParameter("partstat")),
      };
    })
    .filter((a) => a.email.includes("@"));
}

function organizerOf(vevent: ICAL.Component): SyncedMeeting["organizer"] {
  const prop = vevent.getFirstProperty("organizer");
  if (!prop) return null;
  const email = addr(prop.getFirstValue());
  if (!email.includes("@")) return null;
  const cn = prop.getParameter("cn");
  return { email, displayName: cn ? String(cn) : null };
}

function staticFields(vevent: ICAL.Component) {
  const location = (vevent.getFirstPropertyValue("location") as string) || null;
  const description = (vevent.getFirstPropertyValue("description") as string) || null;
  const url = vevent.getFirstPropertyValue("url");
  const status = String(vevent.getFirstPropertyValue("status") || "confirmed").toLowerCase();
  const rawRecur = vevent.getAllProperties("rrule").map((p) => p.toICALString());
  return {
    title: (vevent.getFirstPropertyValue("summary") as string) || "Untitled meeting",
    description,
    location,
    status,
    attendees: attendeesOf(vevent),
    organizer: organizerOf(vevent),
    meetingLink: extractMeetingLink([location, description, url ? String(url) : null]),
    recurrence: rawRecur.length > 0 ? rawRecur : null,
  };
}

/**
 * Parse one iCal object into the meetings that fall in [start, end]. Handles
 * single events, recurring masters (expanded), EXDATE skips and per-occurrence
 * RECURRENCE-ID overrides.
 */
export function mapIcsToMeetings(
  icsData: string,
  windowStart: Date,
  windowEnd: Date,
): SyncedMeeting[] {
  const root = new ICAL.Component(ICAL.parse(icsData));
  const vevents = root.getAllSubcomponents("vevent");
  if (vevents.length === 0) return [];

  // Group by UID so override instances (RECURRENCE-ID) attach to their master.
  const byUid = new Map<string, { master: ICAL.Component | null; exceptions: ICAL.Component[] }>();
  for (const ve of vevents) {
    const uid = String(ve.getFirstPropertyValue("uid") || "");
    if (!uid) continue;
    const slot = byUid.get(uid) ?? { master: null, exceptions: [] };
    if (ve.getFirstProperty("recurrence-id")) slot.exceptions.push(ve);
    else slot.master = ve;
    byUid.set(uid, slot);
  }

  const out: SyncedMeeting[] = [];
  for (const [uid, { master, exceptions }] of byUid) {
    const base = master ?? exceptions[0];
    if (!base) continue;
    const fields = staticFields(base);
    const event = new ICAL.Event(base);
    for (const ex of exceptions) {
      try {
        event.relateException(ex);
      } catch {
        /* unrelated override — ignore */
      }
    }

    if (!event.isRecurring()) {
      const startJs = event.startDate.toJSDate();
      const endJs = event.endDate ? event.endDate.toJSDate() : startJs;
      if (endJs < windowStart || startJs > windowEnd) continue;
      out.push({
        calendarEventId: uid,
        startTime: startJs,
        endTime: endJs,
        isAllDay: !!event.startDate.isDate,
        ...fields,
      });
      continue;
    }

    // Expand occurrences up to the window end (guard against runaway RRULEs).
    const iter = event.iterator();
    let next: ICAL.Time | null;
    let guard = 0;
    while ((next = iter.next()) && guard++ < 1000) {
      const startJs = next.toJSDate();
      if (startJs > windowEnd) break;
      let details;
      try {
        details = event.getOccurrenceDetails(next);
      } catch {
        continue;
      }
      const occStart = details.startDate.toJSDate();
      const occEnd = details.endDate ? details.endDate.toJSDate() : occStart;
      if (occEnd < windowStart) continue;
      // Each occurrence gets a stable, unique id (master UID + instance start),
      // matching how Google's singleEvents expansion yields per-instance ids.
      const occFields = details.item ? staticFields(details.item.component) : fields;
      out.push({
        calendarEventId: `${uid}::${occStart.toISOString()}`,
        startTime: occStart,
        endTime: occEnd,
        isAllDay: !!details.startDate.isDate,
        ...occFields,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Error mapping (mirrors imap.ts#humanImapError)                     */
/* ------------------------------------------------------------------ */

export function humanCalDavError(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes("401") || msg.includes("403") || msg.includes("auth") || msg.includes("credential") || msg.includes("login")) {
    return "Calendar login failed — check the email and password (use an app-specific password if 2FA is on).";
  }
  if (msg.includes("enotfound") || msg.includes("getaddrinfo") || msg.includes("dns")) {
    return "Couldn't find a CalDAV server for this domain — enter the calendar (CalDAV) URL from your provider.";
  }
  if (msg.includes("econnrefused") || msg.includes("timeout") || msg.includes("etimedout")) {
    return "Couldn't reach the CalDAV server — check the calendar URL, or your provider may not expose CalDAV.";
  }
  if (msg.includes("certificate") || msg.includes("tls") || msg.includes("ssl")) {
    return "TLS handshake with the CalDAV server failed — confirm the calendar URL uses https.";
  }
  return "Couldn't connect a calendar for this mailbox — your provider may not support CalDAV, or enter the URL manually.";
}
