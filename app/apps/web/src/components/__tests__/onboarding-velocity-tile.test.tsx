/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { OnboardingVelocityTile } from "@/components/onboarding-velocity-tile";

function stubFetch(body: unknown, opts: { status?: number } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
          status: opts.status ?? 200,
          json: async () => body,
        }) as unknown as Response,
    ),
  );
}

const baseStats = {
  totalStarted: 47,
  totalCompleted: 32,
  ttcHoursP50: 4.5,
  ttcHoursP75: 12.0,
  ttcHoursP95: 48.0,
  completionRate: 0.6809,
  reachedByPhase: { 1: 47, 2: 41, 3: 36, 4: 32, 5: 32, 6: 32, 7: 32 },
  finalisedByPhase: { 1: 32, 2: 32, 3: 32, 4: 32, 5: 32, 6: 32, 7: 32 },
};

const basePayload = {
  scope: "all",
  asOf: "2026-05-08T10:00:00.000Z",
  stats: baseStats,
  dropoff: {
    1: 0.1277,
    2: 0.122,
    3: 0.1111,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
  },
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingVelocityTile", () => {
  it("renders nothing when API returns 403 (caller isn't admin)", async () => {
    stubFetch({ error: "forbidden" }, { status: 403 });
    const { container } = render(<OnboardingVelocityTile />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing when API returns 401", async () => {
    stubFetch({ error: "unauth" }, { status: 401 });
    const { container } = render(<OnboardingVelocityTile />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders nothing when totalStarted is 0 (no data yet)", async () => {
    stubFetch({
      ...basePayload,
      stats: {
        ...baseStats,
        totalStarted: 0,
        totalCompleted: 0,
        completionRate: 0,
        ttcHoursP50: null,
        ttcHoursP75: null,
        ttcHoursP95: null,
      },
    });
    const { container } = render(<OnboardingVelocityTile />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders the tile header + counts when data is present", async () => {
    stubFetch(basePayload);
    render(<OnboardingVelocityTile />);
    await waitFor(() =>
      expect(screen.getByText(/Onboarding velocity/i)).toBeDefined(),
    );
    expect(screen.getByText(/47 started, 32 finalised/i)).toBeDefined();
  });

  it("renders completion rate + TTC percentiles", async () => {
    stubFetch(basePayload);
    render(<OnboardingVelocityTile />);
    await waitFor(() =>
      expect(screen.getByText(/Completion/i)).toBeDefined(),
    );
    // 0.6809 → "68%"
    expect(screen.getByText("68%")).toBeDefined();
    expect(screen.getByText("4.5h")).toBeDefined();
    expect(screen.getByText("12.0h")).toBeDefined();
    // p95 48h → 2.0d
    expect(screen.getByText("2.0d")).toBeDefined();
  });

  it("renders dash for null percentiles", async () => {
    stubFetch({
      ...basePayload,
      stats: { ...baseStats, ttcHoursP50: null, ttcHoursP75: null, ttcHoursP95: null },
      dropoff: basePayload.dropoff,
    });
    render(<OnboardingVelocityTile />);
    await waitFor(() =>
      expect(screen.getByText(/Onboarding velocity/i)).toBeDefined(),
    );
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("renders all 7 phase rows with reach + finalised counts", async () => {
    stubFetch(basePayload);
    render(<OnboardingVelocityTile />);
    await waitFor(() => expect(screen.getByText(/Diagnostic/)).toBeDefined());
    expect(screen.getByText(/ICP & TAM/)).toBeDefined();
    expect(screen.getByText(/Email & Cal/)).toBeDefined();
    expect(screen.getByText(/Signals/)).toBeDefined();
    expect(screen.getByText(/Voice & Seq/)).toBeDefined();
    expect(screen.getByText(/Pipeline/)).toBeDefined();
    expect(screen.getByText(/Coaching/)).toBeDefined();
  });

  it("highlights phases with > 30% drop-off", async () => {
    stubFetch({
      ...basePayload,
      stats: {
        ...baseStats,
        reachedByPhase: { 1: 100, 2: 50, 3: 50, 4: 50, 5: 50, 6: 50, 7: 50 },
      },
      dropoff: { 1: 0.5, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 },
    });
    render(<OnboardingVelocityTile />);
    await waitFor(() => expect(screen.getByText(/Diagnostic/)).toBeDefined());
    // 50% drop-off displayed.
    expect(screen.getByText(/−50%/)).toBeDefined();
  });

  it("hides tile silently on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const { container } = render(<OnboardingVelocityTile />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
