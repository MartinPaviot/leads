import { describe, it, expect } from "vitest";
import { pickListState, pickPaneState } from "../list-state";

/**
 * F3 B1 — the pure state-decision core. Table-driven so the ordering (rows win,
 * a failed load is an error not an empty lane) is locked.
 */

describe("pickListState", () => {
  const cases: Array<[string, Parameters<typeof pickListState>[0], ReturnType<typeof pickListState>]> = [
    ["rows present win even while a background load runs", { loading: true, error: false, count: 3, hasQuery: false }, "ready"],
    ["rows present win even after an error", { loading: false, error: true, count: 3, hasQuery: true }, "ready"],
    ["loading with no rows -> loading", { loading: true, error: false, count: 0, hasQuery: false }, "loading"],
    ["error with no rows -> error (not empty)", { loading: false, error: true, count: 0, hasQuery: false }, "error"],
    ["empty with no query -> empty", { loading: false, error: false, count: 0, hasQuery: false }, "empty"],
    ["empty with a query -> no-results", { loading: false, error: false, count: 0, hasQuery: true }, "no-results"],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => expect(pickListState(input)).toBe(expected));
  }

  it("loading takes precedence over error when both set and no rows", () => {
    expect(pickListState({ loading: true, error: true, count: 0, hasQuery: true })).toBe("loading");
  });
});

describe("pickPaneState", () => {
  const cases: Array<[string, Parameters<typeof pickPaneState>[0], ReturnType<typeof pickPaneState>]> = [
    ["no selection -> none", { hasSelection: false, loading: true, error: true, hasDetail: true }, "none"],
    ["selected + loading -> loading", { hasSelection: true, loading: true, error: false, hasDetail: false }, "loading"],
    ["selected + error -> error (retryable)", { hasSelection: true, loading: false, error: true, hasDetail: false }, "error"],
    ["selected + detail -> ready", { hasSelection: true, loading: false, error: false, hasDetail: true }, "ready"],
    ["selected, resolved, no detail -> missing", { hasSelection: true, loading: false, error: false, hasDetail: false }, "missing"],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => expect(pickPaneState(input)).toBe(expected));
  }

  it("error and missing are distinct: an errored fetch is never reported as 'no longer available'", () => {
    expect(pickPaneState({ hasSelection: true, loading: false, error: true, hasDetail: false })).toBe("error");
    expect(pickPaneState({ hasSelection: true, loading: false, error: false, hasDetail: false })).toBe("missing");
  });
});
