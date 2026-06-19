import { describe, it, expect, afterEach } from "vitest";
import { INBOX_SHORTCUTS } from "@/lib/inbox/inbox-shortcuts";
import {
  registerShortcut,
  getRegisteredShortcuts,
  _resetShortcutRegistry,
} from "@/lib/hotkey-registry";

afterEach(() => _resetShortcutRegistry());

describe("INBOX_SHORTCUTS (INBOX-K02)", () => {
  it("covers exactly the single-key actions the inbox page handler implements", () => {
    // These mirror inbox/page.tsx's keydown handler: j/k navigate, e done,
    // x select, r reply, m mailbox quick-switch. If a key is added/removed
    // there, this must change too.
    const single = INBOX_SHORTCUTS.map((s) => s.combo).filter((c) => c.length === 1).sort();
    expect(single).toEqual(["e", "j", "k", "m", "r", "x"]);
  });

  it("groups every entry under 'Inbox' with a non-empty description", () => {
    for (const s of INBOX_SHORTCUTS) {
      expect(s.group).toBe("Inbox");
      expect(s.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("registers into the cheatsheet registry and cleans up", () => {
    const unregs = INBOX_SHORTCUTS.map(registerShortcut);
    const inboxEntries = getRegisteredShortcuts().filter((s) => s.group === "Inbox");
    expect(inboxEntries).toHaveLength(INBOX_SHORTCUTS.length);
    expect(inboxEntries.map((s) => s.combo).sort()).toContain("mod+k");

    unregs.forEach((u) => u());
    expect(getRegisteredShortcuts().filter((s) => s.group === "Inbox")).toHaveLength(0);
  });
});
