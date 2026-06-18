/**
 * Minimal iCalendar (RFC 5545) VEVENT parser for inbound meeting invites
 * (INBOX-R12 / CAL02 / CAL04). Pure + deterministic: turns the raw text/calendar
 * part of an email into the few fields the inbox needs to render an inline event
 * card and offer accept/decline — summary, start/end, location, organizer, status.
 *
 * Deliberately small (no dependency): we only read the first VEVENT, the common
 * date forms (UTC `…Z`, floating local, and all-day VALUE=DATE), and unfold the
 * RFC 5545 line continuations. Anything we cannot parse degrades to null, never
 * throws — a malformed invite still renders its summary, or nothing.
 */

export interface IcsEvent {
  summary: string | null;
  start: Date | null;
  end: Date | null;
  /** All-day event (DTSTART was a VALUE=DATE, no time component). */
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  /** METHOD (REQUEST/CANCEL/REPLY) — REQUEST = a new invite, CANCEL = cancelled. */
  method: string | null;
  /** STATUS (CONFIRMED/TENTATIVE/CANCELLED). */
  status: string | null;
  uid: string | null;
}

/** Unescape RFC 5545 TEXT values: \n \, \; \\ . */
function unescapeText(v: string): string {
  return v.replace(/\\([\\,;nN])/g, (_m, c) => (c === "n" || c === "N" ? "\n" : c));
}

/** Parse an iCal date/date-time value into a Date + all-day flag. */
function parseIcsDate(value: string): { date: Date | null; allDay: boolean } {
  // All-day: YYYYMMDD
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return { date: new Date(Number(y), Number(m) - 1, Number(d)), allDay: true };
  }
  // Date-time: YYYYMMDDTHHMMSS with optional trailing Z (UTC).
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value);
  if (dt) {
    const [, y, mo, d, h, mi, s, z] = dt;
    if (z) {
      return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
    }
    // Floating / TZID local time — best-effort as local; tz-correctness is residual.
    return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
  }
  return { date: null, allDay: false };
}

/** Extract the bare email address from an ORGANIZER value (mailto:, CN=… etc.). */
function organizerEmail(value: string): string {
  const m = /mailto:([^\s;:]+)/i.exec(value);
  return (m ? m[1] : value).trim().toLowerCase();
}

/**
 * Parse the first VEVENT from raw text/calendar content. Returns null when there
 * is no parseable VEVENT. Never throws.
 */
export function parseIcs(raw: string): IcsEvent | null {
  if (!raw || !/BEGIN:VEVENT/i.test(raw)) return null;

  // RFC 5545 line unfolding: a CRLF (or LF) followed by a space/tab continues
  // the previous line.
  const unfolded = raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const lines = unfolded.split(/\r\n|\n|\r/);

  let inEvent = false;
  let method: string | null = null;
  const ev: IcsEvent = {
    summary: null, start: null, end: null, allDay: false,
    location: null, organizer: null, method: null, status: null, uid: null,
  };

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const name = left.split(";")[0].toUpperCase();

    if (name === "METHOD") method = value.trim().toUpperCase();
    if (name === "BEGIN" && value.trim().toUpperCase() === "VEVENT") { inEvent = true; continue; }
    if (name === "END" && value.trim().toUpperCase() === "VEVENT") break; // first VEVENT only
    if (!inEvent) continue;

    switch (name) {
      case "SUMMARY": ev.summary = unescapeText(value).trim() || null; break;
      case "LOCATION": ev.location = unescapeText(value).trim() || null; break;
      case "STATUS": ev.status = value.trim().toUpperCase() || null; break;
      case "UID": ev.uid = value.trim() || null; break;
      case "ORGANIZER": ev.organizer = organizerEmail(value) || null; break;
      case "DTSTART": {
        const { date, allDay } = parseIcsDate(value.trim());
        ev.start = date;
        ev.allDay = allDay;
        break;
      }
      case "DTEND": {
        ev.end = parseIcsDate(value.trim()).date;
        break;
      }
    }
  }

  ev.method = method;
  // A VEVENT with nothing usable is not worth a card.
  if (!ev.summary && !ev.start) return null;
  return ev;
}

/** Short human label for the invite card header, from METHOD/STATUS. */
export function eventStatusLabel(ev: IcsEvent): string {
  if (ev.method === "CANCEL" || ev.status === "CANCELLED") return "Cancelled";
  if (ev.method === "REPLY") return "Reply";
  if (ev.method === "REQUEST") return ev.status === "TENTATIVE" ? "Tentative invitation" : "Invitation";
  return "Event";
}

/** Whether this invite has been cancelled (drives the card's struck-through state). */
export function isEventCancelled(ev: IcsEvent): boolean {
  return ev.method === "CANCEL" || ev.status === "CANCELLED";
}
