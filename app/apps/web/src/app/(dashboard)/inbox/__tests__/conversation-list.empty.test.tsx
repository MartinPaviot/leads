// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConversationList } from "../_conversation-list";

/**
 * F3 B4 — a search-aware empty list. With a query, an empty result reads "no
 * matches" + Clear search; with no query, the lane's resting empty copy.
 */

const base = {
  lane: "attention" as const,
  conversations: [],
  selectedKey: null,
  onSelect: vi.fn(),
  hasMore: false,
  loadingMore: false,
  onLoadMore: vi.fn(),
};

describe("ConversationList empty state (F3 B4)", () => {
  it("with an active query -> no-results copy + a Clear search action", () => {
    const onClearSearch = vi.fn();
    render(<ConversationList {...base} hasQuery onClearSearch={onClearSearch} />);
    expect(screen.getByText("No conversations match the current search")).toBeTruthy();
    const clear = screen.getByText("Clear search");
    fireEvent.click(clear);
    expect(onClearSearch).toHaveBeenCalled();
  });

  it("with no query -> the lane's resting empty copy, no Clear search", () => {
    render(<ConversationList {...base} hasQuery={false} />);
    expect(screen.getByText("Nothing needs your attention")).toBeTruthy();
    expect(screen.queryByText("Clear search")).toBeNull();
  });

  it("the done lane shows its own resting copy when empty + no query", () => {
    render(<ConversationList {...base} lane="done" />);
    expect(screen.getByText("Nothing marked done yet")).toBeTruthy();
  });
});
