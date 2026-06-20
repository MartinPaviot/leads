import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F3 B7 — hover is CSS, not an imperative style mutation, so it survives a
 * re-render. The headline is the mailbox rail, which used to set
 * e.currentTarget.style.background on mouse enter/leave; assert that's gone and a
 * hover: utility took its place. Also assert the other swept surfaces carry a real
 * bg-hover affordance.
 */

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, "..", rel), "utf8");

describe("mailbox rail hover (B7)", () => {
  const rail = read("_mailbox-rail.tsx");

  it("no longer mutates style.background imperatively", () => {
    expect(rail).not.toMatch(/\.style\.background\s*=/);
    expect(rail).not.toMatch(/onMouseEnter|onMouseLeave/);
  });

  it("uses a CSS hover utility on the inactive row", () => {
    expect(rail).toContain("hover:bg-[var(--color-bg-hover)]");
  });
});

describe("swept hover surfaces carry a bg-hover affordance (B7)", () => {
  it("snooze presets + RSVP buttons hover to bg-hover", () => {
    expect(read("_conversation-pane.tsx")).toContain("hover:bg-[var(--color-bg-hover)]");
    expect(read("_event-card.tsx")).toContain("hover:bg-[var(--color-bg-hover)]");
  });
});
