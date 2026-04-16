import { describe, it, expect } from "vitest";
import { checkSpamSignals } from "@/lib/email-spam-check";

// A baseline "good" cold-outbound email with one personalisation
// token, one link, one CTA, and an unsubscribe — used as the canary
// for "doesn't trip false positives".
const CLEAN_BODY = `Hi {{first_name}},

I noticed {{company}} just raised your Series B — congrats. We help GTM
teams turn that funding into pipeline in 60 days. Worth a 15-minute
chat next week?

Best,
Martin

https://elevay.com/intro

You can unsubscribe here: {{unsubscribe_url}}`;

describe("checkSpamSignals — clean baseline", () => {
  it("returns score 0 for a normal personalised cold email", () => {
    const r = checkSpamSignals("Quick question about {{company}}", CLEAN_BODY);
    expect(r.score).toBe(0);
    expect(r.severity).toBe("clean");
    expect(r.warnings).toEqual([]);
  });

  it("does not flag short acronyms like AI, B2B, USA", () => {
    const r = checkSpamSignals(
      "AI for B2B SaaS",
      `${CLEAN_BODY}\nWe build AI for B2B teams in the USA.`
    );
    // No all-caps warning because each acronym is < 4 chars.
    expect(r.warnings.find((w) => w.code === "all-caps-words")).toBeUndefined();
  });
});

describe("checkSpamSignals — subject rules", () => {
  it("flags ALL-CAPS words in subject", () => {
    const r = checkSpamSignals("URGENT discount inside", CLEAN_BODY);
    const w = r.warnings.find((x) => x.code === "subject-all-caps");
    expect(w).toBeTruthy();
    expect(r.score).toBeGreaterThanOrEqual(20);
  });

  it("flags repeated punctuation in subject", () => {
    const r = checkSpamSignals("Don't miss out!!!", CLEAN_BODY);
    expect(r.warnings.find((w) => w.code === "subject-excessive-punct")).toBeTruthy();
  });

  it("a single ! in the subject is fine", () => {
    const r = checkSpamSignals("Hey!", CLEAN_BODY);
    expect(r.warnings.find((w) => w.code === "subject-excessive-punct")).toBeUndefined();
  });
});

describe("checkSpamSignals — body content rules", () => {
  it("flags 3+ ALL-CAPS words in body", () => {
    const body = `${CLEAN_BODY}\n\nURGENT IMPORTANT MESSAGE LIMITED TIME.`;
    const r = checkSpamSignals("Hi", body);
    expect(r.warnings.find((w) => w.code === "all-caps-words")).toBeTruthy();
  });

  it("flags 3+ exclamation marks in body", () => {
    const body = "Hey {{first_name}}! Big news! Check it out! See {{unsubscribe_url}}";
    const r = checkSpamSignals("hi", body);
    expect(r.warnings.find((w) => w.code === "excessive-exclamations")).toBeTruthy();
  });

  it("flags classic spam phrases (whole word, case-insensitive)", () => {
    const r = checkSpamSignals(
      "Hi",
      `${CLEAN_BODY}\n\nThis is 100% FREE — guaranteed results.`
    );
    expect(r.warnings.find((w) => w.code === "spammy-phrases")).toBeTruthy();
  });

  it("does not flag substrings of clean words", () => {
    // "free" is a phrase, but "freedom" should not trip on a whole-word match
    const r = checkSpamSignals(
      "Hi",
      `${CLEAN_BODY}\n\nFreedom of choice matters.`
    );
    const phraseWarn = r.warnings.find((w) => w.code === "spammy-phrases");
    expect(phraseWarn).toBeUndefined();
  });

  it("flags 3+ links in body", () => {
    const body = `Hi {{first_name}}, see https://a.com and https://b.com and https://c.com. {{unsubscribe_url}}`;
    const r = checkSpamSignals("hi", body);
    expect(r.warnings.find((w) => w.code === "too-many-links")).toBeTruthy();
  });

  it("counts markdown + anchor + raw URL forms together", () => {
    const body = `Hi {{first_name}}, see [docs](https://a.com), <a href="https://b.com">b</a>, and https://c.com. {{unsubscribe_url}}`;
    const r = checkSpamSignals("hi", body);
    expect(r.warnings.find((w) => w.code === "too-many-links")).toBeTruthy();
  });

  it("flags missing personalisation tokens", () => {
    const body = "Hello there, see our offer. unsubscribe here.";
    const r = checkSpamSignals("Hi", body);
    expect(r.warnings.find((w) => w.code === "missing-personalisation")).toBeTruthy();
  });

  it("recognises bracketed [First Name] as personalisation too", () => {
    const body = "Hi [First Name], unsubscribe here.";
    const r = checkSpamSignals("Hi", body);
    expect(r.warnings.find((w) => w.code === "missing-personalisation")).toBeUndefined();
  });

  it("flags missing unsubscribe", () => {
    const body = "Hi {{first_name}}, just checking in.";
    const r = checkSpamSignals("Hi", body);
    expect(r.warnings.find((w) => w.code === "missing-unsubscribe")).toBeTruthy();
  });

  it("accepts plain-text 'opt out' as unsubscribe signal", () => {
    const body = "Hi {{first_name}}, just checking in. You can opt-out anytime.";
    const r = checkSpamSignals("Hi", body);
    expect(r.warnings.find((w) => w.code === "missing-unsubscribe")).toBeUndefined();
  });
});

describe("checkSpamSignals — length rules", () => {
  it("flags bodies under 30 characters", () => {
    const r = checkSpamSignals("hi", "Click here.");
    expect(r.warnings.find((w) => w.code === "too-short")).toBeTruthy();
  });

  it("flags bodies over 4000 characters", () => {
    const body = "Hi {{first_name}}, " + "x".repeat(4500) + " {{unsubscribe_url}}";
    const r = checkSpamSignals("hi", body);
    expect(r.warnings.find((w) => w.code === "too-long")).toBeTruthy();
  });
});

describe("checkSpamSignals — score and severity bucketing", () => {
  it("severity 'clean' for score 0", () => {
    expect(checkSpamSignals("ok", CLEAN_BODY).severity).toBe("clean");
  });

  it("severity 'high' for the worst-case email", () => {
    const r = checkSpamSignals(
      "URGENT FREE MONEY!!!",
      "ACT NOW! GUARANTEED winners! Click here: https://a.com https://b.com https://c.com !!!"
    );
    expect(r.severity).toBe("high");
    expect(r.score).toBe(100); // capped
  });

  it("score caps at 100 even with many warnings", () => {
    const r = checkSpamSignals(
      "URGENT URGENT URGENT!!!",
      "ACT NOW!!! GUARANTEED!!! FREE MONEY!!! https://a.com https://b.com https://c.com"
    );
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("never throws on empty input", () => {
    expect(() => checkSpamSignals("", "")).not.toThrow();
    expect(checkSpamSignals("", "").score).toBe(0);
  });
});
