import { describe, it, expect } from "vitest";
import { computeS256Challenge, verifyPkce } from "../pkce";

describe("PKCE S256", () => {
  it("verifies a matching verifier/challenge pair", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = computeS256Challenge(verifier);
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    const challenge = computeS256Challenge("correct-verifier");
    expect(verifyPkce("wrong-verifier", challenge, "S256")).toBe(false);
  });

  it("rejects the 'plain' method entirely (OAuth 2.1 drops it)", () => {
    const verifier = "some-verifier";
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
  });

  it("rejects empty verifier or challenge", () => {
    expect(verifyPkce("", "something", "S256")).toBe(false);
    expect(verifyPkce("something", "", "S256")).toBe(false);
  });

  it("matches the well-known RFC 7636 appendix B test vector", () => {
    // RFC 7636 Appendix B example.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(computeS256Challenge(verifier)).toBe(expectedChallenge);
  });
});
