import { describe, it, expect } from "vitest";
import { getEffectivePermission, buildDefaultConfig, LEVEL_DEFAULTS, DELAY_BY_ACTION } from "../lib/campaign-engine/autonomy-defaults";
import type { AutonomyConfig, ActionType } from "../lib/campaign-engine/types";

describe("Execution Gate — Autonomy Defaults", () => {
  describe("getEffectivePermission", () => {
    it("returns 'manual' for coldEmailSend at copilot level", () => {
      const config = buildDefaultConfig("copilot");
      expect(getEffectivePermission("coldEmailSend", config)).toBe("manual");
    });

    it("returns 'delayed' for coldEmailSend at guided level", () => {
      const config = buildDefaultConfig("guided");
      expect(getEffectivePermission("coldEmailSend", config)).toBe("delayed");
    });

    it("returns 'auto' for coldEmailSend at autonomous level", () => {
      const config = buildDefaultConfig("autonomous");
      expect(getEffectivePermission("coldEmailSend", config)).toBe("auto");
    });

    it("returns 'manual' for warmIntroSend at all levels except autonomous+", () => {
      expect(getEffectivePermission("warmIntroSend", buildDefaultConfig("copilot"))).toBe("manual");
      expect(getEffectivePermission("warmIntroSend", buildDefaultConfig("guided"))).toBe("manual");
      expect(getEffectivePermission("warmIntroSend", buildDefaultConfig("autonomous"))).toBe("auto_if_preapproved");
    });

    it("respects permission overrides over level defaults", () => {
      const config: AutonomyConfig = {
        ...buildDefaultConfig("copilot"),
        permissions: { ...LEVEL_DEFAULTS.copilot, coldEmailSend: "auto" },
      };
      expect(getEffectivePermission("coldEmailSend", config)).toBe("auto");
    });
  });

  describe("buildDefaultConfig", () => {
    it("defaults to copilot", () => {
      const config = buildDefaultConfig();
      expect(config.level).toBe("copilot");
    });

    it("sets all permissions to manual at copilot level", () => {
      const config = buildDefaultConfig("copilot");
      expect(config.permissions.coldEmailSend).toBe("manual");
      expect(config.permissions.replyPositive).toBe("manual");
      expect(config.permissions.replyObjection).toBe("manual");
    });

    it("sets sending permissions to delayed at guided level", () => {
      const config = buildDefaultConfig("guided");
      expect(config.permissions.coldEmailSend).toBe("delayed");
      expect(config.permissions.replyPositive).toBe("delayed");
      expect(config.permissions.replyObjection).toBe("manual");
    });

    it("sets guardrails with sane defaults", () => {
      const config = buildDefaultConfig();
      expect(config.guardrails.maxEmailsPerDay).toBe(40);
      expect(config.guardrails.maxNewProspectsPerWeek).toBe(25);
      expect(config.guardrails.maxEmailsPerProspect).toBe(5);
      expect(config.guardrails.neverContact).toEqual([]);
    });
  });

  describe("DELAY_BY_ACTION", () => {
    it("has 2h delay for cold email", () => {
      expect(DELAY_BY_ACTION.coldEmailSend).toBe(2 * 60 * 60 * 1000);
    });

    it("has 1h delay for positive reply", () => {
      expect(DELAY_BY_ACTION.replyPositive).toBe(1 * 60 * 60 * 1000);
    });
  });

  describe("Level progression", () => {
    it("each level is more permissive than the previous", () => {
      const levels: Array<"copilot" | "guided" | "autonomous" | "strategic"> = ["copilot", "guided", "autonomous", "strategic"];
      const permissiveness: Record<string, number> = { manual: 0, ask: 0, draft_only: 0, delayed: 1, auto_if_preapproved: 2, auto_if_icp_match: 2, auto_with_notification: 2, auto_with_log: 2, auto: 3, auto_stop: 3 };

      for (let i = 1; i < levels.length; i++) {
        const prev = buildDefaultConfig(levels[i - 1]);
        const curr = buildDefaultConfig(levels[i]);

        // At least one permission should be more permissive
        const keys = Object.keys(curr.permissions) as ActionType[];
        const morePermissive = keys.some(
          (k) => (permissiveness[curr.permissions[k]] || 0) > (permissiveness[prev.permissions[k]] || 0)
        );
        expect(morePermissive).toBe(true);
      }
    });
  });
});
