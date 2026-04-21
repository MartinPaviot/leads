import { describe, expect, it } from "vitest";
import { hashWriteKey } from "@/lib/inbound/write-keys";

describe("inbound write keys — pure helpers", () => {
  it("hashWriteKey produces a deterministic 64-char hex digest", () => {
    const h = hashWriteKey("lk_abcdef0123456789");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
    expect(hashWriteKey("lk_abcdef0123456789")).toBe(h);
  });

  it("different raw keys produce different hashes (no collision in practice)", () => {
    const a = hashWriteKey("lk_aaaaaaaaaaaaaaaa");
    const b = hashWriteKey("lk_bbbbbbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("never emits the raw key as part of the hash output", () => {
    const raw = "lk_supersecretkey123";
    const h = hashWriteKey(raw);
    expect(h).not.toContain("lk_");
    expect(h).not.toContain("secret");
  });

  it("empty string still hashes (sha256 of empty is a well-known digest)", () => {
    expect(hashWriteKey("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
