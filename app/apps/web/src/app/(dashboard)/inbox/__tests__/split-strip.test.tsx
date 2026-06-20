// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SplitStrip } from "../_split-strip";

/** Shell-redesign V2 — the split-tab strip (the second nav axis). */

const splits = [
  { id: "other", name: "Primary", count: 4 },
  { id: "needs_reply", name: "Needs Reply", count: 2 },
  { id: "promotions", name: "Promotions", count: 41 },
];

describe("SplitStrip", () => {
  it("renders one tab per split with its count, plus a Noise tab when noiseCount > 0", () => {
    render(<SplitStrip splits={splits} noiseCount={7} active={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("Promotions")).toBeTruthy();
    expect(screen.getByText("41")).toBeTruthy();
    expect(screen.getByText("Noise")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("omits the Noise tab when noiseCount is 0", () => {
    render(<SplitStrip splits={splits} noiseCount={0} active={null} onSelect={vi.fn()} />);
    expect(screen.queryByText("Noise")).toBeNull();
  });

  it("clicking a tab selects it; clicking the active tab clears it (back to all)", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SplitStrip splits={splits} noiseCount={0} active={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Promotions"));
    expect(onSelect).toHaveBeenCalledWith("promotions");
    rerender(<SplitStrip splits={splits} noiseCount={0} active="promotions" onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Promotions"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("the active tab carries the accent underline", () => {
    render(<SplitStrip splits={splits} noiseCount={0} active="needs_reply" onSelect={vi.fn()} />);
    const tab = screen.getByText("Needs Reply").closest("button")!;
    expect(tab.getAttribute("style")).toContain("var(--color-accent)");
  });
});
