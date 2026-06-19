import { describe, it, expect } from "vitest";
import {
  buildScopeFromRows,
  scopeConversationRows,
  type InboxScope,
} from "@/lib/inbox/user-scope";

const row = (id: string, email: string, name: string | null = null) => ({
  id,
  emailAddress: email,
  displayName: name,
});

describe("buildScopeFromRows — team inbox (INBOX-X01)", () => {
  it("is byte-identical to personal when there are no shared mailboxes", () => {
    const s = buildScopeFromRows([row("m1", "Me@Co.io", "Me")], []);
    expect(s.hasMailbox).toBe(true);
    expect([...s.addresses]).toEqual(["me@co.io"]);
    expect([...s.mailboxIds]).toEqual(["m1"]);
    expect(s.mailboxes[0]).toEqual({ id: "m1", address: "me@co.io", label: "Me" });
    expect(s.mailboxes[0].shared).toBeUndefined();
  });

  it("unions shared mailboxes and flags them", () => {
    const s = buildScopeFromRows([row("m1", "me@co.io")], [row("m2", "founder@co.io", "Founder")]);
    expect(s.addresses.has("founder@co.io")).toBe(true);
    expect(s.mailboxIds.has("m2")).toBe(true);
    expect(s.mailboxes.find((m) => m.id === "m2")?.shared).toBe(true);
    expect(s.mailboxes.find((m) => m.id === "m1")?.shared).toBeUndefined();
  });

  it("lets a member with no own mailbox read shared ones", () => {
    const s = buildScopeFromRows([], [row("m2", "team@co.io")]);
    expect(s.hasMailbox).toBe(true);
    expect(s.addresses.has("team@co.io")).toBe(true);
  });

  it("own wins on a duplicate id (never mislabels your own box shared)", () => {
    const s = buildScopeFromRows([row("m1", "me@co.io")], [row("m1", "me@co.io")]);
    expect(s.mailboxes).toHaveLength(1);
    expect(s.mailboxes[0].shared).toBeUndefined();
  });

  it("is empty when there are no mailboxes at all", () => {
    expect(buildScopeFromRows([], []).hasMailbox).toBe(false);
  });
});

describe("scopeConversationRows surfaces shared-mailbox mail", () => {
  it("includes inbound/outbound addressed to a shared mailbox", () => {
    const scope: InboxScope = buildScopeFromRows([row("m1", "me@co.io")], [row("m2", "founder@co.io")]);
    const rows = {
      inbound: [
        { metadata: { to: "me@co.io" } },
        { metadata: { to: "founder@co.io" } }, // shared
        { metadata: { to: "stranger@x.io" } },
      ],
      outbound: [
        { mailboxId: "m2", fromAddress: "founder@co.io" }, // shared
        { mailboxId: "mX", fromAddress: "nope@x.io" },
      ],
      triage: [],
    };
    const scoped = scopeConversationRows(rows, scope);
    expect(scoped.inbound).toHaveLength(2);
    expect(scoped.outbound).toHaveLength(1);
  });
});
