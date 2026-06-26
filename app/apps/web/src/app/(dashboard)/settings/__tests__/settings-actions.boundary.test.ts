import { describe, it, expect } from "vitest";
import { SETTINGS_EXCLUDED_IDS } from "@/app/(dashboard)/settings/guardrails/_excluded-ids";

/**
 * CLE-14 — the SAFE-config boundary for the /settings/* cluster. The chat
 * live-executor may flip safe workspace configuration, but security
 * (password / MFA) and money (billing / plan / payment) are STRICTLY
 * human-bound. This test freezes that contract: the set of settings actions we
 * actually register must be DISJOINT from SETTINGS_EXCLUDED_IDS, and no
 * registered id may even mention a credential- or money-class verb.
 */

// The exact ids the five settings sub-pages register (one each). Hardcoded so a
// new registration must be added here on purpose — the test then enforces it
// stays clear of the excluded set + the substring sweep.
const REGISTERED_SETTINGS_IDS = [
  "settings.setAutonomyLevel",
  "settings.updateNotificationPrefs",
  "settings.editPipelineStages",
  "settings.addSignal",
  "settings.updateWorkspaceName",
] as const;

describe("CLE-14 /settings — SAFE-config boundary (the headline)", () => {
  it("the excluded set is exactly the security + money actions", () => {
    expect([...SETTINGS_EXCLUDED_IDS].sort()).toEqual(
      [
        "settings.changePassword",
        "settings.enrollMfa",
        "settings.disableMfa",
        "settings.manageBilling",
        "settings.upgradePlan",
        "settings.updatePayment",
      ].sort(),
    );
  });

  it("registered settings ids are DISJOINT from SETTINGS_EXCLUDED_IDS", () => {
    const excluded = new Set<string>(SETTINGS_EXCLUDED_IDS);
    const overlap = REGISTERED_SETTINGS_IDS.filter((id) => excluded.has(id));
    expect(overlap).toEqual([]);
  });

  it("no registered settings id mentions a security/money verb", () => {
    const FORBIDDEN = ["password", "mfa", "billing", "payment", "plan", "upgrade"];
    for (const id of REGISTERED_SETTINGS_IDS) {
      const lower = id.toLowerCase();
      for (const bad of FORBIDDEN) {
        expect(lower.includes(bad), `registered id "${id}" must not contain "${bad}"`).toBe(false);
      }
    }
  });
});
