// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThreadLabels } from "../_thread-labels";

/**
 * B6.3 — the `openSignal` bridge: bumping it (the `l` key / "Label" palette
 * command, relayed page -> pane -> here) opens the add-label input on the open
 * thread; the initial 0/undefined mount must NOT auto-open it.
 */

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ labels: [], suggestions: [] }) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("ThreadLabels — B6.3 openSignal", () => {
  it("renders the '+ Label' button and no input by default", () => {
    render(<ThreadLabels conversationKey="k1" />);
    expect(screen.getByText("Label")).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Label/)).toBeNull();
  });

  it("does not auto-open on mount when openSignal is 0", () => {
    render(<ThreadLabels conversationKey="k1" openSignal={0} />);
    expect(screen.queryByPlaceholderText(/Label/)).toBeNull();
  });

  it("opens the focused add-label input when openSignal goes positive", () => {
    const { rerender } = render(<ThreadLabels conversationKey="k1" openSignal={0} />);
    expect(screen.queryByPlaceholderText(/Label/)).toBeNull();
    rerender(<ThreadLabels conversationKey="k1" openSignal={1} />);
    const input = screen.getByPlaceholderText(/Label/);
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
  });

  it("re-opens after a subsequent bump (monotonic increments)", () => {
    const { rerender } = render(<ThreadLabels conversationKey="k1" openSignal={1} />);
    expect(screen.getByPlaceholderText(/Label/)).toBeTruthy();
    rerender(<ThreadLabels conversationKey="k1" openSignal={2} />);
    expect(screen.getByPlaceholderText(/Label/)).toBeTruthy();
  });
});
