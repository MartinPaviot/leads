import { describe, expect, it } from "vitest";
import { isEmptyEmailBody, EMPTY_BODY_REASON } from "../empty-body-guard";

describe("isEmptyEmailBody", () => {
  it("treats a real plain-text body as non-empty", () => {
    expect(isEmptyEmailBody("", "Hi Sarah, congrats on the raise.")).toBe(false);
  });

  it("treats a real HTML body as non-empty", () => {
    expect(isEmptyEmailBody("<p>Hi Sarah, congrats on the raise.</p>", "")).toBe(false);
  });

  it("flags both-blank as empty", () => {
    expect(isEmptyEmailBody("", "")).toBe(true);
    expect(isEmptyEmailBody(null, null)).toBe(true);
    expect(isEmptyEmailBody(undefined, undefined)).toBe(true);
    expect(isEmptyEmailBody("   ", "\n\t ")).toBe(true);
  });

  it("flags HTML that is only structural tags / entities as empty (no readable content)", () => {
    // This is exactly what the copy path emits with no assets: an empty body
    // that downstream footer/pixel injection would otherwise mask.
    expect(isEmptyEmailBody("<p></p>", "")).toBe(true);
    expect(isEmptyEmailBody("<div><br/></div>", "")).toBe(true);
    expect(isEmptyEmailBody("&nbsp;&nbsp;", "")).toBe(true);
    expect(isEmptyEmailBody("<p>&nbsp;</p>", null)).toBe(true);
  });

  it("is non-empty when EITHER channel has content (multipart fallback)", () => {
    expect(isEmptyEmailBody("<p></p>", "plain-text only")).toBe(false);
    expect(isEmptyEmailBody("<p>html only</p>", "")).toBe(false);
  });

  it("exposes an actionable refusal reason", () => {
    expect(EMPTY_BODY_REASON).toMatch(/empty message body/i);
    expect(EMPTY_BODY_REASON).toMatch(/copy assets/i);
  });
});
