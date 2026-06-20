import { describe, it, expect } from "vitest";
import {
  isAssignedToMe,
  isUnassigned,
  isAssignedToOther,
  matchesAssigneeLane,
  type AssigneeLane,
} from "../assignee-filter";

/** B8 B4 — assignee-lane predicates (pure, inert in a solo workspace). */

const ME = "me";
const LANES: AssigneeLane[] = ["me", "unassigned", "others"];

describe("base predicates", () => {
  it("partition a conversation by owner", () => {
    expect(isAssignedToMe(ME, ME)).toBe(true);
    expect(isAssignedToMe("other", ME)).toBe(false);
    expect(isUnassigned(null)).toBe(true);
    expect(isUnassigned(ME)).toBe(false);
    expect(isAssignedToOther("other", ME)).toBe(true);
    expect(isAssignedToOther(ME, ME)).toBe(false);
    expect(isAssignedToOther(null, ME)).toBe(false);
  });
});

describe("matchesAssigneeLane (memberCount >= 2)", () => {
  const cases: Array<[string | null, AssigneeLane]> = [
    [ME, "me"],
    [null, "unassigned"],
    ["other", "others"],
  ];

  it("each conversation matches exactly ONE lane (exhaustive + mutually exclusive)", () => {
    for (const [assignee, expectedLane] of cases) {
      const matched = LANES.filter((lane) => matchesAssigneeLane(lane, assignee, ME, 2));
      expect(matched, `assignee=${assignee}`).toEqual([expectedLane]);
    }
  });
});

describe("solo workspace (memberCount < 2) is inert", () => {
  it("every lane matches every conversation, so the lanes add nothing", () => {
    for (const lane of LANES) {
      expect(matchesAssigneeLane(lane, ME, ME, 1)).toBe(true);
      expect(matchesAssigneeLane(lane, null, ME, 1)).toBe(true);
      expect(matchesAssigneeLane(lane, "other", ME, 1)).toBe(true);
    }
  });
});
