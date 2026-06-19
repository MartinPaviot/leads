/**
 * CLE-16 T1 — typed learnedThresholds + trustStatsUpdatedAt on TenantSettings.
 * Compile-time: the object below only type-checks if both fields are declared
 * with the right types (this removes the untyped cast in learned-trust.ts).
 */
import { describe, it, expect } from "vitest";
import type { TenantSettings } from "@/lib/config/tenant-settings";

const sample = {
  learnedThresholds: { "contact-update": 0.6, "task-create": 0.55 },
  trustStatsUpdatedAt: new Date().toISOString(),
} satisfies TenantSettings;

describe("TenantSettings learned-threshold fields", () => {
  it("learnedThresholds is a typed Record<string, number>", () => {
    expect(sample.learnedThresholds["contact-update"]).toBe(0.6);
    expect(typeof sample.trustStatsUpdatedAt).toBe("string");
  });
});
