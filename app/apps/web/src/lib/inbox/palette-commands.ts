/**
 * Pure builder for the inbox Cmd/Ctrl+K command palette (B6).
 *
 * The page used to assemble these commands inline in a useMemo, which made the
 * exact command set (gated by selection / lane / mailbox-connected) impossible
 * to unit-test. This module is the canonical, side-effect-free assembler: it
 * takes a snapshot of the palette-relevant state (`PaletteData`) plus the action
 * callbacks the page wires (`PaletteActions`) and returns the ordered command
 * list. Every `run()` delegates to ONE action callback — there is no second
 * triage/reply/book/stop/label code path (B6 R2.11).
 */

export interface PaletteCommand {
  id: string;
  label: string;
  /** Right-aligned secondary text, e.g. "Lane" / "Action" / "Open". */
  hint?: string;
  /**
   * Single-key shortcut for this verb (e.g. "e", "r", "s"), shown as a `kbd`
   * glyph so the palette doubles as the shortcuts cheat-sheet (B6 R1.5/R4.1).
   * Display-only — the actual key binding lives in the page keydown listener.
   */
  shortcut?: string;
  run: () => void;
}

/** Built-in lanes, in display order. Mirrors page.tsx `TABS`. */
export const PALETTE_LANES = ["attention", "snoozed", "done", "handled", "outbound"] as const;
export type PaletteLane = (typeof PALETTE_LANES)[number];

export interface PaletteData {
  /** The active lane id (a built-in lane, "bundles", or a custom lane). */
  tab: string;
  /** The focused conversation, or null. Gates the per-conversation actions. */
  selectedKey: string | null;
  conversations: { key: string; displayName: string; subject: string }[];
  customLanes: { id: string; name: string }[];
  /** Total messages bundled — the "Go to Bundles" command shows when > 0. */
  bundleTotal: number;
  mailboxes: { id: string; label: string; address: string }[];
  /** Intention splits on the attention lane (B3). Empty off-attention. */
  splits: { id: string; name: string; count: number }[];
  /** False once a lane load confirms the user has no mailbox of their own. */
  mailboxConnected: boolean;
  /** Human lane labels (page.tsx TAB_LABELS). */
  tabLabels: Record<string, string>;
}

export interface PaletteActions {
  /** Jump to a built-in lane (clears any custom lane). */
  goToLane: (tab: PaletteLane) => void;
  goToBundles: () => void;
  goToCustomLane: (id: string) => void;
  /** Switch the focused mailbox; null = "All inboxes". */
  switchMailbox: (id: string | null) => void;
  openConversation: (key: string) => void;
  markDone: (key: string) => void;
  snooze1Day: (key: string) => void;
  /** Open the reply composer on the selected thread (never sends). */
  reply: () => void;
  /** Open the meeting scheduler via the pane handler. */
  book: () => void;
  /** Stop the active sequence on the selected thread (reports if none). */
  stop: () => void;
  /** Open the thread add-label input, focused. */
  label: () => void;
  /** Switch the attention lane to an intention split. */
  goToSplit: (id: string) => void;
  /** Route to /settings/mail-calendar to connect a mailbox. */
  connectMailbox: () => void;
}

/**
 * Assemble the palette command list. Order: lanes -> bundles -> custom lanes ->
 * mailbox switch -> attention splits -> per-conversation actions -> connect ->
 * open-by-name. Pure: no React, no refs, no router — every effect is a callback.
 */
export function buildInboxPaletteCommands(data: PaletteData, actions: PaletteActions): PaletteCommand[] {
  const cmds: PaletteCommand[] = [];
  const { tab, selectedKey, tabLabels } = data;

  // Built-in lanes.
  for (const t of PALETTE_LANES) {
    cmds.push({ id: `lane:${t}`, label: `Go to ${tabLabels[t] ?? t}`, hint: "Lane", run: () => actions.goToLane(t) });
  }
  if (data.bundleTotal > 0) {
    cmds.push({ id: "lane:bundles", label: "Go to Bundles", hint: "Lane", run: actions.goToBundles });
  }
  for (const l of data.customLanes) {
    cmds.push({ id: `lane:${l.id}`, label: `Go to ${l.name}`, hint: "Lane", run: () => actions.goToCustomLane(l.id) });
  }

  // Mailbox quick-switch — only with a chooser (2+ connected boxes).
  if (data.mailboxes.length >= 2) {
    cmds.push({ id: "mailbox:all", label: "Switch to All inboxes", hint: "Mailbox", run: () => actions.switchMailbox(null) });
    for (const m of data.mailboxes) {
      cmds.push({
        id: `mailbox:${m.id}`,
        label: `Switch to ${m.label || m.address}`,
        hint: "Mailbox",
        run: () => actions.switchMailbox(m.id),
      });
    }
  }

  // Intention splits — only on the attention lane, when splits exist (B6.6).
  if (tab === "attention" && data.splits.length > 0) {
    for (const s of data.splits) {
      cmds.push({ id: `split:${s.id}`, label: `Go to ${s.name}`, hint: "Split", run: () => actions.goToSplit(s.id) });
    }
  }

  // Per-conversation actions — require a selection.
  if (selectedKey) {
    // Triage verbs only make sense on the attention/snoozed lanes.
    if (tab === "attention" || tab === "snoozed") {
      cmds.push({ id: "act:done", label: "Mark current conversation done", hint: "Action", shortcut: "e", run: () => actions.markDone(selectedKey) });
      cmds.push({ id: "act:snooze", label: "Snooze current conversation for 1 day", hint: "Action", shortcut: "s", run: () => actions.snooze1Day(selectedKey) });
    }
    // Reply / book / label / stop work on the open thread from any lane (B6.5).
    cmds.push({ id: "act:reply", label: "Reply to current conversation", hint: "Action", shortcut: "r", run: actions.reply });
    cmds.push({ id: "act:book", label: "Book a meeting", hint: "Action", shortcut: "b", run: actions.book });
    cmds.push({ id: "act:label", label: "Label current conversation", hint: "Action", shortcut: "l", run: actions.label });
    cmds.push({ id: "act:stop", label: "Stop the sequence", hint: "Action", run: actions.stop });
  }

  // Connect a mailbox — only when the user has none of their own (B6.6).
  if (!data.mailboxConnected) {
    cmds.push({ id: "connect:mailbox", label: "Connect a mailbox", hint: "Setup", run: actions.connectMailbox });
  }

  // Open any loaded conversation by fuzzy name/subject.
  for (const c of data.conversations) {
    cmds.push({ id: `conv:${c.key}`, label: `${c.displayName} — ${c.subject}`, hint: "Open", run: () => actions.openConversation(c.key) });
  }

  return cmds;
}
