import { describe, it, expect } from "vitest";
import {
  validateConfirmedMap,
  normalizeToken,
  findAnchorOffset,
  isKnownDataKey,
  type Component,
  type ComponentMap,
} from "../component-map";

function comp(overrides: Partial<Component> = {}): Component {
  return {
    id: crypto.randomUUID(),
    kind: "section",
    label: "Executive Summary",
    placeholderToken: "{{executive_summary}}",
    dataKey: null,
    anchor: { headingText: null, offset: null },
    required: true,
    confidence: "high",
    order: 0,
    ...overrides,
  };
}

function mapOf(components: Component[]): ComponentMap {
  return { version: 1, components };
}

describe("validateConfirmedMap", () => {
  it("accepts a complete map (section + bound field)", () => {
    const res = validateConfirmedMap(
      mapOf([
        comp({ kind: "section", label: "Scope", dataKey: null }),
        comp({ kind: "field", label: "Client", dataKey: "company.name", order: 1 }),
      ]),
    );
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("rejects an empty map", () => {
    const res = validateConfirmedMap(mapOf([]));
    expect(res.ok).toBe(false);
    expect(res.errors).toContainEqual({ componentId: null, error: "empty_map" });
  });

  it("flags a component with a blank label", () => {
    const c = comp({ label: "   " });
    const res = validateConfirmedMap(mapOf([c]));
    expect(res.ok).toBe(false);
    expect(res.errors).toContainEqual({ componentId: c.id, error: "missing_label" });
  });

  it("flags a field with an unknown dataKey", () => {
    const c = comp({ kind: "field", label: "Mystery", dataKey: "not.a.real.key" });
    const res = validateConfirmedMap(mapOf([c]));
    expect(res.ok).toBe(false);
    expect(res.errors).toContainEqual({
      componentId: c.id,
      error: "field_missing_or_unknown_dataKey",
    });
  });

  it("flags a field with a null dataKey", () => {
    const c = comp({ kind: "field", label: "Amount", dataKey: null });
    const res = validateConfirmedMap(mapOf([c]));
    expect(res.ok).toBe(false);
    expect(res.errors).toContainEqual({
      componentId: c.id,
      error: "field_missing_or_unknown_dataKey",
    });
  });

  it("rejects a structurally invalid map", () => {
    const res = validateConfirmedMap({ version: 2, components: "nope" });
    expect(res.ok).toBe(false);
    expect(res.errors).toEqual([{ componentId: null, error: "invalid_map_shape" }]);
  });
});

describe("normalizeToken", () => {
  it("converts a label-ish token to snake_case in double braces", () => {
    expect(normalizeToken("Executive Summary", "x")).toBe("{{executive_summary}}");
  });
  it("preserves an already-tokenized value", () => {
    expect(normalizeToken("{{client_name}}", "x")).toBe("{{client_name}}");
  });
  it("falls back to the label when the token is empty", () => {
    expect(normalizeToken("", "About Us")).toBe("{{about_us}}");
  });
});

describe("findAnchorOffset", () => {
  const outline = [
    { text: "Intro", offset: 0 },
    { text: "Pricing", offset: 42 },
  ];
  const text = "Intro\n...\nPricing\n...";

  it("returns the outline offset when the heading matches", () => {
    expect(findAnchorOffset(outline, text, "Pricing")).toBe(42);
  });
  it("falls back to indexOf when not in the outline", () => {
    expect(findAnchorOffset([], text, "Pricing")).toBe(text.indexOf("Pricing"));
  });
  it("returns null for a null heading or a miss", () => {
    expect(findAnchorOffset(outline, text, null)).toBeNull();
    expect(findAnchorOffset(outline, text, "Absent")).toBeNull();
  });
});

describe("isKnownDataKey", () => {
  it("recognizes vocabulary keys and rejects others", () => {
    expect(isKnownDataKey("company.name")).toBe(true);
    expect(isKnownDataKey("deal.amount")).toBe(true);
    expect(isKnownDataKey("not.a.key")).toBe(false);
    expect(isKnownDataKey(null)).toBe(false);
  });
});
