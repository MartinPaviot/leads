import { describe, it, expect } from "vitest";
import { buildScopeFromRows, scopeConversationRows } from "@/lib/inbox/user-scope";

/**
 * INBOX-P05 — the app-layer enforcement that is the LIVE tenant-isolation
 * guarantee (the DB-level strict RLS flip, 0081, is staged behind INBOX_RLS_TX).
 * This pins the fail-closed contract: with no readable mailbox, the user sees
 * zero mail — even if rows leaked from the DB layer.
 */
describe("inbox scope is fail-closed (INBOX-P05 app-layer guarantee)", () => {
  it("yields no messages when the user has no mailbox", () => {
    const scope = buildScopeFromRows([], []);
    expect(scope.hasMailbox).toBe(false);
    const scoped = scopeConversationRows(
      {
        inbound: [{ metadata: { to: "anyone@x.io" } }],
        outbound: [{ mailboxId: "m1", fromAddress: "a@x.io" }],
        triage: [],
      },
      scope,
    );
    expect(scoped.inbound).toEqual([]);
    expect(scoped.outbound).toEqual([]);
  });

  it("never surfaces mail addressed outside the user's own/shared mailboxes", () => {
    const scope = buildScopeFromRows([{ id: "m1", emailAddress: "me@co.io", displayName: null }], []);
    const scoped = scopeConversationRows(
      {
        inbound: [{ metadata: { to: "me@co.io" } }, { metadata: { to: "someone-else@co.io" } }],
        outbound: [],
        triage: [],
      },
      scope,
    );
    expect(scoped.inbound).toHaveLength(1);
  });
});
