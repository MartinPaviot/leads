// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { AutonomyNudgeBanner } from "../autonomy-nudge-banner";

interface Call {
  url: string;
  init?: RequestInit;
}

function mockFetch(getBody: unknown, getOk = true) {
  const calls: Call[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (init?.method === "POST") {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    }
    return Promise.resolve({ ok: getOk, json: () => Promise.resolve(getBody) });
  });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
}

const postBody = (calls: Call[]) => {
  const post = calls.find((c) => c.init?.method === "POST");
  return post ? JSON.parse(post.init!.body as string) : null;
};

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AutonomyNudgeBanner", () => {
  it("renders nothing when there is no nudge", async () => {
    const { fn } = mockFetch({ nudge: null, currentMode: "review-each", trustScore: 0.2 });
    const { container } = render(<AutonomyNudgeBanner />);
    await waitFor(() => expect(fn).toHaveBeenCalledWith("/api/nudges/autonomy"));
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("stays hidden when the GET fails", async () => {
    const { fn } = mockFetch({}, false);
    const { container } = render(<AutonomyNudgeBanner />);
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("shows the batch-daily nudge and POSTs accepted on the CTA", async () => {
    const { calls } = mockFetch({ nudge: "batch-daily", currentMode: "review-each", trustScore: 0.6 });
    render(<AutonomyNudgeBanner />);

    const cta = await screen.findByRole("button", { name: /switch to daily review/i });
    fireEvent.click(cta);

    await waitFor(() =>
      expect(postBody(calls)).toEqual({ nudge: "batch-daily", response: "accepted" }),
    );
    // Banner hides after the choice is recorded.
    await waitFor(() =>
      expect(screen.queryByText(/ready for daily batch review/i)).toBeNull(),
    );
  });

  it("POSTs dismissed when the user clicks 'Not yet'", async () => {
    const { calls } = mockFetch({
      nudge: "auto-high-confidence",
      currentMode: "batch-daily",
      trustScore: 0.85,
    });
    render(<AutonomyNudgeBanner />);

    const notYet = await screen.findByRole("button", { name: /not yet/i });
    fireEvent.click(notYet);

    await waitFor(() =>
      expect(postBody(calls)).toEqual({ nudge: "auto-high-confidence", response: "dismissed" }),
    );
  });

  it("renders the auto-high-confidence copy with the outbound caveat", async () => {
    mockFetch({ nudge: "auto-high-confidence", currentMode: "batch-daily", trustScore: 0.85 });
    render(<AutonomyNudgeBanner />);

    expect(await screen.findByText(/auto-run the easy calls/i)).toBeTruthy();
    expect(screen.getByText(/outbound sends still always ask/i)).toBeTruthy();
  });
});
