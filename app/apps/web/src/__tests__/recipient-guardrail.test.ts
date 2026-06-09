import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isOutboundTestMode,
  isRecipientAllowed,
  outboundAllowlist,
  recipientBlockReason,
} from "@/lib/emails/recipient-guardrail";

// The guardrail reads process.env at call time. Snapshot + restore the
// two knobs around every test so cases don't leak into each other.
const KEYS = ["OUTBOUND_TEST_MODE", "OUTBOUND_TEST_ALLOWLIST"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("recipient guardrail", () => {
  it("defaults to test mode ON when the env is unset (fail-safe)", () => {
    expect(isOutboundTestMode()).toBe(true);
  });

  it("treats any non-'off' value as ON; only literal 'off' disables", () => {
    process.env.OUTBOUND_TEST_MODE = "true"; // a typo for 'off'
    expect(isOutboundTestMode()).toBe(true);
    process.env.OUTBOUND_TEST_MODE = "OFF";
    expect(isOutboundTestMode()).toBe(false);
    process.env.OUTBOUND_TEST_MODE = " off ";
    expect(isOutboundTestMode()).toBe(false);
  });

  it("always allows the operator's own domain in test mode", () => {
    expect(isRecipientAllowed("martin@elevay.dev")).toBe(true);
    expect(isRecipientAllowed("Martin <MARTIN@Elevay.Dev>")).toBe(true);
    expect(outboundAllowlist()).toContain("elevay.dev");
  });

  it("blocks a real prospect while test mode is on", () => {
    expect(isRecipientAllowed("ceo@acme-prospect.com")).toBe(false);
    expect(isRecipientAllowed("Jane CEO <jane@bigco.fr>")).toBe(false);
  });

  it("allows everyone once test mode is off", () => {
    process.env.OUTBOUND_TEST_MODE = "off";
    expect(isRecipientAllowed("ceo@acme-prospect.com")).toBe(true);
    expect(isRecipientAllowed("anyone@anywhere.io")).toBe(true);
  });

  it("honours a full address added to the allowlist (and nothing else on that domain)", () => {
    process.env.OUTBOUND_TEST_ALLOWLIST = "martin.paviot@outlook.com";
    expect(isRecipientAllowed("martin.paviot@outlook.com")).toBe(true);
    expect(isRecipientAllowed("someone-else@outlook.com")).toBe(false);
  });

  it("honours an @domain entry (whole domain) and a bare domain entry", () => {
    process.env.OUTBOUND_TEST_ALLOWLIST = "@test.dev, partner.io";
    expect(isRecipientAllowed("a@test.dev")).toBe(true);
    expect(isRecipientAllowed("b@partner.io")).toBe(true);
    expect(isRecipientAllowed("c@elsewhere.com")).toBe(false);
  });

  it("rejects malformed addresses in test mode", () => {
    expect(isRecipientAllowed("not-an-email")).toBe(false);
    expect(isRecipientAllowed("@elevay.dev")).toBe(false);
    expect(isRecipientAllowed("trailing@")).toBe(false);
    expect(isRecipientAllowed("")).toBe(false);
  });

  it("gives an actionable block reason naming the bare address", () => {
    const reason = recipientBlockReason("Jane <jane@bigco.fr>");
    expect(reason).toContain("jane@bigco.fr");
    expect(reason).toContain("OUTBOUND_TEST_MODE=off");
  });
});
