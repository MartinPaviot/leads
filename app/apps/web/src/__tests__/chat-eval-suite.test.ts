import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * CHAT-09: static validation of the eval-suite JSONL. Ensures every
 * line parses, required fields are present, and tags/surface enums
 * match what the resolver knows. Doesn't execute the LLM — that's a
 * separate online-eval job.
 */

const SUITE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "_calibration",
  "chat-suite.jsonl"
);

const VALID_SURFACE_TYPES = [
  "global",
  "contact",
  "account",
  "deal",
  "meeting",
  "list",
  "slack",
  "mcp",
];

describe("chat-eval-suite", () => {
  const exists = existsSync(SUITE_PATH);

  it.skipIf(!exists)("chat-suite.jsonl exists", () => {
    expect(exists).toBe(true);
  });

  it.skipIf(!exists)("every line parses as valid JSON", () => {
    const src = readFileSync(SUITE_PATH, "utf8");
    const lines = src.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(30);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it.skipIf(!exists)("every case has required fields (id, prompt, surface)", () => {
    const src = readFileSync(SUITE_PATH, "utf8");
    const lines = src.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const c = JSON.parse(line);
      expect(c.id).toBeTruthy();
      expect(c.prompt).toBeTruthy();
      expect(c.surface).toBeDefined();
      expect(VALID_SURFACE_TYPES).toContain(c.surface.type);
    }
  });

  it.skipIf(!exists)("every case has either expectedTool or expectError", () => {
    const src = readFileSync(SUITE_PATH, "utf8");
    const lines = src.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const c = JSON.parse(line);
      const hasExpectation =
        typeof c.expectedTool === "string" || c.expectError === true;
      expect(hasExpectation).toBe(true);
    }
  });

  it.skipIf(!exists)("ids are unique", () => {
    const src = readFileSync(SUITE_PATH, "utf8");
    const lines = src.split("\n").filter((l) => l.trim().length > 0);
    const ids = lines.map((l) => JSON.parse(l).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
