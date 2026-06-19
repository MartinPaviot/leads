// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useRegisterEntityLocator,
  locateEntity,
  highlightEntity,
  __resetEntityLocatorsForTest,
  type HighlightAnchor,
} from "@/lib/chat/page-actions/registry";

/**
 * CLE-15 — the dock afterNavigation bounded poll (design §5.2). router.push is
 * async: the target page mounts and registers its locator on a later tick, so
 * the highlight ctx retries briefly (12 × 100ms) until the locator resolves,
 * then gives up silently. This exercises the exact poll algorithm the dock's
 * `highlight` ctx uses, against the REAL registry.
 */

// The verbatim poll from chat-dock.tsx onDirective ctx.highlight (afterNavigation).
function afterNavigationHighlight(anchor: HighlightAnchor | HighlightAnchor[]) {
  const first = Array.isArray(anchor) ? anchor[0] : anchor;
  if (!first) return;
  let tries = 0;
  const tick = () => {
    if (locateEntity(first)) {
      highlightEntity(anchor);
      return;
    }
    if (++tries >= 12) return;
    window.setTimeout(tick, 100);
  };
  tick();
}

function mockMatchMedia(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  __resetEntityLocatorsForTest();
  mockMatchMedia(false);
  Element.prototype.scrollIntoView = vi.fn();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("dock afterNavigation poll", () => {
  it("pulses once the locator appears on a later tick (AC-5)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const anchor: HighlightAnchor = { entityId: "e1", scope: "accounts" };

    afterNavigationHighlight(anchor);
    // not registered yet -> no class
    expect(el.classList.contains("cle-entity-highlight")).toBe(false);

    // page mounts + registers its locator ~250ms later
    vi.advanceTimersByTime(250);
    renderHook(() => useRegisterEntityLocator("accounts", () => el));

    vi.advanceTimersByTime(200); // next poll tick resolves it
    expect(el.classList.contains("cle-entity-highlight")).toBe(true);
  });

  it("gives up silently after the ~1.2s budget when no locator ever registers (E-3)", () => {
    const anchor: HighlightAnchor = { entityId: "ghost", scope: "accounts" };
    expect(() => {
      afterNavigationHighlight(anchor);
      vi.advanceTimersByTime(5000); // well past 12 × 100ms
    }).not.toThrow();
    // nothing to assert beyond "no throw + terminated" — the poll bounded out.
  });
});
