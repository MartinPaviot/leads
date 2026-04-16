import { describe, it, expect } from "vitest";
import { generateInviteToken, hashInviteToken } from "@/lib/invite-token";

describe("invite-token — H5 regression", () => {
  it("generates a raw token of sufficient entropy", () => {
    const { raw } = generateInviteToken();
    // 24 bytes base64url = 32 chars; the hash side is hex-sha256 = 64.
    expect(raw.length).toBe(32);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces the same hash for the same raw input (deterministic lookup)", () => {
    const a = hashInviteToken("the-same-token-value");
    const b = hashInviteToken("the-same-token-value");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashInviteToken("a")).not.toBe(hashInviteToken("b"));
  });

  it("hash matches the pair emitted by generateInviteToken", () => {
    const { raw, hash } = generateInviteToken();
    expect(hashInviteToken(raw)).toBe(hash);
  });

  it("hash is not equal to the raw token (belt-and-braces)", () => {
    const { raw, hash } = generateInviteToken();
    expect(hash).not.toBe(raw);
  });

  it("generated raw tokens are unique across many draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateInviteToken().raw);
    expect(seen.size).toBe(500);
  });
});
