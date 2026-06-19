import { describe, it, expect } from "vitest";
import { freeSlots } from "@/lib/inbox/availability";

describe("freeSlots (INBOX-CAL01)", () => {
  it("returns the whole window when nothing is busy", () => {
    expect(freeSlots([], 0, 100, 10)).toEqual([{ start: 0, end: 100 }]);
  });

  it("returns the gaps around a busy block", () => {
    expect(freeSlots([{ start: 40, end: 60 }], 0, 100, 10)).toEqual([
      { start: 0, end: 40 },
      { start: 60, end: 100 },
    ]);
  });

  it("merges overlapping busy blocks", () => {
    expect(freeSlots([{ start: 40, end: 60 }, { start: 50, end: 70 }], 0, 100, 10)).toEqual([
      { start: 0, end: 40 },
      { start: 70, end: 100 },
    ]);
  });

  it("excludes gaps shorter than the requested slot", () => {
    expect(freeSlots([{ start: 0, end: 95 }], 0, 100, 10)).toEqual([]);
  });

  it("returns nothing when the whole window is busy", () => {
    expect(freeSlots([{ start: 0, end: 100 }], 0, 100, 10)).toEqual([]);
  });
});
