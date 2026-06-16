import { describe, it, expect } from "vitest";
import { classifyInboundSender } from "@/lib/inbound/lead-classification";

describe("classifyInboundSender — role local-part", () => {
  it("flags noreply@ as machine-sent transactional", () => {
    const c = classifyInboundSender({ fromHeader: "Stripe <noreply@stripe.com>" });
    expect(c.isMachineSent).toBe(true);
    expect(c.senderType).toBe("automated_transactional");
    expect(c.isRoleAddress).toBe(true);
    expect(c.reasons.join(" ")).toMatch(/automated sender address/);
  });

  it("flags no-reply / do-not-reply / nepasrepondre variants (separator-insensitive)", () => {
    for (const addr of [
      "no-reply@acme.com",
      "no.reply@acme.com",
      "do-not-reply@acme.com",
      "ne-pas-repondre@acme.ch",
      "noreply-account@acme.com", // hard prefix with suffix
    ]) {
      expect(classifyInboundSender({ fromHeader: addr }).isMachineSent, addr).toBe(true);
    }
  });

  it("flags notifications@ / mailer-daemon@ / postmaster@ / bounce@", () => {
    for (const addr of [
      "notifications@github.com",
      "mailer-daemon@gmail.com",
      "postmaster@corp.com",
      "bounce@sendgrid.net",
    ]) {
      expect(classifyInboundSender({ fromHeader: addr }).isMachineSent, addr).toBe(true);
    }
  });

  it("classes newsletter@ / news@ / digest@ as automated_marketing", () => {
    for (const addr of ["newsletter@brand.com", "news@brand.com", "digest@substack.com"]) {
      const c = classifyInboundSender({ fromHeader: addr });
      expect(c.senderType, addr).toBe("automated_marketing");
      expect(c.isMachineSent, addr).toBe(true);
      expect(c.isBulk, addr).toBe(true);
    }
  });

  it("treats soft functional roles (support@, sales@) as role but NOT machine-sent", () => {
    for (const addr of ["support@startup.io", "sales@petiteboite.ch", "hello@brand.com"]) {
      const c = classifyInboundSender({ fromHeader: addr });
      expect(c.isMachineSent, addr).toBe(false); // could be a human — never drop
      expect(c.isRoleAddress, addr).toBe(true);
      expect(c.senderType, addr).toBe("unknown");
    }
  });

  it("treats a normal personal address as a human", () => {
    const c = classifyInboundSender({
      fromHeader: "Anna Keller <anna.keller@romandco.ch>",
      subject: "Re: votre solution",
      text: "Bonjour, intéressée par une démo.",
    });
    expect(c.isMachineSent).toBe(false);
    expect(c.isRoleAddress).toBe(false);
    expect(c.senderType).toBe("human");
    expect(c.reasons).toEqual([]);
  });

  it("does not false-positive when a role token is a substring of a personal local-part", () => {
    for (const addr of [
      "support.diaz@acme.com", // contains "support" but is a person
      "norbert@acme.com", // starts like noreply but isn't
      "noreen.duparc@acme.com", // 'noreen' not 'noreply'
    ]) {
      expect(classifyInboundSender({ fromHeader: addr }).isMachineSent, addr).toBe(false);
    }
  });
});

describe("classifyInboundSender — RFC headers", () => {
  it("List-Unsubscribe ⇒ machine-sent marketing even from a human-looking address", () => {
    const c = classifyInboundSender({
      fromHeader: "Founder Updates <jane@startup.com>",
      headers: { "List-Unsubscribe": "<https://startup.com/u/abc>" },
    });
    expect(c.isMachineSent).toBe(true);
    expect(c.isBulk).toBe(true);
    expect(c.senderType).toBe("automated_marketing");
  });

  it("Precedence: bulk ⇒ machine-sent", () => {
    const c = classifyInboundSender({
      fromHeader: "jane@startup.com",
      headers: { Precedence: "bulk" },
    });
    expect(c.isMachineSent).toBe(true);
  });

  it("Auto-Submitted: auto-generated ⇒ machine-sent transactional", () => {
    const c = classifyInboundSender({
      fromHeader: "jane@startup.com",
      headers: { "Auto-Submitted": "auto-generated" },
    });
    expect(c.isMachineSent).toBe(true);
    expect(c.senderType).toBe("automated_transactional");
  });

  it("Auto-Submitted: no ⇒ NOT a machine signal", () => {
    const c = classifyInboundSender({
      fromHeader: "jane@startup.com",
      headers: { "Auto-Submitted": "no" },
    });
    expect(c.isMachineSent).toBe(false);
    expect(c.senderType).toBe("human");
  });

  it("header lookup is case-insensitive", () => {
    const c = classifyInboundSender({
      fromHeader: "jane@startup.com",
      headers: { "LIST-UNSUBSCRIBE": "<mailto:u@startup.com>" },
    });
    expect(c.isMachineSent).toBe(true);
  });
});

describe("classifyInboundSender — body bulk hint", () => {
  it("an unsubscribe link in the body marks bulk but not machine on its own", () => {
    const c = classifyInboundSender({
      fromHeader: "Jane Doe <jane@startup.com>",
      text: "Hi! ... Click here to unsubscribe from these emails.",
    });
    expect(c.isBulk).toBe(true);
    expect(c.isMachineSent).toBe(false); // address is human, no machine header
    expect(c.reasons.join(" ")).toMatch(/unsubscribe link in body/);
  });
});

describe("classifyInboundSender — robustness", () => {
  it("malformed from header fails open to unknown, never throws", () => {
    for (const bad of ["", "not-an-email", "@nolocal.com", "   "]) {
      const c = classifyInboundSender({ fromHeader: bad });
      expect(c.isMachineSent, bad).toBe(false);
      expect(c.senderType, bad).toBe("unknown");
    }
  });

  it("is pure — identical input yields identical output", () => {
    const input = { fromHeader: "noreply@x.com", headers: { Precedence: "bulk" } };
    expect(classifyInboundSender(input)).toEqual(classifyInboundSender(input));
  });
});
