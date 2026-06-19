/**
 * CLE-16 T13 — pruneExcludedLearnedKeys drops stale excluded learned keys (EC-8).
 */
import { describe, it, expect } from "vitest";
import { pruneExcludedLearnedKeys } from "@/scripts/cle16-prune-excluded-learned";

describe("pruneExcludedLearnedKeys", () => {
  it("drops email-send/email-reply/sequence-enrollment, keeps the rest", () => {
    const { cleaned, prunedKeys } = pruneExcludedLearnedKeys({
      "email-send": 0.5,
      "email-reply": 0.5,
      "sequence-enrollment": 0.5,
      "contact-update": 0.6,
      "task-create": 0.55,
    });
    expect(cleaned).toEqual({ "contact-update": 0.6, "task-create": 0.55 });
    expect(prunedKeys.sort()).toEqual(["email-reply", "email-send", "sequence-enrollment"]);
  });

  it("is idempotent — a clean map yields no prunes", () => {
    const { cleaned, prunedKeys } = pruneExcludedLearnedKeys({ "contact-update": 0.6 });
    expect(cleaned).toEqual({ "contact-update": 0.6 });
    expect(prunedKeys).toEqual([]);
  });

  it("handles undefined / null / empty", () => {
    expect(pruneExcludedLearnedKeys(undefined)).toEqual({ cleaned: {}, prunedKeys: [] });
    expect(pruneExcludedLearnedKeys(null)).toEqual({ cleaned: {}, prunedKeys: [] });
    expect(pruneExcludedLearnedKeys({})).toEqual({ cleaned: {}, prunedKeys: [] });
  });
});
