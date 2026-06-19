/**
 * CLE-16 T11 — UI copy matches actual behaviour (AC-16 / AC-17). The autonomy
 * page level descriptions are sourced from the SSOT `LEVEL_BEHAVIOR` map (the
 * page maps LEVELS from it), and no copy claims auto-send under copilot/guided
 * (outbound always confirms — the HARD RULE).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEVEL_BEHAVIOR } from "@/lib/guardrails/level-behavior";

const PAGE_PATH = join(
  process.cwd(),
  "src/app/(dashboard)/(rest)/settings/autonomy/page.tsx",
);
const pageSrc = readFileSync(PAGE_PATH, "utf8");

describe("LEVEL_BEHAVIOR SSOT", () => {
  it("covers all four levels with a label + behavior", () => {
    for (const id of ["copilot", "guided", "autonomous", "strategic"] as const) {
      expect(LEVEL_BEHAVIOR[id].label.length).toBeGreaterThan(0);
      expect(LEVEL_BEHAVIOR[id].behavior.length).toBeGreaterThan(0);
    }
  });

  it("AC-16: no level claims auto-send / cold-email auto-send under copilot or guided", () => {
    for (const id of ["copilot", "guided"] as const) {
      const b = LEVEL_BEHAVIOR[id].behavior.toLowerCase();
      expect(b).not.toMatch(/auto-send/);
      expect(b).not.toMatch(/auto send/);
      expect(b).not.toMatch(/send.*automatically/);
    }
  });

  it("autonomous + strategic copy explicitly preserve the always-confirm-on-send posture", () => {
    expect(LEVEL_BEHAVIOR.autonomous.behavior.toLowerCase()).toContain("always asks before sending");
    expect(LEVEL_BEHAVIOR.strategic.behavior.toLowerCase()).toMatch(/always asks before send/);
  });
});

describe("autonomy page is wired to the SSOT", () => {
  it("imports LEVEL_BEHAVIOR and derives LEVELS from it", () => {
    expect(pageSrc).toContain('from "@/lib/guardrails/level-behavior"');
    expect(pageSrc).toContain("LEVEL_BEHAVIOR[id].behavior");
    expect(pageSrc).toContain("LEVEL_BEHAVIOR[id].label");
  });

  it("does NOT contain the old false copy (auto-send cold emails / handle everything)", () => {
    expect(pageSrc).not.toContain("Auto-send cold emails after 2h");
    expect(pageSrc).not.toContain("Handle everything, escalate edge cases");
  });
});
