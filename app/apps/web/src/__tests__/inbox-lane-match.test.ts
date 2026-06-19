import { describe, it, expect } from "vitest";
import { laneMatches, clauseMatches, filterByLane, type MatchCandidate } from "@/lib/inbox/lane-match";

const pilae: MatchCandidate = { from: "anna@pilae.ch", subject: "Re: pricing", labelIds: ["L1"] };

describe("lane-match (INBOX-T01)", () => {
  it("matches a From-domain clause", () => {
    expect(laneMatches(pilae, { clauses: [{ field: "from", op: "domain", value: "pilae.ch" }], join: "and" })).toBe(true);
    expect(laneMatches({ from: "x@other.com" }, { clauses: [{ field: "from", op: "domain", value: "pilae.ch" }], join: "and" })).toBe(false);
  });

  it("matches a subject-contains clause", () => {
    expect(clauseMatches(pilae, { field: "subject", op: "contains", value: "pricing" })).toBe(true);
  });

  it("honours AND vs OR", () => {
    const clauses = [
      { field: "from" as const, op: "domain" as const, value: "pilae.ch" },
      { field: "subject" as const, op: "contains" as const, value: "invoice" },
    ];
    expect(laneMatches(pilae, { clauses, join: "and" })).toBe(false); // subject fails
    expect(laneMatches(pilae, { clauses, join: "or" })).toBe(true); // from passes
  });

  it("supports negated clauses", () => {
    expect(clauseMatches(pilae, { field: "from", op: "domain", value: "pilae.ch", negate: true })).toBe(false);
  });

  it("matches by attached AI label, OR'd with the query", () => {
    expect(laneMatches(pilae, { clauses: [], join: "and", aiLabelIds: ["L1"] })).toBe(true);
    expect(laneMatches(pilae, { clauses: [{ field: "from", op: "is", value: "nope@x.com" }], join: "and", aiLabelIds: ["L1"] })).toBe(true);
  });

  it("an empty definition matches nothing", () => {
    expect(laneMatches(pilae, { clauses: [], join: "and" })).toBe(false);
  });
});

describe("filterByLane (INBOX-T01)", () => {
  it("keeps only the items matching the lane, via the candidate extractor", () => {
    const items = [
      { key: "a", from: "anna@pilae.ch", subject: "Hi" },
      { key: "b", from: "x@other.com", subject: "Hi" },
    ];
    const def = {
      clauses: [{ field: "from" as const, op: "domain" as const, value: "pilae.ch" }],
      join: "and" as const,
    };
    const out = filterByLane(items, def, (i) => ({ from: i.from, subject: i.subject }));
    expect(out.map((i) => i.key)).toEqual(["a"]);
  });
});
