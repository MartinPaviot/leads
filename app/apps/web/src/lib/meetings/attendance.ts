/**
 * Meeting attendance + show-rate — the pure SSOT.
 *
 * A booked meeting only counts toward the show rate once its outcome is KNOWN:
 * the rep marked it held / no-show, or it was recorded (a recording proves it
 * happened). A no-show leaves no trace, so it must be marked — the rate is
 * therefore computed over QUALIFIED meetings only (held + no-show), and the
 * count still to qualify is surfaced so the number is never mistaken for the
 * whole. Floor-gated like the call metrics: a rate on 3 meetings is an anecdote,
 * not a rate. No DB, no LLM, client-safe (the meetings page resolves in the
 * browser, the dashboard endpoint mirrors the same logic in SQL).
 */

/** What a rep can explicitly mark — the source of truth. */
export const MEETING_ATTENDANCE = ["held", "no_show"] as const;
export type MeetingAttendance = (typeof MEETING_ATTENDANCE)[number];

export function isMeetingAttendance(v: unknown): v is MeetingAttendance {
  return v === "held" || v === "no_show";
}

export type ResolvedAttendance =
  | "held"
  | "no_show"
  | "cancelled" // calendar event was cancelled — never happened
  | "unknown" // past, not recorded, not marked → to qualify
  | "scheduled"; // still upcoming

export interface AttendanceSignals {
  /** The rep's explicit mark — wins over every inferred signal. */
  explicit?: MeetingAttendance | null;
  /** Calendar event status: "confirmed" | "tentative" | "cancelled". */
  calendarStatus?: string | null;
  /** Whether the meeting's start time has passed. */
  isPast: boolean;
  /** A recording / transcript / structured notes exist → it was held. */
  recorded?: boolean;
}

/**
 * Resolve one meeting's attendance. Explicit mark first (the rep is the truth),
 * then a cancelled calendar event, then "a recording proves it happened", then
 * unknown for a past meeting with no evidence either way. Upcoming → scheduled.
 */
export function resolveAttendance(s: AttendanceSignals): ResolvedAttendance {
  if (s.explicit === "held" || s.explicit === "no_show") return s.explicit;
  if (s.calendarStatus === "cancelled") return "cancelled";
  if (!s.isPast) return "scheduled";
  if (s.recorded) return "held";
  return "unknown";
}

/** Minimum qualified meetings (held + no-show) before a show rate is shown. */
export const SHOW_RATE_SAMPLE_FLOOR = 10;

/** Sourced B2B benchmark: a healthy meeting show rate sits around 75-80%. */
export const SHOW_RATE_BENCHMARK = { typical: [0.75, 0.8] as [number, number] };

export interface ShowStats {
  held: number;
  noShow: number;
  cancelled: number;
  /** Past, no recording, not marked — the rep still owes a verdict. */
  unknown: number;
  scheduled: number;
  /** held + noShow — the show-rate denominator (meetings with a known verdict). */
  qualified: number;
  /** held / qualified, null below the sample floor. */
  showRate: { value: number | null; num: number; den: number };
}

/** Build the stats from already-aggregated counts — the SQL path (the dashboard
 * endpoint tallies in Postgres, then hands the counts here so the rate + floor
 * rule live in exactly one place). */
export function showStatsFromCounts(
  c: { held: number; noShow: number; cancelled?: number; unknown?: number; scheduled?: number },
  floor = SHOW_RATE_SAMPLE_FLOOR,
): ShowStats {
  const held = c.held;
  const noShow = c.noShow;
  const qualified = held + noShow;
  return {
    held,
    noShow,
    cancelled: c.cancelled ?? 0,
    unknown: c.unknown ?? 0,
    scheduled: c.scheduled ?? 0,
    qualified,
    showRate: {
      value: qualified >= floor && qualified > 0 ? held / qualified : null,
      num: held,
      den: qualified,
    },
  };
}

export function tallyShowStats(
  resolved: ResolvedAttendance[],
  floor = SHOW_RATE_SAMPLE_FLOOR,
): ShowStats {
  let held = 0;
  let noShow = 0;
  let cancelled = 0;
  let unknown = 0;
  let scheduled = 0;
  for (const r of resolved) {
    if (r === "held") held++;
    else if (r === "no_show") noShow++;
    else if (r === "cancelled") cancelled++;
    else if (r === "unknown") unknown++;
    else if (r === "scheduled") scheduled++;
  }
  return showStatsFromCounts({ held, noShow, cancelled, unknown, scheduled }, floor);
}

/** Resolve a list of meetings then tally — the client-side path. */
export function computeShowStats(
  meetings: AttendanceSignals[],
  floor = SHOW_RATE_SAMPLE_FLOOR,
): ShowStats {
  return tallyShowStats(meetings.map(resolveAttendance), floor);
}
