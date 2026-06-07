import { describe, it, expect } from "vitest";
import { parseExcludedMode } from "@/lib/accounts/list-filters";

describe("parseExcludedMode", () => {
  it("defaults to hide (excluded accounts hidden)", () => {
    expect(parseExcludedMode(null)).toBe("hide");
    expect(parseExcludedMode(undefined)).toBe("hide");
    expect(parseExcludedMode("")).toBe("hide");
    expect(parseExcludedMode("false")).toBe("hide");
    expect(parseExcludedMode("0")).toBe("hide");
  });

  it("returns only for true/1 (show only excluded)", () => {
    expect(parseExcludedMode("true")).toBe("only");
    expect(parseExcludedMode("TRUE")).toBe("only");
    expect(parseExcludedMode("1")).toBe("only");
  });

  it("returns all for all (show both)", () => {
    expect(parseExcludedMode("all")).toBe("all");
    expect(parseExcludedMode("ALL")).toBe("all");
  });
});
