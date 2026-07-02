import { describe, it, expect } from "vitest";
import { activityExcerpt, decisionAwareExcerpt, ACTIVITY_EXCERPT_MAX } from "../excerpt";

describe("activityExcerpt", () => {
  it("returns null for empty/whitespace/null/undefined bodies", () => {
    expect(activityExcerpt(null)).toBeNull();
    expect(activityExcerpt(undefined)).toBeNull();
    expect(activityExcerpt("")).toBeNull();
    expect(activityExcerpt("   \n\t ")).toBeNull();
  });

  it("collapses runs of whitespace/newlines to single spaces", () => {
    expect(activityExcerpt("Yes,\n\n we are   good\tto go")).toBe(
      "Yes, we are good to go",
    );
  });

  it("passes a short body through, trimmed", () => {
    expect(activityExcerpt("  Send the contract.  ")).toBe("Send the contract.");
  });

  it("caps at ACTIVITY_EXCERPT_MAX and appends a single ellipsis", () => {
    const long = "x".repeat(ACTIVITY_EXCERPT_MAX + 50);
    const out = activityExcerpt(long)!;
    expect((out.match(/x/g) || []).length).toBe(ACTIVITY_EXCERPT_MAX);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(ACTIVITY_EXCERPT_MAX + 1);
  });

  it("does not append an ellipsis when exactly at the cap", () => {
    const exact = "y".repeat(ACTIVITY_EXCERPT_MAX);
    expect(activityExcerpt(exact)).toBe(exact);
  });
});

describe("decisionAwareExcerpt", () => {
  it("returns null for empty/null bodies", () => {
    expect(decisionAwareExcerpt(null)).toBeNull();
    expect(decisionAwareExcerpt("   ")).toBeNull();
  });

  it("is byte-identical to the head cap when there is NO decision cue", () => {
    const body = "Thanks for the update, I'll take a look and circle round to you when I can.";
    expect(decisionAwareExcerpt(body)).toBe(activityExcerpt(body));
  });

  it("is byte-identical to the head cap when the cue is already in the head window", () => {
    const body = "We're good to go — send the contract and we'll sign this week.";
    expect(decisionAwareExcerpt(body)).toBe(activityExcerpt(body));
  });

  it("windows onto a BURIED cue the head cap would miss (EN)", () => {
    const pleasantries = "x".repeat(300); // pushes the cue well past the 160 head
    const body = `${pleasantries} bottom line: we're good to go, send the order form.`;
    const out = decisionAwareExcerpt(body)!;
    expect(out).toContain("good to go");
    expect(out).toContain("order form");
    expect(out.startsWith("…")).toBe(true); // leading ellipsis = windowed, not head
    // the OLD head-only excerpt genuinely loses it
    expect(activityExcerpt(body)!).not.toContain("good to go");
  });

  it("windows onto a buried cue (FR)", () => {
    const pleasantries = "a".repeat(300);
    const body = `${pleasantries} en résumé, c'est bon pour nous, on signe.`;
    const out = decisionAwareExcerpt(body)!.toLowerCase();
    expect(out).toContain("c'est bon");
    expect(out.startsWith("…")).toBe(true);
  });

  it("stays within the cap (+ at most two ellipses)", () => {
    const body = "z".repeat(300) + " let's proceed and " + "w".repeat(300);
    const out = decisionAwareExcerpt(body)!;
    expect(out.length).toBeLessThanOrEqual(ACTIVITY_EXCERPT_MAX + 2);
    expect(out).toContain("let's proceed");
  });

  // ── 2026-07-02 hostile-audit regressions ──────────────────────────────
  // JS `\b` after an accented char never matches, so every FR cue ending in
  // an accent was DEAD ("validé" next to a space = no boundary). And the
  // window anchored via s.indexOf(m[0]), which an earlier CONTAINING word
  // ("concerning" ⊃ "concern") could pull off the real cue.

  it("matches FR cues ending in an accented char (the dead \\b branch)", () => {
    const pad = "a".repeat(300);
    const out = decisionAwareExcerpt(`${pad} le budget est validé par la direction.`)!;
    expect(out.toLowerCase()).toContain("validé");
    const out2 = decisionAwareExcerpt(`${pad} honnêtement c'est trop cher pour nous.`)!;
    expect(out2.toLowerCase()).toContain("trop cher");
  });

  it("matches FR internal-validation phrasings", () => {
    const pad = "b".repeat(300);
    const out = decisionAwareExcerpt(`${pad} on doit valider en interne avant.`)!;
    expect(out.toLowerCase()).toContain("valider en interne");
  });

  it("anchors the window at the MATCH, not at an earlier containing word", () => {
    // "concerning" sits in the head; the real standalone cue is buried. The old
    // indexOf(m[0]) anchor resolved inside "concerning" (head) and returned the
    // head cap, losing the actual signal.
    const body =
      "It was concerning weather all week here in Lyon honestly. " +
      "c".repeat(250) +
      " our main concern is the seat price for this year.";
    const out = decisionAwareExcerpt(body)!;
    expect(out).toContain("concern is the seat price");
  });
});
