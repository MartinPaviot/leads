import { describe, it, expect } from "vitest";
import { interpolateTemplate, parseRecipients } from "@/lib/inbox/template-vars";

describe("interpolateTemplate (INBOX-C06)", () => {
  it("fills supplied variables", () => {
    const r = interpolateTemplate("Hi {{firstName}}, re {{company}}", { firstName: "Anna", company: "Pilae" });
    expect(r.text).toBe("Hi Anna, re Pilae");
    expect(r.missing).toEqual([]);
  });

  it("blanks and reports missing variables (never ships a literal placeholder)", () => {
    const r = interpolateTemplate("Hi {{firstName}} at {{company}}", { firstName: "Anna" });
    expect(r.text).toBe("Hi Anna at ");
    expect(r.missing).toEqual(["company"]);
  });

  it("dedupes a repeated missing variable", () => {
    expect(interpolateTemplate("{{x}} {{x}}", {}).missing).toEqual(["x"]);
  });
});

describe("parseRecipients (INBOX-C06)", () => {
  it("splits, validates, dedupes, and extracts addresses from display-name form", () => {
    const r = parseRecipients("a@b.co, Bob <bob@b.co>; a@b.co, nonsense");
    expect(r.valid).toEqual(["a@b.co", "bob@b.co"]);
    expect(r.invalid).toEqual(["nonsense"]);
  });

  it("returns empty for empty input", () => {
    expect(parseRecipients("")).toEqual({ valid: [], invalid: [] });
  });
});
