// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InboxRow } from "../_inbox-row";
import type { ConversationListItem } from "../_types";

function sample(over: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    key: "k1",
    lane: "attention",
    priority: 1,
    subject: "Re: pricing question",
    contactId: null,
    displayName: "Jane Doe",
    fromAddress: "jane@acme.com",
    snippet: "Thanks — can you confirm the annual number?",
    reason: "Reply to your outreach",
    reasonSource: "reply",
    slaHoursOverdue: null,
    importanceTier: 1,
    importanceFactors: ["recent reply"],
    labels: [],
    handledNote: null,
    lastInboundAt: "2026-06-19T10:00:00Z",
    lastMessageAt: "2026-06-19T10:00:00Z",
    messageCount: 2,
    hasIntelligence: false,
    split: "needs_reply",
    noise: false,
    mailboxId: "mb1",
    mailboxAddress: "me@acme.com",
    mailboxLabel: "Primary",
    ...over,
  };
}

describe("InboxRow (F1)", () => {
  it("renders sender (14/700), subject, snippet, timestamp", () => {
    render(<InboxRow item={sample()} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} />);
    const sender = screen.getByText("Jane Doe");
    expect(sender.className).toMatch(/text-\[14px\]/);
    expect(sender.className).toMatch(/font-bold/);
    const subject = screen.getByText("Re: pricing question");
    expect(subject.className).toMatch(/font-semibold/);
    expect(screen.getByText(/confirm the annual number/)).toBeTruthy();
  });

  it("checkbox is hidden at rest, shown when multi-selected", () => {
    const { rerender } = render(
      <InboxRow item={sample()} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} onToggleSelect={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox").className).toMatch(/opacity-0/);
    rerender(
      <InboxRow item={sample()} lane="attention" selected={false} multiSelected={true} hasSelection={true} onSelect={vi.fn()} onToggleSelect={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox").className).toMatch(/opacity-100/);
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
  });

  it("fires onSelect on click", () => {
    const onSelect = vi.fn();
    render(<InboxRow item={sample()} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={onSelect} />);
    screen.getByRole("button").click();
    expect(onSelect).toHaveBeenCalledWith("k1");
  });

  it("renders the SLA-overdue chip when overdue", () => {
    render(<InboxRow item={sample({ slaHoursOverdue: 30 })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/overdue/)).toBeTruthy();
  });
});
