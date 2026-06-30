import { describe, it, expect, afterEach, vi } from "vitest";
import { dailyViewCap } from "../view-budget";

describe("dailyViewCap — per-seat daily LinkedIn view ceiling", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to 80 when unset/invalid/non-positive", () => {
    vi.stubEnv("LINKEDIN_DAILY_VIEW_CAP", "");
    expect(dailyViewCap()).toBe(80);
    vi.stubEnv("LINKEDIN_DAILY_VIEW_CAP", "nope");
    expect(dailyViewCap()).toBe(80);
    vi.stubEnv("LINKEDIN_DAILY_VIEW_CAP", "0");
    expect(dailyViewCap()).toBe(80);
  });

  it("reads the override and clamps to [1, 100]", () => {
    vi.stubEnv("LINKEDIN_DAILY_VIEW_CAP", "40");
    expect(dailyViewCap()).toBe(40);
    vi.stubEnv("LINKEDIN_DAILY_VIEW_CAP", "500");
    expect(dailyViewCap()).toBe(100);
    vi.stubEnv("LINKEDIN_DAILY_VIEW_CAP", "1");
    expect(dailyViewCap()).toBe(1);
  });
});
