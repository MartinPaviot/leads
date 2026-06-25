import { describe, it, expect } from "vitest";
import { isFeatureEnabled } from "../feature-gate";

describe("isFeatureEnabled", () => {
  it("defaults to enabled when the env var is unset", () => {
    expect(isFeatureEnabled(undefined)).toBe(true);
  });

  it("treats '0', 'off', 'false' (any case, padded) as disabled", () => {
    for (const v of ["0", "off", "false", "OFF", "False", "  off  ", "0 "]) {
      expect(isFeatureEnabled(v)).toBe(false);
    }
  });

  it("treats every other value as enabled", () => {
    for (const v of ["1", "on", "true", "yes", "", "anything"]) {
      expect(isFeatureEnabled(v)).toBe(true);
    }
  });
});
