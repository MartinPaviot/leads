import { describe, it, expect } from "vitest";
import { parseZeliqWebhook, zeliqCallbackUrl } from "@/lib/integrations/zeliq-client";

describe("parseZeliqWebhook", () => {
  it("reads a flat mobile + verified email", () => {
    const r = parseZeliqWebhook({ mobile_phone: "+33612345678", email: "a@x.fr", email_status: "valid" });
    expect(r.phone).toBe("+33612345678");
    expect(r.phoneType).toBe("mobile");
    expect(r.email).toBe("a@x.fr");
    expect(r.emailStatus).toBe("verified");
  });

  it("unwraps a nested data envelope", () => {
    const r = parseZeliqWebhook({ data: { phone: "+41791234567", email: "b@y.ch", status: "deliverable" } });
    expect(r.phone).toBe("+41791234567");
    expect(r.email).toBe("b@y.ch");
    expect(r.emailStatus).toBe("verified");
  });

  it("classifies a generic phone (no mobile field) as direct", () => {
    const r = parseZeliqWebhook({ phone: "+33155667788" });
    expect(r.phone).toBe("+33155667788");
    expect(r.phoneType).toBe("direct");
  });

  it("reads arrays of phones/emails", () => {
    const r = parseZeliqWebhook({
      result: { phones: [{ number: "+33611112222" }], emails: [{ email: "c@z.fr" }] },
    });
    expect(r.phone).toBe("+33611112222");
    expect(r.email).toBe("c@z.fr");
  });

  it("marks an unknown email status as likely (not verified)", () => {
    const r = parseZeliqWebhook({ email: "d@w.fr", email_status: "catch_all" });
    expect(r.emailStatus).toBe("likely");
  });

  it("returns all-null for empty / garbage payloads", () => {
    expect(parseZeliqWebhook(null)).toEqual({ phone: null, phoneType: null, email: null, emailStatus: null });
    expect(parseZeliqWebhook("nope")).toEqual({ phone: null, phoneType: null, email: null, emailStatus: null });
    expect(parseZeliqWebhook({ unrelated: 1 })).toEqual({ phone: null, phoneType: null, email: null, emailStatus: null });
  });
});

describe("zeliqCallbackUrl", () => {
  it("carries the contact id (and token when set)", () => {
    const prev = process.env.ZELIQ_WEBHOOK_SECRET;
    process.env.ZELIQ_WEBHOOK_SECRET = "s3cret";
    const u = new URL(zeliqCallbackUrl("https://app.elevay.dev", "ct_123"));
    expect(u.pathname).toBe("/api/webhooks/zeliq");
    expect(u.searchParams.get("contactId")).toBe("ct_123");
    expect(u.searchParams.get("token")).toBe("s3cret");
    if (prev === undefined) delete process.env.ZELIQ_WEBHOOK_SECRET;
    else process.env.ZELIQ_WEBHOOK_SECRET = prev;
  });
});
