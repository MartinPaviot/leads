// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderHook } from "@testing-library/react";
import {
  useRegisterEntityLocator,
  highlightEntity,
  __resetEntityLocatorsForTest,
} from "@/lib/chat/page-actions/registry";

/**
 * CLE-15 accessibility (§11 / AC-6/AC-7/AC-11):
 *  - the emphasis is NOT color-only (outline + box-shadow, not a hue swap),
 *  - reduced-motion uses a static, transition-free emphasis,
 *  - focus is never stolen unless the anchor opts in.
 */

const GLOBALS = readFileSync(path.resolve(__dirname, "../../../../app/globals.css"), "utf-8");

function block(name: string): string {
  // crude slice: from the selector to the next closing brace.
  const start = GLOBALS.indexOf(name);
  if (start === -1) return "";
  const end = GLOBALS.indexOf("}", start);
  return GLOBALS.slice(start, end + 1);
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
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("CLE-15 highlight CSS is not color-only", () => {
  it("the animated keyframe uses box-shadow (a ring), not only a color", () => {
    const kf = GLOBALS.slice(GLOBALS.indexOf("@keyframes cle-highlight-pulse"));
    expect(kf).toContain("box-shadow");
  });

  it("the static fallback uses an outline (perceivable without color vision)", () => {
    const staticCls = block(".cle-entity-highlight--static");
    expect(staticCls).toContain("outline");
  });

  it("the reduced-motion media rule disables the animation and applies an outline", () => {
    expect(GLOBALS).toContain("@keyframes cle-highlight-pulse");
    // a reduced-motion block neutralizes the animated class with an outline.
    const reduceIdx = GLOBALS.lastIndexOf("prefers-reduced-motion");
    const tail = GLOBALS.slice(reduceIdx);
    expect(tail).toContain("cle-entity-highlight");
    expect(tail).toContain("animation: none");
    expect(tail).toContain("outline");
  });
});

describe("CLE-15 highlight runtime a11y", () => {
  it("reduced-motion -> static class, no animated class (AC-6)", () => {
    mockMatchMedia(true);
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderHook(() => useRegisterEntityLocator("accounts", () => el));
    highlightEntity({ entityId: "e1", scope: "accounts" });
    expect(el.classList.contains("cle-entity-highlight--static")).toBe(true);
    expect(el.classList.contains("cle-entity-highlight")).toBe(false);
  });

  it("never steals focus by default; only on explicit focus:true (AC-7)", () => {
    const el = document.createElement("div");
    el.tabIndex = -1;
    document.body.appendChild(el);
    const focusSpy = vi.spyOn(el, "focus");
    renderHook(() => useRegisterEntityLocator("accounts", () => el));

    highlightEntity({ entityId: "e1", scope: "accounts" });
    expect(focusSpy).not.toHaveBeenCalled();

    highlightEntity({ entityId: "e1", scope: "accounts", focus: true });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
  });
});
