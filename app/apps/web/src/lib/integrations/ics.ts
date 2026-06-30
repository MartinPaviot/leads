/**
 * RFC 5545 iCalendar builder. Two consumers:
 *   1. CalDAV write — the VEVENT we PUT into the user's calendar collection.
 *   2. SMTP invite  — the METHOD:REQUEST attachment we email the prospect when
 *      the calendar backend (CalDAV) won't notify them itself.
 *
 * Pure (no I/O) so it unit-tests without a server. Handles TEXT escaping
 * (§3.3.11) and 75-octet line folding (§3.1).
 */

import { toIcsLocal } from "./tz";

/**
 * VTIMEZONE blocks copied VERBATIM from real Google/Apple .ics exports — NEVER
 * algorithmically synthesized. A conformant client PREFERS an embedded VTIMEZONE
 * over its own tz database, so a subtly-wrong block would silently corrupt the
 * absolute time of every occurrence (worse than the DST drift we're fixing).
 *
 * Only the zones Elevay organizers actually use (EU/CH/UK); every other zone
 * falls back to UTC for recurring ICS (the drift, but never a broken invite).
 * To extend: paste a real export's VTIMEZONE for the zone — do not hand-derive.
 *
 * The EU last-Sunday-of-March / last-Sunday-of-October rule is decades-stable.
 */
const VTIMEZONE_BLOCKS: Record<string, string> = {
  "Europe/Paris": [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\n"),
  "Europe/Zurich": [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Zurich",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:CEST",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:CET",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\n"),
  "Europe/London": [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/London",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0100",
    "TZNAME:BST",
    "DTSTART:19700329T010000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0000",
    "TZNAME:GMT",
    "DTSTART:19701025T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ].join("\n"),
};

export interface IcsPerson {
  email: string;
  name?: string | null;
}

export interface IcsEventInput {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: IcsPerson;
  attendees: IcsPerson[];
  /** RRULE body (no "RRULE:" prefix), e.g. "FREQ=WEEKLY;COUNT=8". See recurrence.ts. */
  recurrenceRule?: string | null;
  /** Minutes before start for a DISPLAY VALARM. Omitted = no alarm. */
  reminderMinutes?: number | null;
  /** Organizer IANA zone for a RECURRING series — emits DTSTART;TZID + a VTIMEZONE
   *  so occurrences hold their local wall-clock across DST. Only honoured when a
   *  recurrenceRule is set AND the zone is in VTIMEZONE_BLOCKS; otherwise (and for
   *  every single event) DTSTART stays UTC, byte-identical to before. */
  timeZone?: string | null;
  /** REQUEST = invitation, PUBLISH = plain object, REPLY = an attendee's RSVP. */
  method?: "REQUEST" | "PUBLISH" | "REPLY";
  /**
   * Attendee participation status for a REPLY (iTIP §3.2.3). When set, attendees
   * are emitted as `ATTENDEE;PARTSTAT=<value>` (the responder's answer) instead
   * of the NEEDS-ACTION/RSVP=TRUE form used in an outgoing REQUEST.
   */
  attendeePartstat?: "ACCEPTED" | "TENTATIVE" | "DECLINED";
  sequence?: number;
}

const PRODID = "-//Elevay//Sovereign Visio//EN";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → RFC 5545 UTC stamp: YYYYMMDDTHHMMSSZ. */
export function toIcsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape a TEXT value per RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold a content line at 75 octets with CRLF + space continuation (§3.1). */
export function foldIcsLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, "utf8");
    if (bytes + chBytes > 75) {
      out.push(cur);
      cur = " " + ch; // continuation lines begin with a single space
      bytes = 1 + chBytes;
    } else {
      cur += ch;
      bytes += chBytes;
    }
  }
  if (cur) out.push(cur);
  return out.join("\r\n");
}

/** DQUOTE-wrap a param value if it carries a separator char. */
function quoteParam(value: string): string {
  const cleaned = value.replace(/"/g, "");
  return /[:;,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

function personLine(
  prop: "ORGANIZER" | "ATTENDEE",
  p: IcsPerson,
  extraParams = "",
): string {
  const cn = p.name ? `;CN=${quoteParam(p.name)}` : "";
  return `${prop}${cn}${extraParams}:mailto:${p.email}`;
}

export function buildIcs(input: IcsEventInput): string {
  const {
    uid,
    start,
    end,
    summary,
    description,
    location,
    url,
    organizer,
    attendees,
    recurrenceRule,
    reminderMinutes,
    timeZone,
    method = "REQUEST",
    attendeePartstat,
    sequence = 0,
  } = input;

  // Zoned (DTSTART;TZID + a VTIMEZONE) ONLY for a recurring event whose organizer
  // zone is in the verified table; singles + unknown zones stay UTC (identical
  // bytes). The VTIMEZONE lets the series hold its local wall-clock across DST.
  const tzBlock = recurrenceRule && timeZone ? VTIMEZONE_BLOCKS[timeZone] : undefined;
  const localStart = tzBlock && timeZone ? toIcsLocal(start, timeZone) : null;
  const localEnd = tzBlock && timeZone ? toIcsLocal(end, timeZone) : null;
  const zoned = Boolean(tzBlock && localStart && localEnd);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
  ];
  // VTIMEZONE is a top-level component and MUST precede the VEVENT referencing it.
  if (zoned && tzBlock) lines.push(...tzBlock.split("\n"));
  lines.push(
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`, // DTSTAMP is always UTC (RFC 5545 §3.8.7.2)
    zoned ? `DTSTART;TZID=${timeZone}:${localStart}` : `DTSTART:${toIcsUtc(start)}`,
    zoned ? `DTEND;TZID=${timeZone}:${localEnd}` : `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  );
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (url) lines.push(`URL:${url}`); // URI value — not TEXT-escaped
  // RRULE — recurrenceRule is an enumerated/bounded body (recurrence.ts), so it
  // carries no user free-text and needs no escaping.
  if (recurrenceRule) lines.push(`RRULE:${recurrenceRule}`);
  lines.push(personLine("ORGANIZER", organizer));
  // A REPLY carries the responder's PARTSTAT; a REQUEST/PUBLISH invites them.
  const attendeeParams = attendeePartstat
    ? `;PARTSTAT=${attendeePartstat}`
    : ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE";
  for (const a of attendees) {
    lines.push(personLine("ATTENDEE", a, attendeeParams));
  }
  lines.push(`SEQUENCE:${sequence}`);
  // STATUS belongs on the organizer's object, not on an attendee's REPLY.
  if (method !== "REPLY") lines.push("STATUS:CONFIRMED");
  // A DISPLAY reminder (VALARM) fired `reminderMinutes` before start.
  if (typeof reminderMinutes === "number" && reminderMinutes >= 0) {
    lines.push("BEGIN:VALARM");
    lines.push(`TRIGGER:-PT${Math.floor(reminderMinutes)}M`);
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:Reminder");
    lines.push("END:VALARM");
  }
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
