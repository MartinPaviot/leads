// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InboxFolders } from "../_inbox-folders";

/** Shell-redesign V1 + per-mailbox sub-segment. */

function base(over: Record<string, unknown> = {}) {
  return {
    tab: "attention" as const,
    customLaneId: null,
    activeSplit: null,
    counts: { attention: 0, snoozed: 0, done: 0, handled: 0 },
    splitCounts: [{ id: "needs_reply", name: "Needs Reply", count: 4 }],
    customLanes: [],
    bundleTotal: 0,
    mailboxes: [],
    selectedMailbox: null,
    onSelectMailbox: vi.fn(),
    search: "",
    onSearch: vi.fn(),
    onSelectLane: vi.fn(),
    onSelectSplit: vi.fn(),
    onSelectCustomLane: vi.fn(),
    onNewLane: vi.fn(),
    onNewSplit: vi.fn(),
    ...over,
  };
}

const twoBoxes = [
  { id: "mb1", address: "work@x.com", label: "Work", attention: 3 },
  { id: "mb2", address: "perso@x.com", label: "Personal", attention: 1 },
];

describe("InboxFolders — Upstream sidebar order", () => {
  it("renders Inbox + the intention folders as top-tier rows (with the split count)", () => {
    render(<InboxFolders {...base()} />);
    expect(screen.getByText("Inbox")).toBeTruthy();
    expect(screen.getByText("Needs Reply")).toBeTruthy();
    expect(screen.getByText("Follow Ups")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy(); // outbound relabelled
    expect(screen.getByText("4")).toBeTruthy(); // needs_reply split count
  });

  it("clicking an intention folder selects its split", () => {
    const onSelectSplit = vi.fn();
    render(<InboxFolders {...base({ onSelectSplit })} />);
    fireEvent.click(screen.getByText("Needs Reply"));
    expect(onSelectSplit).toHaveBeenCalledWith("needs_reply");
  });
});

describe("InboxFolders — per-mailbox sub-segment", () => {
  it("shows the Mailboxes group with 2+ boxes: All inboxes + each box", () => {
    render(<InboxFolders {...base({ mailboxes: twoBoxes })} />);
    expect(screen.getByText("Mailboxes")).toBeTruthy();
    expect(screen.getByText("All inboxes")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Personal")).toBeTruthy();
  });

  it("clicking a mailbox scopes to it; All inboxes clears the scope", () => {
    const onSelectMailbox = vi.fn();
    render(<InboxFolders {...base({ mailboxes: twoBoxes, selectedMailbox: "mb1", onSelectMailbox })} />);
    fireEvent.click(screen.getByText("Personal"));
    expect(onSelectMailbox).toHaveBeenCalledWith("mb2");
    fireEvent.click(screen.getByText("All inboxes"));
    expect(onSelectMailbox).toHaveBeenLastCalledWith(null);
  });

  it("hides the Mailboxes group for a single-mailbox user", () => {
    render(<InboxFolders {...base({ mailboxes: [twoBoxes[0]] })} />);
    expect(screen.queryByText("Mailboxes")).toBeNull();
    expect(screen.queryByText("All inboxes")).toBeNull();
  });
});
