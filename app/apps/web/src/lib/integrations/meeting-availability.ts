/**
 * Free-slot availability for the meeting scheduler — provider-aware, so a user
 * on Infomaniak / OVH / any CalDAV mailbox gets slots from THEIR calendar, not
 * just Google. Resolution order mirrors `bookSovereignMeeting` (calendar-write.ts)
 * exactly: the connected IMAP/SMTP mailbox (CalDAV) first, then Microsoft, then
 * Google — so the calendar we read free/busy from is the same one the booking
 * writes to.
 *
 *  - CalDAV (Infomaniak…): busy periods from `fetchCalDavMeetings` (caldav.ts),
 *    skipping cancelled/declined events (Google freebusy excludes those too).
 *  - Microsoft: busy periods from `fetchMicrosoftMeetings` (Graph).
 *  - Google: busy periods from the freebusy API.
 *  - none: source "none" → the scheduler keeps its manual picker.
 *
 * Slots are generated in the USER's timezone (passed through `timeZone`), not the
 * server's — on Vercel the runtime is UTC, so without this "09:00" would mean
 * 09:00 UTC (11:00 Paris in summer). The generator (`freeSlotsFromBusy`) is pure
 * and unit-tested.
 */

import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { fetchCalDavMeetings } from "./caldav";
import { fetchMicrosoftMeetings, getMicrosoftAccessToken } from "./calendar-microsoft";
import { getCalendarClient } from "./calendar";

export interface FreeSlot {
  start: Date;
  end: Date;
}

export type AvailabilitySource = "caldav" | "microsoft" | "google" | "none";

export interface FreeSlots {
  source: AvailabilitySource;
  slots: FreeSlot[];
}

export interface SlotOptions {
  /** How many days out to look (inclusive of today). */
  daysAhead?: number;
  /** Slot length in minutes — also the booked meeting's duration. */
  slotDurationMinutes?: number;
  /** Business-hours window, in the user's timezone. */
  windowStart?: string; // "09:00"
  windowEnd?: string; // "17:00"
  /** Cap the total number of suggestions returned. */
  max?: number;
  /** Cap suggestions PER DAY so a week grid shows openings across every day,
   *  not all of them on the first free day. Default ∞ (no per-day cap). */
  maxPerDay?: number;
  /** IANA timezone the business-hours window is expressed in (e.g. "Europe/Zurich").
   *  Omitted → server-local time (used only by the unit test). */
  timeZone?: string;
}

/* ------------------------------------------------------------------ */
/*  Timezone helpers — build "HH:MM on day D in tz" as a UTC instant   */
/* ------------------------------------------------------------------ */

interface ZonedParts {
  y: number;
  mo: number; // 0-based
  d: number;
  H: number;
  M: number;
  S: number;
}

/** The wall-clock parts of `instant` as seen in `tz`. */
function tzParts(instant: Date, tz: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let H = Number(map.hour);
  if (H === 24) H = 0; // some engines emit "24" at midnight
  return { y: Number(map.year), mo: Number(map.month) - 1, d: Number(map.day), H, M: Number(map.minute), S: Number(map.second) };
}

/** Offset (minutes) of `tz` at `instant`: local(tz) − UTC. */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = tzParts(instant, tz);
  const asUTC = Date.UTC(p.y, p.mo, p.d, p.H, p.M, p.S);
  return (asUTC - instant.getTime()) / 60_000;
}

/** Interpret the wall time (y, mo, d, h, mi) in `tz` and return the UTC instant. */
function wallToInstant(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = new Date(Date.UTC(y, mo, d, h, mi, 0));
  const off = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - off * 60_000);
}

interface DayParts {
  y: number;
  mo: number;
  d: number;
  dow: number;
}

/** The calendar date `dayOffset` days after `now`, in `tz` (or server-local). */
function dayParts(now: Date, dayOffset: number, tz?: string): DayParts {
  if (!tz) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    return { y: day.getFullYear(), mo: day.getMonth(), d: day.getDate(), dow: day.getDay() };
  }
  const p = tzParts(new Date(now.getTime() + dayOffset * 86_400_000), tz);
  // Weekday is date-only and tz-stable once we have the local Y-M-D.
  const dow = new Date(Date.UTC(p.y, p.mo, p.d)).getUTCDay();
  return { y: p.y, mo: p.mo, d: p.d, dow };
}

/** A slot's start instant for wall time (h, m) on `day`, in `tz` (or server-local). */
function slotInstant(day: DayParts, h: number, m: number, tz?: string): Date {
  return tz ? wallToInstant(day.y, day.mo, day.d, h, m, tz) : new Date(day.y, day.mo, day.d, h, m, 0, 0);
}

/* ------------------------------------------------------------------ */
/*  Pure slot generator                                                 */
/* ------------------------------------------------------------------ */

/**
 * Generate free business-hour slots in [now, now+daysAhead], excluding any slot
 * that overlaps a busy period. Pure (now is injectable) so it's deterministic in
 * tests. Weekends and past slots are skipped; a slot must fit fully inside the
 * window. With `timeZone` set, the window is the user's local time.
 */
export function freeSlotsFromBusy(
  busy: Array<{ start: Date; end: Date }>,
  opts: SlotOptions = {},
  now: Date = new Date(),
): FreeSlot[] {
  const {
    daysAhead = 5,
    slotDurationMinutes = 30,
    windowStart = "09:00",
    windowEnd = "17:00",
    max = 12,
    maxPerDay = Infinity,
    timeZone,
  } = opts;
  const [startH] = windowStart.split(":").map(Number);
  const [endH] = windowEnd.split(":").map(Number);
  const out: FreeSlot[] = [];

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
    const day = dayParts(now, dayOffset, timeZone);
    if (day.dow === 0 || day.dow === 6) continue; // skip weekends

    let dayCount = 0;
    hours: for (let h = startH; h < endH; h++) {
      for (let m = 0; m < 60; m += slotDurationMinutes) {
        // Wall-clock window fit (tz-independent): the slot must finish by windowEnd.
        if (h * 60 + m + slotDurationMinutes > endH * 60) continue;
        const slotStart = slotInstant(day, h, m, timeZone);
        if (slotStart.getTime() <= now.getTime()) continue; // past
        const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60_000);
        const overlaps = busy.some((b) => slotStart < b.end && slotEnd > b.start);
        if (!overlaps) {
          out.push({ start: slotStart, end: slotEnd });
          if (out.length >= max) return out;
          if (++dayCount >= maxPerDay) break hours; // this day is full → next day
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Busy-period sources                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolve the SAME mailbox `bookSovereignMeeting` would book on (findSmtpMailbox:
 * smtp_custom + smtpHost, the user's own row else the legacy first), then read
 * its CalDAV URL. Resolving on the same row — not on `caldavUrl` up front — keeps
 * availability and booking pointed at one calendar (and never another member's).
 */
async function caldavBox(
  userId: string,
  tenantId: string,
): Promise<{ email: string; password: string; calendarUrl: string } | null> {
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
  // No CalDAV on the chosen box → no calendar to read free/busy from.
  if (!box.secretEncrypted || !box.caldavUrl) return null;
  let password: string;
  try {
    password = decryptSecret(box.secretEncrypted);
  } catch {
    return null;
  }
  return { email: box.emailAddress, password, calendarUrl: box.caldavUrl };
}

/** Busy intervals from the CalDAV calendar (timed, non-cancelled, non-declined). */
async function caldavBusy(
  userId: string,
  tenantId: string,
  daysAhead: number,
): Promise<Array<{ start: Date; end: Date }> | null> {
  const box = await caldavBox(userId, tenantId);
  if (!box) return null;
  const owner = box.email.toLowerCase();
  try {
    const meetings = await fetchCalDavMeetings(
      { email: box.email, password: box.password, calendarUrl: box.calendarUrl },
      0,
      daysAhead + 1,
    );
    return meetings
      .filter(
        (m) =>
          !m.isAllDay &&
          m.status !== "cancelled" &&
          !(m.attendees ?? []).some((a) => a.email === owner && a.responseStatus === "declined"),
      )
      .map((m) => ({ start: m.startTime, end: m.endTime }));
  } catch {
    // A CalDAV hiccup shouldn't break scheduling — treat as "no calendar".
    return null;
  }
}

/** Busy intervals from Microsoft Graph (timed, non-cancelled). null = no Microsoft. */
async function microsoftBusy(
  userId: string,
  daysAhead: number,
): Promise<Array<{ start: Date; end: Date }> | null> {
  const token = await getMicrosoftAccessToken(userId);
  if (!token) return null; // not connected
  try {
    const meetings = await fetchMicrosoftMeetings(userId, 0, daysAhead + 1);
    return meetings
      .filter((m) => !m.isAllDay && m.status !== "cancelled")
      .map((m) => ({ start: m.startTime, end: m.endTime }));
  } catch {
    return null;
  }
}

/** Busy intervals from Google freebusy. null = no Google calendar connected. */
async function googleBusy(
  userId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<Array<{ start: Date; end: Date }> | null> {
  const calendar = await getCalendarClient(userId);
  if (!calendar) return null;
  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }],
      },
    });
    const periods = (res.data.calendars?.primary?.busy || []) as Array<{ start: string; end: string }>;
    return periods.map((p) => ({ start: new Date(p.start), end: new Date(p.end) }));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Resolve busy intervals from whichever calendar the user connected — CalDAV
 * (Infomaniak…), then Microsoft, then Google (the same order booking resolves).
 * null = no calendar connected.
 */
async function resolveBusy(
  userId: string,
  tenantId: string,
  daysAhead: number,
): Promise<{ source: AvailabilitySource; busy: Array<{ start: Date; end: Date }> } | null> {
  const cal = await caldavBusy(userId, tenantId, daysAhead);
  if (cal) return { source: "caldav", busy: cal };

  const ms = await microsoftBusy(userId, daysAhead);
  if (ms) return { source: "microsoft", busy: ms };

  const now = new Date();
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + daysAhead + 1);
  const g = await googleBusy(userId, now, timeMax);
  if (g) return { source: "google", busy: g };

  return null;
}

/**
 * Resolve free slots from whichever calendar the user connected. Returns
 * `source: "none"` with no slots when none is connected, so the scheduler keeps
 * its manual picker.
 */
export async function getConnectedFreeSlots(
  userId: string,
  tenantId: string,
  opts: SlotOptions = {},
): Promise<FreeSlots> {
  const r = await resolveBusy(userId, tenantId, opts.daysAhead ?? 5);
  if (!r) return { source: "none", slots: [] };
  return { source: r.source, slots: freeSlotsFromBusy(r.busy, opts) };
}

/**
 * Point-in-time check: is [start, start+duration] free on the connected calendar?
 * Backstops the manual datetime picker (the one path that can choose a busy time
 * — the week-strip pills are free by construction). No calendar connected → we
 * can't validate, so we report free rather than block the booking.
 */
export async function isSlotFree(
  userId: string,
  tenantId: string,
  start: Date,
  durationMinutes: number,
): Promise<{ free: boolean; source: AvailabilitySource }> {
  const daysToStart = Math.ceil((start.getTime() - Date.now()) / 86_400_000) + 1;
  const r = await resolveBusy(userId, tenantId, Math.min(60, Math.max(1, daysToStart)));
  if (!r) return { free: true, source: "none" };
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const overlaps = r.busy.some((b) => start < b.end && end > b.start);
  return { free: !overlaps, source: r.source };
}
