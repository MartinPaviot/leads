/**
 * Anti-ARR test for the Pilae dashboard (DoD, _specs/pilae-machine R11.3).
 *
 * Reporting must use "bookings" — never "ARR" — as the headline total
 * label. "Platform ARR" remains valid as a sub-category field name
 * (the literal split column tracks Annual Recurring Revenue), so the
 * forbidden patterns target headline-total constructs like
 * `formatDealAmount(...) ... ARR` or "1M ARR" or "$X ARR".
 *
 * Why source-grep instead of rendered-DOM snapshot: the dashboard
 * fetches live data, requiring a full DOM + mocked fetch setup to
 * snapshot meaningfully. A targeted source-grep catches the actual
 * authoring failure modes (a headline like `<h1>$1.2M ARR</h1>`)
 * without flake from mock drift.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_WEB_ROOT = join(__dirname, "..", "..");

const DASHBOARD_FILES = [
  "src/app/(dashboard)/insights/pilae/page.tsx",
  "src/app/api/insights/pilae/route.ts",
];

// Patterns that would signal "this is a headline ARR claim" rather
// than a legitimate field-name usage like "Platform ARR".
//   - $1.2M ARR / 1.2M ARR / €1M ARR — numeric + ARR
//   - "ARR" as a total card header (capital, end-of-heading)
const HEADLINE_ARR_PATTERNS: RegExp[] = [
  /\$\s?\d[\d.,kKmMbB]*\s*ARR\b/,
  /€\s?\d[\d.,kKmMbB]*\s*ARR\b/,
  /\d[\d.,kKmMbB]*\s*ARR\b/,
  /total\s*arr/i,
  /annual\s*recurring/i, // expanded form is the marketing tell
];

describe("anti-ARR — Pilae dashboard reports 'bookings', not 'ARR'", () => {
  it.each(DASHBOARD_FILES)(
    "%s does not contain a headline ARR construct",
    (relPath) => {
      const full = join(REPO_WEB_ROOT, relPath);
      const content = readFileSync(full, "utf8");
      const offenders = HEADLINE_ARR_PATTERNS.filter((re) => re.test(content));
      expect(
        offenders,
        offenders.length > 0
          ? `Found headline ARR construct(s) in ${relPath}: ${offenders.map((r) => r.source).join(", ")}. Use "bookings" for totals; "Platform ARR" is only acceptable as a sub-category field label.`
          : undefined,
      ).toEqual([]);
    },
  );

  it("dashboard page mentions 'bookings' (the documented label)", () => {
    const page = readFileSync(
      join(REPO_WEB_ROOT, DASHBOARD_FILES[0]),
      "utf8",
    );
    expect(/bookings/i.test(page)).toBe(true);
  });

  it("API route declares the explicit 'bookings' label marker", () => {
    const route = readFileSync(
      join(REPO_WEB_ROOT, DASHBOARD_FILES[1]),
      "utf8",
    );
    expect(/label:\s*"bookings"/.test(route)).toBe(true);
  });
});
