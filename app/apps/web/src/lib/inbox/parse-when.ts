/**
 * Natural-language "when" parser for the snooze / remind-me control (INBOX-T05).
 *
 * Resolves inputs like "2d", "monday", "tomorrow 9am", "next week", "this
 * weekend", "15:00" to a concrete future timestamp, given `now`. Pure + fully
 * unit-tested; the UI shows the resolved time for confirmation before commit and
 * the API re-validates it is in the future. Unparseable input returns null (the
 * control says "couldn't read that time" rather than guessing).
 */

const DEFAULT_HOUR = 8; // "morning"
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function at(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Next occurrence of weekday `target` strictly after today, at hour:minute. */
function nextWeekday(now: Date, target: number, hour: number, minute: number): Date {
  let delta = (target - now.getDay() + 7) % 7;
  if (delta === 0) delta = 7; // "monday" on a Monday means next Monday
  const d = new Date(now);
  d.setDate(d.getDate() + delta);
  return at(d, hour, minute);
}

/** "9am", "9:30 am", "3pm", "15:00" → {hour,minute}; else null. */
function parseClock(token: string): { hour: number; minute: number } | null {
  let m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(token);
  if (m) {
    let hour = parseInt(m[1], 10) % 12;
    if (m[3] === "pm") hour += 12;
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    if (hour < 24 && minute < 60) return { hour, minute };
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(token);
  if (m) {
    const hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (hour < 24 && minute < 60) return { hour, minute };
  }
  return null;
}

export function parseWhen(input: string, now: Date = new Date()): Date | null {
  const s = (input || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;

  // Pure relative offset: "2d", "3 days", "in 2 days", "2h", "30m", "1w".
  const rel = /^(?:in\s+)?(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?)$/.exec(s);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const u = rel[2];
    const d = new Date(now);
    if (u.startsWith("m")) d.setMinutes(d.getMinutes() + n);
    else if (u.startsWith("h")) d.setHours(d.getHours() + n);
    else if (u.startsWith("d")) d.setDate(d.getDate() + n);
    else d.setDate(d.getDate() + n * 7);
    return d;
  }

  // Optional trailing clock ("monday 9am", "tomorrow 3pm", "today 15:00").
  const tokens = s.split(" ");
  let clock: { hour: number; minute: number } | null = null;
  let phrase = s;
  if (tokens.length >= 2) {
    const c = parseClock(tokens[tokens.length - 1]);
    if (c) {
      clock = c;
      phrase = tokens.slice(0, -1).join(" ");
    }
  }
  const hour = clock?.hour ?? DEFAULT_HOUR;
  const minute = clock?.minute ?? 0;

  if (phrase === "today") return at(now, clock?.hour ?? DEFAULT_HOUR, minute);
  if (phrase === "tonight") return at(now, clock?.hour ?? 19, minute);
  if (phrase === "tomorrow") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return at(d, hour, minute);
  }
  if (phrase === "next week") return nextWeekday(now, 1, hour, minute); // next Monday
  if (phrase === "this weekend" || phrase === "weekend") return nextWeekday(now, 6, hour, minute); // Saturday

  const weekdayPhrase = phrase.replace(/^next\s+/, "");
  const wd = WEEKDAYS.indexOf(weekdayPhrase);
  if (wd >= 0) return nextWeekday(now, wd, hour, minute);

  // Bare clock ("9am", "15:00") → today if still ahead, else tomorrow.
  const bare = parseClock(s);
  if (bare) {
    const today = at(now, bare.hour, bare.minute);
    if (today.getTime() > now.getTime()) return today;
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return at(d, bare.hour, bare.minute);
  }

  return null;
}
