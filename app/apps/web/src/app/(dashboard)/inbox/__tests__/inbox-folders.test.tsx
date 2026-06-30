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
    starredCount: 0,
    draftsCount: 0,
    scheduledCount: 0,
    allMailCount: 0,
    trashCount: 0,
    spamCount: 0,
    mailboxes: [],
    selectedMailbox: null,
    onSelectMailbox: vi.fn(),
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
    expect(screen.getByText("Boîte de réception")).toBeTruthy();
    expect(screen.getByText("À répondre")).toBeTruthy();
    expect(screen.getByText("Relances")).toBeTruthy();
    expect(screen.getByText("Envoyés")).toBeTruthy(); // outbound relabelled
    expect(screen.getByText("4")).toBeTruthy(); // needs_reply split count
  });

  it("clicking an intention folder selects its split", () => {
    const onSelectSplit = vi.fn();
    render(<InboxFolders {...base({ onSelectSplit })} />);
    fireEvent.click(screen.getByText("À répondre"));
    expect(onSelectSplit).toHaveBeenCalledWith("needs_reply");
  });
});

describe("InboxFolders — deal folders (P1)", () => {
  const deals = [
    { id: "deal:d1", name: "Northwind", stage: "proposal", count: 3 },
    { id: "deal:d2", name: "Acme", stage: "demo", count: 1 },
  ];

  it("renders a Deals group with a folder per deal + its thread count", () => {
    render(<InboxFolders {...base({ dealLanes: deals })} />);
    expect(screen.getByText("Deals")).toBeTruthy();
    expect(screen.getByText("Northwind")).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("clicking a deal folder selects it via the customLane path (deal:<id>)", () => {
    const onSelectCustomLane = vi.fn();
    render(<InboxFolders {...base({ dealLanes: deals, onSelectCustomLane })} />);
    fireEvent.click(screen.getByText("Northwind"));
    expect(onSelectCustomLane).toHaveBeenCalledWith("deal:d1");
  });

  it("renders no Deals group when there are no active deals", () => {
    render(<InboxFolders {...base({ dealLanes: [] })} />);
    expect(screen.queryByText("Deals")).toBeNull();
  });
});

describe("InboxFolders — per-mailbox sub-segment", () => {
  it("shows the Mailboxes group with 2+ boxes: All inboxes + each box", () => {
    render(<InboxFolders {...base({ mailboxes: twoBoxes })} />);
    expect(screen.getByText("Boîtes mail")).toBeTruthy();
    expect(screen.getByText("Toutes les boîtes")).toBeTruthy();
    expect(screen.getByText("Work")).toBeTruthy();
    expect(screen.getByText("Personal")).toBeTruthy();
  });

  it("clicking a mailbox scopes to it; All inboxes clears the scope", () => {
    const onSelectMailbox = vi.fn();
    render(<InboxFolders {...base({ mailboxes: twoBoxes, selectedMailbox: "mb1", onSelectMailbox })} />);
    fireEvent.click(screen.getByText("Personal"));
    expect(onSelectMailbox).toHaveBeenCalledWith("mb2");
    fireEvent.click(screen.getByText("Toutes les boîtes"));
    expect(onSelectMailbox).toHaveBeenLastCalledWith(null);
  });

  it("hides the Mailboxes group for a single-mailbox user", () => {
    render(<InboxFolders {...base({ mailboxes: [twoBoxes[0]] })} />);
    expect(screen.queryByText("Boîtes mail")).toBeNull();
    expect(screen.queryByText("Toutes les boîtes")).toBeNull();
  });
});
