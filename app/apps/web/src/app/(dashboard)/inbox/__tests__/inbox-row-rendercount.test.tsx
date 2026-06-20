// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

/**
 * F2 B1.3 — the measurable core win. With InboxRow wrapped in React.memo and the
 * list passing stable handlers, changing the selected row must re-render ONLY the
 * two affected rows (old + new), not the whole list. We count real InboxRow renders
 * by mocking SenderAvatar (rendered exactly once per InboxRow body) — so removing
 * React.memo makes this test fail (it has teeth).
 */

const rendered: string[] = [];
vi.mock("../_sender-avatar", () => ({
  SenderAvatar: ({ email }: { email: string }) => {
    rendered.push(email);
    return null;
  },
}));

import { ConversationList } from "../_conversation-list";
import type { ConversationListItem } from "../_types";

function makeRows(n: number): ConversationListItem[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `k${i}`,
    lane: "attention",
    priority: 1,
    subject: `Subject ${i}`,
    contactId: null,
    displayName: `Sender ${i}`,
    fromAddress: `s${i}@acme.com`, // unique -> identifies which row rendered
    snippet: `snippet ${i}`,
    reason: "Replied",
    reasonSource: "reply",
    slaHoursOverdue: null,
    followup: null,
    starred: false,
    unread: false,
    importanceTier: 1,
    importanceFactors: [],
    labels: [],
    handledNote: null,
    lastInboundAt: "2026-06-19T10:00:00Z",
    lastMessageAt: "2026-06-19T10:00:00Z",
    messageCount: 1,
    hasIntelligence: false,
    split: "needs_reply",
    noise: false,
    mailboxId: null,
    mailboxAddress: null,
    mailboxLabel: null,
  }));
}

beforeEach(() => {
  rendered.length = 0;
});

describe("InboxRow render-count (F2 B1.3)", () => {
  const rows = makeRows(20);
  const stable = {
    lane: "attention" as const,
    conversations: rows,
    onSelect: vi.fn(),
    selectedKeys: [] as string[],
    onToggleSelect: vi.fn(),
    hasMore: false,
    loadingMore: false,
    onLoadMore: vi.fn(),
  };

  it("renders all rows once on first paint", () => {
    render(<ConversationList {...stable} selectedKey={rows[0].key} />);
    expect(rendered.length).toBe(20);
  });

  it("a selectedKey change re-renders at most 2 rows (old + new), not all 20", () => {
    const { rerender } = render(<ConversationList {...stable} selectedKey={rows[0].key} />);
    rendered.length = 0; // reset after the initial paint
    rerender(<ConversationList {...stable} selectedKey={rows[1].key} />);
    expect(rendered.length).toBeLessThanOrEqual(2);
    // The two affected rows are exactly the deselected + the newly selected one.
    expect(new Set(rendered)).toEqual(new Set(["s0@acme.com", "s1@acme.com"]));
  });

  it("an unrelated parent re-render (same props) re-renders no rows", () => {
    const { rerender } = render(<ConversationList {...stable} selectedKey={rows[0].key} />);
    rendered.length = 0;
    rerender(<ConversationList {...stable} selectedKey={rows[0].key} />);
    expect(rendered.length).toBe(0); // memo skips every row — nothing changed
  });
});
