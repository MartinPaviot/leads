import { describe, it, expect } from "vitest";
import { rewrite, buildRewritePrompt, REWRITE_PRESETS } from "@/lib/inbox/rewrite";

describe("rewrite (INBOX-C04)", () => {
  it("builds a grounded prompt carrying the instruction + body", () => {
    const p = buildRewritePrompt("Hi Anna, can we meet Tuesday?", "make it more concise");
    expect(p).toContain("make it more concise");
    expect(p).toContain("meet Tuesday");
    expect(p).toMatch(/Preserve the meaning/i);
  });

  it("returns the trimmed rewritten text from the generator", async () => {
    const gen = async () => ({ text: "  Anna — Tuesday work?  " });
    expect((await rewrite("original body", "shorter", gen)).text).toBe("Anna — Tuesday work?");
  });

  it("fails closed on empty input or generator error (caller keeps original)", async () => {
    const gen = async () => ({ text: "x" });
    expect((await rewrite("", "shorter", gen)).text).toBe("");
    expect((await rewrite("body", "  ", gen)).text).toBe("");
    const boom = async () => {
      throw new Error("model down");
    };
    expect((await rewrite("body", "shorter", boom)).text).toBe("");
  });

  it("ships GTM presets with non-empty instructions", () => {
    expect(REWRITE_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const p of REWRITE_PRESETS) {
      expect(p.id && p.label && p.instruction).toBeTruthy();
    }
  });
});
