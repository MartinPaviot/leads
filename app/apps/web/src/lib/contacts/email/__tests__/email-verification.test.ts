import { describe, it, expect, vi } from "vitest";
import {
  verifyEmail,
  findAndVerifyEmail,
  isSyntaxValid,
  statusFromSignal,
  isEmailSendable,
  isLinkedInSendable,
  sendEligibility,
  EMAIL_VERIFY_TTL_MS,
  type VerifyProvider,
  type VerifyEmailDeps,
  type VerifySignal,
  type EmailVerification,
  type CandidateEmail,
} from "../index";

const passthroughMeter: VerifyEmailDeps["meter"] = (_op, fn) => fn();

/** A meter that keeps its generic signature (vi.fn can't) while recording ops. */
function spyMeter(): { meter: VerifyEmailDeps["meter"]; calls: Array<{ kind: string; amount: number; provider: string }> } {
  const calls: Array<{ kind: string; amount: number; provider: string }> = [];
  const meter: VerifyEmailDeps["meter"] = (op, fn) => {
    calls.push({ kind: op.kind, amount: op.amount, provider: op.provider });
    return fn();
  };
  return { meter, calls };
}

function provider(signal: VerifySignal | null, name = "findymail", cost = 1): VerifyProvider {
  return { name, cost, verify: vi.fn(async () => signal) };
}
function deps(p: VerifyProvider, over: Partial<VerifyEmailDeps> = {}): VerifyEmailDeps {
  return { tenantId: "t1", provider: p, meter: passthroughMeter, now: () => 1_000, ...over };
}

describe("isSyntaxValid", () => {
  it("accepts a normal business address", () => {
    expect(isSyntaxValid("jane.doe@acme.com")).toBe(true);
  });
  it("rejects malformed addresses", () => {
    for (const bad of ["", "noatsign.com", "a@b", "a@@b.com", "a b@c.com", "dup..dot@x.com", "@x.com", "a@.com"]) {
      expect(isSyntaxValid(bad)).toBe(false);
    }
  });
});

describe("statusFromSignal — AC1 mapping", () => {
  it("spam trap → invalid (never send)", () => {
    expect(statusFromSignal({ spamTrap: true, mailboxOk: true })).toBe("invalid");
  });
  it("dead domain or mailbox → invalid", () => {
    expect(statusFromSignal({ domainOk: false })).toBe("invalid");
    expect(statusFromSignal({ domainOk: true, mailboxOk: false })).toBe("invalid");
  });
  it("accept-all domain → catch_all", () => {
    expect(statusFromSignal({ domainOk: true, catchAll: true })).toBe("catch_all");
  });
  it("disposable / role-based / low-confidence → risky", () => {
    expect(statusFromSignal({ mailboxOk: true, disposable: true })).toBe("risky");
    expect(statusFromSignal({ mailboxOk: true, roleBased: true })).toBe("risky");
    expect(statusFromSignal({ mailboxOk: true, confidence: 0.4 })).toBe("risky");
  });
  it("confirmed mailbox, not catch-all/role → valid", () => {
    expect(statusFromSignal({ domainOk: true, mailboxOk: true, confidence: 0.95 })).toBe("valid");
  });
  it("nothing conclusive → unknown", () => {
    expect(statusFromSignal({})).toBe("unknown");
  });
});

describe("verifyEmail — AC1 + AC4", () => {
  it("a syntactically invalid email is invalid without spending (no provider/meter call)", async () => {
    const p = provider({ mailboxOk: true });
    const { meter, calls } = spyMeter();
    const r = await verifyEmail("c1", "not-an-email", deps(p, { meter }));
    expect(r.status).toBe("invalid");
    expect(p.verify).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("meters exactly one provider call and stamps provenance + TTL", async () => {
    const p = provider({ domainOk: true, mailboxOk: true, confidence: 0.9 });
    const { meter, calls } = spyMeter();
    const r = await verifyEmail("c1", "jane@acme.com", deps(p, { meter }));
    expect(r.status).toBe("valid");
    expect(r.provider).toBe("findymail");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "verify.email", amount: 1 });
    expect(r.ttlExpiresAt.getTime() - r.checkedAt.getTime()).toBe(EMAIL_VERIFY_TTL_MS);
  });

  it("serves a fresh cache hit without spending", async () => {
    const cached: EmailVerification = { email: "jane@acme.com", status: "valid", provider: "findymail", checkedAt: new Date(0), ttlExpiresAt: new Date(10_000), signal: undefined };
    const store = new Map<string, EmailVerification>([["findymail:c1:jane@acme.com", cached]]);
    const p = provider({ mailboxOk: true });
    const cache = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: EmailVerification) => void store.set(k, v) };
    const r = await verifyEmail("c1", "jane@acme.com", deps(p, { cache }));
    expect(r).toBe(cached);
    expect(p.verify).not.toHaveBeenCalled();
  });

  it("does not spend past the budget — returns unknown", async () => {
    const p = provider({ mailboxOk: true });
    const r = await verifyEmail("c1", "jane@acme.com", deps(p, { budgetOk: async () => false }));
    expect(r.status).toBe("unknown");
    expect(p.verify).not.toHaveBeenCalled();
  });

  it("a provider throw → unknown (not a false verdict)", async () => {
    const p: VerifyProvider = { name: "findymail", cost: 1, verify: async () => { throw new Error("503"); } };
    expect((await verifyEmail("c1", "jane@acme.com", deps(p))).status).toBe("unknown");
  });
});

describe("findAndVerifyEmail — AC1 across candidates + AC5 injected finder", () => {
  const finder = (cands: CandidateEmail[]) => async () => cands;

  it("verifies in confidence order and short-circuits on the first valid", async () => {
    const p: VerifyProvider = {
      name: "findymail", cost: 1,
      verify: vi.fn(async (email: string) => (email === "good@acme.com" ? { mailboxOk: true, confidence: 0.95 } : { mailboxOk: false })),
    };
    const r = await findAndVerifyEmail("c1", {
      ...deps(p),
      findCandidateEmails: finder([
        { email: "bad@acme.com", provider: "apollo", confidence: 0.5 },
        { email: "good@acme.com", provider: "apollo", confidence: 0.9 },
      ]),
    });
    expect(r.status).toBe("valid");
    expect(r.email).toBe("good@acme.com"); // higher confidence tried first, and it's valid
    expect(p.verify).toHaveBeenCalledOnce(); // short-circuited, never tried the weak candidate
  });

  it("with no valid candidate, returns the best by status rank", async () => {
    const p: VerifyProvider = {
      name: "findymail", cost: 1,
      verify: async (email: string) => (email === "ca@acme.com" ? { domainOk: true, catchAll: true } : { domainOk: false }),
    };
    const r = await findAndVerifyEmail("c1", {
      ...deps(p),
      findCandidateEmails: finder([
        { email: "ca@acme.com", provider: "apollo", confidence: 0.8 },
        { email: "dead@acme.com", provider: "hunter", confidence: 0.6 },
      ]),
    });
    expect(r.status).toBe("catch_all"); // catch_all outranks invalid
  });

  it("no candidates → unknown with empty email", async () => {
    const r = await findAndVerifyEmail("c1", { ...deps(provider(null)), findCandidateEmails: finder([]) });
    expect(r).toMatchObject({ status: "unknown", email: "" });
  });
});

describe("send-eligibility — AC2 + AC3", () => {
  it("AC2: an unverified contact is NOT email-sendable", () => {
    expect(isEmailSendable({ emailStatus: null })).toBe(false);
    expect(isEmailSendable({})).toBe(false);
  });
  it("AC2: only valid is email-sendable by default", () => {
    expect(isEmailSendable({ emailStatus: "valid" })).toBe(true);
    for (const s of ["risky", "invalid", "catch_all", "unknown"] as const) {
      expect(isEmailSendable({ emailStatus: s })).toBe(false);
    }
  });
  it("a campaign can opt into a wider sendable set", () => {
    expect(isEmailSendable({ emailStatus: "catch_all" }, new Set(["valid", "catch_all"]))).toBe(true);
  });
  it("AC3: an invalid email keeps LinkedIn eligibility when linkedin_url is known", () => {
    const c = { emailStatus: "invalid" as const, linkedinUrl: "https://linkedin.com/in/jane" };
    expect(isEmailSendable(c)).toBe(false);
    expect(isLinkedInSendable(c)).toBe(true);
    expect(sendEligibility(c)).toEqual({ email: false, linkedin: true });
  });
  it("no linkedin_url → not LinkedIn-eligible", () => {
    expect(isLinkedInSendable({ linkedinUrl: null })).toBe(false);
    expect(isLinkedInSendable({ linkedinUrl: "  " })).toBe(false);
  });
});
