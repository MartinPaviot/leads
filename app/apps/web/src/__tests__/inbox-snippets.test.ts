import { describe, it, expect } from "vitest";
import {
  interpolateSnippet,
  firstNameOf,
  normalizeSnippets,
  type Snippet,
} from "@/lib/inbox/snippets";

describe("interpolateSnippet (INBOX-X05)", () => {
  it("fills placeholders from the contact, tolerating inner whitespace", () => {
    const out = interpolateSnippet("Hi {{firstName}}, re {{ email }}", {
      firstName: "Ada",
      email: "ada@x.io",
    });
    expect(out).toBe("Hi Ada, re ada@x.io");
  });

  it("falls back to a neutral token for an unknown sender", () => {
    expect(interpolateSnippet("Hi {{firstName}},", {})).toBe("Hi there,");
    expect(interpolateSnippet("Hi {{firstName}},", { firstName: "  " })).toBe("Hi there,");
  });

  it("resolves an unrecognised variable to empty, never a dangling brace", () => {
    expect(interpolateSnippet("X {{nope}} Y", {})).toBe("X  Y");
    expect(interpolateSnippet("{{email}}", {})).toBe("");
  });
});

describe("firstNameOf", () => {
  it("takes the first token, null when empty", () => {
    expect(firstNameOf("Ada Lovelace")).toBe("Ada");
    expect(firstNameOf("  ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("normalizeSnippets", () => {
  it("drops malformed rows, blank names and duplicate ids, caps the set", () => {
    const raw = [
      { id: "1", name: "A", body: "hi" },
      { id: "2", name: "  ", body: "x" }, // blank name → dropped
      { id: "1", name: "dup", body: "y" }, // dup id → dropped
      { id: "3", name: "B" }, // missing body → dropped
      "garbage",
      null,
    ];
    const out = normalizeSnippets(raw);
    expect(out.map((s) => s.id)).toEqual(["1"]);
  });

  it("is null-safe on non-arrays", () => {
    expect(normalizeSnippets(null)).toEqual([]);
    expect(normalizeSnippets({ snippets: 1 })).toEqual([]);
  });

  it("trims long names and preserves body verbatim", () => {
    const long: Snippet = { id: "x", name: "n".repeat(200), body: "  spaced  " };
    const [s] = normalizeSnippets([long]);
    expect(s.name.length).toBe(80);
    expect(s.body).toBe("  spaced  ");
  });
});
