import { describe, it, expect } from "vitest";
import { planRank, tierKey, tierState } from "@/lib/billing/pricing-tier";

describe("pricing-tier (R6)", () => {
  it("maps display names to plan keys", () => {
    expect(tierKey("Free Trial")).toBe("trial");
    expect(tierKey("Starter")).toBe("starter");
    expect(tierKey("Pro")).toBe("pro");
  });

  it("orders plans trial < starter < pro", () => {
    expect(planRank("trial")).toBeLessThan(planRank("starter"));
    expect(planRank("starter")).toBeLessThan(planRank("pro"));
    expect(planRank("unknown")).toBe(-1);
    expect(planRank(null)).toBe(-1);
  });

  it("marks the matching tier as the current plan (disabled)", () => {
    const s = tierState("Starter", "starter", "Get Started");
    expect(s).toMatchObject({ label: "Current Plan", disabled: true, isCurrent: true, isUpgrade: false });
  });

  it("marks strictly-lower tiers as Included (owned, disabled)", () => {
    // On Pro, the Starter tier is already owned.
    const s = tierState("Starter", "pro", "Get Started");
    expect(s).toMatchObject({ label: "Included", disabled: true, isCurrent: false, isUpgrade: false });
  });

  it("keeps strictly-higher tiers as enabled upgrades", () => {
    // On Starter, Pro is a real upgrade.
    const s = tierState("Pro", "starter", "Go Pro");
    expect(s).toMatchObject({ label: "Go Pro", disabled: false, isCurrent: false, isUpgrade: true });
  });

  it("never marks a current tier while the plan is unknown (loading/failed)", () => {
    const s = tierState("Free Trial", null, "Get started free");
    expect(s.isCurrent).toBe(false);
    expect(s.label).toBe("Get started free");
  });

  it("a trial tenant sees Free Trial as current, Starter/Pro as upgrades", () => {
    expect(tierState("Free Trial", "trial", "Get started free").isCurrent).toBe(true);
    expect(tierState("Starter", "trial", "Get Started").isUpgrade).toBe(true);
    expect(tierState("Pro", "trial", "Go Pro").isUpgrade).toBe(true);
  });
});
