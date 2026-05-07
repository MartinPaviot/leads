import { describe, it, expect } from "vitest";
import {
  readTriggerConfig,
  writeTriggerConfig,
  matchesTrigger,
  pickSequenceForSignal,
  KNOWN_SIGNAL_TYPES,
} from "@/lib/sequences/triggers";

describe("readTriggerConfig", () => {
  it("returns empty array on null / undefined / empty config", () => {
    expect(readTriggerConfig(null)).toEqual({ triggerSignalTypes: [] });
    expect(readTriggerConfig(undefined)).toEqual({ triggerSignalTypes: [] });
    expect(readTriggerConfig({})).toEqual({ triggerSignalTypes: [] });
  });

  it("returns empty array when triggerSignalTypes is not an array", () => {
    expect(readTriggerConfig({ triggerSignalTypes: "yolo" })).toEqual({
      triggerSignalTypes: [],
    });
    expect(readTriggerConfig({ triggerSignalTypes: 42 })).toEqual({
      triggerSignalTypes: [],
    });
  });

  it("returns all known signal types when configured", () => {
    expect(
      readTriggerConfig({ triggerSignalTypes: ["website_visit", "post_funding"] }),
    ).toEqual({
      triggerSignalTypes: ["website_visit", "post_funding"],
    });
  });

  it("drops unknown signal types defensively", () => {
    expect(
      readTriggerConfig({
        triggerSignalTypes: ["website_visit", "fake_type", "post_funding"],
      }),
    ).toEqual({
      triggerSignalTypes: ["website_visit", "post_funding"],
    });
  });

  it("dedupes while preserving order", () => {
    expect(
      readTriggerConfig({
        triggerSignalTypes: [
          "website_visit",
          "website_visit",
          "post_funding",
          "website_visit",
        ],
      }),
    ).toEqual({
      triggerSignalTypes: ["website_visit", "post_funding"],
    });
  });

  it("ignores other keys in the campaign config", () => {
    expect(
      readTriggerConfig({
        triggerSignalTypes: ["website_visit"],
        rejectionInsights: { byCategory: { tone: 5 } },
      }),
    ).toEqual({ triggerSignalTypes: ["website_visit"] });
  });
});

describe("matchesTrigger", () => {
  it("matches all signals when triggerSignalTypes is empty (legacy default)", () => {
    expect(matchesTrigger(null, "website_visit")).toBe(true);
    expect(matchesTrigger({}, "post_funding")).toBe(true);
    expect(matchesTrigger({ triggerSignalTypes: [] }, "any_signal")).toBe(
      true,
    );
  });

  it("matches signals in the configured list", () => {
    expect(
      matchesTrigger(
        { triggerSignalTypes: ["website_visit"] },
        "website_visit",
      ),
    ).toBe(true);
  });

  it("rejects signals NOT in the configured list", () => {
    expect(
      matchesTrigger(
        { triggerSignalTypes: ["website_visit"] },
        "post_funding",
      ),
    ).toBe(false);
  });

  it("rejects null / empty signalType when filter is configured", () => {
    expect(
      matchesTrigger({ triggerSignalTypes: ["website_visit"] }, null),
    ).toBe(false);
    expect(
      matchesTrigger({ triggerSignalTypes: ["website_visit"] }, ""),
    ).toBe(false);
    expect(
      matchesTrigger(
        { triggerSignalTypes: ["website_visit"] },
        undefined as never,
      ),
    ).toBe(false);
  });

  it("matches null signalType when filter is empty (legacy)", () => {
    expect(matchesTrigger({}, null)).toBe(true);
  });
});

describe("writeTriggerConfig", () => {
  it("writes the validated array to a fresh config", () => {
    const out = writeTriggerConfig(null, ["website_visit", "post_funding"]);
    expect(out).toEqual({
      triggerSignalTypes: ["website_visit", "post_funding"],
    });
  });

  it("preserves existing keys in the campaign config", () => {
    const out = writeTriggerConfig(
      { rejectionInsights: { byCategory: { tone: 3 } } },
      ["website_visit"],
    );
    expect(out).toEqual({
      rejectionInsights: { byCategory: { tone: 3 } },
      triggerSignalTypes: ["website_visit"],
    });
  });

  it("drops unknown signal types", () => {
    const out = writeTriggerConfig({}, [
      "website_visit",
      "yolo_signal",
      "post_funding",
    ]);
    expect(out.triggerSignalTypes).toEqual([
      "website_visit",
      "post_funding",
    ]);
  });

  it("dedupes input array", () => {
    const out = writeTriggerConfig({}, [
      "website_visit",
      "website_visit",
      "post_funding",
    ]);
    expect(out.triggerSignalTypes).toEqual([
      "website_visit",
      "post_funding",
    ]);
  });

  it("empty array overwrites prior value (intentional clear)", () => {
    const out = writeTriggerConfig(
      { triggerSignalTypes: ["website_visit"] },
      [],
    );
    expect(out.triggerSignalTypes).toEqual([]);
  });

  it("does not mutate the input config", () => {
    const input: Record<string, unknown> = { foo: "bar" };
    writeTriggerConfig(input, ["website_visit"]);
    expect(input).toEqual({ foo: "bar" });
  });
});

describe("pickSequenceForSignal", () => {
  it("returns the first matching sequence", () => {
    const seqs = [
      { id: "a", name: "A", campaignConfig: { triggerSignalTypes: ["post_funding"] } },
      { id: "b", name: "B", campaignConfig: { triggerSignalTypes: ["website_visit"] } },
    ];
    const out = pickSequenceForSignal(seqs, "website_visit");
    expect(out?.id).toBe("b");
  });

  it("legacy unconfigured sequence matches every signal first", () => {
    const seqs = [
      { id: "legacy", name: "L", campaignConfig: null },
      { id: "filtered", name: "F", campaignConfig: { triggerSignalTypes: ["website_visit"] } },
    ];
    const out = pickSequenceForSignal(seqs, "website_visit");
    expect(out?.id).toBe("legacy");
  });

  it("returns null when no candidate matches", () => {
    const seqs = [
      { id: "a", name: "A", campaignConfig: { triggerSignalTypes: ["post_funding"] } },
    ];
    expect(pickSequenceForSignal(seqs, "website_visit")).toBeNull();
  });

  it("empty candidate list returns null", () => {
    expect(pickSequenceForSignal([], "website_visit")).toBeNull();
  });
});

describe("KNOWN_SIGNAL_TYPES", () => {
  it("has at least website_visit + post_funding", () => {
    expect(KNOWN_SIGNAL_TYPES.includes("website_visit")).toBe(true);
    expect(KNOWN_SIGNAL_TYPES.includes("post_funding")).toBe(true);
  });

  it("contains 9 canonical types", () => {
    expect(KNOWN_SIGNAL_TYPES.length).toBe(9);
  });
});
