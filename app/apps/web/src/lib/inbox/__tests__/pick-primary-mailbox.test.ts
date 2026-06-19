import { describe, it, expect } from "vitest";
import { pickPrimaryMailbox, indexMailboxes, type AttributableMessage, type MailboxRef } from "@/lib/inbox/mailbox-attribution";

const boxes: MailboxRef[] = [
  { id: "b1", address: "one@acme.com", label: "One" },
  { id: "b2", address: "two@acme.com", label: "Two" },
];
const idx = indexMailboxes(boxes);

function inbound(to: string, at: string): AttributableMessage {
  return { direction: "inbound", from: "them@x.com", to, at };
}
function outbound(from: string, at: string): AttributableMessage {
  return { direction: "outbound", from, to: "them@x.com", at };
}

describe("pickPrimaryMailbox", () => {
  it("attributes a single inbound to the receiving box", () => {
    expect(pickPrimaryMailbox([inbound("one@acme.com", "2026-06-19T10:00:00Z")], idx).mailboxId).toBe("b1");
  });

  it("picks the box whose newest inbound is latest", () => {
    const msgs = [inbound("one@acme.com", "2026-06-19T09:00:00Z"), inbound("two@acme.com", "2026-06-19T11:00:00Z")];
    expect(pickPrimaryMailbox(msgs, idx).mailboxId).toBe("b2");
  });

  it("is STABLE under message reordering (the cross-box determinism bar)", () => {
    const msgs = [inbound("one@acme.com", "2026-06-19T09:00:00Z"), inbound("two@acme.com", "2026-06-19T11:00:00Z")];
    const a = pickPrimaryMailbox(msgs, idx).mailboxId;
    const b = pickPrimaryMailbox([...msgs].reverse(), idx).mailboxId;
    expect(a).toBe(b);
    expect(a).toBe("b2");
  });

  it("breaks an inbound tie by mailboxId ascending", () => {
    const msgs = [inbound("two@acme.com", "2026-06-19T10:00:00Z"), inbound("one@acme.com", "2026-06-19T10:00:00Z")];
    expect(pickPrimaryMailbox(msgs, idx).mailboxId).toBe("b1");
  });

  it("falls back to a touched box (id asc) when only outbound touched a box", () => {
    const msgs = [outbound("two@acme.com", "2026-06-19T10:00:00Z"), outbound("one@acme.com", "2026-06-19T11:00:00Z")];
    expect(pickPrimaryMailbox(msgs, idx).mailboxId).toBe("b1");
  });

  it("returns UNATTRIBUTED when no box is touched", () => {
    expect(pickPrimaryMailbox([inbound("other@nope.com", "2026-06-19T10:00:00Z")], idx).mailboxId).toBeNull();
    expect(pickPrimaryMailbox([], idx).mailboxId).toBeNull();
  });
});
