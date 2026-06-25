import { describe, it, expect } from "vitest";
import { mxVerifyProvider, type MxResolver } from "../mx-verify-provider";
import { statusFromSignal } from "../verify-email";

const ok: MxResolver = async () => [{ exchange: "mx1.example.com", priority: 10 }];
const noMx: MxResolver = async () => [];
const throwsCode = (code: string): MxResolver => async () => { throw Object.assign(new Error(code), { code }); };

/** Run the provider then map its signal exactly like verifyEmail does. */
async function statusFor(email: string, resolveMx: MxResolver): Promise<string> {
  const sig = await mxVerifyProvider({ resolveMx }).verify(email);
  return sig ? statusFromSignal(sig) : "unknown";
}

describe("mxVerifyProvider", () => {
  it("is free and named", () => {
    const p = mxVerifyProvider({ resolveMx: ok });
    expect(p.cost).toBe(0);
    expect(p.name).toBe("mx-dns");
  });

  it("a domain with MX records → unknown (NOT claimed valid without a mailbox probe)", async () => {
    expect(await statusFor("ceo@acme.com", ok)).toBe("unknown");
  });

  it("a domain with no MX records → invalid (cannot receive mail)", async () => {
    expect(await statusFor("ceo@acme.com", noMx)).toBe("invalid");
  });

  it("NXDOMAIN / ENODATA → invalid (definitive dead domain)", async () => {
    expect(await statusFor("ceo@nope.com", throwsCode("ENOTFOUND"))).toBe("invalid");
    expect(await statusFor("ceo@nope.com", throwsCode("ENODATA"))).toBe("invalid");
  });

  it("a transient DNS error → unknown (never condemn a real domain on a blip)", async () => {
    expect(await mxVerifyProvider({ resolveMx: throwsCode("ETIMEOUT") }).verify("x@real.com")).toBeNull();
    expect(await statusFor("x@real.com", throwsCode("ESERVFAIL"))).toBe("unknown");
  });

  it("a disposable domain → risky", async () => {
    expect(await statusFor("x@mailinator.com", ok)).toBe("risky");
  });

  it("a malformed address (no domain) → invalid", async () => {
    expect(await statusFor("not-an-email", ok)).toBe("invalid");
  });
});
