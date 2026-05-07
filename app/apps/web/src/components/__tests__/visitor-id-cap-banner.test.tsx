/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { VisitorIdCapBanner } from "@/components/visitor-id-cap-banner";

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

beforeEach(() => {
  // Clean localStorage between tests so dismissals don't carry over.
  if (typeof window !== "undefined") window.localStorage.clear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VisitorIdCapBanner — visibility branches", () => {
  it("renders nothing when spend is healthy (no warning, no reached)", async () => {
    stubFetch({
      spendUsd: 10,
      capUsd: 50,
      remainingUsd: 40,
      reached: false,
      warning: false,
      asOf: new Date().toISOString(),
    });
    const { container } = render(<VisitorIdCapBanner />);
    await waitFor(() => {
      // Component returns null after fetch.
      expect(container.firstChild).toBeNull();
    });
  });

  it("renders amber warning banner when warning=true", async () => {
    stubFetch({
      spendUsd: 46,
      capUsd: 50,
      remainingUsd: 4,
      reached: false,
      warning: true,
      asOf: "2026-05-08T10:00:00.000Z",
    });
    render(<VisitorIdCapBanner />);
    await waitFor(() =>
      expect(screen.getByText(/approaching monthly cap/i)).toBeDefined(),
    );
    expect(screen.getByText(/Adjust cap/i)).toBeDefined();
  });

  it("renders red reached banner when reached=true", async () => {
    stubFetch({
      spendUsd: 50,
      capUsd: 50,
      remainingUsd: 0,
      reached: true,
      warning: false,
      asOf: "2026-05-08T10:00:00.000Z",
    });
    render(<VisitorIdCapBanner />);
    await waitFor(() =>
      expect(screen.getByText(/identification paused/i)).toBeDefined(),
    );
    expect(screen.getByText(/cap reached/i)).toBeDefined();
  });

  it("does not render dismiss button on reached banner (hard stop)", async () => {
    stubFetch({
      spendUsd: 60,
      capUsd: 50,
      remainingUsd: 0,
      reached: true,
      warning: false,
      asOf: new Date().toISOString(),
    });
    render(<VisitorIdCapBanner />);
    await waitFor(() =>
      expect(screen.getByText(/identification paused/i)).toBeDefined(),
    );
    expect(
      screen.queryByRole("button", { name: /Dismiss banner/i }),
    ).toBeNull();
  });

  it("renders dismiss button on warning banner", async () => {
    stubFetch({
      spendUsd: 45,
      capUsd: 50,
      remainingUsd: 5,
      reached: false,
      warning: true,
      asOf: new Date().toISOString(),
    });
    render(<VisitorIdCapBanner />);
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Dismiss banner/i }),
      ).not.toBeNull(),
    );
  });
});

describe("VisitorIdCapBanner — dismissal", () => {
  it("clicking dismiss hides the warning banner + persists for the day", async () => {
    stubFetch({
      spendUsd: 45,
      capUsd: 50,
      remainingUsd: 5,
      reached: false,
      warning: true,
      asOf: new Date().toISOString(),
    });
    const { container, rerender } = render(<VisitorIdCapBanner />);
    await waitFor(() =>
      expect(screen.getByText(/approaching monthly cap/i)).toBeDefined(),
    );
    const btn = screen.getByRole("button", { name: /Dismiss banner/i });
    fireEvent.click(btn);
    // Component re-renders to null.
    await waitFor(() => {
      expect(screen.queryByText(/approaching monthly cap/i)).toBeNull();
    });
    expect(container.firstChild).toBeNull();
    // Persistence : a fresh mount should also stay hidden today.
    rerender(<VisitorIdCapBanner />);
    await waitFor(() => {
      expect(screen.queryByText(/approaching monthly cap/i)).toBeNull();
    });
  });
});

describe("VisitorIdCapBanner — fetch failure", () => {
  it("stays hidden silently on HTTP failure", async () => {
    stubFetch({ error: "boom" }, { status: 500 });
    const { container } = render(<VisitorIdCapBanner />);
    await waitFor(() => {
      // No banner ever surfaces.
      expect(container.firstChild).toBeNull();
    });
  });

  it("stays hidden on network error (fetch throws)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const { container } = render(<VisitorIdCapBanner />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});

describe("VisitorIdCapBanner — copy", () => {
  it("warning copy mentions remainingUsd + capUsd", async () => {
    stubFetch({
      spendUsd: 47.5,
      capUsd: 50,
      remainingUsd: 2.5,
      reached: false,
      warning: true,
      asOf: new Date().toISOString(),
    });
    render(<VisitorIdCapBanner />);
    await waitFor(() => expect(screen.getByText(/\$50/)).toBeDefined());
    expect(screen.getByText(/\$2\.50/)).toBeDefined();
  });

  it("reached copy explains the consequence (visits land but unmatched)", async () => {
    stubFetch({
      spendUsd: 55,
      capUsd: 50,
      remainingUsd: 0,
      reached: true,
      warning: false,
      asOf: new Date().toISOString(),
    });
    render(<VisitorIdCapBanner />);
    await waitFor(() =>
      expect(screen.getByText(/won't be matched/i)).toBeDefined(),
    );
  });
});
