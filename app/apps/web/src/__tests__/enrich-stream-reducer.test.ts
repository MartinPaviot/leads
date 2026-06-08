import { describe, it, expect } from "vitest";
import {
  enrichReducer,
  initialEnrichStreamState,
  type EnrichStreamState,
} from "@/hooks/use-enrich-stream";
import type { EnrichStreamEvent } from "@/lib/enrichment/enrich-stream-events";

function apply(state: EnrichStreamState, ...events: EnrichStreamEvent[]): EnrichStreamState {
  return events.reduce((s, event) => enrichReducer(s, { type: "event", event }), state);
}

describe("enrichReducer", () => {
  it("starts running and records the total", () => {
    const s = enrichReducer(initialEnrichStreamState, { type: "start", total: 3 });
    expect(s.isRunning).toBe(true);
    expect(s.total).toBe(3);
    expect(s.processed).toBe(0);
    expect(s.terminated).toBeNull();
  });

  it("reduces a full single-company sequence into honest cell + row state", () => {
    let s = enrichReducer(initialEnrichStreamState, { type: "start", total: 1 });
    s = apply(
      s,
      { type: "hello", jobId: "j1", companyIds: ["c1"], criteria: ["revenue", "linkedin"], startedAt: "t" },
      { type: "company.start", companyId: "c1" },
      { type: "criterion.searching", companyId: "c1", key: "revenue" },
      { type: "criterion.searching", companyId: "c1", key: "linkedin" },
    );

    expect(s.jobId).toBe("j1");
    expect(s.active.has("c1")).toBe(true);
    expect(s.cells.get("c1")?.get("revenue")).toEqual({ status: "searching" });

    s = apply(
      s,
      { type: "criterion.resolved", companyId: "c1", key: "revenue", label: "Revenue", outcome: "filled", value: "$1B+" },
      { type: "criterion.resolved", companyId: "c1", key: "linkedin", label: "LinkedIn", outcome: "not-found", value: null },
      { type: "company.done", companyId: "c1", status: "enriched", provider: "apollo" },
    );

    expect(s.cells.get("c1")?.get("revenue")).toEqual({ status: "resolved", outcome: "filled", value: "$1B+" });
    expect(s.cells.get("c1")?.get("linkedin")).toEqual({ status: "resolved", outcome: "not-found", value: null });
    expect(s.companyStatus.get("c1")).toBe("enriched");
    expect(s.active.has("c1")).toBe(false);
    expect(s.processed).toBe(1);
  });

  it("finalizes on done with a summary", () => {
    let s = enrichReducer(initialEnrichStreamState, { type: "start", total: 1 });
    s = apply(s, {
      type: "done",
      summary: { total: 1, enriched: 1, alreadyComplete: 0, noData: 0, failed: 0, durationMs: 1200 },
    });
    expect(s.isRunning).toBe(false);
    expect(s.terminated).toBe("done");
    expect(s.summary?.enriched).toBe(1);
  });

  it("collects soft errors without stopping the run", () => {
    let s = enrichReducer(initialEnrichStreamState, { type: "start", total: 2 });
    s = apply(s, { type: "error", companyId: "c9", message: "boom" });
    expect(s.errors).toEqual([{ companyId: "c9", message: "boom" }]);
    expect(s.isRunning).toBe(true);
  });

  it("clamps isRunning when the stream closes without a terminal done", () => {
    let s = enrichReducer(initialEnrichStreamState, { type: "start", total: 1 });
    s = enrichReducer(s, { type: "stream_closed" });
    expect(s.isRunning).toBe(false);
    expect(s.terminated).toBe("done");
  });

  it("preserves prior resolved cells across a new run", () => {
    let s = enrichReducer(initialEnrichStreamState, { type: "start", total: 1 });
    s = apply(s, { type: "criterion.resolved", companyId: "c1", key: "revenue", label: "Revenue", outcome: "filled", value: "$1B+" });
    // A second run (re-enrich a different subset) shouldn't blank c1.
    s = enrichReducer(s, { type: "start", total: 1 });
    expect(s.cells.get("c1")?.get("revenue")).toEqual({ status: "resolved", outcome: "filled", value: "$1B+" });
    expect(s.isRunning).toBe(true);
  });
});
