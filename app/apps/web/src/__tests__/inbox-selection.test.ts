import { describe, it, expect } from "vitest";
import {
  toggle,
  rangeTo,
  selectAll,
  clearSelection,
  summarizeBulk,
  EMPTY_SELECTION,
} from "@/lib/inbox/selection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("selection reducer (INBOX-T09)", () => {
  it("toggles a key on and off and tracks the anchor", () => {
    const s1 = toggle(EMPTY_SELECTION, "b");
    expect(s1.keys).toEqual(["b"]);
    expect(s1.anchor).toBe("b");
    expect(toggle(s1, "b").keys).toEqual([]);
  });

  it("range-selects inclusively from the anchor", () => {
    const s1 = toggle(EMPTY_SELECTION, "b"); // anchor b
    const s2 = rangeTo(s1, ORDER, "d");
    expect(s2.keys.sort()).toEqual(["b", "c", "d"]);
  });

  it("range works regardless of direction", () => {
    const s1 = toggle(EMPTY_SELECTION, "d");
    expect(rangeTo(s1, ORDER, "b").keys.sort()).toEqual(["b", "c", "d"]);
  });

  it("range with no anchor just toggles the target", () => {
    expect(rangeTo(EMPTY_SELECTION, ORDER, "c").keys).toEqual(["c"]);
  });

  it("select-all respects the cap", () => {
    expect(selectAll(ORDER, 3).keys).toEqual(["a", "b", "c"]);
  });

  it("clear empties the selection", () => {
    expect(clearSelection()).toEqual({ keys: [], anchor: null });
  });

  it("summarizes a bulk action's failures without hiding them", () => {
    expect(
      summarizeBulk([
        { key: "a", ok: true },
        { key: "b", ok: false },
        { key: "c", ok: true },
      ]),
    ).toEqual({ applied: 2, failed: ["b"] });
  });
});
