/**
 * RFC 5545 iCalendar builder. Two consumers:
 *   1. CalDAV write — the VEVENT we PUT into the user's calendar collection.
 *   2. SMTP invite  — the METHOD:REQUEST attachment we email the prospect when
 *      the calendar backend (CalDAV) won't notify them itself.
 *
 * Pure (no I/O) so it unit-tests without a server. Handles TEXT escaping
 * (§3.3.11) and 75-octet line folding (§3.1).
 */

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
  /** REQUEST for an invitation, PUBLISH for a plain calendar object. */
  method?: "REQUEST" | "PUBLISH";
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
    method = "REQUEST",
    sequence = 0,
  } = input;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (url) lines.push(`URL:${url}`); // URI value — not TEXT-escaped
  lines.push(personLine("ORGANIZER", organizer));
  for (const a of attendees) {
    lines.push(
      personLine("ATTENDEE", a, ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE"),
    );
  }
  lines.push(`SEQUENCE:${sequence}`);
  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
