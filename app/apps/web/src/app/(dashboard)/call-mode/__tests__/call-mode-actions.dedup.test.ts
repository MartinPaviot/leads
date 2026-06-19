import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CLE-09 AC-13 — no handler logic is duplicated. After the §4 lifts, each reused
 * fetch URL must appear exactly ONCE across the Call Mode tree (the page + its
 * children + the shared helpers), used by BOTH the button/setter and the action
 * via one shared implementation. A second copy of a body shape = FAIL.
 */

const DIR = join(__dirname, "..");
const SHARED = join(DIR, "..", "..", "..", "components"); // src/components

function read(rel: string, base = DIR): string {
  return readFileSync(join(base, rel), "utf8");
}

// All Call Mode source the lifts touch, concatenated.
const sources = [
  read("page.tsx"),
  read("_call-script.tsx"),
  read("_call-actions.tsx"),
  read("_edit-campaign-modal.tsx"),
  read("_find-mobile.ts"),
  read("_panels.tsx"),
  read("meeting-scheduler.tsx", SHARED),
].join("\n");

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

describe("CLE-09 dedup — each reused fetch URL appears once across the tree", () => {
  // These are the literal URL strings each reused handler issues. After the lift
  // there must be a single occurrence (the shared copy the button + action share).
  const ONCE = [
    "/api/calls/lists/all/activate",
    "/api/calls/script/generate",
    "/api/contacts/fullenrich-enrich",
    "/api/calls/draft-email",
    "/api/meetings/book",
  ];

  for (const url of ONCE) {
    it(`"${url}" is defined exactly once`, () => {
      expect(countOccurrences(sources, `"${url}"`)).toBe(1);
    });
  }

  it("the campaign PATCH endpoint string appears once (one PATCH copy)", () => {
    // /api/calls/campaign is GET-fetched in a couple of places (bootstrap/reload);
    // the PATCH literal that editPlan + the modal share is the lifted patchPlan.
    // Assert the PATCH method is issued from a single place.
    const page = read("page.tsx");
    const modal = read("_edit-campaign-modal.tsx");
    // The modal must NOT contain its own PATCH anymore (it delegates to onSave).
    expect(modal.includes('method: "PATCH"')).toBe(false);
    expect(page.includes('method: "PATCH"')).toBe(true);
    expect(countOccurrences(page, 'method: "PATCH"')).toBe(1);
  });

  it("the zeliq-enrich POST template appears once (lifted out of handleEnrich)", () => {
    // Count the actual fetch template, not prose comments mentioning the route.
    expect(countOccurrences(sources, "${contactId}/zeliq-enrich`")).toBe(1);
  });

  it("the roleObsolete PUT body appears once (shared requestRoleObsolete)", () => {
    expect(countOccurrences(sources, "roleObsolete: true")).toBe(1);
  });
});
