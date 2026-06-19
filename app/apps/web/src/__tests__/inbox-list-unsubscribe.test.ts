import { describe, it, expect } from "vitest";
import { parseListUnsubscribe } from "@/lib/inbox/list-unsubscribe";

describe("parseListUnsubscribe (INBOX-T07)", () => {
  it("extracts http + mailto and detects one-click", () => {
    const r = parseListUnsubscribe({
      "list-unsubscribe": "<https://news.example/u?id=9>, <mailto:unsub@news.example?subject=unsubscribe>",
      "list-unsubscribe-post": "List-Unsubscribe=One-Click",
    });
    expect(r.httpUrl).toBe("https://news.example/u?id=9");
    expect(r.mailto).toBe("mailto:unsub@news.example?subject=unsubscribe");
    expect(r.oneClick).toBe(true);
    expect(r.available).toBe(true);
  });

  it("handles a mailto-only header", () => {
    const r = parseListUnsubscribe({ "list-unsubscribe": "<mailto:leave@list.example>" });
    expect(r.mailto).toBe("mailto:leave@list.example");
    expect(r.httpUrl).toBeNull();
    expect(r.oneClick).toBe(false);
    expect(r.available).toBe(true);
  });

  it("requires an http endpoint for one-click even if the POST header is present", () => {
    const r = parseListUnsubscribe({
      "list-unsubscribe": "<mailto:leave@list.example>",
      "list-unsubscribe-post": "List-Unsubscribe=One-Click",
    });
    expect(r.oneClick).toBe(false);
  });

  it("tolerates a non-bracketed header", () => {
    const r = parseListUnsubscribe({ "list-unsubscribe": "https://x.example/u, mailto:u@x.example" });
    expect(r.httpUrl).toBe("https://x.example/u");
    expect(r.mailto).toBe("mailto:u@x.example");
  });

  it("returns empty when there is no header", () => {
    expect(parseListUnsubscribe({})).toEqual({ available: false, oneClick: false, httpUrl: null, mailto: null });
    expect(parseListUnsubscribe(null)).toEqual({ available: false, oneClick: false, httpUrl: null, mailto: null });
  });
});
