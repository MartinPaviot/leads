/**
 * Pure-logic tests for onboarding-telemetry helpers (P0-3 task 3.1).
 *
 * The trackEvent dispatcher is mocked so we assert the exact event
 * name + properties our wizard fans out, including duration math.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const trackEventMock = vi.fn();

vi.mock("@/components/posthog-provider", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

import {
  trackPhaseSubmitted,
  trackWizardOpened,
  trackCompletionAttempt,
  isFreshStart,
  recordPhaseEntry,
} from "@/lib/analytics/onboarding-telemetry";

beforeEach(() => {
  trackEventMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isFreshStart", () => {
  it("true when no phases completed and currentPhase=1", () => {
    expect(isFreshStart({ completedPhases: [], currentPhase: 1 })).toBe(true);
  });
  it("false when at least one phase done", () => {
    expect(isFreshStart({ completedPhases: [1], currentPhase: 2 })).toBe(false);
  });
  it("false when starting from a non-1 phase", () => {
    expect(isFreshStart({ completedPhases: [], currentPhase: 3 })).toBe(false);
  });
});

describe("recordPhaseEntry", () => {
  it("returns the phase number + the current ms timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T10:00:00Z"));
    const r = recordPhaseEntry(3);
    expect(r.phase).toBe(3);
    expect(r.enteredAt).toBe(new Date("2026-05-07T10:00:00Z").getTime());
  });
});

describe("trackWizardOpened", () => {
  it("emits onboarding_started on fresh launch", () => {
    trackWizardOpened(
      { userId: "u-1", tenantId: "t-1" },
      { isFresh: true, resumeAtPhase: 1 },
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      "u-1",
      "onboarding_started",
      expect.objectContaining({ userId: "u-1", tenantId: "t-1" }),
    );
  });

  it("emits onboarding_resumed when not fresh + carries phase tag", () => {
    trackWizardOpened(
      { userId: "u-2", tenantId: "t-1" },
      { isFresh: false, resumeAtPhase: 4 },
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      "u-2",
      "onboarding_resumed",
      expect.objectContaining({ fromStep: "phase_4" }),
    );
  });

  it("no-ops when userId is null (session expired)", () => {
    trackWizardOpened(
      { userId: null, tenantId: "t-1" },
      { isFresh: true, resumeAtPhase: 1 },
    );
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});

describe("trackPhaseSubmitted", () => {
  it("emits onboarding_v3_phase_submitted with duration math", () => {
    vi.useFakeTimers();
    const enteredAt = new Date("2026-05-07T10:00:00Z").getTime();
    const startedAt = new Date("2026-05-07T09:00:00Z").getTime();
    vi.setSystemTime(new Date("2026-05-07T10:02:30Z"));

    trackPhaseSubmitted(
      { userId: "u-1", tenantId: "t-1" },
      2,
      { success: true },
      enteredAt,
      startedAt,
    );

    expect(trackEventMock).toHaveBeenCalledWith(
      "u-1",
      "onboarding_v3_phase_submitted",
      expect.objectContaining({
        phase: 2,
        success: true,
        durationMs: 150_000, // 2 min 30 s
        durationSinceStartMs: 3_750_000, // 1h 2m 30s
      }),
    );
  });

  it("includes validationErrors when failure", () => {
    trackPhaseSubmitted(
      { userId: "u-1", tenantId: "t-1" },
      3,
      { success: false, validationErrors: 4 },
      Date.now(),
      Date.now(),
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      "u-1",
      "onboarding_v3_phase_submitted",
      expect.objectContaining({ success: false, validationErrors: 4 }),
    );
  });

  it("durationSinceStartMs omitted when startedAt is null", () => {
    trackPhaseSubmitted(
      { userId: "u-1", tenantId: "t-1" },
      1,
      { success: true },
      Date.now(),
      null,
    );
    const props = trackEventMock.mock.calls[0][2];
    expect(props.durationSinceStartMs).toBeUndefined();
  });

  it("clamps negative durations to 0 (clock skew safety)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T10:00:00Z"));
    const futureEntry = new Date("2026-05-07T10:01:00Z").getTime(); // 1m in future
    trackPhaseSubmitted(
      { userId: "u", tenantId: "t" },
      1,
      { success: true },
      futureEntry,
      futureEntry,
    );
    const props = trackEventMock.mock.calls[0][2];
    expect(props.durationMs).toBe(0);
    expect(props.durationSinceStartMs).toBe(0);
  });

  it("no-ops when userId is null", () => {
    trackPhaseSubmitted(
      { userId: null, tenantId: "t" },
      1,
      { success: true },
      Date.now(),
      Date.now(),
    );
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});

describe("trackCompletionAttempt", () => {
  it("emits onboarding_v3_completed with success=true", () => {
    trackCompletionAttempt(
      { userId: "u", tenantId: "t" },
      { success: true, durationMs: 12345 },
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      "u",
      "onboarding_v3_completed",
      expect.objectContaining({ success: true, durationMs: 12345 }),
    );
  });

  it("emits failingGatesCount on failure", () => {
    trackCompletionAttempt(
      { userId: "u", tenantId: "t" },
      { success: false, failingGatesCount: 3, durationMs: 100 },
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      "u",
      "onboarding_v3_completed",
      expect.objectContaining({
        success: false,
        failingGatesCount: 3,
      }),
    );
  });

  it("no-ops when userId is null", () => {
    trackCompletionAttempt(
      { userId: null, tenantId: "t" },
      { success: true, durationMs: 100 },
    );
    expect(trackEventMock).not.toHaveBeenCalled();
  });
});
