import { describe, it, expect } from "vitest";
import { resolveMailboxShortcut } from "@/lib/inbox/mailbox-switch";

const ids = ["box-a", "box-b", "box-c"];

describe("resolveMailboxShortcut (INBOX-K05)", () => {
  it("maps 1-based digits to mailboxes in rail order", () => {
    expect(resolveMailboxShortcut("1", ids)).toEqual({ target: "box-a" });
    expect(resolveMailboxShortcut("2", ids)).toEqual({ target: "box-b" });
    expect(resolveMailboxShortcut("3", ids)).toEqual({ target: "box-c" });
  });

  it("treats 0 and a as 'All inboxes'", () => {
    expect(resolveMailboxShortcut("0", ids)).toEqual({ target: null });
    expect(resolveMailboxShortcut("a", ids)).toEqual({ target: null });
  });

  it("no-ops a digit past the end of the list", () => {
    expect(resolveMailboxShortcut("4", ids)).toBeNull();
    expect(resolveMailboxShortcut("9", ids)).toBeNull();
  });

  it("no-ops any non-mapped key", () => {
    expect(resolveMailboxShortcut("j", ids)).toBeNull();
    expect(resolveMailboxShortcut("e", ids)).toBeNull();
    expect(resolveMailboxShortcut("", ids)).toBeNull();
  });
});
