import { describe, it, expect } from "vitest";
import { isReplaceableTool, pickReplaceableTools } from "@/lib/tech-detect/replaceable";

describe("isReplaceableTool", () => {
  it("matches catalog tools across provider spellings", () => {
    expect(isReplaceableTool("Microsoft Office 365")).toBe(true); // catalog: Microsoft 365
    expect(isReplaceableTool("WordPress.org")).toBe(true);
    expect(isReplaceableTool("Salesforce")).toBe(true);
    expect(isReplaceableTool("Wix")).toBe(true);
  });

  it("rejects analytics / CDN / infra and unknown junk", () => {
    expect(isReplaceableTool("Google Tag Manager")).toBe(false); // catalog: replaceable=false
    expect(isReplaceableTool("Google Analytics")).toBe(false);
    expect(isReplaceableTool("Cloudflare")).toBe(false);
    expect(isReplaceableTool("AI")).toBe(false); // too short / not a tool
    expect(isReplaceableTool("Mobile Friendly")).toBe(false);
    expect(isReplaceableTool("Apache")).toBe(false); // not in catalog
  });
});

describe("pickReplaceableTools", () => {
  it("filters a real Apollo-style stack down to the actual lever", () => {
    expect(
      pickReplaceableTools(["AI", "Apache", "Google Tag Manager", "Microsoft Office 365", "Mobile Friendly", "reCAPTCHA"]),
    ).toEqual(["Microsoft Office 365"]);
  });

  it("preserves input order and dedupes", () => {
    expect(pickReplaceableTools(["WordPress.org", "Salesforce", "wordpress.org", "Zendesk"])).toEqual([
      "WordPress.org",
      "Salesforce",
      "Zendesk",
    ]);
  });

  it("handles empty / null input", () => {
    expect(pickReplaceableTools(null)).toEqual([]);
    expect(pickReplaceableTools([])).toEqual([]);
    expect(pickReplaceableTools(["", "  "])).toEqual([]);
  });
});
