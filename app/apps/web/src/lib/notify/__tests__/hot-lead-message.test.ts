import { describe, it, expect } from "vitest";
import { buildHotLeadNotification } from "../hot-lead-message";

describe("buildHotLeadNotification", () => {
  it("uses the full name + company + role + reply snippet", () => {
    const n = buildHotLeadNotification({
      firstName: "Ada", lastName: "Lovelace", company: "Analytical Engines", title: "CTO",
      classification: "interested", replyText: "Yes, let's talk next week.", reason: "explicit interest",
    });
    expect(n.title).toBe("Hot lead — Ada Lovelace at Analytical Engines replied — interested");
    expect(n.body).toContain("Ada Lovelace, CTO at Analytical Engines");
    expect(n.body).toContain('"Yes, let\'s talk next week."');
    expect(n.body).toContain("explicit interest");
  });

  it("phrases a meeting_request distinctly", () => {
    const n = buildHotLeadNotification({ firstName: "Grace", classification: "meeting_request" });
    expect(n.title).toBe("Hot lead — Grace requested a meeting");
  });

  it("falls back to email, then to a generic label, when no name", () => {
    expect(buildHotLeadNotification({ email: "ceo@acme.com", classification: "interested" }).title)
      .toBe("Hot lead — ceo@acme.com replied — interested");
    expect(buildHotLeadNotification({ classification: "interested" }).title)
      .toBe("Hot lead — A prospect replied — interested");
  });

  it("truncates a long reply to 240 chars", () => {
    const long = "x".repeat(500);
    const n = buildHotLeadNotification({ firstName: "X", classification: "interested", replyText: long });
    expect(n.body).toContain('"' + "x".repeat(240) + '"');
    expect(n.body).not.toContain("x".repeat(241));
  });

  it("contains NO emoji (in-app UI string)", () => {
    const n = buildHotLeadNotification({ firstName: "Y", classification: "interested", replyText: "hi" });
    // No characters outside the basic multilingual plane / known emoji ranges.
    expect(/\p{Extended_Pictographic}/u.test(n.title + n.body)).toBe(false);
  });
});
