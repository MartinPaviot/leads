// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { Floating } from "@/components/ui/floating";

afterEach(cleanup);

/**
 * The bug Floating fixes: a popover anchored near the left edge of the 224px
 * overflow-hidden queue column, opening leftward (right-aligned), got its left
 * 18-77px sliced off. Floating portals to <body> with fixed positioning and
 * CLAMPS left into the viewport, so the popover is never pushed off-screen and
 * never clipped by an ancestor overflow.
 */

// Anchor sits at x≈226..240 (an "i" icon at the right of the queue column),
// mirroring the live measurement; the popover is 224px wide.
function mockRects(anchor: DOMRect, popWidth: number, popHeight: number) {
  const orig = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.dataset.role === "anchor") return anchor;
    // any portaled popover
    if (this.style.position === "fixed") {
      return { left: 0, top: 0, right: popWidth, bottom: popHeight, width: popWidth, height: popHeight, x: 0, y: 0, toJSON() {} } as DOMRect;
    }
    return orig.call(this);
  };
  return () => { HTMLElement.prototype.getBoundingClientRect = orig; };
}

function Harness({ open, onClose }: { open: boolean; onClose?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={ref} data-role="anchor">trigger</button>
      <Floating anchorRef={ref} open={open} placement="bottom-end" onClose={onClose}>
        <div data-testid="pop">tout l&apos;icp</div>
      </Floating>
    </div>
  );
}

describe("Floating", () => {
  it("renders nothing when closed", () => {
    render(<Harness open={false} />);
    expect(screen.queryByTestId("pop")).toBeNull();
  });

  it("portals the popover to document.body when open", () => {
    render(<Harness open />);
    const pop = screen.getByTestId("pop");
    // It must NOT live inside the (clipping) anchor subtree — it's portaled to body.
    expect(pop.closest("[data-role='anchor']")).toBeNull();
    expect(document.body.contains(pop)).toBe(true);
  });

  it("clamps left into the viewport so a right-aligned popover is never pushed off-screen (the clip bug)", () => {
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });
    // Anchor "i" icon near the left rail (right edge x=100). End-aligning a
    // 224px popover would put its left at 100-224 = -124 (off-screen-left = the
    // exact clip the inline version suffered). The clamp must rescue it to >= 8.
    const restore = mockRects(
      { left: 86, top: 250, right: 100, bottom: 264, width: 14, height: 14, x: 86, y: 250, toJSON() {} } as DOMRect,
      224, 120,
    );
    render(<Harness open />);
    const layer = screen.getByTestId("pop").parentElement as HTMLElement;
    const left = parseFloat(layer.style.left);
    expect(left).toBeGreaterThanOrEqual(8); // never negative / off-screen-left → not clipped
    expect(left + 224).toBeLessThanOrEqual(1440 - 8); // fits within the right margin too
    restore();
  });

  it("closes on Escape and on outside mousedown when onClose is provided", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
