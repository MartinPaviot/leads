import { describe, it, expect, vi, beforeEach } from "vitest";

const upsertMonitor = vi.fn();
const listMonitors = vi.fn();
const resolveMonitorRef = vi.fn();
const setMonitorStatus = vi.fn();
const deleteMonitor = vi.fn();
vi.mock("@/lib/linkedin/search-monitors-db", () => ({
  upsertMonitor: (...a: unknown[]) => upsertMonitor(...a),
  listMonitors: (...a: unknown[]) => listMonitors(...a),
  resolveMonitorRef: (...a: unknown[]) => resolveMonitorRef(...a),
  setMonitorStatus: (...a: unknown[]) => setMonitorStatus(...a),
  deleteMonitor: (...a: unknown[]) => deleteMonitor(...a),
}));

import { buildSearchMonitorTools } from "../search-monitors";

const ctx = { tenantId: "t1", userId: "u1" } as never;
const run = (name: string, input: unknown) => (buildSearchMonitorTools(ctx)[name as keyof ReturnType<typeof buildSearchMonitorTools>] as never as { execute: (i: unknown) => Promise<Record<string, unknown>> }).execute(input);

beforeEach(() => {
  vi.clearAllMocks();
  upsertMonitor.mockResolvedValue({ id: "m1", label: "Hiring RevOps", category: "jobs", status: "active", maxPerRun: 100 });
  listMonitors.mockResolvedValue([{ id: "m1", label: "Hiring RevOps", category: "jobs", status: "active", maxPerRun: 100, lastRunAt: null, lastRunSummary: null }]);
  resolveMonitorRef.mockResolvedValue({ id: "m1", label: "Hiring RevOps" });
});

describe("createSearchMonitor", () => {
  it("stores the sourcing criteria (category + filters), separate from label/maxPerRun", async () => {
    const r = await run("createSearchMonitor", {
      label: "Hiring RevOps",
      maxPerRun: 50,
      category: "jobs",
      titles: ["Head of RevOps"],
      locations: ["France"],
    });
    expect(r).toMatchObject({ ok: true, id: "m1", label: "Hiring RevOps" });
    const [tenantId, userId, payload] = upsertMonitor.mock.calls[0];
    expect(tenantId).toBe("t1");
    expect(userId).toBe("u1");
    expect(payload.label).toBe("Hiring RevOps");
    expect(payload.maxPerRun).toBe(50);
    // criteria carries the search shape, NOT label/maxPerRun
    expect(payload.criteria).toMatchObject({ category: "jobs", titles: ["Head of RevOps"], locations: ["France"] });
    expect(payload.criteria.label).toBeUndefined();
    expect(payload.criteria.maxPerRun).toBeUndefined();
  });
});

describe("listSearchMonitors", () => {
  it("returns the monitors with status + last run", async () => {
    const r = await run("listSearchMonitors", {});
    expect(r.monitors).toHaveLength(1);
    expect((r.monitors as unknown[])[0]).toMatchObject({ id: "m1", label: "Hiring RevOps", status: "active" });
  });
});

describe("setSearchMonitorStatus / deleteSearchMonitor", () => {
  it("pauses a monitor resolved by label", async () => {
    const r = await run("setSearchMonitorStatus", { label: "Hiring RevOps", status: "paused" });
    expect(r).toMatchObject({ ok: true, id: "m1", status: "paused" });
    expect(setMonitorStatus).toHaveBeenCalledWith("t1", "m1", "paused");
  });
  it("errors when the monitor is missing", async () => {
    resolveMonitorRef.mockResolvedValue(null);
    expect(await run("deleteSearchMonitor", { label: "nope" })).toMatchObject({ error: expect.stringContaining("not found") });
    expect(deleteMonitor).not.toHaveBeenCalled();
  });
  it("deletes a monitor", async () => {
    const r = await run("deleteSearchMonitor", { monitorId: "m1" });
    expect(r).toMatchObject({ ok: true, deleted: "Hiring RevOps" });
    expect(deleteMonitor).toHaveBeenCalledWith("t1", "m1");
  });
});
