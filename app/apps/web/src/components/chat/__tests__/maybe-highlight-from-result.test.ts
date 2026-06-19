import { describe, it, expect, vi } from "vitest";
import { maybeHighlightFromResult, coerceAnchors } from "../use-ui-directives";
import type { PageActionResult } from "@/lib/chat/page-actions/types";

/**
 * CLE-15 — the one factored read point for PAR-result highlights. Called by both
 * the run-now arm and CLE-05's approve path. A failure pulses nothing; a result
 * with no highlight pulses nothing; malformed anchors are dropped, never thrown.
 */

describe("coerceAnchors", () => {
  it("accepts a single anchor", () => {
    expect(coerceAnchors({ entityId: "a1", scope: "accounts" })).toEqual([{ entityId: "a1", scope: "accounts" }]);
  });
  it("accepts an array of anchors", () => {
    expect(coerceAnchors([{ entityId: "a1" }, { entityId: "b2", field: "stage" }])).toEqual([
      { entityId: "a1" },
      { entityId: "b2", field: "stage" },
    ]);
  });
  it("drops entries with no usable entityId and strips unknown keys", () => {
    expect(
      coerceAnchors([{ entityId: "a1", bogus: 1 }, { entityId: "" }, { scope: "x" }, 7, null]),
    ).toEqual([{ entityId: "a1" }]);
  });
  it("returns [] for undefined / null / non-anchor", () => {
    expect(coerceAnchors(undefined)).toEqual([]);
    expect(coerceAnchors(null)).toEqual([]);
    expect(coerceAnchors("nope")).toEqual([]);
  });
  it("only keeps focus when it is exactly boolean true", () => {
    expect(coerceAnchors({ entityId: "a1", focus: true })).toEqual([{ entityId: "a1", focus: true }]);
    expect(coerceAnchors({ entityId: "a1", focus: "y" })).toEqual([{ entityId: "a1" }]);
  });
});

describe("maybeHighlightFromResult", () => {
  it("does NOT highlight a failed result (a green flash on failure would mislead)", () => {
    const hl = vi.fn();
    const r: PageActionResult = { ok: false, summary: "failed", data: { highlight: { entityId: "a1" } } };
    maybeHighlightFromResult(r, hl);
    expect(hl).not.toHaveBeenCalled();
  });

  it("highlights a success carrying data.highlight (single)", () => {
    const hl = vi.fn();
    const r: PageActionResult = { ok: true, summary: "moved", data: { highlight: { entityId: "d1", scope: "opportunities" } } };
    maybeHighlightFromResult(r, hl);
    expect(hl).toHaveBeenCalledTimes(1);
    expect(hl).toHaveBeenCalledWith([{ entityId: "d1", scope: "opportunities" }]);
  });

  it("highlights a success carrying data.highlight (array)", () => {
    const hl = vi.fn();
    const r: PageActionResult = { ok: true, summary: "enriched", data: { highlight: [{ entityId: "c1" }, { entityId: "c2" }] } };
    maybeHighlightFromResult(r, hl);
    expect(hl).toHaveBeenCalledWith([{ entityId: "c1" }, { entityId: "c2" }]);
  });

  it("does nothing when a success carries no highlight", () => {
    const hl = vi.fn();
    maybeHighlightFromResult({ ok: true, summary: "done", data: { other: 1 } }, hl);
    maybeHighlightFromResult({ ok: true, summary: "done" }, hl);
    expect(hl).not.toHaveBeenCalled();
  });

  it("drops a malformed data.highlight without throwing or calling highlight", () => {
    const hl = vi.fn();
    expect(() =>
      maybeHighlightFromResult({ ok: true, summary: "x", data: { highlight: { scope: "accounts" } } }, hl),
    ).not.toThrow();
    expect(hl).not.toHaveBeenCalled();
  });
});
