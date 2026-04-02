import { describe, it, expect } from "vitest";
import {
  formatFieldValue,
  getCustomFieldValue,
  setCustomFieldValue,
  getBuiltInFields,
} from "@/lib/custom-fields";

describe("formatFieldValue", () => {
  it("returns — for null/undefined", () => {
    expect(formatFieldValue(null, "text")).toBe("—");
    expect(formatFieldValue(undefined, "text")).toBe("—");
    expect(formatFieldValue("", "text")).toBe("—");
  });

  it("formats text values", () => {
    expect(formatFieldValue("hello", "text")).toBe("hello");
  });

  it("formats date values", () => {
    const result = formatFieldValue("2026-04-01", "date");
    expect(result).toBeTruthy();
    expect(result).not.toBe("—");
  });

  it("formats number values", () => {
    const formatted = formatFieldValue(1234567, "number");
    // Locale-dependent separator (comma in en-US, narrow no-break space in fr-FR)
    expect(formatted).toContain("1");
    expect(formatted).toContain("234");
    expect(formatted).toContain("567");
    expect(formatFieldValue("42", "number")).toBe("42");
  });

  it("formats multi_select values", () => {
    expect(formatFieldValue(["Seed", "Series A"], "multi_select")).toBe("Seed, Series A");
  });

  it("formats url values", () => {
    expect(formatFieldValue("https://example.com", "url")).toBe("https://example.com");
  });

  it("formats social_handle values", () => {
    expect(formatFieldValue("elonmusk", "social_handle")).toBe("@elonmusk");
    expect(formatFieldValue("@elonmusk", "social_handle")).toBe("@elonmusk");
  });
});

describe("getCustomFieldValue", () => {
  it("returns undefined for null properties", () => {
    expect(getCustomFieldValue(null, "field1")).toBeUndefined();
    expect(getCustomFieldValue(undefined, "field1")).toBeUndefined();
  });

  it("returns undefined when no customFields key", () => {
    expect(getCustomFieldValue({}, "field1")).toBeUndefined();
  });

  it("returns value from customFields", () => {
    const props = { customFields: { field1: "hello" } };
    expect(getCustomFieldValue(props, "field1")).toBe("hello");
  });

  it("returns undefined for missing field", () => {
    const props = { customFields: { field1: "hello" } };
    expect(getCustomFieldValue(props, "field2")).toBeUndefined();
  });
});

describe("setCustomFieldValue", () => {
  it("creates customFields key if missing", () => {
    const result = setCustomFieldValue(null, "field1", "hello");
    expect(result.customFields).toEqual({ field1: "hello" });
  });

  it("preserves existing properties", () => {
    const result = setCustomFieldValue({ existing: true }, "field1", "hello");
    expect(result.existing).toBe(true);
    expect((result.customFields as Record<string, unknown>).field1).toBe("hello");
  });

  it("preserves existing custom fields", () => {
    const result = setCustomFieldValue(
      { customFields: { field1: "a" } },
      "field2",
      "b"
    );
    const cf = result.customFields as Record<string, unknown>;
    expect(cf.field1).toBe("a");
    expect(cf.field2).toBe("b");
  });

  it("overwrites existing value", () => {
    const result = setCustomFieldValue(
      { customFields: { field1: "old" } },
      "field1",
      "new"
    );
    expect((result.customFields as Record<string, unknown>).field1).toBe("new");
  });
});

describe("getBuiltInFields", () => {
  it("returns company fields", () => {
    const fields = getBuiltInFields("company");
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.find((f) => f.name === "Name")).toBeTruthy();
    expect(fields.find((f) => f.name === "Domain")).toBeTruthy();
    expect(fields.find((f) => f.name === "Industry")).toBeTruthy();
  });

  it("returns contact fields", () => {
    const fields = getBuiltInFields("contact");
    expect(fields.find((f) => f.name === "Email")).toBeTruthy();
    expect(fields.find((f) => f.name === "First Name")).toBeTruthy();
  });

  it("returns deal fields", () => {
    const fields = getBuiltInFields("deal");
    expect(fields.find((f) => f.name === "Stage")).toBeTruthy();
    expect(fields.find((f) => f.name === "Value")).toBeTruthy();
  });
});
