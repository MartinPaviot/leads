import { describe, it, expect } from "vitest";
import {
  resolveResumePhase,
  canNavigateToPhase,
  canFinalize,
} from "@/lib/onboarding/resume";

describe("resolveResumePhase", () => {
  it("first load snaps to server's currentPhase", () => {
    const r = resolveResumePhase(
      { currentPhase: 4, completedPhases: [1, 2, 3], completedAt: null },
      { currentlyActive: 1, isFirstLoad: true },
    );
    expect(r).toEqual({ phase: 4, snap: true });
  });

  it("subsequent loads keep currentlyActive", () => {
    const r = resolveResumePhase(
      { currentPhase: 4, completedPhases: [1, 2, 3], completedAt: null },
      { currentlyActive: 2, isFirstLoad: false },
    );
    expect(r).toEqual({ phase: 2, snap: false });
  });

  it("completed wizard pins phase to MAX (7)", () => {
    const r = resolveResumePhase(
      {
        currentPhase: 7,
        completedPhases: [1, 2, 3, 4, 5, 6, 7],
        completedAt: "2026-05-07T10:00:00Z",
      },
      { currentlyActive: 1, isFirstLoad: true },
    );
    expect(r.phase).toBe(7);
  });

  it("clamps server-reported out-of-range phase", () => {
    expect(
      resolveResumePhase(
        { currentPhase: 99, completedPhases: [], completedAt: null },
        { currentlyActive: 1, isFirstLoad: true },
      ).phase,
    ).toBe(7);
    expect(
      resolveResumePhase(
        { currentPhase: -3, completedPhases: [], completedAt: null },
        { currentlyActive: 1, isFirstLoad: true },
      ).phase,
    ).toBe(1);
  });

  it("clamps fractional currentPhase", () => {
    expect(
      resolveResumePhase(
        { currentPhase: 3.7, completedPhases: [1, 2], completedAt: null },
        { currentlyActive: 1, isFirstLoad: true },
      ).phase,
    ).toBe(3);
  });

  it("treats NaN/Infinity as MIN", () => {
    expect(
      resolveResumePhase(
        { currentPhase: NaN, completedPhases: [], completedAt: null },
        { currentlyActive: 1, isFirstLoad: true },
      ).phase,
    ).toBe(1);
    expect(
      resolveResumePhase(
        { currentPhase: Infinity, completedPhases: [], completedAt: null },
        { currentlyActive: 1, isFirstLoad: true },
      ).phase,
    ).toBe(1);
  });
});

describe("canNavigateToPhase", () => {
  const baseState = {
    currentPhase: 4,
    completedPhases: [1, 2, 3],
    completedAt: null,
  };

  it("allows navigation to completed phases", () => {
    expect(canNavigateToPhase(baseState, 1)).toBe(true);
    expect(canNavigateToPhase(baseState, 2)).toBe(true);
    expect(canNavigateToPhase(baseState, 3)).toBe(true);
  });

  it("allows navigation to current phase", () => {
    expect(canNavigateToPhase(baseState, 4)).toBe(true);
  });

  it("rejects navigation past currentPhase", () => {
    expect(canNavigateToPhase(baseState, 5)).toBe(false);
    expect(canNavigateToPhase(baseState, 7)).toBe(false);
  });

  it("rejects out-of-range targets", () => {
    expect(canNavigateToPhase(baseState, 0)).toBe(false);
    expect(canNavigateToPhase(baseState, 8)).toBe(false);
    expect(canNavigateToPhase(baseState, -1)).toBe(false);
  });

  it("once a phase is completed, allows navigation back even after current advances", () => {
    expect(
      canNavigateToPhase(
        { currentPhase: 6, completedPhases: [1, 2, 3, 4, 5], completedAt: null },
        2,
      ),
    ).toBe(true);
  });
});

describe("canFinalize", () => {
  it("returns true when phase 7 done and all hard gates pass", () => {
    expect(
      canFinalize(
        { currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7], completedAt: null },
        true,
      ),
    ).toBe(true);
  });

  it("returns false when phase 7 not yet done", () => {
    expect(
      canFinalize(
        { currentPhase: 6, completedPhases: [1, 2, 3, 4, 5, 6], completedAt: null },
        true,
      ),
    ).toBe(false);
  });

  it("returns false when hard gates failing", () => {
    expect(
      canFinalize(
        { currentPhase: 7, completedPhases: [1, 2, 3, 4, 5, 6, 7], completedAt: null },
        false,
      ),
    ).toBe(false);
  });

  it("returns false when already completed", () => {
    expect(
      canFinalize(
        {
          currentPhase: 7,
          completedPhases: [1, 2, 3, 4, 5, 6, 7],
          completedAt: "2026-05-07T10:00:00Z",
        },
        true,
      ),
    ).toBe(false);
  });
});
