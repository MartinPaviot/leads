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
    followup: null,
    starred: false,
    unread: true,
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
  it("comfortable (default): unread row shows bold sender, medium subject, preview", () => {
    render(<InboxRow item={sample({ unread: true })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} />);
    // Outlook 2-line: line 1 sender (bold when unread), line 2 subject (medium) + preview.
    const sender = screen.getByText("Jane Doe");
    expect(sender.className).toMatch(/font-bold/);
    const subject = screen.getByText("Re: pricing question");
    expect(subject.className).toMatch(/font-medium/);
    expect(screen.getByText("Thanks — can you confirm the annual number?")).toBeTruthy();
  });

  it("compact: collapses to one masked single line (sender · subject · snippet)", () => {
    const { container } = render(<InboxRow item={sample({ unread: true })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} density="compact" />);
    // One 14px clipped row with the soft right-edge fade.
    expect(container.querySelector(".text-\\[14px\\].overflow-hidden")).toBeTruthy();
    expect(screen.getByText("Jane Doe").className).toMatch(/font-bold/);
    expect(screen.getByText("Re: pricing question").className).toMatch(/font-medium/);
  });

  it("renders a READ row in normal weight (no unread emphasis)", () => {
    render(<InboxRow item={sample({ unread: false })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} />);
    expect(screen.getByText("Jane Doe").className).toMatch(/font-normal/);
    expect(screen.getByText("Re: pricing question").className).toMatch(/font-normal/);
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

  it("renders the SLA-overdue indicator when overdue (calm: hours, hover-revealed)", () => {
    render(<InboxRow item={sample({ slaHoursOverdue: 5 })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} />);
    expect(screen.getByText("5h")).toBeTruthy(); // concise "5h" (no loud "overdue" pill)
  });

  it("star toggle: fires onToggleStar with the flipped state, without selecting the row", () => {
    const onToggleStar = vi.fn();
    const onSelect = vi.fn();
    render(<InboxRow item={sample({ starred: false })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={onSelect} onToggleStar={onToggleStar} />);
    screen.getByLabelText("Star conversation").click();
    expect(onToggleStar).toHaveBeenCalledWith("k1", true);
    expect(onSelect).not.toHaveBeenCalled(); // stopPropagation
  });

  it("a starred row shows the filled star (always visible)", () => {
    render(<InboxRow item={sample({ starred: true })} lane="attention" selected={false} multiSelected={false} hasSelection={false} onSelect={vi.fn()} onToggleStar={vi.fn()} />);
    const star = screen.getByLabelText("Unstar conversation");
    expect(star.className).toContain("opacity-100");
  });
});

describe("InboxRow follow-up chip (B7 B2.3)", () => {
  const overdue = { dueAt: 1, stage: 1, overdue: true, daysUntilDue: 0, businessDaysOverdue: 3 };
  const upcoming = { dueAt: 1, stage: 1, overdue: false, daysUntilDue: 2, businessDaysOverdue: 0 };
  const props = { lane: "attention" as const, selected: false, multiSelected: false, hasSelection: false, onSelect: vi.fn() };

  it("renders an overdue follow-up label", () => {
    render(<InboxRow item={sample({ followup: overdue })} {...props} />);
    expect(screen.getByText("Follow up overdue · 3d")).toBeTruthy();
  });

  it("renders an upcoming follow-up label", () => {
    render(<InboxRow item={sample({ followup: upcoming })} {...props} />);
    expect(screen.getByText("Follow up in 2d")).toBeTruthy();
  });

  it("renders no follow-up chip when dueAt is null", () => {
    render(<InboxRow item={sample({ followup: { dueAt: null, stage: 0, overdue: false, daysUntilDue: 0, businessDaysOverdue: 0 } })} {...props} />);
    expect(screen.queryByText(/Follow up/)).toBeNull();
  });

  it("never renders both the SLA chip and the follow-up chip", () => {
    render(<InboxRow item={sample({ slaHoursOverdue: 5, followup: overdue })} {...props} />);
    expect(screen.getByText("5h")).toBeTruthy(); // SLA wins
    expect(screen.queryByText(/Follow up/)).toBeNull(); // follow-up suppressed
  });
});
