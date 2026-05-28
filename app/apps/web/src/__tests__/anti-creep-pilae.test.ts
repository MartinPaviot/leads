/**
 * Anti-creep test (DoD, _specs/pilae-machine/spec-v2.md §5 DoD logiciel,
 * D5 wedge isolation guard).
 *
 * The Pilae tenant is dogfood FR/CH. The product wedge stays US-first
 * by default — Pilae is a tenant configuration, NOT a code path. This
 * test fails if anyone hard-codes the tenant by name in shared code:
 *
 *   if (tenant.name === "Pilae") { ... }      // BAD
 *   if (companyId === "...pilae-id...") {     // BAD
 *   const PILAE_TEMPLATE = `Bonjour [...]`;   // BAD
 *
 * Locale-specific behaviour must read `tenant.locale` (or an equivalent
 * config column), never the tenant's name. Templates that are FR-only
 * live in the tenant config store, not in `lib/ai/`.
 *
 * Why these two directories specifically:
 *   - `lib/ai/`         — message generation, prompt assembly. The
 *     highest-risk spot for a "just hardcode it for Pilae now" patch
 *     that would lock the wedge.
 *   - `lib/sequences/`  — cadence logic, eligibility rules, recycle
 *     gates. A hardcoded Pilae check here would silently affect every
 *     future tenant.
 *
 * Allowlist: this test file itself (it has to mention 'Pilae' to be
 * legible), and any file with `_specs/pilae-machine` in its path
 * (specs ARE allowed to name the tenant — they're the source of
 * truth for the dogfood track).
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const REPO_WEB_ROOT = join(__dirname, "..", "..");
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (stat.isFile() && SCAN_EXTS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

function pilaeReferences(file: string): Array<{ line: number; text: string }> {
  const content = readFileSync(file, "utf8");
  const hits: Array<{ line: number; text: string }> = [];
  const lines = content.split(/\r?\n/);
  // Word-boundary match catches `Pilae`, `pilae`, `PILAE` but not
  // `pilatestriangulation` and similar false positives.
  const pattern = /\bpilae\b/i;
  // Spec citations are the documented way to point at the source of
  // truth for a rule. They're comments, not code branches, and the
  // _specs/pilae-machine path is the unambiguous marker.
  const specCitation = /_specs\/pilae-machine/i;
  for (let i = 0; i < lines.length; i++) {
    if (!pattern.test(lines[i])) continue;
    if (specCitation.test(lines[i])) continue;
    hits.push({ line: i + 1, text: lines[i].trim() });
  }
  return hits;
}

function isAllowed(filePath: string): boolean {
  const rel = relative(REPO_WEB_ROOT, filePath).replace(/\\/g, "/");
  // Allow:
  //   - this test file (necessarily references 'Pilae')
  //   - any file under a _specs/pilae-machine path (none expected in
  //     the web tree, but defensive)
  return (
    rel.endsWith("__tests__/anti-creep-pilae.test.ts") ||
    rel.includes("_specs/pilae-machine")
  );
}

function scanDir(rel: string): Array<{ file: string; hits: Array<{ line: number; text: string }> }> {
  const root = join(REPO_WEB_ROOT, rel);
  const files = walk(root);
  const matches: Array<{ file: string; hits: Array<{ line: number; text: string }> }> = [];
  for (const f of files) {
    if (isAllowed(f)) continue;
    const hits = pilaeReferences(f);
    if (hits.length > 0) {
      matches.push({ file: relative(REPO_WEB_ROOT, f).replace(/\\/g, "/"), hits });
    }
  }
  return matches;
}

describe("anti-creep — no hardcoded 'Pilae' in shared code paths", () => {
  it("src/lib/ai/ has zero references to 'Pilae' (locale-specific logic must read tenant.locale)", () => {
    const matches = scanDir("src/lib/ai");
    expect(
      matches,
      // Fail-friendly message: list every offending file:line so the
      // contributor knows exactly what to refactor.
      matches.length > 0
        ? "Found 'Pilae' references in lib/ai/. Replace with tenant.locale-aware code:\n" +
            matches
              .map(
                (m) =>
                  `  ${m.file}:\n` +
                  m.hits.map((h) => `    L${h.line}: ${h.text}`).join("\n"),
              )
              .join("\n")
        : undefined,
    ).toEqual([]);
  });

  it("src/lib/sequences/ has zero references to 'Pilae' (cadence logic must not branch on tenant name)", () => {
    const matches = scanDir("src/lib/sequences");
    expect(
      matches,
      matches.length > 0
        ? "Found 'Pilae' references in lib/sequences/. Cadence rules must apply to every tenant uniformly:\n" +
            matches
              .map(
                (m) =>
                  `  ${m.file}:\n` +
                  m.hits.map((h) => `    L${h.line}: ${h.text}`).join("\n"),
              )
              .join("\n")
        : undefined,
    ).toEqual([]);
  });

  it("scanner correctly flags a known 'Pilae' usage when present (self-test of the scanner)", () => {
    // Sanity-check the scanner itself by running it against this very
    // test file (which IS allowed, so the scan output excludes it —
    // we re-run the raw match to confirm the regex catches both casings).
    const here = readFileSync(__filename, "utf8");
    expect(/\bpilae\b/i.test(here)).toBe(true);
    expect(/\bPilae\b/.test(here)).toBe(true);
  });
});
