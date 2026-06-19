import { describe, it, expect } from "vitest";
import { normalizeLabel, sameLabel, dedupeLabels, labelHue } from "@/lib/inbox/labels";

describe("normalizeLabel (INBOX-X04)", () => {
  it("trims, collapses whitespace, caps", () => {
    expect(normalizeLabel("  Needs   founder reply ")).toBe("Needs founder reply");
    expect(normalizeLabel("x".repeat(60))!.length).toBe(40);
  });
  it("nulls empty / non-string", () => {
    expect(normalizeLabel("   ")).toBeNull();
    expect(normalizeLabel(null)).toBeNull();
  });
});

describe("sameLabel / dedupeLabels", () => {
  it("compares case- and space-insensitively", () => {
    expect(sameLabel("Hot Lead", "hot lead")).toBe(true);
    expect(sameLabel("a", "b")).toBe(false);
  });
  it("dedupes case-insensitively, keeping first casing + order", () => {
    expect(dedupeLabels(["Hot", "hot", "Cold", "HOT"])).toEqual(["Hot", "Cold"]);
  });
});

describe("labelHue", () => {
  it("is deterministic and in range", () => {
    const h = labelHue("Pricing");
    expect(h).toBe(labelHue("Pricing"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});
