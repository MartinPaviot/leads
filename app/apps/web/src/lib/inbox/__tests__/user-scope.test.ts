import { describe, it, expect } from "vitest";
import {
  headerAddresses,
  outboundBelongsToUser,
  inboundBelongsToUser,
  scopeConversationRows,
  type InboxScope,
} from "../user-scope";

function scopeOf(addresses: string[], mailboxIds: string[] = [], linkedinAccountIds: string[] = []): InboxScope {
  return {
    hasMailbox: addresses.length > 0 || mailboxIds.length > 0,
    addresses: new Set(addresses.map((a) => a.toLowerCase())),
    mailboxIds: new Set(mailboxIds),
    mailboxes: [],
    hasLinkedin: linkedinAccountIds.length > 0,
    linkedinAccountIds: new Set(linkedinAccountIds),
  };
}

describe("headerAddresses", () => {
  it("extracts a bare address, lowercased", () => {
    expect(headerAddresses("Jane@Example.com")).toEqual(["jane@example.com"]);
  });

  it("extracts the address out of a display-name header", () => {
    expect(headerAddresses("Jane Doe <jane@example.com>")).toEqual(["jane@example.com"]);
  });

  it("splits multiple recipients", () => {
    expect(headerAddresses("a@x.com, Bob <b@y.com>")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("returns [] for null/empty", () => {
    expect(headerAddresses(null)).toEqual([]);
    expect(headerAddresses("")).toEqual([]);
    expect(headerAddresses("   ")).toEqual([]);
  });
});

describe("outboundBelongsToUser", () => {
  const scope = scopeOf(["me@pilae.ch"], ["mb-1"]);

  it("matches by mailbox id", () => {
    expect(outboundBelongsToUser({ mailboxId: "mb-1", fromAddress: "whatever@x.com" }, scope)).toBe(true);
  });

  it("falls back to from_address when mailbox id is absent", () => {
    expect(outboundBelongsToUser({ mailboxId: null, fromAddress: "Me <me@pilae.ch>" }, scope)).toBe(true);
  });

  it("rejects another user's mailbox", () => {
    expect(outboundBelongsToUser({ mailboxId: "mb-2", fromAddress: "other@pilae.ch" }, scope)).toBe(false);
  });

  it("rejects when nothing is attributable", () => {
    expect(outboundBelongsToUser({ mailboxId: null, fromAddress: null }, scope)).toBe(false);
  });
});

describe("inboundBelongsToUser", () => {
  const scope = scopeOf(["me@pilae.ch"]);

  it("matches when the recipient is the user's address", () => {
    expect(inboundBelongsToUser({ metadata: { to: "Me <me@pilae.ch>" } }, scope)).toBe(true);
  });

  it("matches when the user is one of several recipients", () => {
    expect(inboundBelongsToUser({ metadata: { to: "team@pilae.ch, me@pilae.ch" } }, scope)).toBe(true);
  });

  it("rejects mail addressed to a colleague", () => {
    expect(inboundBelongsToUser({ metadata: { to: "colleague@pilae.ch" } }, scope)).toBe(false);
  });

  it("rejects when metadata or 'to' is missing", () => {
    expect(inboundBelongsToUser({ metadata: null }, scope)).toBe(false);
    expect(inboundBelongsToUser({ metadata: {} }, scope)).toBe(false);
  });

  it("scopes a LinkedIn inbound by the receiving seat (metadata.linkedinAccountId)", () => {
    const liScope = scopeOf([], [], ["li-acct-1"]);
    expect(inboundBelongsToUser({ metadata: { channel: "linkedin", linkedinAccountId: "li-acct-1" } }, liScope)).toBe(true);
    expect(inboundBelongsToUser({ metadata: { channel: "linkedin", linkedinAccountId: "li-acct-2" } }, liScope)).toBe(false);
  });

  it("never crosses channels: a LinkedIn row fails an email-only scope, and vice versa", () => {
    // email scope, linkedin row → false (no seat match, never the email path)
    expect(inboundBelongsToUser({ metadata: { channel: "linkedin", linkedinAccountId: "x" } }, scope)).toBe(false);
    // linkedin scope, email row → false (email path needs an address)
    const liScope = scopeOf([], [], ["li-acct-1"]);
    expect(inboundBelongsToUser({ metadata: { to: "me@pilae.ch" } }, liScope)).toBe(false);
  });
});

describe("scopeConversationRows", () => {
  const inbound = [
    { id: "in-mine", metadata: { to: "me@pilae.ch" } },
    { id: "in-theirs", metadata: { to: "boss@pilae.ch" } },
  ];
  const outbound = [
    { id: "out-mine", mailboxId: "mb-1", fromAddress: "me@pilae.ch" },
    { id: "out-theirs", mailboxId: "mb-2", fromAddress: "boss@pilae.ch" },
  ];
  const triage = [{ conversationKey: "k1" }];

  it("keeps only the user's own inbound + outbound, passes triage through", () => {
    const scope = scopeOf(["me@pilae.ch"], ["mb-1"]);
    const out = scopeConversationRows({ inbound, outbound, triage }, scope);
    expect(out.inbound.map((r) => r.id)).toEqual(["in-mine"]);
    expect(out.outbound.map((r) => r.id)).toEqual(["out-mine"]);
    expect(out.triage).toBe(triage);
  });

  it("returns no messages when the user has no mailbox", () => {
    const empty = scopeOf([]);
    const out = scopeConversationRows({ inbound, outbound, triage }, empty);
    expect(out.inbound).toEqual([]);
    expect(out.outbound).toEqual([]);
    // triage is still passed through (harmless without any conversations).
    expect(out.triage).toBe(triage);
  });

  it("a LinkedIn-only user (no mailbox) still sees their own LinkedIn inbound", () => {
    const inboundLi = [
      { id: "li-mine", metadata: { channel: "linkedin", linkedinAccountId: "li-1" } },
      { id: "li-theirs", metadata: { channel: "linkedin", linkedinAccountId: "li-2" } },
      { id: "email-mine", metadata: { to: "me@pilae.ch" } },
    ];
    const scope = scopeOf([], [], ["li-1"]); // connected LinkedIn seat, no mailbox
    const out = scopeConversationRows({ inbound: inboundLi, outbound: [], triage }, scope);
    expect(out.inbound.map((r) => r.id)).toEqual(["li-mine"]); // own seat only; email excluded
  });
});
