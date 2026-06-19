import { describe, it, expect } from "vitest";
import { parseMentions, type MentionMember } from "@/lib/inbox/mentions";

const members: MentionMember[] = [
  { id: "u1", name: "Anna Keller" },
  { id: "u2", name: "Bob Smith" },
];

describe("parseMentions (INBOX-X02)", () => {
  it("resolves @[Full Name] and @firstname against members", () => {
    const r = parseMentions("Hey @[Anna Keller] and @bob, please look", members);
    expect(r.mentioned.map((m) => m.id)).toEqual(["u1", "u2"]);
    expect(r.unknown).toEqual([]);
  });

  it("collects unresolved handles as unknown", () => {
    const r = parseMentions("cc @nobody here", members);
    expect(r.mentioned).toEqual([]);
    expect(r.unknown).toEqual(["nobody"]);
  });

  it("dedupes a member mentioned twice", () => {
    expect(parseMentions("@bob @[Bob Smith]", members).mentioned).toHaveLength(1);
  });

  it("returns empty for a comment with no mentions", () => {
    expect(parseMentions("no mentions here", members)).toEqual({ mentioned: [], unknown: [] });
  });
});
