import { describe, it, expect } from "vitest";
import { breakpointFor, isAtLeast, BREAKPOINTS } from "@/hooks/use-breakpoint";

describe("breakpointFor", () => {
  it("returns base for widths below sm", () => {
    expect(breakpointFor(0)).toBe("base");
    expect(breakpointFor(100)).toBe("base");
    expect(breakpointFor(BREAKPOINTS.sm - 1)).toBe("base");
  });

  it("returns sm for widths in [sm, md)", () => {
    expect(breakpointFor(BREAKPOINTS.sm)).toBe("sm");
    expect(breakpointFor(BREAKPOINTS.md - 1)).toBe("sm");
  });

  it("returns md for widths in [md, lg)", () => {
    expect(breakpointFor(BREAKPOINTS.md)).toBe("md");
    expect(breakpointFor(BREAKPOINTS.lg - 1)).toBe("md");
  });

  it("returns lg / xl / 2xl at matching widths", () => {
    expect(breakpointFor(BREAKPOINTS.lg)).toBe("lg");
    expect(breakpointFor(BREAKPOINTS.xl)).toBe("xl");
    expect(breakpointFor(BREAKPOINTS["2xl"])).toBe("2xl");
    expect(breakpointFor(9999)).toBe("2xl");
  });
});

describe("isAtLeast", () => {
  it("returns true when current equals target", () => {
    expect(isAtLeast("md", "md")).toBe(true);
  });

  it("returns true when current is larger than target", () => {
    expect(isAtLeast("lg", "md")).toBe(true);
    expect(isAtLeast("2xl", "base")).toBe(true);
  });

  it("returns false when current is smaller than target", () => {
    expect(isAtLeast("sm", "lg")).toBe(false);
    expect(isAtLeast("base", "sm")).toBe(false);
  });
});
