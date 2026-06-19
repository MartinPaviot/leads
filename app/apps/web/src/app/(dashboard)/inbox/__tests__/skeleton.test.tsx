// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render } from "@testing-library/react";
import { InboxRowSkeleton, InboxListSkeleton, SplitStripSkeleton, RailSkeleton } from "../_skeleton";

/**
 * F3 B2 — the shared skeletons reserve the loaded footprint (no CLS) and use only
 * F1 tokens (the tokens.contract gate also enforces this; here we assert the
 * row-shape + dimensions directly).
 */

describe("InboxListSkeleton", () => {
  it("renders `count` row-shaped skeletons, each at the row height", () => {
    const { container } = render(<InboxListSkeleton count={8} />);
    const rows = container.querySelectorAll(".skeleton-row");
    expect(rows.length).toBe(8);
    for (const r of rows) {
      expect((r as HTMLElement).style.minHeight).toBe("var(--inbox-row-height)");
    }
  });

  it("defaults to 8 rows", () => {
    const { container } = render(<InboxListSkeleton />);
    expect(container.querySelectorAll(".skeleton-row").length).toBe(8);
  });
});

describe("InboxRowSkeleton", () => {
  it("has a rounded-full avatar placeholder", () => {
    const { container } = render(<InboxRowSkeleton />);
    expect(container.querySelector(".rounded-full")).toBeTruthy();
  });
});

describe("SplitStripSkeleton + RailSkeleton dimensions (B6)", () => {
  it("the rail skeleton reserves the loaded rail's 212px width", () => {
    const { container } = render(<RailSkeleton />);
    expect(container.querySelector(".w-\\[212px\\]")).toBeTruthy();
  });

  it("the split strip skeleton reserves a horizontal pill strip", () => {
    const { container } = render(<SplitStripSkeleton />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(4);
  });
});

describe("no raw color literal in _skeleton.tsx (tokens only)", () => {
  it("uses var(--color-*), not a hex/rgb/hsl literal", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "..", "_skeleton.tsx"), "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[0-9]|hsl\(\s*[0-9]|oklch\(\s*[0-9.]/);
  });
});
