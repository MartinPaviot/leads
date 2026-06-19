import { describe, it, expect } from "vitest";
import { parseAuthResults, initialsFor, avatarColorIndex } from "@/lib/inbox/sender-auth";

describe("parseAuthResults (INBOX-R06)", () => {
  it("passes on a real DMARC-pass header and extracts the fields", () => {
    const h = {
      "authentication-results":
        "mx.google.com; dkim=pass header.i=@stripe.com header.b=xxx; " +
        "spf=pass (google.com: domain of bounce@stripe.com designates 1.2.3.4 as permitted sender) " +
        "smtp.mailfrom=bounce@stripe.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=stripe.com",
    };
    expect(parseAuthResults(h)).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass", status: "pass" });
  });

  it("passes when SPF and DKIM both pass without an explicit DMARC verdict", () => {
    expect(parseAuthResults({ "authentication-results": "x; spf=pass; dkim=pass" }).status).toBe("pass");
  });

  it("fails on an explicit SPF or DMARC failure", () => {
    expect(parseAuthResults({ "authentication-results": "x; spf=fail; dkim=none" }).status).toBe("fail");
    expect(parseAuthResults({ "authentication-results": "x; dmarc=fail" }).status).toBe("fail");
  });

  it("is unknown when there is no header or only a partial pass", () => {
    expect(parseAuthResults(null).status).toBe("unknown");
    expect(parseAuthResults({}).status).toBe("unknown");
    expect(parseAuthResults({ "authentication-results": "x; spf=pass" }).status).toBe("unknown");
  });
});

describe("initialsFor", () => {
  it("takes two initials from a display name", () => {
    expect(initialsFor("John Doe")).toBe("JD");
  });
  it("derives initials from a dotted email local part", () => {
    expect(initialsFor("alice.martin@example.com")).toBe("AM");
  });
  it("uses the first two characters of a single token", () => {
    expect(initialsFor("Madonna")).toBe("MA");
    expect(initialsFor("bob@example.com")).toBe("BO");
  });
  it("falls back to ? for empty input", () => {
    expect(initialsFor("")).toBe("?");
  });
});

describe("avatarColorIndex", () => {
  it("is deterministic and within range", () => {
    expect(avatarColorIndex("john@x.com")).toBe(avatarColorIndex("john@x.com"));
    for (const s of ["a@x.com", "b@y.com", "long name here", ""]) {
      const i = avatarColorIndex(s);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(10);
    }
  });
});
