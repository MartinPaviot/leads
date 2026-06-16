/**
 * SprintAudience network facet — `readSprintAudience` parses it (a network-only
 * segment is valid, never "match everyone") and `sprintAudienceConditions`
 * wires it into the SQL builder. Mocks mirror call-sprint.test (db/schema/ai)
 * so the call-sprint module imports cleanly in a unit context.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ companies: {}, contacts: {} }));
vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateObject: vi.fn() }));
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: vi.fn(() => "anthropic-model") }));
vi.mock("@ai-sdk/openai", () => ({
  openai: Object.assign(vi.fn(() => "openai-model"), { embedding: vi.fn() }),
}));
vi.mock("@/lib/search/industry-match", () => ({ matchIndustries: vi.fn() }));
vi.mock("@/lib/icp/fit-recompute-core", () => ({ loadActiveIcps: vi.fn() }));

import { readSprintAudience, sprintAudienceConditions } from "@/lib/voice/call-sprint";

describe("SprintAudience network facet", () => {
  it("parses network:true, and a network-only segment is valid", () => {
    const a = readSprintAudience({ audience: { label: "My network", network: true } });
    expect(a).not.toBeNull();
    expect(a!.network).toBe(true);
  });

  it("treats network:false / absent as not-a-facet (empty audience -> null)", () => {
    expect(readSprintAudience({ audience: { network: false } })).toBeNull();
    expect(readSprintAudience({ audience: {} })).toBeNull();
  });

  it("adds exactly one SQL condition for the network facet", () => {
    const base = { label: "x", industries: [] as string[], personas: [] as string[] };
    const without = sprintAudienceConditions(base);
    const withNet = sprintAudienceConditions({ ...base, network: true });
    expect(withNet.length).toBe(without.length + 1);
  });
});
