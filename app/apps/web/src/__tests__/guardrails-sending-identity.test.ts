import { describe, it, expect } from "vitest";
import {
  enforceSendingIdentity,
  type SendingEnforcementInput,
} from "@/lib/guardrails/sending-identity";

const defaultInput: SendingEnforcementInput = {
  mode: "primary-with-caps",
  isCold: false,
  sentTodayFromPrimary: 0,
  sendingDailyCapPrimary: 20,
  sendingAllowColdOnPrimary: false,
};

describe("enforceSendingIdentity — primary-with-caps", () => {
  it("allows a warm send under cap", () => {
    const d = enforceSendingIdentity(defaultInput);
    expect(d.allowed).toBe(true);
    expect(d.provider).toBe("primary");
    expect(d.blockReason).toBeNull();
    expect(d.scalingPath).toBe(false);
  });

  it("blocks cold outreach by default and raises the scaling-path flag", () => {
    const d = enforceSendingIdentity({ ...defaultInput, isCold: true });
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe("cold-on-primary-blocked");
    expect(d.scalingPath).toBe(true);
    expect(d.reason).toMatch(/dedicated sender|managed setup/i);
  });

  it("allows cold outreach when the opt-in flag is set", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      isCold: true,
      sendingAllowColdOnPrimary: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.provider).toBe("primary");
  });

  it("blocks when the daily cap is hit and flags scaling-path", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      sentTodayFromPrimary: 20,
    });
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe("primary-cap-hit");
    expect(d.scalingPath).toBe(true);
  });

  it("blocks at cap even when cold-on-primary is allowed", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      isCold: true,
      sendingAllowColdOnPrimary: true,
      sentTodayFromPrimary: 20,
    });
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe("primary-cap-hit");
  });

  it("cold-block takes precedence over cap-hit when both trigger", () => {
    // When cold-on-primary is disabled, the cold rule short-circuits
    // before the cap rule — the user's actionable path is to upgrade
    // sending infra, not to wait for the cap to reset.
    const d = enforceSendingIdentity({
      ...defaultInput,
      isCold: true,
      sendingAllowColdOnPrimary: false,
      sentTodayFromPrimary: 50,
    });
    expect(d.blockReason).toBe("cold-on-primary-blocked");
  });
});

describe("enforceSendingIdentity — external-connected", () => {
  it("allows any send, ungated by primary rules", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      mode: "external-connected",
      isCold: true,
      sentTodayFromPrimary: 100,
    });
    expect(d.allowed).toBe(true);
    expect(d.provider).toBe("external");
    expect(d.blockReason).toBeNull();
  });
});

describe("enforceSendingIdentity — elevay-managed-active", () => {
  it("allows any send, routes via managed", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      mode: "elevay-managed-active",
      isCold: true,
    });
    expect(d.allowed).toBe(true);
    expect(d.provider).toBe("managed");
  });
});

describe("enforceSendingIdentity — elevay-managed-requested", () => {
  it("blocks cold outreach until managed setup completes", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      mode: "elevay-managed-requested",
      isCold: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe("managed-setup-pending");
    // scalingPath stays false — the user already requested; no prompt
    // to re-show.
    expect(d.scalingPath).toBe(false);
  });

  it("allows warm sends under cap via primary as a bridge", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      mode: "elevay-managed-requested",
      isCold: false,
      sentTodayFromPrimary: 5,
    });
    expect(d.allowed).toBe(true);
    expect(d.provider).toBe("primary");
  });

  it("blocks warm sends that exceed the cap", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      mode: "elevay-managed-requested",
      isCold: false,
      sentTodayFromPrimary: 20,
    });
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe("primary-cap-hit");
  });
});

describe("enforceSendingIdentity — cap boundary", () => {
  it("allows exactly cap-1", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      sentTodayFromPrimary: 19,
    });
    expect(d.allowed).toBe(true);
  });

  it("blocks exactly at cap", () => {
    const d = enforceSendingIdentity({
      ...defaultInput,
      sentTodayFromPrimary: 20,
    });
    expect(d.allowed).toBe(false);
    expect(d.blockReason).toBe("primary-cap-hit");
  });
});
