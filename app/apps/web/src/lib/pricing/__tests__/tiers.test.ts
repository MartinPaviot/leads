import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  TIERS,
  PUBLIC_TIER_IDS,
  getTierForPlan,
  getLimitsForTenant,
  serialiseLimit,
  getPlanFromPriceId,
  type PlanId,
} from "@/lib/pricing/tiers";

describe("TIERS shape", () => {
  it("has an entry for every PlanId", () => {
    const ids: PlanId[] = ["trial", "starter", "pro", "canceled"];
    for (const id of ids) {
      expect(TIERS[id]).toBeDefined();
      expect(TIERS[id].id).toBe(id);
      expect(TIERS[id].displayName).toBeTruthy();
      expect(TIERS[id].limits).toBeDefined();
    }
  });

  it("pro has unlimited AI queries via Infinity", () => {
    expect(TIERS.pro.limits.aiQueriesPerMonth).toBe(Number.POSITIVE_INFINITY);
  });

  it("canceled tier quotas mirror trial (most restrictive)", () => {
    expect(TIERS.canceled.limits).toEqual(TIERS.trial.limits);
  });

  it("public pricing order is trial → starter → pro (canceled hidden)", () => {
    expect(PUBLIC_TIER_IDS).toEqual(["trial", "starter", "pro"]);
    expect(PUBLIC_TIER_IDS).not.toContain("canceled");
  });

  it("paid tiers have both client and server env keys", () => {
    for (const id of ["starter", "pro"] as const) {
      expect(TIERS[id].priceEnvKey).toMatch(/^NEXT_PUBLIC_STRIPE_/);
      expect(TIERS[id].serverPriceEnvKey).toMatch(/^STRIPE_/);
      expect(TIERS[id].serverPriceEnvKey).not.toMatch(/^NEXT_PUBLIC_/);
    }
  });

  it("trial + canceled have no env keys (not purchasable)", () => {
    expect(TIERS.trial.priceEnvKey).toBeNull();
    expect(TIERS.trial.serverPriceEnvKey).toBeNull();
    expect(TIERS.canceled.priceEnvKey).toBeNull();
  });
});

describe("getTierForPlan", () => {
  it("returns the matching tier", () => {
    expect(getTierForPlan("starter").id).toBe("starter");
    expect(getTierForPlan("pro").id).toBe("pro");
  });

  it("null / undefined / unknown falls back to trial", () => {
    expect(getTierForPlan(null).id).toBe("trial");
    expect(getTierForPlan(undefined).id).toBe("trial");
    expect(getTierForPlan("enterprise").id).toBe("trial");
    expect(getTierForPlan("").id).toBe("trial");
  });
});

describe("getLimitsForTenant", () => {
  it("no overrides → plan defaults", () => {
    expect(getLimitsForTenant("starter", null)).toEqual(TIERS.starter.limits);
    expect(getLimitsForTenant("starter", undefined)).toEqual(TIERS.starter.limits);
    expect(getLimitsForTenant("starter", {})).toEqual(TIERS.starter.limits);
  });

  it("number override replaces plan default", () => {
    const r = getLimitsForTenant("starter", { contacts: 5000 });
    expect(r.contacts).toBe(5000);
    expect(r.emailsPerMonth).toBe(TIERS.starter.limits.emailsPerMonth);
  });

  it("null override means inherit (NOT zero)", () => {
    const r = getLimitsForTenant("starter", { contacts: null });
    expect(r.contacts).toBe(TIERS.starter.limits.contacts);
  });

  it("zero override is a hard block", () => {
    const r = getLimitsForTenant("starter", { emailsPerMonth: 0 });
    expect(r.emailsPerMonth).toBe(0);
  });

  it("ignores garbage types (string, negative, NaN) and falls back", () => {
    const r = getLimitsForTenant("starter", {
      // @ts-expect-error intentional bad input — string not number
      contacts: "lots",
      emailsPerMonth: -5,
      aiQueriesPerMonth: NaN,
    });
    expect(r).toEqual(TIERS.starter.limits);
  });

  it("unknown plan + overrides → trial defaults with overrides applied", () => {
    const r = getLimitsForTenant("enterprise", { contacts: 999 });
    expect(r.contacts).toBe(999);
    expect(r.emailsPerMonth).toBe(TIERS.trial.limits.emailsPerMonth);
  });

  it("infinity in plan stays infinity when not overridden", () => {
    const r = getLimitsForTenant("pro", {});
    expect(r.aiQueriesPerMonth).toBe(Number.POSITIVE_INFINITY);
  });

  it("override can cap an unlimited tier", () => {
    const r = getLimitsForTenant("pro", { aiQueriesPerMonth: 1000 });
    expect(r.aiQueriesPerMonth).toBe(1000);
  });
});

describe("serialiseLimit", () => {
  it("finite numbers pass through", () => {
    expect(serialiseLimit(0)).toBe(0);
    expect(serialiseLimit(100)).toBe(100);
    expect(serialiseLimit(10_000)).toBe(10_000);
  });

  it("Infinity becomes null", () => {
    expect(serialiseLimit(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("NaN becomes null", () => {
    expect(serialiseLimit(NaN)).toBeNull();
  });
});

describe("getPlanFromPriceId", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_live";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro_live";
  });
  afterEach(() => {
    process.env = original;
  });

  it("matches starter", () => {
    expect(getPlanFromPriceId("price_starter_live")).toBe("starter");
  });

  it("matches pro", () => {
    expect(getPlanFromPriceId("price_pro_live")).toBe("pro");
  });

  it("null priceId → trial", () => {
    expect(getPlanFromPriceId(null)).toBe("trial");
    expect(getPlanFromPriceId(undefined)).toBe("trial");
    expect(getPlanFromPriceId("")).toBe("trial");
  });

  it("unknown paid priceId falls back to starter (not trial)", () => {
    // This keeps a paying customer at paid-tier quotas even if we add a new
    // Stripe price id but forget to map it here.
    expect(getPlanFromPriceId("price_mystery_new")).toBe("starter");
  });
});
