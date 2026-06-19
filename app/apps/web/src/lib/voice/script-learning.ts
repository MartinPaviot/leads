/**
 * The learning loop (teardown E): which enjeu actually books meetings, PER
 * sector. Pure — feed it the dial-time scriptContext (sector + the enjeu the
 * rep led with) plus the call outcome; it returns per-sector booking rates by
 * enjeu, FLOORED so a handful of calls never fakes a "winner" (same anti-noise
 * discipline as the cohort engine / call metrics). The flywheel: once a sector
 * clears the floor, `best` names the enjeu to float first; until then it's
 * null and the script keeps its default order. Capturing the data now (cheap,
 * no migration — scriptContext is jsonb) is what lets the loop spin later.
 */

export interface CallEnjeuRow {
  sector: string | null;
  /** Semantic enjeu key led with: ia | cout | souverainete. */
  enjeuKey: string | null;
  /** outcome === "meeting_booked". */
  booked: boolean;
}

export interface EnjeuStat {
  enjeuKey: string;
  calls: number;
  meetings: number;
  rate: number;
}

export interface SectorEnjeuInsight {
  sector: string;
  total: number;
  /** Enjeux that cleared the floor, best booking-rate first. */
  ranked: EnjeuStat[];
  /** The enjeu to float first once it earns it, else null (keep default). */
  best: string | null;
}

/** Minimum dials per enjeu before its rate is trusted (anti-noise floor). */
export const ENJEU_MIN_CALLS = 20;

/** Per-sector booking rate by enjeu. Rows with no sector or no enjeu key are
 *  ignored (can't attribute). Sectors returned busiest-first. */
export function enjeuWinRates(rows: CallEnjeuRow[], minCalls = ENJEU_MIN_CALLS): SectorEnjeuInsight[] {
  const bySector = new Map<string, Map<string, { calls: number; meetings: number }>>();
  for (const r of rows) {
    const s = (r.sector ?? "").trim();
    const e = (r.enjeuKey ?? "").trim();
    if (!s || !e) continue;
    let m = bySector.get(s);
    if (!m) {
      m = new Map();
      bySector.set(s, m);
    }
    const cur = m.get(e) ?? { calls: 0, meetings: 0 };
    cur.calls += 1;
    if (r.booked) cur.meetings += 1;
    m.set(e, cur);
  }

  const out: SectorEnjeuInsight[] = [];
  for (const [sector, m] of bySector) {
    let total = 0;
    const stats: EnjeuStat[] = [];
    for (const [enjeuKey, { calls, meetings }] of m) {
      total += calls;
      stats.push({ enjeuKey, calls, meetings, rate: calls > 0 ? meetings / calls : 0 });
    }
    const ranked = stats
      .filter((s) => s.calls >= minCalls)
      .sort((a, b) => b.rate - a.rate || b.calls - a.calls);
    out.push({ sector, total, ranked, best: ranked.length > 0 ? ranked[0].enjeuKey : null });
  }
  return out.sort((a, b) => b.total - a.total);
}
