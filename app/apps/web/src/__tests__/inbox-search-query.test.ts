import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "@/lib/inbox/search-query";

describe("parseSearchQuery (INBOX-Q04)", () => {
  it("parses operators and keeps the free text", () => {
    const q = parseSearchQuery("from:anna@pilae.ch subject:'Q3 budget' pricing question");
    expect(q.from).toBe("anna@pilae.ch");
    expect(q.subject).toBe("Q3 budget");
    expect(q.text).toBe("pricing question");
  });

  it("parses dates and accumulates has:/is:", () => {
    const q = parseSearchQuery("before:2026-06-01 after:2026-01-01 has:attachment is:unread is:starred");
    expect(q.before).toBe("2026-06-01");
    expect(q.after).toBe("2026-01-01");
    expect(q.has).toEqual(["attachment"]);
    expect(q.is).toEqual(["unread", "starred"]);
    expect(q.text).toBe("");
  });

  it("treats a bare query as free text", () => {
    expect(parseSearchQuery("just some words").text).toBe("just some words");
  });

  it("returns an empty text for empty input", () => {
    expect(parseSearchQuery("")).toEqual({ text: "" });
  });
});
