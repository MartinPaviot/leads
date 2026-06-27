import { describe, expect, it } from "vitest";
import { upsertMonitorSignal } from "../signal-monitor";

describe("upsertMonitorSignal — dedup-by-type on persist", () => {
  const funding = { type: "funding_recent", confidence: "high", detail: "Series A", detectedAt: "2026-06-01T00:00:00Z", isNew: true };

  it("appends a brand-new type", () => {
    const out = upsertMonitorSignal([], funding);
    expect(out).toEqual([funding]);
  });

  it("REPLACES a prior entry of the same type instead of appending a duplicate", () => {
    const stale = { type: "funding_recent", confidence: "high", detail: "old raise", detectedAt: "2026-01-01T00:00:00Z", isNew: true };
    const fresher = { ...funding, detail: "Series B", detectedAt: "2026-06-27T00:00:00Z" };
    const out = upsertMonitorSignal([stale], fresher);
    // Exactly one funding_recent — the fresh one — never two.
    expect(out.filter((s) => s.type === "funding_recent")).toHaveLength(1);
    expect(out[0]).toEqual(fresher);
  });

  it("preserves other-type entries and appends the new one last (order-stable)", () => {
    const hiring = { type: "hiring_surge", confidence: "high", detail: "5 roles", detectedAt: "2026-06-10T00:00:00Z", isNew: true };
    const out = upsertMonitorSignal([hiring], funding);
    expect(out).toEqual([hiring, funding]);
  });

  it("keeps the richer monitor fields (detail/confidence/isNew) downstream consumers read", () => {
    const out = upsertMonitorSignal([], funding);
    expect(out[0]).toMatchObject({ detail: "Series A", confidence: "high", isNew: true });
  });
});
