/**
 * @vitest-environment happy-dom
 *
 * Component tests for the 7-phase onboarding wizard (P0-3 task 3.4).
 *
 * Mocks `fetch` so the wizard's `refreshState` + `submitPhase` flows
 * exercise their happy + sad paths without a Postgres harness. The
 * pure helpers (resume, retry, telemetry) are tested in their own
 * suites — here we focus on the wiring : did the wizard render the
 * right phase, did the right API call fire, did errors surface, etc.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock telemetry — counted in assertions, no network IO.
const trackEventMock = vi.fn();
vi.mock("@/components/posthog-provider", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

// Stub next/navigation so router.replace doesn't throw.
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: replaceMock }),
}));

import { OnboardingWizard } from "@/components/onboarding-7phase/wizard";

interface MockFetchResp {
  status: number;
  body: unknown;
}

function makeFetchMock(routes: Record<string, MockFetchResp | (() => MockFetchResp)>) {
  return vi.fn(async (url: string) => {
    const path = url.split("?")[0];
    const route = routes[path];
    if (!route) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: `unmocked: ${path}` }),
      } as unknown as Response;
    }
    const resp = typeof route === "function" ? route() : route;
    return {
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json: async () => resp.body,
    } as unknown as Response;
  });
}

const FRESH_STATE = {
  currentPhase: 1,
  completedPhases: [],
  phaseData: {},
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  completedAt: null,
  checklist: { gates: [], allHardPassed: false, failingHard: [] },
  userId: "user-1",
  tenantId: "tenant-1",
};

const RESUME_STATE_AT_PHASE_4 = {
  ...FRESH_STATE,
  currentPhase: 4,
  completedPhases: [1, 2, 3],
};

beforeEach(() => {
  trackEventMock.mockClear();
  replaceMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingWizard — mount + initial render", () => {
  it("shows a loading spinner before state arrives", async () => {
    let resolveState: (() => void) | null = null;
    const blocking = new Promise<void>((r) => {
      resolveState = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/onboarding/state")) {
          await blocking;
        }
        return {
          ok: true,
          status: 200,
          json: async () => FRESH_STATE,
        } as unknown as Response;
      }),
    );
    render(<OnboardingWizard />);
    // While fetch is pending, we should not see the heading yet.
    expect(screen.queryByText(/Configure your outbound engine/i)).toBeNull();
    resolveState?.();
  });

  it("renders header + Phase 1 form on fresh start", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": { status: 200, body: FRESH_STATE },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() =>
      expect(screen.getByText(/Configure your outbound engine/i)).toBeDefined(),
    );
    expect(screen.getByText(/Elevay setup/i)).toBeDefined();
    // Phase 1 form has the "Situation" select.
    expect(screen.getByText(/Situation/i)).toBeDefined();
  });

  it("emits onboarding_started on fresh mount", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": { status: 200, body: FRESH_STATE },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() => expect(trackEventMock).toHaveBeenCalled());
    const calls = trackEventMock.mock.calls.map((c) => c[1]);
    expect(calls).toContain("onboarding_started");
  });

  it("emits onboarding_resumed when user has completed phases", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": { status: 200, body: RESUME_STATE_AT_PHASE_4 },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() =>
      expect(trackEventMock).toHaveBeenCalledWith(
        "user-1",
        "onboarding_resumed",
        expect.objectContaining({ fromStep: "phase_4" }),
      ),
    );
  });

  it("snaps activePhase to server's currentPhase on resume", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": { status: 200, body: RESUME_STATE_AT_PHASE_4 },
      }),
    );
    render(<OnboardingWizard />);
    // Phase 4 has the "Signals" section header.
    await waitFor(() => {
      const all = screen.getAllByText(/Signals/i);
      expect(all.length).toBeGreaterThan(0);
    });
  });
});

describe("OnboardingWizard — error surfacing", () => {
  it("shows an error alert when state load returns 401 (terminal, no retry)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ error: "Unauthorized" }),
        }) as unknown as Response,
      ),
    );
    render(<OnboardingWizard />);
    // 401 is non-retryable — error surfaces fast. Pre-state-load the
    // wizard renders the spinner ; the error alert shouldn't surface
    // until refreshState gives up. The retry helper short-circuits
    // 4xx so this is one round-trip.
    await waitFor(
      () => {
        expect(screen.queryByRole("alert")).not.toBeNull();
      },
      { timeout: 5000 },
    );
  }, 8000);
});

describe("OnboardingWizard — finalise button gating", () => {
  it("does not render Finalise when phase 7 isn't completed", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": {
          status: 200,
          body: {
            ...FRESH_STATE,
            currentPhase: 7,
            completedPhases: [1, 2, 3, 4, 5, 6],
            checklist: { gates: [], allHardPassed: false, failingHard: [] },
          },
        },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() =>
      expect(screen.getByText(/Configure your outbound engine/i)).toBeDefined(),
    );
    expect(screen.queryByRole("button", { name: /Finalise onboarding/i })).toBeNull();
  });

  it("does not render Finalise when hard gates fail", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": {
          status: 200,
          body: {
            ...FRESH_STATE,
            currentPhase: 7,
            completedPhases: [1, 2, 3, 4, 5, 6, 7],
            checklist: {
              gates: [
                { key: "tam_size", required: true, pass: false, reason: "Only 5 accounts" },
              ],
              allHardPassed: false,
              failingHard: ["tam_size"],
            },
          },
        },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() =>
      expect(screen.getByText(/Configure your outbound engine/i)).toBeDefined(),
    );
    expect(screen.queryByRole("button", { name: /Finalise onboarding/i })).toBeNull();
  });

  it("renders Finalise when phase 7 done + all gates pass", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": {
          status: 200,
          body: {
            ...FRESH_STATE,
            currentPhase: 7,
            completedPhases: [1, 2, 3, 4, 5, 6, 7],
            checklist: { gates: [], allHardPassed: true, failingHard: [] },
          },
        },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Finalise onboarding/i }),
      ).not.toBeNull(),
    );
  });
});

describe("OnboardingWizard — checklist sidebar surface", () => {
  it("renders failing checklist gate reasons", async () => {
    vi.stubGlobal(
      "fetch",
      makeFetchMock({
        "/api/onboarding/state": {
          status: 200,
          body: {
            ...FRESH_STATE,
            checklist: {
              gates: [
                {
                  key: "tam_size",
                  required: true,
                  pass: false,
                  reason: "Only 12 accounts in TAM (need ≥30)",
                },
                {
                  key: "email_sync",
                  required: true,
                  pass: true,
                },
              ],
              allHardPassed: false,
              failingHard: ["tam_size"],
            },
          },
        },
      }),
    );
    render(<OnboardingWizard />);
    await waitFor(() =>
      expect(screen.getByText(/Only 12 accounts in TAM/i)).toBeDefined(),
    );
  });
});
