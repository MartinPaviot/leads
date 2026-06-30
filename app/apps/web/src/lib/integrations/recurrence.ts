/**
 * Meeting recurrence — a small, safe subset of RFC 5545 / provider recurrence
 * that maps cleanly to all three calendar backends:
 *  - Google Calendar + ICS (CalDAV/SMTP): an `RRULE` string.
 *  - Microsoft Graph: a `patternedRecurrence` { pattern, range } object.
 *
 * We expose only { freq, count } — no interval / BYDAY / UNTIL — to keep the
 * surface unambiguous across providers and free of injection: every field is
 * enumerated or a bounded integer. The event's START defines the weekday
 * (weekly), day-of-month (monthly) and the range start date.
 */

import { zonedWeekday, zonedYmdDay } from "./tz";

export type RecurrenceFreq = "daily" | "weekly" | "monthly";

export interface MeetingRecurrence {
  freq: RecurrenceFreq;
  /** Total number of occurrences incl. the first (>=2). Omitted = open-ended. */
  count?: number;
}

const FREQ_TO_RRULE: Record<RecurrenceFreq, string> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
};

/** Lowercase day names, indexed by JS getUTCDay() (0 = Sunday). Graph form. */
const GRAPH_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function ymdUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}-` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getUTCDate()).padStart(2, "0")}`
  );
}

/** True only when a count means "ends after N occurrences" (N >= 2). */
function hasCount(rec: MeetingRecurrence): boolean {
  return typeof rec.count === "number" && rec.count >= 2;
}

/**
 * The RRULE BODY (no "RRULE:" prefix), e.g. "FREQ=WEEKLY;COUNT=8". Google's
 * `recurrence` array and the ICS `RRULE:` line both consume this.
 */
export function toRRule(rec: MeetingRecurrence): string {
  const parts = [`FREQ=${FREQ_TO_RRULE[rec.freq]}`];
  if (hasCount(rec)) parts.push(`COUNT=${Math.floor(rec.count as number)}`);
  return parts.join(";");
}

/**
 * Microsoft Graph `patternedRecurrence`. The weekday (weekly) / day-of-month
 * (monthly) and the range start come from the event's start.
 *
 * `tz` (the organizer's IANA zone) MUST be the SAME zone the Graph writer puts
 * in start.timeZone — else the restated weekday/dayOfMonth would disagree with
 * the start. When `tz` is set, the anchors are the LOCAL wall-clock in that zone
 * (so a recurring series holds its local time across DST); when null they fall
 * back to the UTC basis (matching a UTC-pinned start), preserving the prior
 * behaviour byte-for-byte for the 2-arg call sites + tests.
 */
export function toGraphRecurrence(
  rec: MeetingRecurrence,
  start: Date,
  tz: string | null = null,
): { pattern: Record<string, unknown>; range: Record<string, unknown> } {
  const weekday = tz ? zonedWeekday(start, tz) : GRAPH_DAYS[start.getUTCDay()];
  const dayOfMonth = tz ? zonedYmdDay(start, tz).dayOfMonth : start.getUTCDate();
  const startDate = tz ? zonedYmdDay(start, tz).ymd : ymdUtc(start);
  const pattern: Record<string, unknown> =
    rec.freq === "weekly"
      ? { type: "weekly", interval: 1, daysOfWeek: [weekday] }
      : rec.freq === "monthly"
        ? { type: "absoluteMonthly", interval: 1, dayOfMonth }
        : { type: "daily", interval: 1 };
  const range: Record<string, unknown> = hasCount(rec)
    ? { type: "numbered", startDate, numberOfOccurrences: Math.floor(rec.count as number) }
    : { type: "noEnd", startDate };
  return { pattern, range };
}
