import { describe, it, expect } from "vitest";
import { looksLikeHtml } from "@/lib/inbox/sanitize-email";

describe("looksLikeHtml (R09 mis-typed-part detection)", () => {
  it("detects real markup in a mis-typed text/plain part", () => {
    expect(looksLikeHtml("<p>Hello</p>")).toBe(true);
    expect(looksLikeHtml("<div>unclosed")).toBe(true);
    expect(looksLikeHtml("<!doctype html><html><body>x</body></html>")).toBe(true);
    expect(looksLikeHtml("Hello <strong>world</strong>")).toBe(true);
    expect(looksLikeHtml("see <a href='https://x.example'>here</a>")).toBe(true);
  });

  it("does NOT misread prose with stray angle brackets as HTML", () => {
    expect(looksLikeHtml("if a < b and c > d then ok")).toBe(false);
    expect(looksLikeHtml("price < 5 > 3 comparison")).toBe(false);
    expect(looksLikeHtml("plain text, no markup at all")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
  });
});
