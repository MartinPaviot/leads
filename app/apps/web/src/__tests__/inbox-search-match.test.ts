import { describe, it, expect } from "vitest";
import { matchesSearch, isActiveQuery, type SearchCandidate } from "@/lib/inbox/search-match";
import { parseSearchQuery } from "@/lib/inbox/search-query";

const base: SearchCandidate = {
  from: "anna@acme.ch",
  subject: "Proposal for Q3",
  snippet: "Here is the pricing we discussed",
  lane: "attention",
  at: "2026-06-10T10:00:00Z",
  mailbox: "me@pilae.ch",
};

const run = (q: string, c: SearchCandidate = base) => matchesSearch(c, parseSearchQuery(q));

describe("matchesSearch (INBOX-Q04)", () => {
  it("matches free text against subject/snippet/from", () => {
    expect(run("pricing")).toBe(true); // snippet
    expect(run("proposal")).toBe(true); // subject
    expect(run("acme")).toBe(true); // from
    expect(run("nonexistent")).toBe(false);
  });

  it("honours from: and subject: operators", () => {
    expect(run("from:acme.ch")).toBe(true);
    expect(run("from:other.com")).toBe(false);
    expect(run("subject:'Q3'")).toBe(true);
    expect(run("subject:invoice")).toBe(false);
  });

  it("filters by is: lane (unread ≈ attention)", () => {
    expect(run("is:unread")).toBe(true);
    expect(run("is:done")).toBe(false);
    expect(matchesSearch({ ...base, lane: "done" }, parseSearchQuery("is:done"))).toBe(true);
  });

  it("applies before:/after: date bounds and ignores unparseable ones", () => {
    expect(run("after:2026-06-01")).toBe(true);
    expect(run("before:2026-06-01")).toBe(false);
    expect(run("before:notadate")).toBe(true); // bad value ignored, not exclude-all
  });

  it("combines operators with AND and ignores has: (uncaptured)", () => {
    expect(run("from:acme.ch subject:proposal pricing")).toBe(true);
    expect(run("from:acme.ch subject:invoice")).toBe(false);
    expect(run("has:attachment pricing")).toBe(true); // has: never excludes
  });

  it("isActiveQuery distinguishes real queries from empty", () => {
    expect(isActiveQuery(parseSearchQuery(""))).toBe(false);
    expect(isActiveQuery(parseSearchQuery("   "))).toBe(false);
    expect(isActiveQuery(parseSearchQuery("hello"))).toBe(true);
    expect(isActiveQuery(parseSearchQuery("from:x"))).toBe(true);
  });
});
