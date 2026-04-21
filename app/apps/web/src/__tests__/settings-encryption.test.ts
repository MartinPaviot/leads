import { describe, it, expect, beforeEach, afterEach } from "vitest";

const originalSecret = process.env.ELEVAY_APP_SECRET;

beforeEach(() => {
  process.env.ELEVAY_APP_SECRET =
    "test-secret-at-least-32-bytes-long-xxxxxxxxxxxxxxxxxxxxxxx";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ELEVAY_APP_SECRET;
  else process.env.ELEVAY_APP_SECRET = originalSecret;
});

describe("encryptSecret + decryptSecret round-trip", () => {
  it("encrypts then decrypts a UTF-8 string", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    const ciphertext = mod.encryptSecret("hunter2");
    expect(ciphertext).toMatch(/^v1\./);
    expect(ciphertext).not.toContain("hunter2");
    expect(mod.decryptSecret(ciphertext)).toBe("hunter2");
  });

  it("produces a different ciphertext each time (fresh IV)", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    const a = mod.encryptSecret("same-input");
    const b = mod.encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(mod.decryptSecret(a)).toBe("same-input");
    expect(mod.decryptSecret(b)).toBe("same-input");
  });

  it("handles unicode correctly", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    const plain = "clé-secrète-with-émojis-🔐";
    expect(mod.decryptSecret(mod.encryptSecret(plain))).toBe(plain);
  });

  it("rejects tampered ciphertexts", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    const original = mod.encryptSecret("hunter2");
    const parts = original.split(".");
    // Flip a single byte in the ciphertext section.
    const ct = Buffer.from(parts[2], "base64url");
    ct[0] = ct[0] ^ 0xff;
    const tampered = [parts[0], parts[1], ct.toString("base64url"), parts[3]].join(".");
    expect(() => mod.decryptSecret(tampered)).toThrow();
  });

  it("rejects truncated ciphertext", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    expect(() => mod.decryptSecret("v1.short")).toThrow(/unsupported/);
  });

  it("rejects unknown version prefix", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    const valid = mod.encryptSecret("hunter2");
    const rewritten = valid.replace(/^v1\./, "v99.");
    expect(() => mod.decryptSecret(rewritten)).toThrow(/unsupported/);
  });

  it("refuses to encrypt an empty plaintext", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    expect(() => mod.encryptSecret("")).toThrow(/non-empty/);
  });

  it("derives a 32-byte key even from a short secret (dev ergonomics)", async () => {
    process.env.ELEVAY_APP_SECRET = "short";
    // Re-import to pick up the new env var — settings-encryption
    // reads the env on each call so this just works.
    const mod = await import("@/lib/crypto/settings-encryption");
    const ct = mod.encryptSecret("hello");
    expect(mod.decryptSecret(ct)).toBe("hello");
  });

  it("surfaces missing ELEVAY_APP_SECRET explicitly", async () => {
    delete process.env.ELEVAY_APP_SECRET;
    const mod = await import("@/lib/crypto/settings-encryption");
    expect(() => mod.encryptSecret("hello")).toThrow(/ELEVAY_APP_SECRET/);
  });
});

describe("verifyCiphertextIntegrity", () => {
  it("returns true for a valid ciphertext, false for a tampered one", async () => {
    const mod = await import("@/lib/crypto/settings-encryption");
    const good = mod.encryptSecret("hunter2");
    expect(mod.verifyCiphertextIntegrity(good)).toBe(true);

    const parts = good.split(".");
    const ct = Buffer.from(parts[2], "base64url");
    ct[0] = ct[0] ^ 0xff;
    const bad = [parts[0], parts[1], ct.toString("base64url"), parts[3]].join(".");
    expect(mod.verifyCiphertextIntegrity(bad)).toBe(false);
  });
});
