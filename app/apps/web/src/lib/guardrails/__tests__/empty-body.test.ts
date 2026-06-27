import { describe, it, expect } from "vitest";
import { isSendableBody } from "../empty-body";

describe("isSendableBody", () => {
  it("true for a non-empty text body", () => {
    expect(isSendableBody("Hi Marc, saw your seed round — worth a chat?", null)).toBe(true);
  });

  it("true for a non-empty html body", () => {
    expect(isSendableBody(null, "<p>Real copy here</p>")).toBe(true);
  });

  it("false for empty / whitespace text and no html", () => {
    expect(isSendableBody("", null)).toBe(false);
    expect(isSendableBody("   \n  ", null)).toBe(false);
    expect(isSendableBody(null, null)).toBe(false);
    expect(isSendableBody(undefined, undefined)).toBe(false);
  });

  it("false for tag-only / entity-only html (no real content)", () => {
    expect(isSendableBody("", "<div></div>")).toBe(false);
    expect(isSendableBody("", "<br/> &nbsp; ")).toBe(false);
    expect(isSendableBody("", "<p></p>")).toBe(false);
  });

  it("text content wins even when html is empty", () => {
    expect(isSendableBody("real copy", "<p></p>")).toBe(true);
  });
});
