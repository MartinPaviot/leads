/**
 * Onboarding velocity stats — pure helpers (P0-3 follow-up).
 *
 * Computes time-to-complete distribution + per-phase drop-off from
 * a list of `onboarding_progress` rows. The admin dashboard tile
 * reads this to surface :
 *  - p50 / p75 / p95 time-to-complete in hours
 *  - Completion rate (% of started tenants who finalised)
 *  - Per-phase drop-off : how many tenants made it to each phase
 *    vs how many finalised after that phase
 *
 * Pure : no DB, no clock injection — caller passes `now` for the
 * "still in progress" calculations. Tests pin every percentile +
 * boundary case.
 */

export interface OnboardingRow {
  tenantId: string;
  startedAt: Date | string;
  completedAt: Date | string | null;
  currentPhase: number;
  completedPhases: ReadonlyArray<number>;
}

export interface VelocityStats {
  /** Tenants whose onboarding row exists. */
  totalStarted: number;
  /** Tenants who hit "complete". */
  totalCompleted: number;
  /** completedAt - startedAt percentiles, in hours. Null when there
   *  are zero completed rows. */
  ttcHoursP50: number | null;
  ttcHoursP75: number | null;
  ttcHoursP95: number | null;
  /** totalCompleted / totalStarted, rounded 4 decimals. 0 when
   *  totalStarted is 0. */
  completionRate: number;
  /** Per-phase counts : how many tenants reached each phase 1..7
   *  (i.e. either completed it OR are currently on it). Index 0
   *  unused, indexes 1..7 used so callers can do `byPhase[3]`. */
  reachedByPhase: Record<number, number>;
  /** Per-phase finalisation : how many tenants who reached the
   *  phase went on to finalise onboarding. Drop-off = reached -
   *  finalised. */
  finalisedByPhase: Record<number, number>;
}

const PHASES = [1, 2, 3, 4, 5, 6, 7] as const;

export function toMs(d: Date | string): number {
  if (d instanceof Date) return d.getTime();
  const parsed = new Date(d).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Linear-interpolation percentile on a pre-sorted ascending array.
 * Returns null on empty input. Matches numpy's default
 * `np.percentile` (linear interpolation, not nearest-rank).
 */
export function computePercentile(
  sortedAsc: ReadonlyArray<number>,
  p: number,
): number | null {
  if (sortedAsc.length === 0) return null;
  if (p <= 0) return sortedAsc[0];
  if (p >= 100) return sortedAsc[sortedAsc.length - 1];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + frac * (sortedAsc[hi] - sortedAsc[lo]);
}

/**
 * Compute the velocity-stats summary from a batch of rows. Pure :
 * no IO ; caller does the SQL fetch then hands the rows in.
 */
export function computeVelocityStats(
  rows: ReadonlyArray<OnboardingRow>,
): VelocityStats {
  const totalStarted = rows.length;
  const completed = rows.filter((r) => r.completedAt !== null);
  const totalCompleted = completed.length;

  // Compute TTC hours for completed rows. Drop rows where the
  // timestamps are unparseable rather than blow up the whole
  // aggregate.
  const ttcHours: number[] = [];
  for (const r of completed) {
    const startMs = toMs(r.startedAt);
    const endMs = r.completedAt ? toMs(r.completedAt) : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const hours = (endMs - startMs) / (1000 * 60 * 60);
    if (hours < 0) continue; // clock skew safety
    ttcHours.push(hours);
  }
  ttcHours.sort((a, b) => a - b);

  const reachedByPhase: Record<number, number> = {};
  const finalisedByPhase: Record<number, number> = {};
  for (const p of PHASES) {
    reachedByPhase[p] = 0;
    finalisedByPhase[p] = 0;
  }
  for (const r of rows) {
    const completedSet = new Set(r.completedPhases);
    for (const p of PHASES) {
      if (r.currentPhase >= p || completedSet.has(p)) {
        reachedByPhase[p]++;
        if (r.completedAt) {
          finalisedByPhase[p]++;
        }
      }
    }
  }

  return {
    totalStarted,
    totalCompleted,
    ttcHoursP50: round1(computePercentile(ttcHours, 50)),
    ttcHoursP75: round1(computePercentile(ttcHours, 75)),
    ttcHoursP95: round1(computePercentile(ttcHours, 95)),
    completionRate:
      totalStarted === 0
        ? 0
        : Math.round((totalCompleted / totalStarted) * 10000) / 10000,
    reachedByPhase,
    finalisedByPhase,
  };
}

function round1(n: number | null): number | null {
  if (n === null) return null;
  return Math.round(n * 10) / 10;
}

/**
 * Per-phase drop-off in basis-points-friendly fractions. Drop-off
 * for phase N = (reached at N) - (reached at N+1) / (reached at N).
 * Phase 7 has no drop-off ; returns 0 there.
 */
export function computePhaseDropoff(
  stats: Pick<VelocityStats, "reachedByPhase">,
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of PHASES) {
    const reached = stats.reachedByPhase[p] ?? 0;
    const reachedNext =
      p === 7 ? null : stats.reachedByPhase[p + 1] ?? 0;
    if (reachedNext === null || reached === 0) {
      out[p] = 0;
      continue;
    }
    out[p] = Math.round(((reached - reachedNext) / reached) * 10000) / 10000;
  }
  return out;
}
