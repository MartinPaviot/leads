/**
 * IANA timezone helpers — pure, dependency-free (built-in Intl only). Used to
 * express a UTC instant as a LOCAL wall-clock in the organizer's zone for
 * RECURRING meetings, so a standing series (e.g. weekly 09:00 Europe/Paris)
 * holds its local time across a DST transition instead of drifting with the
 * fixed UTC instant. Single events stay UTC (an instant is unambiguous).
 *
 * The formatToParts technique mirrors meeting-availability.ts (tzParts) — same
 * hourCycle:"h23" + "24"→"00" midnight guard.
 */

/** True when `tz` is a usable IANA zone (Intl accepts it). */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ZonedParts {
  y: string;
  mo: string;
  d: string;
  H: string;
  M: string;
  S: string;
}

/** The wall-clock Y/M/D/H/M/S of `date` in `tz` (all zero-padded strings). */
function zonedParts(date: Date, tz: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
  // h23 still emits "24" for midnight on some engines — normalize to "00".
  const H = p.hour === "24" ? "00" : p.hour;
  return { y: p.year, mo: p.month, d: p.day, H, M: p.minute, S: p.second };
}

/** "YYYY-MM-DDTHH:MM:SS" (no offset/Z) — Google/Graph dateTime in `tz`. */
export function toZonedNaiveIso(date: Date, tz: string): string {
  const { y, mo, d, H, M, S } = zonedParts(date, tz);
  return `${y}-${mo}-${d}T${H}:${M}:${S}`;
}

/** "YYYYMMDDTHHMMSS" — ICS DTSTART local stamp in `tz`; null on an invalid zone. */
export function toIcsLocal(date: Date, tz: string): string | null {
  if (!isValidTimeZone(tz)) return null;
  const { y, mo, d, H, M, S } = zonedParts(date, tz);
  return `${y}${mo}${d}T${H}${M}${S}`;
}

/** Lowercase day name (Graph `daysOfWeek` form) of `date` in `tz`, e.g. "monday". */
export function zonedWeekday(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" })
    .format(date)
    .toLowerCase();
}

/** The local date (YYYY-MM-DD) + day-of-month of `date` in `tz`. */
export function zonedYmdDay(date: Date, tz: string): { ymd: string; dayOfMonth: number } {
  const { y, mo, d } = zonedParts(date, tz);
  return { ymd: `${y}-${mo}-${d}`, dayOfMonth: Number(d) };
}
