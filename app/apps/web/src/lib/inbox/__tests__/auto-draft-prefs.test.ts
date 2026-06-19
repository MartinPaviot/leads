import { describe, it, expect } from "vitest";
import { clampAutoDraft, DEFAULT_AUTO_DRAFT } from "@/lib/inbox/auto-draft-prefs";

describe("auto-draft-prefs clampAutoDraft", () => {
  it("defaults to OFF", () => {
    expect(DEFAULT_AUTO_DRAFT).toEqual({ enabled: false });
  });

  it("coerces enabled true through", () => {
    expect(clampAutoDraft({ enabled: true })).toEqual({ enabled: true });
  });

  it("coerces enabled false through", () => {
    expect(clampAutoDraft({ enabled: false })).toEqual({ enabled: false });
  });

  it("treats missing as OFF", () => {
    expect(clampAutoDraft({})).toEqual({ enabled: false });
    expect(clampAutoDraft(null)).toEqual({ enabled: false });
    expect(clampAutoDraft(undefined)).toEqual({ enabled: false });
  });

  it("rejects truthy-but-not-true values (no accidental enable)", () => {
    // Only a strict boolean true enables; strings/numbers never do.
    expect(clampAutoDraft({ enabled: "true" as unknown as boolean })).toEqual({ enabled: false });
    expect(clampAutoDraft({ enabled: 1 as unknown as boolean })).toEqual({ enabled: false });
  });
});
