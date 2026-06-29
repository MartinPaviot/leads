import { describe, it, expect } from "vitest";
import {
  parseExcludedMode,
  parseAccountListFilters,
  hasActiveAccountFilters,
  GRADE_RANGES,
} from "@/lib/accounts/list-filters";

const P = (q: string) => new URLSearchParams(q);

describe("parseExcludedMode", () => {
  it("maps the documented values", () => {
    expect(parseExcludedMode(undefined)).toBe("hide");
    expect(parseExcludedMode("false")).toBe("hide");
    expect(parseExcludedMode("true")).toBe("only");
    expect(parseExcludedMode("1")).toBe("only");
    expect(parseExcludedMode("all")).toBe("all");
  });
});

describe("parseAccountListFilters", () => {
  it("defaults to an empty/neutral filter set", () => {
    const f = parseAccountListFilters(P(""));
    expect(f).toEqual({
      industries: [], geographies: [], regions: [], sizes: [], revenues: [], stages: [], grades: [],
      contactReach: [], recency: [], families: [],
      enriched: null, linkedin: null, name: null, domain: null, listId: null, tab: "all", scoreMin: null, scoreMax: null,
    });
    expect(hasActiveAccountFilters(f)).toBe(false);
  });

  it("parses comma lists, trimming and dropping empties", () => {
    const f = parseAccountListFilters(P("fIndustry=Software,%20Banking%20,,Health"));
    expect(f.industries).toEqual(["Software", "Banking", "Health"]);
    expect(hasActiveAccountFilters(f)).toBe(true);
  });

  it("keeps only valid grades", () => {
    expect(parseAccountListFilters(P("fGrade=A%2B,Z,B,bogus,F")).grades).toEqual(["A+", "B", "F"]);
  });

  it("normalizes tab + linkedin to their allowed values", () => {
    expect(parseAccountListFilters(P("tab=tam")).tab).toBe("tam");
    expect(parseAccountListFilters(P("tab=manual")).tab).toBe("manual");
    expect(parseAccountListFilters(P("tab=garbage")).tab).toBe("all");
    expect(parseAccountListFilters(P("fLinkedin=has")).linkedin).toBe("has");
    expect(parseAccountListFilters(P("fLinkedin=empty")).linkedin).toBe("empty");
    expect(parseAccountListFilters(P("fLinkedin=nope")).linkedin).toBe(null);
  });

  it("normalizes the enrichment partition to yes/no/null", () => {
    expect(parseAccountListFilters(P("fEnriched=no")).enriched).toBe("no");
    expect(parseAccountListFilters(P("fEnriched=yes")).enriched).toBe("yes");
    expect(parseAccountListFilters(P("fEnriched=maybe")).enriched).toBe(null);
    expect(parseAccountListFilters(P("")).enriched).toBe(null);
  });

  it("parses numeric score bounds and rejects non-numbers", () => {
    const f = parseAccountListFilters(P("fScoreMin=70&fScoreMax=90"));
    expect(f.scoreMin).toBe(70);
    expect(f.scoreMax).toBe(90);
    expect(parseAccountListFilters(P("fScoreMin=high")).scoreMin).toBe(null);
    expect(parseAccountListFilters(P("fScoreMin=")).scoreMin).toBe(null);
  });

  it("trims free-text name/domain", () => {
    const f = parseAccountListFilters(P("fName=%20Acme%20&fDomain=acme.com"));
    expect(f.name).toBe("Acme");
    expect(f.domain).toBe("acme.com");
  });

  it("parses the account-list membership filter (fList)", () => {
    expect(parseAccountListFilters(P("fList=%20list-123%20")).listId).toBe("list-123");
    expect(parseAccountListFilters(P("fList=")).listId).toBe(null);
    expect(parseAccountListFilters(P("")).listId).toBe(null);
  });

  it("hasActiveAccountFilters reacts to each field", () => {
    expect(hasActiveAccountFilters(parseAccountListFilters(P("fGeography=Switzerland")))).toBe(true);
    expect(hasActiveAccountFilters(parseAccountListFilters(P("fScoreMin=70")))).toBe(true);
    expect(hasActiveAccountFilters(parseAccountListFilters(P("tab=tam")))).toBe(true);
    expect(hasActiveAccountFilters(parseAccountListFilters(P("fLinkedin=has")))).toBe(true);
    expect(hasActiveAccountFilters(parseAccountListFilters(P("fEnriched=no")))).toBe(true);
    expect(hasActiveAccountFilters(parseAccountListFilters(P("fList=list-123")))).toBe(true);
  });
});

describe("GRADE_RANGES", () => {
  it("matches the getGrade() thresholds (A+ open-ended)", () => {
    expect(GRADE_RANGES["A+"]).toEqual([90, null]);
    expect(GRADE_RANGES.A).toEqual([80, 90]);
    expect(GRADE_RANGES.B).toEqual([60, 80]);
    expect(GRADE_RANGES.C).toEqual([40, 60]);
    expect(GRADE_RANGES.D).toEqual([20, 40]);
    expect(GRADE_RANGES.F).toEqual([0, 20]);
  });
});
