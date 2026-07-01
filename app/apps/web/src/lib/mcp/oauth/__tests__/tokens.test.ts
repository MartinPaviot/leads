import { describe, it, expect } from "vitest";
import { generateOpaqueToken, hashToken, generateAuthorizationCode } from "../tokens";

describe("MCP OAuth token generation/hashing", () => {
  it("generates unique, sufficiently long opaque tokens", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashToken is deterministic and one-way (same input -> same hash, different input -> different hash)", () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).not.toBe(hashToken(generateOpaqueToken()));
  });

  it("authorization codes use the same generator (opaque, unique)", () => {
    const a = generateAuthorizationCode();
    const b = generateAuthorizationCode();
    expect(a).not.toBe(b);
  });
});
