import { describe, it, expect } from "vitest";
import {
  resolveFeatureAutonomy,
  clampSettings,
  availableLevels,
  AUTONOMY_CATALOG,
  type AutonomySettings,
} from "@/lib/inbox/autonomy-hub";

describe("autonomy-hub (INBOX-T11/O06)", () => {
  it("falls back to a feature's default when unset", () => {
    expect(resolveFeatureAutonomy({}, "summarize")).toBe("auto"); // read-only default auto
    expect(resolveFeatureAutonomy({}, "capture")).toBe("suggest"); // outward-writing default suggest
  });

  it("honors a user override within the ceiling", () => {
    const s: AutonomySettings = { capture: "auto", summarize: "off" };
    expect(resolveFeatureAutonomy(s, "capture")).toBe("auto");
    expect(resolveFeatureAutonomy(s, "summarize")).toBe("off");
  });

  it("clamps outward-writing features to their suggest ceiling (never auto)", () => {
    const s: AutonomySettings = { draft: "auto", send: "auto" };
    expect(resolveFeatureAutonomy(s, "draft")).toBe("suggest");
    expect(resolveFeatureAutonomy(s, "send")).toBe("suggest");
  });

  it("returns off for an unknown feature", () => {
    expect(resolveFeatureAutonomy({ ghost: "auto" } as AutonomySettings, "ghost")).toBe("off");
  });

  it("availableLevels caps the UI at the ceiling", () => {
    const send = AUTONOMY_CATALOG.find((f) => f.id === "send")!;
    const summarize = AUTONOMY_CATALOG.find((f) => f.id === "summarize")!;
    expect(availableLevels(send)).toEqual(["off", "suggest"]);
    expect(availableLevels(summarize)).toEqual(["off", "suggest", "auto"]);
  });

  it("clampSettings drops unknown keys, invalid levels, and over-ceiling values", () => {
    const c = clampSettings({
      summarize: "auto",
      draft: "auto", // over ceiling -> suggest
      send: "auto", // over ceiling -> suggest
      bogus: "auto", // unknown -> dropped
      classify: "nonsense" as unknown as "auto", // invalid -> dropped
    } as AutonomySettings);
    expect(c).toEqual({ summarize: "auto", draft: "suggest", send: "suggest" });
  });
});
