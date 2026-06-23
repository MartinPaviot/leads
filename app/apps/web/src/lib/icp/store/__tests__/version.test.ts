import { describe, it, expect, vi } from "vitest";
import { saveIcpVersion, getActiveIcp, nextVersionNumber, InMemoryIcpVersionStore, type IcpCriterionSnapshot } from "../version";
import { createIcpFromDescription, markOperability, type NlToIcpDeps, type NlIcpAgentResult } from "../../nl/nl-to-icp";

const crit = (fieldKey: string, over: Partial<IcpCriterionSnapshot> = {}): IcpCriterionSnapshot =>
  ({ fieldKey, operator: "equals", value: "x", weight: 1, ...over });

describe("ICP versioning (AC1)", () => {
  it("creates a new version on edit and retains prior versions", async () => {
    const store = new InMemoryIcpVersionStore();
    const v1 = await saveIcpVersion("t1", "icp1", "v1", [crit("industry")], store);
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("active");

    const v2 = await saveIcpVersion("t1", "icp1", "v2", [crit("industry"), crit("size")], store);
    expect(v2.version).toBe(2);

    const active = await getActiveIcp("t1", "icp1", store);
    expect(active?.version).toBe(2); // latest is active
    const history = await store.history("t1", "icp1");
    expect(history.map((h) => h.version)).toEqual([1, 2]); // prior retained
    expect(history.find((h) => h.version === 1)?.status).toBe("superseded"); // prior immutable + superseded
  });

  it("nextVersionNumber increments from the latest", () => {
    expect(nextVersionNumber(null)).toBe(1);
    expect(nextVersionNumber({ icpId: "i", version: 3, name: "x", criteria: [], status: "active" })).toBe(4);
  });

  it("carries exclusion criteria in the snapshot (AC4)", async () => {
    const store = new InMemoryIcpVersionStore();
    const v = await saveIcpVersion("t1", "icp2", "neg", [crit("industry", { isExclusion: true })], store);
    expect(v.criteria[0].isExclusion).toBe(true);
  });
});

describe("markOperability (AC3)", () => {
  it("flags non-operable criteria + warns", () => {
    const isOperable = (f: string) => f !== "vibe";
    const { criteria, warnings } = markOperability([crit("industry"), crit("vibe")], isOperable);
    expect(criteria.find((c) => c.fieldKey === "industry")?.operable).toBe(true);
    expect(criteria.find((c) => c.fieldKey === "vibe")?.operable).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("vibe");
  });
});

describe("createIcpFromDescription (AC2/AC5)", () => {
  function deps(result: NlIcpAgentResult): NlToIcpDeps {
    return { tenantId: "t1", runAgent: vi.fn(async () => result), isOperable: (f) => f !== "vibe" };
  }
  it("returns a draft (never active) with non-operable warnings", async () => {
    const out = await createIcpFromDescription("french fintech 50-200 employees", deps({ evalPassed: true, value: { name: "Fintech FR", criteria: [crit("industry"), crit("vibe")] } }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.draft.status).toBe("draft");
      expect(out.draft.warnings).toHaveLength(1);
    }
  });
  it("yields no draft when the agent eval fails (AC5)", async () => {
    const out = await createIcpFromDescription("x", deps({ evalPassed: false, reason: "proposed a non-operable field" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("non-operable");
  });
});
