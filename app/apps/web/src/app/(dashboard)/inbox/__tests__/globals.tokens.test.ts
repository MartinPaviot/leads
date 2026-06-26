import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// inbox/__tests__ → app/globals.css
const GLOBALS = join(here, "..", "..", "..", "globals.css");
const css = readFileSync(GLOBALS, "utf8");

describe("F1 inbox density tokens (globals.css)", () => {
  const expected: Record<string, string> = {
    "--inbox-row-height": "56px",
    "--inbox-row-height-compact": "34px",
    "--inbox-sidebar-width": "240px",
    "--inbox-list-width": "360px",
    "--inbox-cta-radius": "10px",
  };

  it("defines the five --inbox-* density tokens with exact values", () => {
    for (const [name, value] of Object.entries(expected)) {
      expect(css, name).toMatch(new RegExp(`${name}\\s*:\\s*${value.replace(".", "\\.")}\\s*;`));
    }
  });

  it("the INBOX DENSITY block introduces no color/gradient/shadow token", () => {
    const block = css.slice(css.indexOf("=== INBOX DENSITY"), css.indexOf("=== BADGE CATEGORY"));
    expect(block).not.toMatch(/--color-/);
    expect(block).not.toMatch(/--gradient-/);
    expect(block).not.toMatch(/--shadow-/);
  });
});
