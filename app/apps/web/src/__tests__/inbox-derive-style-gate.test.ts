/**
 * C1 gate — derive-style no-PII / no-hallucination floor (locks B2 R5.5 / R7.2).
 *
 * Deterministic, no LLM: runs the pure sanitizeDerivedStyle over the golden
 * fixture (clean style-only prompts vs prompts that leak an email / URL / domain
 * / amount / phone / echoed proper noun / quoted source phrase) and asserts every
 * verdict matches its label. The cardinal sin is a LEAK that passes (PII reaching
 * the user's saved prompt), so the suite hard-fails if any leaky case is accepted.
 * Wired into `pnpm eval:run`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sanitizeDerivedStyle, buildDerivePrompt, stripQuotedReply } from "@/lib/inbox/derive-style";

interface GoldenLine {
  id: string;
  scenario: string;
  sourceBodies: string[];
  derived: string;
  expectOk: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "lib", "evals", "fixtures", "inbox", "inbox-derive-style.golden.jsonl");

function loadGolden(): GoldenLine[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldenLine);
}

describe("inbox derive-style golden — fixture integrity", () => {
  const golden = loadGolden();
  it("has >= 12 cases with both labels represented", () => {
    expect(golden.length).toBeGreaterThanOrEqual(12);
    expect(golden.some((g) => g.expectOk)).toBe(true);
    expect(golden.some((g) => !g.expectOk)).toBe(true);
  });
  it("has unique ids and well-formed shape", () => {
    const ids = golden.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of golden) {
      expect(Array.isArray(g.sourceBodies), g.id).toBe(true);
      expect(typeof g.derived, g.id).toBe("string");
      expect(typeof g.expectOk, g.id).toBe("boolean");
    }
  });
});

describe("inbox derive-style golden — no-PII gate", () => {
  const golden = loadGolden();
  const scored = golden.map((g) => ({
    id: g.id,
    expectOk: g.expectOk,
    result: sanitizeDerivedStyle(g.derived, g.sourceBodies),
  }));

  it("report card", () => {
    const mismatches = scored.filter((s) => s.result.ok !== s.expectOk);
    // eslint-disable-next-line no-console
    console.log(
      `[inbox-derive-style] cases=${scored.length} ` +
        `correct=${scored.length - mismatches.length}/${scored.length}` +
        (mismatches.length ? ` mismatches=${mismatches.map((m) => m.id).join(",")}` : " mismatches=none"),
    );
    expect(scored.length).toBeGreaterThanOrEqual(12);
  });

  it("every verdict matches its label", () => {
    for (const s of scored) {
      expect(s.result.ok, `${s.id} expected ok=${s.expectOk}, reasons=${s.result.reasons.join("; ")}`).toBe(s.expectOk);
    }
  });

  it("NO leaky prompt is ever accepted (cardinal sin)", () => {
    const leakedAndAccepted = scored.filter((s) => !s.expectOk && s.result.ok).map((s) => s.id);
    expect(leakedAndAccepted, `leaks that passed: ${leakedAndAccepted.join(",")}`).toHaveLength(0);
  });

  it("no clean prompt is falsely rejected (would block a valid derive)", () => {
    const cleanButRejected = scored.filter((s) => s.expectOk && !s.result.ok).map((s) => s.id);
    expect(cleanButRejected, `clean prompts rejected: ${cleanButRejected.join(",")}`).toHaveLength(0);
  });
});

describe("sanitizeDerivedStyle — unit", () => {
  it("rejects email / url / domain / currency / phone / long number", () => {
    expect(sanitizeDerivedStyle("write to a@b.com").ok).toBe(false);
    expect(sanitizeDerivedStyle("see https://x.com").ok).toBe(false);
    expect(sanitizeDerivedStyle("mention acme.io").ok).toBe(false);
    expect(sanitizeDerivedStyle("the $50 fee").ok).toBe(false);
    expect(sanitizeDerivedStyle("call 415-555-1234").ok).toBe(false);
    expect(sanitizeDerivedStyle("the 2026 plan").ok).toBe(false);
  });
  it("allows small style figures and stopword-led directives", () => {
    expect(sanitizeDerivedStyle("Keep to 3-6 short lines; Be direct.").ok).toBe(true);
  });
  it("rejects an echoed source proper noun but not an unrelated capitalized stopword", () => {
    expect(sanitizeDerivedStyle("Match the Stripe tone", ["thanks for the Stripe docs"]).ok).toBe(false);
    expect(sanitizeDerivedStyle("Keep it concise", ["thanks for the Stripe docs"]).ok).toBe(true);
  });
  it("rejects a verbatim 6+ word source phrase", () => {
    const src = ["I wanted to circle back on the pricing proposal we discussed"];
    expect(sanitizeDerivedStyle("circle back on the pricing proposal we discussed", src).ok).toBe(false);
  });
});

describe("buildDerivePrompt — unit", () => {
  it("instructs style-only, forbids names/PII, and includes the corpus", () => {
    const p = buildDerivePrompt(["Hi Sam, sounds good.", "Thanks, will do."]);
    expect(p).toMatch(/style/i);
    expect(p).toMatch(/MUST NOT/);
    expect(p).toContain("message 1");
    expect(p).toContain("message 2");
  });
  it("caps the corpus length", () => {
    const big = ["x".repeat(50000)];
    const p = buildDerivePrompt(big);
    expect(p.length).toBeLessThan(13000);
  });
});

describe("stripQuotedReply — unit", () => {
  it("cuts at an 'On … wrote:' header and keeps the user's own text", () => {
    const body = "Sounds great, let's do Tuesday.\n\nOn Mon, Jun 16 2026, Sam wrote:\n> can we meet next week?";
    expect(stripQuotedReply(body)).toBe("Sounds great, let's do Tuesday.");
  });
  it("drops > quoted lines and original-message blocks", () => {
    const body = "Thanks!\n-----Original Message-----\nFrom: someone";
    expect(stripQuotedReply(body)).toBe("Thanks!");
  });
  it("returns trimmed body when there is no quote", () => {
    expect(stripQuotedReply("  Just my words.  ")).toBe("Just my words.");
  });
});
