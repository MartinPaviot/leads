import { describe, it, expect, vi } from "vitest";
import { computeFrequencies, type SampleAccount } from "../frequency";
import { deriveLookalike, type DeriveDeps, type DraftIcp, type WeightingAgentResult } from "../derive";

const sample: SampleAccount[] = [
  { domain: "a.fr", fields: { industry: "Software", country: "FR" } },
  { domain: "b.fr", fields: { industry: "Software", country: "FR" } },
  { domain: "c.fr", fields: { industry: "Software", country: "FR" } },
  { domain: "d.fr", fields: { industry: "Finance", country: "FR" } },
];

describe("computeFrequencies (AC1/AC2)", () => {
  it("computes coverage per attribute value and applies the floor", () => {
    const f = computeFrequencies(sample, ["industry", "country"], 0.3);
    const fr = f.find((x) => x.fieldKey === "country");
    expect(fr).toMatchObject({ value: "fr", count: 4, sampleSize: 4, coverage: 1 });
    const sw = f.find((x) => x.fieldKey === "industry" && x.value === "software");
    expect(sw?.coverage).toBe(0.75);
    expect(f.find((x) => x.value === "finance")).toBeUndefined(); // 0.25 < floor
    expect(f[0].coverage).toBe(1); // sorted by coverage desc
  });
});

function deps(over: Partial<DeriveDeps> & { agent: WeightingAgentResult; saveDraft?: (d: DraftIcp) => Promise<void> }): DeriveDeps {
  return {
    tenantId: "t1",
    runAgent: vi.fn(async () => over.agent),
    saveDraft: over.saveDraft,
    fields: ["industry", "country"],
    minCoverage: 0.3,
  };
}

describe("deriveLookalike (AC3/AC4/AC5)", () => {
  it("weights measured attributes, drops invented ones, carries evidence", async () => {
    const saveDraft = vi.fn(async () => {});
    const d = deps({
      agent: { evalPassed: true, value: { selected: [
        { fieldKey: "industry", value: "software", weight: 8 },
        { fieldKey: "country", value: "fr", weight: 5 },
        { fieldKey: "vibe", value: "cool", weight: 9 }, // invented — not in the frequency table
      ] } },
      saveDraft,
    });
    const out = await deriveLookalike(sample.map((s) => ({ domain: s.domain, fields: s.fields })), d);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.draft.criteria.map((c) => c.fieldKey).sort()).toEqual(["country", "industry"]); // vibe dropped (AC3)
      const ind = out.draft.criteria.find((c) => c.fieldKey === "industry")!;
      expect(ind.weight).toBe(8);
      expect(ind.evidence.coverage).toBe(0.75); // AC2/AC5 traceable
      expect(out.draft.status).toBe("draft"); // AC4 never active
    }
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it("enriches via the injected spec-08 when fields are absent (AC1)", async () => {
    const enrich = vi.fn(async (domain: string) => ({ industry: "Software", country: "FR", _d: domain }));
    const d: DeriveDeps = { ...deps({ agent: { evalPassed: true, value: { selected: [{ fieldKey: "industry", value: "software", weight: 7 }] } } }), enrich };
    const out = await deriveLookalike([{ domain: "x.fr" }, { domain: "y.fr" }, { domain: "z.fr" }], d);
    expect(enrich).toHaveBeenCalledTimes(3);
    expect(out.ok).toBe(true);
  });

  it("yields no draft when the agent eval fails (AC5)", async () => {
    const out = await deriveLookalike(sample.map((s) => ({ domain: s.domain, fields: s.fields })), deps({ agent: { evalPassed: false, reason: "weighted an unmeasured attribute" } }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("unmeasured");
  });

  it("rejects an empty sample", async () => {
    expect((await deriveLookalike([], deps({ agent: { evalPassed: true, value: { selected: [] } } }))).ok).toBe(false);
  });
});
