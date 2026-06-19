/**
 * C1 gate — inbox noise classifier (locks B4 R1 / R5).
 *
 * Deterministic, no LLM: runs the pure classifyNoise over the hand-labeled golden
 * and asserts the published triage bars — false_demote_rate <= 0.02 (the cardinal
 * sin: a kept human thread wrongly demoted) and noise.precision >= 0.90. Plus a
 * hard zero-false-demote assertion. Wired into `pnpm eval:run`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyNoise, type NoiseInput } from "@/lib/inbox/noise";
import { noiseMetrics, type NoiseEvalCase } from "@/lib/evals/inbox-metrics";

interface GoldenLine {
  id: string;
  scenario: string;
  input: NoiseInput;
  expected: boolean;
}

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, "..", "lib", "evals", "fixtures", "inbox", "inbox-noise.golden.jsonl");

function loadGolden(): GoldenLine[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldenLine);
}

describe("inbox noise golden — fixture integrity", () => {
  const golden = loadGolden();
  it("has >= 40 cases with both labels represented", () => {
    expect(golden.length).toBeGreaterThanOrEqual(40);
    const noise = golden.filter((g) => g.expected).length;
    expect(noise, "noise cases").toBeGreaterThanOrEqual(10);
    expect(golden.length - noise, "kept cases").toBeGreaterThanOrEqual(10);
  });
  it("unique ids + well-formed input", () => {
    const ids = golden.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of golden) {
      expect(typeof g.input.isMachineSent, g.id).toBe("boolean");
      expect([1, 2, 3, 4], g.id).toContain(g.input.importanceTier);
      expect(typeof g.expected, g.id).toBe("boolean");
    }
  });
});

describe("inbox noise golden — demotion gate", () => {
  const golden = loadGolden();
  const scored: Array<NoiseEvalCase & { id: string }> = golden.map((g) => ({
    id: g.id,
    predicted: classifyNoise(g.input).noise,
    expected: g.expected,
  }));
  const m = noiseMetrics(scored);

  it("report card", () => {
    const misses = scored.filter((s) => s.predicted !== s.expected).map((s) => s.id);
    // eslint-disable-next-line no-console
    console.log(
      `[inbox-noise] support=${m.support} false_demote_rate=${m.falseDemoteRate.toFixed(3)} ` +
        `precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)} ` +
        `tp=${m.tp} fp=${m.fp} fn=${m.fn} kept=${m.keptTotal}` +
        (misses.length ? ` misses=${misses.join(",")}` : " misses=none"),
    );
    expect(m.support).toBeGreaterThanOrEqual(40);
  });

  it("false_demote_rate <= 0.02 (cardinal sin)", () => {
    expect(m.falseDemoteRate).toBeLessThanOrEqual(0.02);
  });
  it("zero false-demotes on the golden (a kept thread never demoted)", () => {
    const falseDemotes = scored.filter((s) => s.predicted && !s.expected).map((s) => s.id);
    expect(falseDemotes, `false demotes: ${falseDemotes.join(",")}`).toHaveLength(0);
  });
  it("noise.precision >= 0.90", () => {
    expect(m.precision).toBeGreaterThanOrEqual(0.9);
  });
  it("every verdict matches its label", () => {
    for (const s of scored) {
      expect(s.predicted, `${s.id} expected noise=${s.expected}`).toBe(s.expected);
    }
  });
});
