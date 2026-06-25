import { describe, it, expect } from "vitest";
import { selectProspects, compareProspects, type ProspectCandidate } from "../select";

const c = (over: Partial<ProspectCandidate> & { contactId: string }): ProspectCandidate => ({
  companyId: `co-${over.contactId}`,
  priorityScore: 0,
  priorityScoreComputedAt: 0,
  reachable: true,
  ...over,
});

const ids = (rows: ProspectCandidate[]) => rows.map((r) => r.contactId);

describe("selectProspects — ranking", () => {
  it("orders by priorityScore desc and takes up to budget", () => {
    const rows = [c({ contactId: "a", priorityScore: 10 }), c({ contactId: "b", priorityScore: 90 }), c({ contactId: "d", priorityScore: 50 })];
    expect(ids(selectProspects(rows, 2))).toEqual(["b", "d"]);
  });

  it("ranks unscored (null priorityScore) last", () => {
    const rows = [c({ contactId: "a", priorityScore: null }), c({ contactId: "b", priorityScore: 5 })];
    expect(ids(selectProspects(rows, 5))).toEqual(["b", "a"]);
  });
});

describe("selectProspects — deterministic tie-break (idempotency)", () => {
  it("equal score → stalest computedAt first, then contactId asc", () => {
    const rows = [
      c({ contactId: "z", priorityScore: 50, priorityScoreComputedAt: 200 }),
      c({ contactId: "m", priorityScore: 50, priorityScoreComputedAt: 100 }), // stalest
      c({ contactId: "a", priorityScore: 50, priorityScoreComputedAt: 200 }),
    ];
    // m (stalest) first; then z & a tie on ts → contactId asc → a before z
    expect(ids(selectProspects(rows, 5))).toEqual(["m", "a", "z"]);
  });

  it("a re-run over the same candidates returns the identical set+order", () => {
    const rows = [c({ contactId: "a", priorityScore: 7 }), c({ contactId: "b", priorityScore: 7 }), c({ contactId: "d", priorityScore: 9 })];
    expect(ids(selectProspects(rows, 2))).toEqual(ids(selectProspects(rows, 2)));
  });

  it("does not mutate the caller's array", () => {
    const rows = [c({ contactId: "a", priorityScore: 1 }), c({ contactId: "b", priorityScore: 9 })];
    const before = ids(rows);
    selectProspects(rows, 5);
    expect(ids(rows)).toEqual(before);
  });
});

describe("selectProspects — budget cap", () => {
  it("budget 0 / negative / NaN selects nothing", () => {
    const rows = [c({ contactId: "a", priorityScore: 9 })];
    expect(selectProspects(rows, 0)).toEqual([]);
    expect(selectProspects(rows, -3)).toEqual([]);
    expect(selectProspects(rows, Number.NaN)).toEqual([]);
  });

  it("budget larger than the set returns the whole eligible set", () => {
    const rows = [c({ contactId: "a", priorityScore: 9 }), c({ contactId: "b", priorityScore: 1 })];
    expect(ids(selectProspects(rows, 100))).toEqual(["a", "b"]);
  });

  it("floors a fractional budget", () => {
    const rows = [c({ contactId: "a", priorityScore: 9 }), c({ contactId: "b", priorityScore: 8 }), c({ contactId: "d", priorityScore: 7 })];
    expect(ids(selectProspects(rows, 2.9))).toEqual(["a", "b"]);
  });
});

describe("selectProspects — exclusions (injected predicates)", () => {
  it("drops unreachable, already-enrolled, locked, suppressed before ranking", () => {
    const rows = [
      c({ contactId: "reach", priorityScore: 100 }),
      c({ contactId: "unreach", priorityScore: 99, reachable: false }),
      c({ contactId: "enrolled", priorityScore: 98 }),
      c({ contactId: "locked", priorityScore: 97 }),
      c({ contactId: "suppressed", priorityScore: 96 }),
    ];
    const out = selectProspects(rows, 10, {
      isAlreadyEnrolled: (x) => x.contactId === "enrolled",
      isLocked: (x) => x.contactId === "locked",
      isSuppressed: (x) => x.contactId === "suppressed",
    });
    expect(ids(out)).toEqual(["reach"]);
  });

  it("an empty candidate set returns []", () => {
    expect(selectProspects([], 50)).toEqual([]);
  });
});

describe("compareProspects — pure ordering", () => {
  it("is a stable comparator (score, then stalest, then id)", () => {
    expect(compareProspects(c({ contactId: "a", priorityScore: 9 }), c({ contactId: "b", priorityScore: 1 }))).toBeLessThan(0);
    expect(compareProspects(c({ contactId: "a", priorityScore: null }), c({ contactId: "b", priorityScore: 1 }))).toBeGreaterThan(0);
  });
});
