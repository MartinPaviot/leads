/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EvalRunDrilldown } from "@/components/evals/eval-run-drilldown";

function stubFetch(payload: unknown, opts: { status?: number } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
          status: opts.status ?? 200,
          json: async () => payload,
        }) as unknown as Response,
    ),
  );
}

const baseRun = {
  id: "r-1",
  surfaceId: "transcript-coaching-grounded",
  promptId: "transcript-coaching-grounded.v1",
  casesTotal: 8,
  casesPassed: 5,
  casesErrored: 0,
  casesFailed: 3,
  metrics: { pass_rate: 0.625, mean_citation_accuracy: 0.4 },
  totalLatencyMs: 12340,
  totalCostUsd: 0.0234,
  createdAt: "2026-05-07T10:00:00.000Z",
};

const failedCase = {
  id: "ec-1",
  caseId: "budget-direct-quote",
  passed: false,
  errored: false,
  latencyMs: 1234,
  errorMessage: null,
  outputSnippet: "[99:99] The budget is $200K based on what I know.",
  createdAt: "2026-05-07T10:00:01.000Z",
};

const erroredCase = {
  id: "ec-2",
  caseId: "competitor-named-entity",
  passed: false,
  errored: true,
  latencyMs: 200,
  errorMessage: "LLM_KEY_MISSING",
  outputSnippet: null,
  createdAt: "2026-05-07T10:00:02.000Z",
};

const passedCase = {
  id: "ec-3",
  caseId: "objection-multi-chunk",
  passed: true,
  errored: false,
  latencyMs: 850,
  errorMessage: null,
  outputSnippet: "[2:00] Bob said 'the timeline of two months feels really tight.'",
  createdAt: "2026-05-07T10:00:03.000Z",
};

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EvalRunDrilldown", () => {
  it("shows loader, then surface header + summary on success", async () => {
    stubFetch({ run: baseRun, cases: [failedCase] });
    render(<EvalRunDrilldown runId="r-1" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Run detail/)).toBeDefined());
    // Surface text appears at least once (in the prompt id + surface line).
    expect(
      screen.getAllByText(/transcript-coaching-grounded/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Total/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/8/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders failed case with output snippet", async () => {
    stubFetch({ run: baseRun, cases: [failedCase] });
    render(<EvalRunDrilldown runId="r-1" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/budget-direct-quote/)).toBeDefined(),
    );
    expect(screen.getByText(/\[99:99\] The budget/)).toBeDefined();
  });

  it("renders errored case with error message", async () => {
    stubFetch({ run: baseRun, cases: [erroredCase] });
    render(<EvalRunDrilldown runId="r-1" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/LLM_KEY_MISSING/)).toBeDefined(),
    );
    expect(screen.getByText(/competitor-named-entity/)).toBeDefined();
  });

  it("toggle 'Failing only' triggers a new fetch with onlyFailing param", async () => {
    const fetchSpy = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ run: baseRun, cases: [failedCase] }),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchSpy);
    render(<EvalRunDrilldown runId="r-1" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    // Default state is onlyFailing=true → first call has the param.
    expect(fetchSpy.mock.calls[0][0]).toContain("onlyFailing=1");
    // Click the toggle to flip to "All cases".
    const toggle = screen.getByText(/Failing only|All cases/i).closest("button")!;
    fireEvent.click(toggle);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[1][0]).not.toContain("onlyFailing=1");
  });

  it("calls onClose when the close button is clicked", async () => {
    stubFetch({ run: baseRun, cases: [] });
    const onClose = vi.fn();
    render(<EvalRunDrilldown runId="r-1" onClose={onClose} />);
    await waitFor(() => expect(screen.getByText(/Run detail/)).toBeDefined());
    const closeBtn = screen.getByRole("button", {
      name: /Close drill-down/i,
    });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders empty-state when cases array is empty + onlyFailing", async () => {
    stubFetch({ run: baseRun, cases: [] });
    render(<EvalRunDrilldown runId="r-1" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/No failing or errored cases/)).toBeDefined(),
    );
  });

  it("renders error fallback on HTTP failure", async () => {
    stubFetch({ error: "Run not found" }, { status: 404 });
    render(<EvalRunDrilldown runId="r-missing" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeDefined(),
    );
  });

  it("URL-encodes the runId so special chars don't break the path", async () => {
    const fetchSpy = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ run: baseRun, cases: [] }),
        }) as unknown as Response,
    );
    vi.stubGlobal("fetch", fetchSpy);
    render(<EvalRunDrilldown runId="r/with/slash" onClose={vi.fn()} />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("r%2Fwith%2Fslash");
  });

  it("displays passed case with output snippet (no error block) when onlyFailing=false", async () => {
    stubFetch({ run: baseRun, cases: [passedCase] });
    render(<EvalRunDrilldown runId="r-1" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByText(/objection-multi-chunk/)).toBeDefined(),
    );
    // Snippet text should be visible.
    expect(screen.getByText(/Bob said/)).toBeDefined();
    // No error block for passing cases.
    expect(screen.queryByText(/Error :/)).toBeNull();
  });
});
