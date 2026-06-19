import type { RegisteredShortcut } from "@/lib/hotkey-registry";

/**
 * The inbox's keyboard shortcuts, surfaced in the global `?` cheatsheet
 * (INBOX-K02). The handlers themselves live in the inbox page's keydown
 * listener (inbox/page.tsx) — they are too context-dependent (lane guards,
 * bulk-vs-single triage) to route through the generic `useHotkey`, which is
 * why they were invisible to the registry-driven cheatsheet.
 *
 * This list is DISPLAY-ONLY: registering it does not bind any handler, it only
 * makes the inbox group appear in the cheatsheet. It MUST stay in lockstep with
 * the keys the page handler actually implements — the test asserts that set.
 */
export const INBOX_SHORTCUTS: RegisteredShortcut[] = [
  { combo: "j", description: "Next conversation", group: "Inbox" },
  { combo: "k", description: "Previous conversation", group: "Inbox" },
  { combo: "e", description: "Mark done", group: "Inbox" },
  { combo: "x", description: "Select conversation (Shift for range)", group: "Inbox" },
  { combo: "r", description: "Reply to selected", group: "Inbox" },
  { combo: "m", description: "Switch mailbox (then 1–9, or 0 for all)", group: "Inbox" },
  { combo: "mod+k", description: "Open command palette", group: "Inbox" },
];
