import { describe, it, expect } from "vitest";
import {
  badgeColorIndex,
  BADGE_COLORS,
  getBadgeColor,
  getLifecycleStyle,
  LIFECYCLE_CONFIG,
  STAGE_COLORS,
  letterGrade,
  heatLabel,
  formatScore,
  RISK_STYLES,
  ENRICHMENT_COLORS,
} from "@/lib/ui-utils";

describe("badgeColorIndex", () => {
  it("returns 0 for empty string", () => {
    expect(badgeColorIndex("")).toBe(0);
  });

  it("returns a number between 0 and 9", () => {
    const inputs = ["SaaS", "AI", "Fintech", "Healthcare", "Education", "Manufacturing", "Retail"];
    for (const input of inputs) {
      const result = badgeColorIndex(input);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(9);
    }
  });

  it("returns consistent results for the same input", () => {
    expect(badgeColorIndex("Technology")).toBe(badgeColorIndex("Technology"));
  });

  it("returns different indices for different inputs", () => {
    const results = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map(badgeColorIndex));
    expect(results.size).toBeGreaterThan(1);
  });

  it("handles special characters", () => {
    expect(typeof badgeColorIndex("<script>alert(1)</script>")).toBe("number");
    expect(typeof badgeColorIndex("中文")).toBe("number");
    expect(typeof badgeColorIndex("émojis 🔥")).toBe("number");
  });

  it("handles very long strings", () => {
    const longStr = "a".repeat(10000);
    const result = badgeColorIndex(longStr);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(9);
  });
});

describe("BADGE_COLORS", () => {
  it("has exactly 10 entries", () => {
    expect(BADGE_COLORS).toHaveLength(10);
  });

  it("each entry has bg and text properties referencing CSS vars", () => {
    for (const color of BADGE_COLORS) {
      expect(color.bg).toMatch(/^var\(--color-badge-\d+-bg\)$/);
      expect(color.text).toMatch(/^var\(--color-badge-\d+\)$/);
    }
  });
});

describe("getBadgeColor", () => {
  it("returns a badge color object", () => {
    const result = getBadgeColor("SaaS");
    expect(result).toHaveProperty("bg");
    expect(result).toHaveProperty("text");
  });
});

describe("getLifecycleStyle", () => {
  it("returns style for known stages", () => {
    const stages = ["new", "prospecting", "opportunity", "customer", "disqualified", "inbound", "nurture"];
    for (const stage of stages) {
      const style = getLifecycleStyle(stage);
      expect(style).toHaveProperty("bg");
      expect(style).toHaveProperty("text");
    }
  });

  it("falls back to 'new' style for unknown stages", () => {
    const style = getLifecycleStyle("unknown_stage");
    expect(style).toEqual(LIFECYCLE_CONFIG.new);
  });
});

describe("STAGE_COLORS", () => {
  it("has colors for all pipeline stages", () => {
    const stages = ["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"];
    for (const stage of stages) {
      expect(STAGE_COLORS[stage]).toBeDefined();
      expect(typeof STAGE_COLORS[stage]).toBe("string");
    }
  });

  it("uses CSS variables (no hardcoded hex)", () => {
    for (const color of Object.values(STAGE_COLORS)) {
      expect(color).toMatch(/^var\(/);
    }
  });
});

describe("letterGrade", () => {
  it("returns A+ for 90+", () => {
    expect(letterGrade(90)).toBe("A+");
    expect(letterGrade(100)).toBe("A+");
  });

  it("returns A for 80-89", () => {
    expect(letterGrade(80)).toBe("A");
    expect(letterGrade(89)).toBe("A");
  });

  it("returns B for 70-79", () => {
    expect(letterGrade(70)).toBe("B");
    expect(letterGrade(79)).toBe("B");
  });

  it("returns C for 60-69", () => {
    expect(letterGrade(60)).toBe("C");
    expect(letterGrade(69)).toBe("C");
  });

  it("returns D for 50-59", () => {
    expect(letterGrade(50)).toBe("D");
    expect(letterGrade(59)).toBe("D");
  });

  it("returns F for below 50", () => {
    expect(letterGrade(49)).toBe("F");
    expect(letterGrade(0)).toBe("F");
  });
});

describe("heatLabel", () => {
  it("returns Burning for 80+", () => {
    const result = heatLabel(80);
    expect(result.label).toBe("Burning");
    expect(result.color).toBe("var(--color-success)");
    expect(result.icon).toBe("🔥");
  });

  it("returns Warm for 60-79", () => {
    const result = heatLabel(60);
    expect(result.label).toBe("Warm");
    expect(result.color).toBe("var(--color-warning)");
    expect(result.icon).toBe("☀️");
  });

  it("returns Cool for 40-59", () => {
    const result = heatLabel(40);
    expect(result.label).toBe("Cool");
    expect(result.color).toBe("var(--color-info)");
    expect(result.icon).toBe("");
  });

  it("returns Cold for below 40", () => {
    const result = heatLabel(39);
    expect(result.label).toBe("Cold");
    expect(result.color).toBe("var(--color-text-tertiary)");
    expect(result.icon).toBe("");
  });
});

describe("formatScore", () => {
  it("returns null for null score", () => {
    expect(formatScore(null)).toBeNull();
  });

  it("returns null for undefined score", () => {
    expect(formatScore(undefined)).toBeNull();
  });

  it("returns formatted object for valid score", () => {
    const result = formatScore(85);
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("A");
    expect(result!.heat).toBe("Burning");
    expect(result!.color).toBe("var(--color-success)");
    expect(result!.icon).toBe("🔥");
  });

  it("rounds fractional scores", () => {
    const result = formatScore(79.6);
    expect(result!.grade).toBe("A");
  });

  it("handles 0 score", () => {
    const result = formatScore(0);
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("F");
    expect(result!.heat).toBe("Cold");
  });

  it("handles 100 score", () => {
    const result = formatScore(100);
    expect(result).not.toBeNull();
    expect(result!.grade).toBe("A+");
    expect(result!.heat).toBe("Burning");
  });
});

describe("RISK_STYLES", () => {
  it("has styles for high, medium, low", () => {
    expect(RISK_STYLES.high).toBeDefined();
    expect(RISK_STYLES.medium).toBeDefined();
    expect(RISK_STYLES.low).toBeDefined();
  });

  it("uses CSS variables", () => {
    for (const style of Object.values(RISK_STYLES)) {
      expect(style.bg).toMatch(/^var\(/);
      expect(style.text).toMatch(/^var\(/);
    }
  });
});

describe("ENRICHMENT_COLORS", () => {
  it("has all status colors", () => {
    expect(ENRICHMENT_COLORS.enriching).toBeDefined();
    expect(ENRICHMENT_COLORS.done).toBeDefined();
    expect(ENRICHMENT_COLORS.failed).toBeDefined();
    expect(ENRICHMENT_COLORS.pending).toBeDefined();
  });

  it("uses CSS variables", () => {
    for (const color of Object.values(ENRICHMENT_COLORS)) {
      expect(color).toMatch(/^var\(/);
    }
  });
});
