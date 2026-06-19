import { describe, it, expect } from "vitest";
import { normalizeInboundEmail } from "../instantly-unibox";

const boxAddresses = new Set(["alex@out1.com", "alex@out2.com"]);
const ctx = { boxAddresses };

describe("normalizeInboundEmail", () => {
  it("normalizes an inbound reply (eaccount = our box, sender = the lead)", () => {
    const n = normalizeInboundEmail(
      {
        id: "em_1",
        eaccount: "alex@out1.com",
        from_address_email: "lead@acme.com",
        to_address_email: "alex@out1.com",
        subject: "Re: quick question",
        body: { text: "Sounds good, let's talk." },
        thread_id: "th_9",
        timestamp_email: "2026-06-14T10:00:00Z",
      },
      ctx,
    );
    expect(n).toEqual({
      instantlyEmailId: "em_1",
      fromEmail: "lead@acme.com",
      toBox: "alex@out1.com",
      subject: "Re: quick question",
      bodyText: "Sounds good, let's talk.",
      threadId: "th_9",
      occurredAt: new Date("2026-06-14T10:00:00Z"),
    });
  });

  it("returns null for an OUTBOUND email (sender is one of our boxes)", () => {
    const n = normalizeInboundEmail(
      { id: "em_2", eaccount: "alex@out1.com", from_address_email: "alex@out1.com", to_address_email: "lead@acme.com", subject: "Hi" },
      ctx,
    );
    expect(n).toBeNull();
  });

  it("returns null when the email is not for one of our boxes", () => {
    const n = normalizeInboundEmail(
      { id: "em_3", eaccount: "someoneelse@nope.com", from_address_email: "lead@acme.com", subject: "Hi" },
      ctx,
    );
    expect(n).toBeNull();
  });

  it("attributes via the `to` address when eaccount isn't set", () => {
    const n = normalizeInboundEmail(
      { id: "em_4", from_address_email: "lead@acme.com", to_address_email: "alex@out2.com", subject: "Hi" },
      ctx,
    );
    expect(n?.toBox).toBe("alex@out2.com");
  });

  it("strips HTML when only an html body is present", () => {
    const n = normalizeInboundEmail(
      {
        id: "em_5",
        eaccount: "alex@out1.com",
        from_address_email: "lead@acme.com",
        body: { html: "<p>Hello <b>there</b></p>" },
      },
      ctx,
    );
    expect(n?.bodyText).toBe("Hello there");
  });

  it("handles a string body and nested {email} sender shapes", () => {
    const n = normalizeInboundEmail(
      {
        id: "em_6",
        eaccount: "alex@out1.com",
        from: { email: "Lead@Acme.com" },
        body: "plain text reply",
      },
      ctx,
    );
    expect(n?.fromEmail).toBe("lead@acme.com");
    expect(n?.bodyText).toBe("plain text reply");
  });

  it("returns null without a stable id (can't dedup)", () => {
    const n = normalizeInboundEmail(
      { eaccount: "alex@out1.com", from_address_email: "lead@acme.com", subject: "no id" },
      ctx,
    );
    expect(n).toBeNull();
  });
});
