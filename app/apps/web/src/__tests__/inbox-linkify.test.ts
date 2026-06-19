import { describe, it, expect } from "vitest";
import { linkifyPlainText } from "@/lib/inbox/linkify";

describe("linkifyPlainText (INBOX-R09)", () => {
  it("links an http(s) URL and keeps the surrounding text", () => {
    expect(linkifyPlainText("see https://elevay.dev/x now")).toEqual([
      { type: "text", text: "see " },
      { type: "link", text: "https://elevay.dev/x", href: "https://elevay.dev/x" },
      { type: "text", text: " now" },
    ]);
  });

  it("upgrades a bare www. host to https", () => {
    expect(linkifyPlainText("visit www.example.com")[1]).toEqual({
      type: "link",
      text: "www.example.com",
      href: "https://www.example.com",
    });
  });

  it("turns an email address into a mailto: link", () => {
    expect(linkifyPlainText("ping bob@acme.ch please")[1]).toEqual({
      type: "link",
      text: "bob@acme.ch",
      href: "mailto:bob@acme.ch",
    });
  });

  it("strips trailing sentence punctuation out of the link", () => {
    const segs = linkifyPlainText("read https://x.com/a.");
    expect(segs[1]).toEqual({ type: "link", text: "https://x.com/a", href: "https://x.com/a" });
    expect(segs[2]).toEqual({ type: "text", text: "." });
  });

  it("keeps a parenthesis out of the link", () => {
    const segs = linkifyPlainText("(https://x.com)");
    const link = segs.find((s) => s.type === "link");
    expect(link).toEqual({ type: "link", text: "https://x.com", href: "https://x.com" });
    expect(segs.some((s) => s.type === "text" && s.text.includes(")"))).toBe(true);
  });

  it("returns a single text segment when there are no links", () => {
    expect(linkifyPlainText("just words here")).toEqual([{ type: "text", text: "just words here" }]);
  });

  it("returns [] for empty input", () => {
    expect(linkifyPlainText("")).toEqual([]);
  });

  it("links multiple tokens in one string", () => {
    const segs = linkifyPlainText("a https://1.example b https://2.example");
    expect(segs.filter((s) => s.type === "link")).toHaveLength(2);
  });
});
