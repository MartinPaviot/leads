import { describe, it, expect } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotpSecret,
  totpAt,
  verifyTotp,
} from "@/lib/auth/totp";

// RFC 6238 Appendix B vectors (SHA-1). The published table is 8-digit;
// the 6-digit value is the same dynamic-truncation output mod 10^6,
// i.e. the last 6 digits of each table entry.
const RFC_SECRET_B32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_VECTORS: Array<[number, string]> = [
  [59_000, "287082"],
  [1_111_111_109_000, "081804"],
  [1_111_111_111_000, "050471"],
  [1_234_567_890_000, "005924"],
  [2_000_000_000_000, "279037"],
  [20_000_000_000_000, "353130"],
];

describe("totp — RFC 6238 vectors", () => {
  for (const [timeMs, expected] of RFC_VECTORS) {
    it(`produces ${expected} at t=${timeMs / 1000}s`, () => {
      expect(totpAt(RFC_SECRET_B32, timeMs)).toBe(expected);
    });
  }
});

describe("base32", () => {
  it("roundtrips arbitrary bytes", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 42]);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });
  it("decodes with spaces, dashes, padding and lowercase", () => {
    const secret = generateTotpSecret();
    const mangled = secret.toLowerCase().replace(/(.{4})/g, "$1 ") + "==";
    expect(base32Decode(mangled).equals(base32Decode(secret))).toBe(true);
  });
});

describe("verifyTotp", () => {
  const t = 1_700_000_010_000; // mid-step

  it("accepts the current code and reports the matched step", () => {
    const code = totpAt(RFC_SECRET_B32, t);
    const res = verifyTotp(code, RFC_SECRET_B32, { timeMs: t });
    expect(res.valid).toBe(true);
    expect(res.matchedStep).toBe(Math.floor(t / 1000 / 30));
  });

  it("accepts the previous/next step inside the default ±1 window", () => {
    const prev = totpAt(RFC_SECRET_B32, t - 30_000);
    const next = totpAt(RFC_SECRET_B32, t + 30_000);
    expect(verifyTotp(prev, RFC_SECRET_B32, { timeMs: t }).valid).toBe(true);
    expect(verifyTotp(next, RFC_SECRET_B32, { timeMs: t }).valid).toBe(true);
  });

  it("rejects a code two steps away", () => {
    const stale = totpAt(RFC_SECRET_B32, t - 60_000);
    // Guard against the rare collision where the stale code equals a
    // windowed one — regenerate deterministic expectation instead.
    const windowCodes = [
      totpAt(RFC_SECRET_B32, t - 30_000),
      totpAt(RFC_SECRET_B32, t),
      totpAt(RFC_SECRET_B32, t + 30_000),
    ];
    if (!windowCodes.includes(stale)) {
      expect(verifyTotp(stale, RFC_SECRET_B32, { timeMs: t }).valid).toBe(false);
    }
  });

  it("rejects malformed codes without throwing", () => {
    expect(verifyTotp("12345", RFC_SECRET_B32, { timeMs: t }).valid).toBe(false);
    expect(verifyTotp("abcdef", RFC_SECRET_B32, { timeMs: t }).valid).toBe(false);
    expect(verifyTotp("", RFC_SECRET_B32, { timeMs: t }).valid).toBe(false);
  });
});

describe("secret + otpauth", () => {
  it("generates 160-bit base32 secrets", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s).length).toBe(20);
  });
  it("builds a scannable otpauth URI", () => {
    const url = buildOtpauthUrl("ABCDEFGHIJKLMNOP", "martin@elevay.dev");
    expect(url).toContain("otpauth://totp/Elevay:martin%40elevay.dev");
    expect(url).toContain("secret=ABCDEFGHIJKLMNOP");
    expect(url).toContain("issuer=Elevay");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});
