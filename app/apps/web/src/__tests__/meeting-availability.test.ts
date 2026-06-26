import { describe, it, expect } from "vitest";
import { freeSlotsFromBusy } from "@/lib/integrations/meeting-availability";

// A fixed Monday 08:00 local so the generator is deterministic (no real clock).
// 2026-06-22 is a Monday; the 5-day window covers Mon–Fri (22–26), skips Sat 27.
const NOW = new Date(2026, 5, 22, 8, 0, 0, 0);

describe("freeSlotsFromBusy", () => {
  it("with no busy periods, fills business-hour weekday slots after now", () => {
    const slots = freeSlotsFromBusy([], { max: 100 }, NOW);
    // 5 weekdays × (09:00–17:00 on a 30-min grid = 16 slots) = 80; Monday's are
    // all future (now is 08:00); Saturday is skipped.
    expect(slots.length).toBe(80);
    for (const s of slots) {
      expect(s.start.getTime()).toBeGreaterThan(NOW.getTime());
      const dow = s.start.getDay();
      expect(dow === 0 || dow === 6).toBe(false); // never a weekend
      expect(s.start.getHours()).toBeGreaterThanOrEqual(9);
      // The slot must finish within the 17:00 window.
      const endOk = s.end.getHours() < 17 || (s.end.getHours() === 17 && s.end.getMinutes() === 0);
      expect(endOk).toBe(true);
    }
  });

  it("excludes slots overlapping a busy period", () => {
    const busyStart = new Date(2026, 5, 23, 10, 0, 0); // Tue 10:00
    const busyEnd = new Date(2026, 5, 23, 11, 0, 0); // Tue 11:00
    const withBusy = freeSlotsFromBusy([{ start: busyStart, end: busyEnd }], { max: 100 }, NOW);
    const without = freeSlotsFromBusy([], { max: 100 }, NOW);
    // The 10:00 and 10:30 Tuesday starts are removed → exactly 2 fewer.
    expect(withBusy.length).toBe(without.length - 2);
    for (const s of withBusy) {
      const overlaps = s.start < busyEnd && s.end > busyStart;
      expect(overlaps).toBe(false);
    }
  });

  it("respects the max cap", () => {
    expect(freeSlotsFromBusy([], { max: 6 }, NOW).length).toBe(6);
  });

  it("caps slots PER DAY with maxPerDay (so a week grid is balanced)", () => {
    const slots = freeSlotsFromBusy([], { max: 100, maxPerDay: 3 }, NOW);
    const byDay = new Map<string, number>();
    for (const s of slots) {
      const k = `${s.start.getFullYear()}-${s.start.getMonth()}-${s.start.getDate()}`;
      byDay.set(k, (byDay.get(k) ?? 0) + 1);
    }
    for (const count of byDay.values()) expect(count).toBeLessThanOrEqual(3);
    // 5 business days (Mon–Fri) × 3 = 15.
    expect(slots.length).toBe(15);
  });

  it("honours the slot duration (slot end = start + duration)", () => {
    const slots = freeSlotsFromBusy([], { slotDurationMinutes: 45, max: 1 }, NOW);
    expect(slots.length).toBe(1);
    expect(slots[0].end.getTime() - slots[0].start.getTime()).toBe(45 * 60_000);
  });

  it("with a timeZone, every slot falls inside the user's local 09:00–17:00", () => {
    // 2026-06-22 06:00 UTC = 08:00 Monday in Zurich (UTC+2, CEST).
    const nowUtc = new Date(Date.UTC(2026, 5, 22, 6, 0, 0));
    const slots = freeSlotsFromBusy([], { max: 100, timeZone: "Europe/Zurich" }, nowUtc);
    expect(slots.length).toBeGreaterThan(0);
    const hourIn = (d: Date) =>
      Number(new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", hour: "2-digit", hour12: false }).format(d).replace(/\D/g, ""));
    for (const s of slots) {
      const h = hourIn(s.start);
      expect(h).toBeGreaterThanOrEqual(9);
      expect(h).toBeLessThan(17);
    }
  });
});
