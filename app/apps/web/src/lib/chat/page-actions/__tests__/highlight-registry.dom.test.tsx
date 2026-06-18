// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useRegisterEntityLocator,
  locateEntity,
  highlightEntity,
  __resetEntityLocatorsForTest,
  type EntityLocator,
  type HighlightAnchor,
} from "@/lib/chat/page-actions/registry";

/**
 * CLE-15 — the highlight registry lifecycle + fire path (DOM). matchMedia and
 * scrollIntoView are absent in the test DOM, so both are mocked. Fake timers
 * drive the self-clear window.
 */

const HIGHLIGHT_MS = 1600;

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
  // scrollIntoView is not implemented in happy-dom.
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mountNode(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-cle-entity", "e1");
  document.body.appendChild(el);
  return el;
}

describe("useRegisterEntityLocator — lifecycle (E-6)", () => {
  it("registers on mount and clears its OWN registration on unmount", () => {
    const el = mountNode();
    const locate: EntityLocator = (a) => (a.entityId === "e1" ? el : null);
    const { unmount } = renderHook(() => useRegisterEntityLocator("accounts", locate));
    expect(locateEntity({ entityId: "e1", scope: "accounts" })).toBe(el);
    unmount();
    expect(locateEntity({ entityId: "e1", scope: "accounts" })).toBeNull();
  });
});

describe("locateEntity — scope then default; never throws", () => {
  it("tries the scoped locator first, then falls back to the default", () => {
    const scoped = mountNode();
    const def = document.createElement("span");
    renderHook(() => {
      useRegisterEntityLocator("accounts", (a) => (a.entityId === "e1" ? scoped : null));
      useRegisterEntityLocator("", () => def); // default scope
    });
    expect(locateEntity({ entityId: "e1", scope: "accounts" })).toBe(scoped);
    // an id the scoped locator can't resolve falls back to default
    expect(locateEntity({ entityId: "zzz", scope: "accounts" })).toBe(def);
    // no scope -> default
    expect(locateEntity({ entityId: "x" })).toBe(def);
  });

  it("a throwing locator yields null, never propagates (AC-8)", () => {
    renderHook(() =>
      useRegisterEntityLocator("accounts", () => {
        throw new Error("buggy page locator");
      }),
    );
    expect(() => locateEntity({ entityId: "e1", scope: "accounts" })).not.toThrow();
    expect(locateEntity({ entityId: "e1", scope: "accounts" })).toBeNull();
  });
});

describe("highlightEntity — fire path", () => {
  it("adds the animated pulse class and removes it after the window (AC-7)", () => {
    vi.useFakeTimers();
    const el = mountNode();
    renderHook(() => useRegisterEntityLocator("accounts", () => el));

    highlightEntity({ entityId: "e1", scope: "accounts" });
    expect(el.classList.contains("cle-entity-highlight")).toBe(true);
    expect(el.classList.contains("cle-entity-highlight--static")).toBe(false);
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(HIGHLIGHT_MS + 10);
    expect(el.classList.contains("cle-entity-highlight")).toBe(false);
    // DOM restored exactly (no residual class).
    expect(el.className).toBe("");
  });

  it("reduced-motion -> the --static class is used, NOT the animated one (AC-6)", () => {
    vi.useFakeTimers();
    mockMatchMedia(true);
    const el = mountNode();
    renderHook(() => useRegisterEntityLocator("accounts", () => el));

    highlightEntity({ entityId: "e1", scope: "accounts" });
    expect(el.classList.contains("cle-entity-highlight--static")).toBe(true);
    expect(el.classList.contains("cle-entity-highlight")).toBe(false);

    vi.advanceTimersByTime(HIGHLIGHT_MS + 10);
    expect(el.classList.contains("cle-entity-highlight--static")).toBe(false);
  });

  it("does not move focus by default; moves it only when anchor.focus === true (AC-7)", () => {
    const el = mountNode();
    el.tabIndex = -1;
    const focusSpy = vi.spyOn(el, "focus");
    renderHook(() => useRegisterEntityLocator("accounts", () => el));

    highlightEntity({ entityId: "e1", scope: "accounts" });
    expect(focusSpy).not.toHaveBeenCalled();

    highlightEntity({ entityId: "e1", scope: "accounts", focus: true });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("absent target -> silent no-op, console.error NOT called (AC-8)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => highlightEntity({ entityId: "nope_404" })).not.toThrow();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("detached node during the window -> cleanup skipped, no throw (E-7)", () => {
    vi.useFakeTimers();
    const el = mountNode();
    renderHook(() => useRegisterEntityLocator("accounts", () => el));
    highlightEntity({ entityId: "e1", scope: "accounts" });
    expect(el.classList.contains("cle-entity-highlight")).toBe(true);
    el.remove(); // detach before the timer fires
    expect(() => vi.advanceTimersByTime(HIGHLIGHT_MS + 10)).not.toThrow();
    // node is gone; the class went away with it (isConnected guard skipped cleanup)
    expect(el.isConnected).toBe(false);
  });

  it("cap: 30 anchors -> only the first 25 are located (E-5)", () => {
    const located = vi.fn<EntityLocator>(() => null);
    renderHook(() => useRegisterEntityLocator("accounts", located));
    const anchors: HighlightAnchor[] = Array.from({ length: 30 }, (_, i) => ({ entityId: `e${i}`, scope: "accounts" }));
    highlightEntity(anchors);
    expect(located).toHaveBeenCalledTimes(25);
  });
});
