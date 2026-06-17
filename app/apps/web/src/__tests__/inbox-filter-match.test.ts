import { describe, it, expect } from "vitest";
import { filterMatches, foldExamples, applyLabelFilters, type DeterministicFilter, type LabelFilter } from "@/lib/inbox/filter-match";

describe("filterMatches (INBOX-T02 deterministic core)", () => {
  const f: DeterministicFilter = {
    clauses: [{ field: "from", op: "contains", value: "billing@" }],
    join: "and",
    action: "label",
    labelId: "invoices",
  };

  it("fires on a deterministic criteria match", () => {
    expect(filterMatches({ from: "billing@acme.com" }, f)).toBe(true);
    expect(filterMatches({ from: "sales@acme.com" }, f)).toBe(false);
  });

  it("never fires with no criteria", () => {
    expect(filterMatches({ from: "x@y.com" }, { ...f, clauses: [] })).toBe(false);
  });
});

describe("foldExamples (correct/wrong preview loop)", () => {
  it("adds marks and dedupes by key with the latest winning", () => {
    const folded = foldExamples(
      [{ key: "a", correct: true }],
      [{ key: "b", correct: false }, { key: "a", correct: false }],
    );
    expect(folded).toHaveLength(2);
    expect(folded.find((e) => e.key === "a")!.correct).toBe(false); // re-marked wrong
    expect(folded.find((e) => e.key === "b")!.correct).toBe(false);
  });

  it("starts from nothing", () => {
    expect(foldExamples([], [{ key: "a", correct: true }])).toEqual([{ key: "a", correct: true }]);
  });
});

describe("applyLabelFilters (INBOX-T02)", () => {
  const filters: LabelFilter[] = [
    { id: "1", name: "Pricing", clauses: [{ field: "subject", op: "contains", value: "pricing" }], join: "and", action: "label", label: "Pricing" },
    { id: "2", name: "Invoices", clauses: [{ field: "from", op: "contains", value: "billing@" }], join: "and", action: "label", label: "Invoices" },
  ];

  it("returns the labels of matching label-filters", () => {
    expect(applyLabelFilters({ from: "x@y.com", subject: "Re: pricing" }, filters)).toEqual(["Pricing"]);
    expect(applyLabelFilters({ from: "billing@acme.com", subject: "Invoice" }, filters)).toEqual(["Invoices"]);
  });

  it("returns [] when nothing matches", () => {
    expect(applyLabelFilters({ from: "a@b.com", subject: "hi" }, filters)).toEqual([]);
  });

  it("ignores non-label actions (star/archive)", () => {
    const archive: LabelFilter[] = [
      { id: "3", name: "x", clauses: [{ field: "subject", op: "contains", value: "hi" }], join: "and", action: "archive", label: "X" },
    ];
    expect(applyLabelFilters({ subject: "hi" }, archive)).toEqual([]);
  });
});
