/**
 * CLE-13 (item 4) — tenant-timezone-correct send-window helper.
 *
 * The campaign cron used to compute the current day/time with
 * `now.getUTCDay()` / `now.getUTCHours()` — UTC wall-clock, NOT the tenant's
 * timezone — so an "08:00-18:00" window was enforced against UTC and was off by
 * the tenant's offset. This pure helper mirrors the proven `Intl.DateTimeFormat`
 * approach already used by lib/voice/quiet-hours.ts (no tz library; ICU is always
 * present) and reuses its `resolveTimezone` so the default falls back to
 * Europe/Paris.
 *
 * Single source of truth: every path that honors a send window calls
 * `isWithinSendWindow`, so the UTC/TZ logic cannot drift between paths (AC-4.4).
 */

import { resolveTimezone } from "@/lib/voice/quiet-hours";

export type WeekdayKey =
  | "sun"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat";

const WEEKDAY_MAP: Record<string, WeekdayKey> = {
  Sun: "sun",
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
};

/**
 * The tenant-local day-of-week key and zero-padded "HH:MM" clock for `now` in
 * the given timezone. A missing/malformed timezone falls back to the default
 * (Europe/Paris) and never throws out of a cron step (EC-2 / EC-3).
 */
export function localClock(
  now: Date,
  timezone: string | null | undefined,
): { day: WeekdayKey; time: string } {
  const tz = resolveTimezone(timezone);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    // Intl can emit "24" for midnight in hour12:false; normalize to "00".
    const rawHour = get("hour");
    const hour = rawHour === "24" ? "00" : rawHour;
    const day = WEEKDAY_MAP[get("weekday")] ?? "mon";
    return { day, time: `${hour}:${get("minute")}` };
  } catch {
    // Malformed IANA string -> default TZ, never throw (EC-3). Only recurse when
    // the timezone we tried was NOT already the default, so a broken default
    // (should never happen) cannot loop.
    if (tz !== resolveTimezone(undefined)) {
      return localClock(now, undefined);
    }
    return { day: "mon", time: "00:00" };
  }
}

/**
 * Whether `now`, evaluated in the tenant's timezone, falls within the mailbox's
 * configured send days and [start, end] window. The "HH:MM" comparison is
 * lexicographic, which is correct because the format is zero-padded fixed-width
 * (the same assumption the stored `sendWindowStart`/`sendWindowEnd` defaults and
 * the original UTC code already relied on).
 */
export function isWithinSendWindow(
  now: Date,
  timezone: string | null | undefined,
  win: { sendDays: string[]; sendWindowStart: string; sendWindowEnd: string },
): boolean {
  const { day, time } = localClock(now, timezone);
  return (
    win.sendDays.includes(day) &&
    time >= win.sendWindowStart &&
    time <= win.sendWindowEnd
  );
}
