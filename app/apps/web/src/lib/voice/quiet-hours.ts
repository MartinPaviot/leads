/**
 * Timezone-aware quiet-hours check.
 *
 * Default window: weekdays 8h-19h local to the contact. Saturday is
 * 10h-13h. Sunday closed. Holiday-aware is Phase 4. The contact's
 * timezone is read from `contacts.properties.timezone` (set by the
 * enrichment pipeline) and falls back to the company HQ timezone, then
 * to the country's primary timezone, then to Europe/Paris.
 */

const DEFAULT_TIMEZONE = "Europe/Paris";

const COUNTRY_PRIMARY_TZ: Record<string, string> = {
  FR: "Europe/Paris",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  LU: "Europe/Luxembourg",
  MC: "Europe/Monaco",
  GB: "Europe/London",
  US: "America/New_York",
  CA: "America/Toronto",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  PT: "Europe/Lisbon",
  IE: "Europe/Dublin",
};

export interface QuietHoursWindow {
  startHour: number; // local hour, 0-23
  endHour: number; // local hour, 0-23 (exclusive)
}

const DEFAULT_WINDOWS: Record<number, QuietHoursWindow | null> = {
  0: null, // Sunday
  1: { startHour: 8, endHour: 19 },
  2: { startHour: 8, endHour: 19 },
  3: { startHour: 8, endHour: 19 },
  4: { startHour: 8, endHour: 19 },
  5: { startHour: 8, endHour: 19 },
  6: { startHour: 10, endHour: 13 }, // Saturday
};

export function resolveTimezone(
  explicit?: string | null,
  countryCode?: string | null,
): string {
  if (explicit) return explicit;
  if (countryCode && COUNTRY_PRIMARY_TZ[countryCode]) {
    return COUNTRY_PRIMARY_TZ[countryCode];
  }
  return DEFAULT_TIMEZONE;
}

export interface QuietHoursStatus {
  inQuietHours: boolean;
  localTime: string; // "HH:MM"
  localDayOfWeek: number; // 0=Sunday
  timezone: string;
  nextWindowOpensAt: Date | null;
}

function inWindowAt(
  now: Date,
  timezone: string,
  windows: Record<number, QuietHoursWindow | null>,
): { inWindow: boolean; localDay: number; hour: number; minute: number } {
  // Intl.DateTimeFormat gives us the local clock in the target zone
  // without bringing in a tz library — the runtime always has ICU.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayName = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const localDay = dayMap[weekdayName] ?? 1;
  const window = windows[localDay];
  const inWindow = window
    ? hour >= window.startHour && hour < window.endHour
    : false;
  return { inWindow, localDay, hour, minute };
}

export function checkQuietHours(
  now: Date,
  timezone: string,
  windows: Record<number, QuietHoursWindow | null> = DEFAULT_WINDOWS,
): QuietHoursStatus {
  const { inWindow, localDay, hour, minute } = inWindowAt(now, timezone, windows);
  return {
    inQuietHours: !inWindow,
    localTime: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    localDayOfWeek: localDay,
    timezone,
    nextWindowOpensAt: inWindow ? null : nextWindowStart(now, timezone, windows),
  };
}

function nextWindowStart(
  now: Date,
  timezone: string,
  windows: Record<number, QuietHoursWindow | null>,
): Date {
  // Walk forward up to 7 days looking for the next open window. Cheap
  // and correct without pulling Luxon/date-fns-tz. Uses the recursion-
  // free `inWindowAt` so we don't blow the stack.
  for (let i = 1; i < 7 * 24; i++) {
    const probe = new Date(now.getTime() + i * 60 * 60 * 1000);
    const { inWindow } = inWindowAt(probe, timezone, windows);
    if (inWindow) return probe;
  }
  // Fallback — should never happen given DEFAULT_WINDOWS.
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
