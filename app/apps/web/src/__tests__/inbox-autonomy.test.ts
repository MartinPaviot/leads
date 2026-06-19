import { describe, it, expect } from "vitest";
import { resolveAutonomy, defaultAutonomy, shouldPromote } from "@/lib/inbox/autonomy";

describe("resolveAutonomy (INBOX-T11)", () => {
  it("stages everything on suggest", () => {
    expect(resolveAutonomy("suggest", "label").perform).toBe(false);
  });

  it("performs on auto", () => {
    expect(resolveAutonomy("auto", "label").perform).toBe(true);
  });

  it("NEVER auto-sends, even on auto (hard guard)", () => {
    const d = resolveAutonomy("auto", "send");
    expect(d.perform).toBe(false);
    expect(d.reason).toContain("never auto-send");
  });

  it("demotes an auto match below the confidence floor to suggest", () => {
    expect(resolveAutonomy("auto", "archive", { confidenceFloor: 0.7, confidence: 0.5 }).perform).toBe(false);
    expect(resolveAutonomy("auto", "archive", { confidenceFloor: 0.7, confidence: 0.9 }).perform).toBe(true);
  });
});

describe("defaultAutonomy", () => {
  it("defaults AI rules to suggest, deterministic to auto", () => {
    expect(defaultAutonomy("ai")).toBe("suggest");
    expect(defaultAutonomy("deterministic")).toBe("auto");
  });
});

describe("shouldPromote", () => {
  it("offers promotion only on a clean accepted track record", () => {
    expect(shouldPromote({ accepted: 20, dismissed: 0 })).toBe(true);
    expect(shouldPromote({ accepted: 19, dismissed: 0 })).toBe(false);
    expect(shouldPromote({ accepted: 30, dismissed: 1 })).toBe(false);
    expect(shouldPromote({ accepted: 30, dismissed: 0, undone: 2 })).toBe(false);
  });
});
