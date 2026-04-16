import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { stageProbability, ageInStage } from "@/lib/deal-helpers";

describe("stageProbability", () => {
  it("maps each canonical stage to its probability", () => {
    expect(stageProbability("lead")).toBe(10);
    expect(stageProbability("qualification")).toBe(25);
    expect(stageProbability("demo")).toBe(40);
    expect(stageProbability("trial")).toBe(55);
    expect(stageProbability("proposal")).toBe(70);
    expect(stageProbability("negotiation")).toBe(85);
    expect(stageProbability("won")).toBe(100);
    expect(stageProbability("lost")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(stageProbability("DEMO")).toBe(40);
    expect(stageProbability("Won")).toBe(100);
  });

  it("returns null for unknown stages so the UI can render '—' rather than a misleading 0", () => {
    expect(stageProbability("garbage")).toBeNull();
    expect(stageProbability("")).toBeNull();
    expect(stageProbability(undefined)).toBeNull();
    expect(stageProbability(null)).toBeNull();
  });
});

describe("ageInStage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("buckets a 3-day-old deal as 'fresh'", () => {
    const r = ageInStage(new Date("2026-04-12T12:00:00Z"));
    expect(r).not.toBeNull();
    expect(r!.days).toBe(3);
    expect(r!.bucket).toBe("fresh");
    expect(r!.short).toBe("3d");
    expect(r!.long).toBe("3 days");
  });

  it("buckets a 9-day-old deal as 'watch'", () => {
    const r = ageInStage(new Date("2026-04-06T12:00:00Z"));
    expect(r!.bucket).toBe("watch");
    expect(r!.long).toBe("1 week");
  });

  it("buckets a 21-day-old deal as 'stalled'", () => {
    const r = ageInStage(new Date("2026-03-25T12:00:00Z"));
    expect(r!.bucket).toBe("stalled");
    expect(r!.long).toBe("3 weeks");
  });

  it("buckets a 60-day-old deal as 'frozen'", () => {
    const r = ageInStage(new Date("2026-02-14T12:00:00Z"));
    expect(r!.bucket).toBe("frozen");
    expect(r!.long).toMatch(/months/);
  });

  it("treats won deals as 'not stalled' (returns null)", () => {
    expect(ageInStage(new Date("2026-01-01T12:00:00Z"), "won")).toBeNull();
  });

  it("treats lost deals as 'not stalled' (returns null)", () => {
    expect(ageInStage(new Date("2026-01-01T12:00:00Z"), "lost")).toBeNull();
  });

  it("returns null for missing timestamps and clamps NaN gracefully", () => {
    expect(ageInStage(null)).toBeNull();
    expect(ageInStage(undefined)).toBeNull();
    expect(ageInStage("not a date")).toBeNull();
  });

  it("accepts ISO strings as well as Date instances", () => {
    const r = ageInStage("2026-04-12T12:00:00Z");
    expect(r!.days).toBe(3);
    expect(r!.bucket).toBe("fresh");
  });

  it("clamps negative ages (clock skew) to 0 days", () => {
    const r = ageInStage(new Date("2026-04-20T12:00:00Z"));
    expect(r!.days).toBe(0);
    expect(r!.long).toBe("today");
  });
});
