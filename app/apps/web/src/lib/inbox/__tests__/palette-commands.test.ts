import { describe, it, expect, vi } from "vitest";
import { buildInboxPaletteCommands, type PaletteData, type PaletteActions } from "../palette-commands";

/**
 * B6.5/B6.6 — the pure palette command builder. Asserts the command set gated by
 * selection / lane / mailbox-connected, the backfilled single-key shortcuts, and
 * that every `run()` delegates to exactly ONE action callback (no second path).
 */

const TAB_LABELS: Record<string, string> = {
  attention: "Needs attention",
  snoozed: "Snoozed",
  done: "Done",
  handled: "Handled",
  outbound: "Outbound",
  bundles: "Bundles",
};

function data(over: Partial<PaletteData> = {}): PaletteData {
  return {
    tab: "attention",
    selectedKey: null,
    conversations: [],
    customLanes: [],
    bundleTotal: 0,
    mailboxes: [],
    splits: [],
    mailboxConnected: true,
    tabLabels: TAB_LABELS,
    ...over,
  };
}

function actions(): PaletteActions & { _calls: Record<string, unknown[][]> } {
  const _calls: Record<string, unknown[][]> = {};
  const rec = (name: string) =>
    vi.fn((...args: unknown[]) => {
      (_calls[name] ??= []).push(args);
    });
  return {
    goToLane: rec("goToLane"),
    goToBundles: rec("goToBundles"),
    goToCustomLane: rec("goToCustomLane"),
    switchMailbox: rec("switchMailbox"),
    openConversation: rec("openConversation"),
    markDone: rec("markDone"),
    snooze1Day: rec("snooze1Day"),
    reply: rec("reply"),
    book: rec("book"),
    stop: rec("stop"),
    label: rec("label"),
    goToSplit: rec("goToSplit"),
    connectMailbox: rec("connectMailbox"),
    _calls,
  } as PaletteActions & { _calls: Record<string, unknown[][]> };
}

const ids = (cmds: { id: string }[]) => cmds.map((c) => c.id);
const byId = <T extends { id: string }>(cmds: T[], id: string): T | undefined => cmds.find((c) => c.id === id);

describe("buildInboxPaletteCommands — baseline (preserved) commands", () => {
  it("always lists the five built-in lanes with the human label + Lane hint", () => {
    const cmds = buildInboxPaletteCommands(data(), actions());
    for (const t of ["attention", "snoozed", "done", "handled", "outbound"]) {
      const c = byId(cmds, `lane:${t}`);
      expect(c, t).toBeTruthy();
      expect(c!.label).toBe(`Go to ${TAB_LABELS[t]}`);
      expect(c!.hint).toBe("Lane");
    }
  });

  it("includes Go to Bundles only when bundleTotal > 0", () => {
    expect(byId(buildInboxPaletteCommands(data({ bundleTotal: 0 }), actions()), "lane:bundles")).toBeFalsy();
    expect(byId(buildInboxPaletteCommands(data({ bundleTotal: 3 }), actions()), "lane:bundles")).toBeTruthy();
  });

  it("includes one command per custom lane, run() -> goToCustomLane(id)", () => {
    const a = actions();
    const cmds = buildInboxPaletteCommands(data({ customLanes: [{ id: "L1", name: "VIP" }] }), a);
    const c = byId(cmds, "lane:L1")!;
    expect(c.label).toBe("Go to VIP");
    c.run();
    expect(a._calls.goToCustomLane).toEqual([["L1"]]);
  });

  it("adds mailbox switch commands only with 2+ mailboxes; run() delegates", () => {
    const a = actions();
    const one = buildInboxPaletteCommands(data({ mailboxes: [{ id: "m1", label: "A", address: "a@x" }] }), a);
    expect(ids(one).some((i) => i.startsWith("mailbox:"))).toBe(false);

    const two = buildInboxPaletteCommands(
      data({ mailboxes: [{ id: "m1", label: "A", address: "a@x" }, { id: "m2", label: "", address: "b@x" }] }),
      a,
    );
    expect(byId(two, "mailbox:all")).toBeTruthy();
    byId(two, "mailbox:all")!.run();
    expect(a._calls.switchMailbox).toEqual([[null]]);
    // falls back to the address when label is empty
    expect(byId(two, "mailbox:m2")!.label).toBe("Switch to b@x");
    byId(two, "mailbox:m2")!.run();
    expect(a._calls.switchMailbox).toEqual([[null], ["m2"]]);
  });

  it("lists one open-by-name command per conversation, run() -> openConversation(key)", () => {
    const a = actions();
    const cmds = buildInboxPaletteCommands(
      data({ conversations: [{ key: "k1", displayName: "Ada", subject: "Hi" }] }),
      a,
    );
    const c = byId(cmds, "conv:k1")!;
    expect(c.label).toBe("Ada — Hi");
    expect(c.hint).toBe("Open");
    c.run();
    expect(a._calls.openConversation).toEqual([["k1"]]);
  });
});

describe("buildInboxPaletteCommands — per-conversation actions (B6.5)", () => {
  it("emits NO act:* command when nothing is selected", () => {
    const cmds = buildInboxPaletteCommands(data({ selectedKey: null }), actions());
    expect(ids(cmds).some((i) => i.startsWith("act:"))).toBe(false);
  });

  it("gates act:done / act:snooze to the attention or snoozed lane, with e / s shortcuts", () => {
    const onAttn = buildInboxPaletteCommands(data({ selectedKey: "k", tab: "attention" }), actions());
    expect(byId(onAttn, "act:done")!.shortcut).toBe("e");
    expect(byId(onAttn, "act:snooze")!.shortcut).toBe("s");

    const onDone = buildInboxPaletteCommands(data({ selectedKey: "k", tab: "done" }), actions());
    expect(byId(onDone, "act:done")).toBeFalsy();
    expect(byId(onDone, "act:snooze")).toBeFalsy();
  });

  it("act:done / act:snooze run() delegate to markDone / snooze1Day with the selected key", () => {
    const a = actions();
    const cmds = buildInboxPaletteCommands(data({ selectedKey: "k7", tab: "attention" }), a);
    byId(cmds, "act:done")!.run();
    byId(cmds, "act:snooze")!.run();
    expect(a._calls.markDone).toEqual([["k7"]]);
    expect(a._calls.snooze1Day).toEqual([["k7"]]);
  });

  it("emits reply / book / label / stop on ANY lane when selected, with r / b / l shortcuts (stop has none)", () => {
    const a = actions();
    const cmds = buildInboxPaletteCommands(data({ selectedKey: "k", tab: "done" }), a);
    expect(byId(cmds, "act:reply")!.shortcut).toBe("r");
    expect(byId(cmds, "act:book")!.shortcut).toBe("b");
    expect(byId(cmds, "act:label")!.shortcut).toBe("l");
    expect(byId(cmds, "act:stop")!.shortcut).toBeUndefined();
    byId(cmds, "act:reply")!.run();
    byId(cmds, "act:book")!.run();
    byId(cmds, "act:label")!.run();
    byId(cmds, "act:stop")!.run();
    expect(a._calls.reply).toHaveLength(1);
    expect(a._calls.book).toHaveLength(1);
    expect(a._calls.label).toHaveLength(1);
    expect(a._calls.stop).toHaveLength(1);
  });
});

describe("buildInboxPaletteCommands — splits + connect (B6.6)", () => {
  it("emits split:<id> only on the attention lane with splits present; run() -> goToSplit(id)", () => {
    const a = actions();
    const withSplits = buildInboxPaletteCommands(
      data({ tab: "attention", splits: [{ id: "needs_reply", name: "Needs Reply", count: 4 }] }),
      a,
    );
    const c = byId(withSplits, "split:needs_reply")!;
    expect(c.label).toBe("Go to Needs Reply");
    expect(c.hint).toBe("Split");
    c.run();
    expect(a._calls.goToSplit).toEqual([["needs_reply"]]);

    // off-attention: no split commands even if splits were (wrongly) passed
    const offLane = buildInboxPaletteCommands(
      data({ tab: "done", splits: [{ id: "needs_reply", name: "Needs Reply", count: 4 }] }),
      a,
    );
    expect(ids(offLane).some((i) => i.startsWith("split:"))).toBe(false);
  });

  it("emits connect:mailbox only when no mailbox is connected; run() -> connectMailbox", () => {
    expect(byId(buildInboxPaletteCommands(data({ mailboxConnected: true }), actions()), "connect:mailbox")).toBeFalsy();
    const a = actions();
    const cmds = buildInboxPaletteCommands(data({ mailboxConnected: false }), a);
    const c = byId(cmds, "connect:mailbox")!;
    expect(c.hint).toBe("Setup");
    c.run();
    expect(a._calls.connectMailbox).toHaveLength(1);
  });
});
