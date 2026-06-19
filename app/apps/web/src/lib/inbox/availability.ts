/**
 * Free/busy slot computation for inline availability (INBOX-CAL01 core). Pure +
 * unit-tested.
 *
 * Given the user's busy intervals and an availability window (the caller clips it
 * to working hours), returns the free gaps long enough to hold a meeting of
 * `slotMs`. The calendar reads (free/busy) and the "insert times into the reply"
 * UI reuse the existing calendar layer (project_sovereign-visio) and are residual.
 */

export interface Interval {
  start: number; // ms epoch
  end: number;
}

function mergeIntervals(arr: Interval[]): Interval[] {
  const sorted = [...arr].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

export function freeSlots(
  busy: Interval[],
  windowStart: number,
  windowEnd: number,
  slotMs: number,
): Interval[] {
  if (windowEnd - windowStart < slotMs) return [];
  const merged = mergeIntervals(busy.filter((b) => b.end > windowStart && b.start < windowEnd));

  const free: Interval[] = [];
  let cursor = windowStart;
  for (const b of merged) {
    const bs = Math.max(b.start, windowStart);
    if (bs - cursor >= slotMs) free.push({ start: cursor, end: bs });
    cursor = Math.max(cursor, Math.min(b.end, windowEnd));
  }
  if (windowEnd - cursor >= slotMs) free.push({ start: cursor, end: windowEnd });
  return free;
}
