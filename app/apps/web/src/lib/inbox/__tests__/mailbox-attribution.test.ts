import { describe, it, expect } from "vitest";
import {
  attributeMailbox,
  indexMailboxes,
  type MailboxRef,
  type AttributableMessage,
} from "../mailbox-attribution";

const boxes: MailboxRef[] = [
  { id: "mb_a", address: "alex@out1.com", label: "Outreach 1" },
  { id: "mb_b", address: "alex@out2.com", label: "Outreach 2" },
];
const idx = indexMailboxes(boxes);

describe("attributeMailbox", () => {
  it("attributes an inbound conversation to the box that received it (the `to`)", () => {
    const msgs: AttributableMessage[] = [
      { direction: "outbound", from: "alex@out1.com", to: "lead@acme.com", at: "2026-06-01T10:00:00Z" },
      { direction: "inbound", from: "Lead <lead@acme.com>", to: "alex@out1.com", at: "2026-06-02T10:00:00Z" },
    ];
    expect(attributeMailbox(msgs, idx)).toEqual({
      mailboxId: "mb_a",
      mailboxAddress: "alex@out1.com",
      mailboxLabel: "Outreach 1",
    });
  });

  it("uses the NEWEST message that touches one of my boxes", () => {
    const msgs: AttributableMessage[] = [
      { direction: "inbound", from: "x@acme.com", to: "alex@out1.com", at: "2026-06-01T10:00:00Z" },
      { direction: "inbound", from: "x@acme.com", to: "alex@out2.com", at: "2026-06-03T10:00:00Z" },
    ];
    expect(attributeMailbox(msgs, idx).mailboxId).toBe("mb_b");
  });

  it("attributes an outbound-only conversation by the sending box (`from`)", () => {
    const msgs: AttributableMessage[] = [
      { direction: "outbound", from: "Alex <alex@out2.com>", to: "p@beta.io", at: "2026-06-05T09:00:00Z" },
    ];
    expect(attributeMailbox(msgs, idx).mailboxId).toBe("mb_b");
  });

  it("parses multi-recipient `to` headers and a display name", () => {
    const msgs: AttributableMessage[] = [
      { direction: "inbound", from: "lead@acme.com", to: "Someone <other@x.com>, alex@out1.com", at: "2026-06-02T10:00:00Z" },
    ];
    expect(attributeMailbox(msgs, idx).mailboxId).toBe("mb_a");
  });

  it("is case-insensitive on the address match", () => {
    const msgs: AttributableMessage[] = [
      { direction: "inbound", from: "lead@acme.com", to: "ALEX@OUT1.COM", at: "2026-06-02T10:00:00Z" },
    ];
    expect(attributeMailbox(msgs, idx).mailboxId).toBe("mb_a");
  });

  it("returns null attribution when nothing matches a known box", () => {
    const msgs: AttributableMessage[] = [
      { direction: "inbound", from: "lead@acme.com", to: "someoneelse@nope.com", at: "2026-06-02T10:00:00Z" },
    ];
    expect(attributeMailbox(msgs, idx)).toEqual({
      mailboxId: null,
      mailboxAddress: null,
      mailboxLabel: null,
    });
  });

  it("is empty-safe (no boxes, no messages)", () => {
    expect(attributeMailbox([], idx).mailboxId).toBeNull();
    expect(
      attributeMailbox(
        [{ direction: "inbound", from: "a@b.com", to: "alex@out1.com", at: null }],
        indexMailboxes([]),
      ).mailboxId,
    ).toBeNull();
  });
});
