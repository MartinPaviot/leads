/**
 * Title → persona resolver (_specs/title-persona-fit R2-R6).
 * Locks: vocabulary extraction, hash stability, cache semantics
 * (negative ≠ unresolved), LLM batching, verbatim validation, and the
 * fail-closed paths (no model / throw / missing echo).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: vi.fn(),
}));
vi.mock("@/lib/ai/ai-provider", () => ({
  anthropic: vi.fn(() => "anthropic-model"),
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "openai-model"),
}));

import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import {
  personaVocabulary,
  vocabHash,
  readCachedPersonas,
  resolveTitles,
  resolveTitlesConsensus,
  TITLE_RESOLVE_BATCH,
} from "@/lib/scoring/title-persona";
import type { ActiveIcp } from "@/lib/icp/fit-recompute-core";

const icp = (criteria: ActiveIcp["criteria"]): ActiveIcp => ({
  id: "i1",
  name: "I",
  priority: 1,
  criteria,
});
const titlesCriterion = (value: unknown) => ({
  id: "c1",
  fieldKey: "person_titles",
  operator: "in" as const,
  value,
  weight: 1,
  isRequired: false,
});

describe("personaVocabulary", () => {
  it("collects person_titles values across ICPs, norm-deduped, casing kept", () => {
    const vocab = personaVocabulary([
      icp([titlesCriterion(["CEO", "Head of HR"])]),
      icp([
        titlesCriterion(["ceo", "CFO"]),
        { id: "x", fieldKey: "industry", operator: "eq", value: "software", weight: 1, isRequired: false },
      ]),
    ]);
    expect(vocab).toEqual(["CEO", "Head of HR", "CFO"]);
  });

  it("is empty when no ICP defines person titles (dormant tenant)", () => {
    expect(personaVocabulary([icp([])])).toEqual([]);
  });
});

describe("vocabHash", () => {
  it("ignores order and casing, reacts to membership", () => {
    const a = vocabHash(["CEO", "CFO"]);
    expect(vocabHash(["cfo", "ceo"])).toBe(a);
    expect(vocabHash(["CEO", "CFO", "Head of HR"])).not.toBe(a);
  });
});

describe("readCachedPersonas", () => {
  it("returns the cached personas only for the current hash", () => {
    const props = { title_personas: { h: "abc", p: ["CEO"] } };
    expect(readCachedPersonas(props, "abc")).toEqual(["CEO"]);
    expect(readCachedPersonas(props, "other")).toBeNull();
  });

  it("treats [] as a valid negative and malformed shapes as null", () => {
    expect(readCachedPersonas({ title_personas: { h: "h", p: [] } }, "h")).toEqual([]);
    expect(readCachedPersonas({ title_personas: { h: "h", p: "CEO" } }, "h")).toBeNull();
    expect(readCachedPersonas({}, "h")).toBeNull();
    expect(readCachedPersonas(null, "h")).toBeNull();
  });
});

describe("resolveTitles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps titles and validates output verbatim against the vocabulary", async () => {
    vi.mocked(tracedGenerateObject).mockResolvedValue({
      object: {
        mappings: [
          // casing/separator drift on both sides + a hallucinated label
          { title: "directeur general", personas: ["ceo", "Chief Twitter Officer"] },
          // a valid negative: evaluated, matches nothing
          { title: "Stagiaire RH", personas: [] },
          // a title we never asked about
          { title: "Astronaut", personas: ["ceo"] },
        ],
      },
    } as never);

    const out = await resolveTitles(
      ["Directeur Général", "Stagiaire RH"],
      ["CEO", "Head of HR"],
      "t1",
    );
    // "ceo" validates against vocabulary member "CEO" through norm()
    expect(out.get("directeur general")).toEqual(["CEO"]);
    expect(out.get("stagiaire rh")).toEqual([]);
    expect(out.has("astronaut")).toBe(false);
    expect(tracedGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("a title the model fails to echo stays UNRESOLVED (not negative)", async () => {
    vi.mocked(tracedGenerateObject).mockResolvedValue({
      object: { mappings: [{ title: "CEO adjoint", personas: ["CEO"] }] },
    } as never);
    const out = await resolveTitles(["CEO adjoint", "Forgotten Title"], ["CEO"], "t1");
    expect(out.get("ceo adjoint")).toEqual(["CEO"]);
    expect(out.has("forgotten title")).toBe(false);
  });

  it("batches at TITLE_RESOLVE_BATCH and dedupes norm-equal titles", async () => {
    vi.mocked(tracedGenerateObject).mockResolvedValue({
      object: { mappings: [] },
    } as never);
    const many = Array.from({ length: TITLE_RESOLVE_BATCH * 2 + 1 }, (_, i) => `Title ${i}`);
    await resolveTitles([...many, "title 0", "TITLE 0"], ["CEO"], "t1");
    expect(tracedGenerateObject).toHaveBeenCalledTimes(3); // 101 deduped → 50+50+1
  });

  it("fail-closed: no model configured → empty map, zero calls", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const out = await resolveTitles(["CEO"], ["CEO"], "t1");
    expect(out.size).toBe(0);
    expect(tracedGenerateObject).not.toHaveBeenCalled();
  });

  it("fail-closed: a throwing batch resolves nothing but later batches still try", async () => {
    vi.mocked(tracedGenerateObject)
      .mockRejectedValueOnce(new Error("model down"))
      .mockResolvedValueOnce({
        object: { mappings: [{ title: `Title ${TITLE_RESOLVE_BATCH}`, personas: [] }] },
      } as never);
    const many = Array.from({ length: TITLE_RESOLVE_BATCH + 1 }, (_, i) => `Title ${i}`);
    const out = await resolveTitles(many, ["CEO"], "t1");
    expect(out.size).toBe(1);
    expect(out.get(`title ${TITLE_RESOLVE_BATCH}`)).toEqual([]);
  });

  it("no vocabulary or no titles → no calls", async () => {
    expect((await resolveTitles([], ["CEO"], "t1")).size).toBe(0);
    expect((await resolveTitles(["CEO"], [], "t1")).size).toBe(0);
    expect(tracedGenerateObject).not.toHaveBeenCalled();
  });
});

describe("resolveTitlesConsensus (destructive flows)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("majority personas kept, flicker dropped, splits stay unresolved", async () => {
    vi.mocked(tracedGenerateObject)
      .mockResolvedValueOnce({
        object: {
          mappings: [
            { title: "DG", personas: ["CEO"] },
            { title: "Flaky", personas: ["CEO"] },
            { title: "Junk", personas: [] },
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          mappings: [
            { title: "DG", personas: ["CEO"] },
            // Flaky not echoed this pass
            { title: "Junk", personas: [] },
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        object: {
          mappings: [
            { title: "DG", personas: ["CEO", "Owner"] }, // Owner only 1/3
            { title: "Flaky", personas: [] },
            { title: "Junk", personas: [] },
          ],
        },
      } as never);

    const out = await resolveTitlesConsensus(
      ["DG", "Flaky", "Junk", "Ghost"],
      ["CEO", "Owner"],
      "t1",
    );

    expect(tracedGenerateObject).toHaveBeenCalledTimes(3);
    expect(out.get("dg")).toEqual(["CEO"]); // 3/3; Owner 1/3 dropped
    expect(out.get("junk")).toEqual([]); // explicit empty 3/3 → confirmed negative
    expect(out.has("flaky")).toBe(false); // 1×CEO / 1×[] split → do not touch
    expect(out.has("ghost")).toBe(false); // never echoed → unresolved
  });

  it("a title answered by fewer than the majority of passes stays unresolved", async () => {
    vi.mocked(tracedGenerateObject)
      .mockResolvedValueOnce({ object: { mappings: [{ title: "Rare", personas: ["CEO"] }] } } as never)
      .mockResolvedValueOnce({ object: { mappings: [] } } as never)
      .mockResolvedValueOnce({ object: { mappings: [] } } as never);

    const out = await resolveTitlesConsensus(["Rare"], ["CEO"], "t1");
    expect(out.has("rare")).toBe(false);
  });
});
