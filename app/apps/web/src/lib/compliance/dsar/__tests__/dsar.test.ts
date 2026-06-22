import { describe, it, expect, vi } from "vitest";
import {
  exportSubject,
  eraseSubject,
  checkResurrection,
  type DsarStores,
  type ExportDeps,
  type EraseDeps,
  type EraseReport,
} from "../index";

const stores = (over: Partial<DsarStores> = {}): DsarStores => ({
  readCanonical: async () => ({ id: "p1", name: "Jane", email: "jane@acme.com" }),
  readProvenance: async () => [{ field: "email", source: "apollo" }],
  readActivity: async () => [{ type: "email_sent" }],
  readCrm: async () => ({ hubspotId: "hs-1" }),
  ...over,
});

describe("exportSubject — AC1", () => {
  it("compiles canonical + provenance + activity + CRM", async () => {
    const deps: ExportDeps = { stores: stores(), now: () => 1000 };
    const e = await exportSubject("p1", deps);
    expect(e).toMatchObject({ personId: "p1", compiledAt: 1000, empty: false });
    expect(e.canonical).toMatchObject({ email: "jane@acme.com" });
    expect(e.provenance).toHaveLength(1);
    expect(e.crm).toMatchObject({ hubspotId: "hs-1" });
  });

  it("marks an export empty when no data is held", async () => {
    const empty = stores({ readCanonical: async () => null, readProvenance: async () => [], readActivity: async () => [], readCrm: async () => null });
    expect((await exportSubject("p1", { stores: empty })).empty).toBe(true);
  });
});

function eraseDeps(over: Partial<EraseDeps> = {}) {
  const calls = { eraseCanonical: 0, addSuppression: 0, setDnr: 0, crm: 0 };
  let dnr = false;
  const audits: EraseReport[] = [];
  const deps: EraseDeps = {
    eraseCanonical: async () => void calls.eraseCanonical++,
    eraseCaches: async () => ["apollo_cache", "enrichment_cache"],
    propagateCrm: async () => { calls.crm++; return true; },
    addSuppression: async () => void calls.addSuppression++,
    setDoNotResurrect: async () => { calls.setDnr++; dnr = true; },
    hasDoNotResurrect: async () => dnr,
    findResidual: async () => [],
    audit: (e) => void audits.push(e),
    now: () => 5000,
    requestedAt: 4000,
    ...over,
  };
  return { deps, calls, audits, setDnr: (v: boolean) => { dnr = v; } };
}

describe("eraseSubject — AC2 erase across stores", () => {
  it("erases canonical, clears caches, propagates to CRM, suppresses, sets DNR", async () => {
    const { deps, calls } = eraseDeps();
    const r = await eraseSubject("p1", deps);
    expect(calls.eraseCanonical).toBe(1);
    expect(r.erasedCaches).toEqual(["apollo_cache", "enrichment_cache"]);
    expect(r.crmPropagated).toBe(true);
    expect(calls.addSuppression).toBe(1);
    expect(r.doNotResurrect).toBe(true);
    expect(calls.setDnr).toBe(1);
  });
});

describe("eraseSubject — AC5 verification + idempotency", () => {
  it("verifies clean when no residual remains", async () => {
    const { deps } = eraseDeps();
    const r = await eraseSubject("p1", deps);
    expect(r.verified).toBe(true);
    expect(r.residual).toEqual([]);
  });

  it("reports residual personal data when verification finds some", async () => {
    const { deps } = eraseDeps({ findResidual: async () => ["activity.email_open"] });
    const r = await eraseSubject("p1", deps);
    expect(r.verified).toBe(false);
    expect(r.residual).toEqual(["activity.email_open"]);
  });

  it("a re-run on an already-erased subject is an idempotent no-op (still verifies clean)", async () => {
    const { deps } = eraseDeps();
    await eraseSubject("p1", deps); // first sets DNR
    const second = await eraseSubject("p1", deps);
    expect(second.idempotentNoop).toBe(true);
    expect(second.verified).toBe(true);
  });
});

describe("eraseSubject — AC3 window + audit", () => {
  it("flags within-window and audits the report", async () => {
    const { deps, audits } = eraseDeps({ requestedAt: 4000, windowMs: 2000, now: () => 5000 });
    const r = await eraseSubject("p1", deps);
    expect(r.withinWindow).toBe(true); // 1000ms <= 2000ms
    expect(audits).toHaveLength(1);
  });
  it("flags out-of-window when the erase exceeds the legal window", async () => {
    const { deps } = eraseDeps({ requestedAt: 0, windowMs: 1000, now: () => 5000 });
    expect((await eraseSubject("p1", deps)).withinWindow).toBe(false);
  });
});

describe("checkResurrection — AC4 do-not-resurrect", () => {
  it("re-suppresses an erased person re-sourced from a provider", async () => {
    const addSuppression = vi.fn(async () => {});
    const decision = await checkResurrection("p1", { hasDoNotResurrect: async () => true, addSuppression });
    expect(decision).toBe("re_suppressed");
    expect(addSuppression).toHaveBeenCalledWith("p1");
  });
  it("allows a person with no do-not-resurrect marker", async () => {
    const addSuppression = vi.fn(async () => {});
    expect(await checkResurrection("p2", { hasDoNotResurrect: async () => false, addSuppression })).toBe("allowed");
    expect(addSuppression).not.toHaveBeenCalled();
  });
});
