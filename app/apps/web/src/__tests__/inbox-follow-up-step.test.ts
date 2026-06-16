import { describe, it, expect } from "vitest";
import { nextFollowUp, type FollowUpInput } from "@/lib/inbox/follow-up-step";

const DAY = 86_400_000;
const NOW = 1_750_000_000_000;

function base(over: Partial<FollowUpInput> = {}): FollowUpInput {
  return {
    currentStep: 1,
    totalSteps: 3,
    lastTouchAt: NOW - 4 * DAY,
    cadenceDays: [2, 3, 4],
    now: NOW,
    replied: false,
    ...over,
  };
}

describe("nextFollowUp (INBOX-C09)", () => {
  it("never follows up once the contact replied", () => {
    expect(nextFollowUp(base({ replied: true })).due).toBe(false);
  });

  it("stops at the end of the sequence", () => {
    expect(nextFollowUp(base({ currentStep: 3, totalSteps: 3 })).due).toBe(false);
  });

  it("sends immediately when there is no prior touch", () => {
    const d = nextFollowUp(base({ currentStep: 0, lastTouchAt: null }));
    expect(d.due).toBe(true);
    expect(d.nextStep).toBe(1);
  });

  it("is due once the cadence wait has elapsed", () => {
    // step 1 sent 4d ago; wait before step 2 = cadenceDays[1] = 3d → due
    const d = nextFollowUp(base());
    expect(d.due).toBe(true);
    expect(d.nextStep).toBe(2);
  });

  it("is not yet due inside the cadence wait, citing days left", () => {
    const d = nextFollowUp(base({ lastTouchAt: NOW - 1 * DAY })); // 1d ago, need 3d
    expect(d.due).toBe(false);
    expect(d.reason).toContain("day");
  });
});
