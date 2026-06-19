/**
 * Call sprint unit tests — the pure/validated layer:
 *  - readSprintAudience: targetFilter.audience shape gate (empty-both = null,
 *    never "match everyone");
 *  - sprintAudienceConditions: facets → SQL chunk presence;
 *  - resolvePersonaLabels: LLM output filtered VERBATIM against the
 *    vocabulary, canonical casing, fail-closed;
 *  - resolveSprintAudience: facet split orchestration, fail-closed paths.
 * The live SQL paths (counts, top-up filter) are covered by the
 * scripts/_verify-call-sprint.ts run against the real DB — mocked-SQL tests
 * can't catch operator/binding mistakes (jsonb lesson).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateMock = vi.fn();
const matchIndustriesMock = vi.fn();
const loadActiveIcpsMock = vi.fn();

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ companies: {}, contacts: {} }));
vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: (...a: unknown[]) => generateMock(...a),
}));
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: vi.fn(() => "anthropic-model") }));
vi.mock("@ai-sdk/openai", () => ({ openai: Object.assign(vi.fn(() => "openai-model"), { embedding: vi.fn() }) }));
vi.mock("@/lib/search/industry-match", () => ({
  matchIndustries: (...a: unknown[]) => matchIndustriesMock(...a),
}));
vi.mock("@/lib/icp/fit-recompute-core", () => ({
  loadActiveIcps: (...a: unknown[]) => loadActiveIcpsMock(...a),
}));

import {
  readSprintAudience,
  sprintAudienceConditions,
  resolvePersonaLabels,
  parseSprintFacets,
} from "@/lib/voice/call-sprint";

beforeEach(() => {
  generateMock.mockReset();
  matchIndustriesMock.mockReset();
  loadActiveIcpsMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-test";
});

describe("readSprintAudience", () => {
  it("accepts a valid audience and trims/dedupes values", () => {
    const a = readSprintAudience({
      audience: {
        label: " EMS romands ",
        industries: ["hospital & health care", "hospital & health care", " "],
        personas: ["CEO", 42, "CEO"],
      },
    });
    expect(a).toEqual({
      label: "EMS romands",
      industries: ["hospital & health care"],
      personas: ["CEO"],
    });
  });

  it("returns null when audience is absent, malformed, or empty on both facets", () => {
    expect(readSprintAudience(undefined)).toBeNull();
    expect(readSprintAudience({})).toBeNull();
    expect(readSprintAudience({ audience: "x" })).toBeNull();
    expect(readSprintAudience({ audience: { label: "x", industries: [], personas: [] } })).toBeNull();
    expect(readSprintAudience({ audience: { industries: [""], personas: [3] } })).toBeNull();
  });

  it("defaults the label when missing", () => {
    const a = readSprintAudience({ audience: { industries: ["banking"], personas: [] } });
    expect(a?.label).toBe("sprint");
  });

  it("parses the extended segment facets and trims/dedupes them", () => {
    const a = readSprintAudience({
      audience: {
        label: "fit + signals",
        industries: [],
        personas: [],
        signals: ["funding", "funding", " "],
        phoneType: ["mobile"],
        fitMin: 70,
        freshnessDays: 30,
        dealValueMin: 5000,
      },
    });
    expect(a).toEqual({
      label: "fit + signals",
      industries: [],
      personas: [],
      signals: ["funding"],
      phoneType: ["mobile"],
      fitMin: 70,
      freshnessDays: 30,
      dealValueMin: 5000,
    });
  });

  it("treats a facet-only segment (no industry/persona) as valid, not null", () => {
    expect(readSprintAudience({ audience: { fitMin: 80 } })?.fitMin).toBe(80);
    expect(readSprintAudience({ audience: { signals: ["hiring"] } })?.signals).toEqual(["hiring"]);
  });

  it("drops malformed numeric facets and stays null when every facet is empty/invalid", () => {
    expect(
      readSprintAudience({ audience: { fitMin: -3, freshnessDays: "x", dealValueMin: NaN } }),
    ).toBeNull();
  });

  it("omits extended facets from the shape when absent (sprint-only is unchanged)", () => {
    const a = readSprintAudience({ audience: { industries: ["banking"], personas: [] } });
    expect(a).toEqual({ label: "sprint", industries: ["banking"], personas: [] });
  });
});

describe("sprintAudienceConditions", () => {
  const base = { label: "s", industries: [] as string[], personas: [] as string[] };
  it("emits one condition per non-empty facet", () => {
    expect(sprintAudienceConditions({ ...base, industries: ["banking"] })).toHaveLength(1);
    expect(sprintAudienceConditions({ ...base, personas: ["CEO"] })).toHaveLength(1);
    expect(
      sprintAudienceConditions({ ...base, industries: ["banking"], personas: ["CEO"] }),
    ).toHaveLength(2);
    expect(sprintAudienceConditions(base)).toHaveLength(0);
  });

  it("emits a condition for each extended facet", () => {
    expect(sprintAudienceConditions({ ...base, signals: ["funding"] })).toHaveLength(1);
    expect(sprintAudienceConditions({ ...base, phoneType: ["mobile"] })).toHaveLength(1);
    expect(sprintAudienceConditions({ ...base, fitMin: 70 })).toHaveLength(1);
    expect(sprintAudienceConditions({ ...base, freshnessDays: 30 })).toHaveLength(1);
    expect(sprintAudienceConditions({ ...base, dealValueMin: 5000 })).toHaveLength(1);
  });

  it("combines base + extended facets additively", () => {
    expect(
      sprintAudienceConditions({
        ...base,
        industries: ["banking"],
        personas: ["CEO"],
        signals: ["funding"],
        fitMin: 70,
      }),
    ).toHaveLength(4);
  });
});

describe("resolvePersonaLabels (verbatim gate)", () => {
  const VOCAB = ["CEO", "Managing Director", "IT Director"];

  it("keeps only vocabulary labels, in canonical casing", async () => {
    generateMock.mockResolvedValue({
      object: { personas: ["ceo", "managing director", "Head of Magic", "IT DIRECTOR"] },
    });
    const out = await resolvePersonaLabels("les DG", VOCAB, "t1");
    expect(out).toEqual(["CEO", "Managing Director", "IT Director"]);
  });

  it("fails closed to [] on LLM error / empty vocab / empty query", async () => {
    generateMock.mockRejectedValue(new Error("down"));
    expect(await resolvePersonaLabels("les DG", VOCAB, "t1")).toEqual([]);
    expect(await resolvePersonaLabels("les DG", [], "t1")).toEqual([]);
    expect(await resolvePersonaLabels("  ", VOCAB, "t1")).toEqual([]);
  });
});

describe("parseSprintFacets", () => {
  it("returns trimmed facets and nulls empties", async () => {
    generateMock.mockResolvedValue({ object: { sectorQuery: " EMS ", personaQuery: "" } });
    expect(await parseSprintFacets("les DG des EMS", "t1")).toEqual({
      sectorQuery: "EMS",
      personaQuery: null,
    });
  });

  it("fails closed to null/null on error or empty phrase", async () => {
    generateMock.mockRejectedValue(new Error("down"));
    expect(await parseSprintFacets("x", "t1")).toEqual({ sectorQuery: null, personaQuery: null });
    expect(await parseSprintFacets("   ", "t1")).toEqual({ sectorQuery: null, personaQuery: null });
  });
});
