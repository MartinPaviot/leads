import { describe, it, expect } from "vitest";
import {
  INBOX_SORTS,
  isInboxSort,
  defaultInboxSort,
  compareBy,
  sortRows,
  type InboxSort,
  type SortFields,
} from "@/lib/inbox/inbox-sort";

function row(over: Partial<SortFields>): SortFields {
  return {
    importanceTier: 4,
    importanceScore: 0,
    followupOverdue: false,
    lastInboundAt: null,
    lastMessageAt: null,
    unread: false,
    sortName: "",
    ...over,
  };
}

/** Sort a labelled set and return the labels in order (the field extractor is identity). */
function order(mode: InboxSort, items: Array<{ id: string } & Partial<SortFields>>): string[] {
  return sortRows(items, mode, (r) => row(r)).map((r) => r.id);
}

describe("isInboxSort", () => {
  it("accepts the known modes, rejects everything else", () => {
    for (const s of INBOX_SORTS) expect(isInboxSort(s.id)).toBe(true);
    expect(isInboxSort("date")).toBe(true);
    expect(isInboxSort("bogus")).toBe(false);
    expect(isInboxSort(null)).toBe(false);
    expect(isInboxSort(undefined)).toBe(false);
    expect(isInboxSort("")).toBe(false);
  });
});

describe("defaultInboxSort", () => {
  it("ranks the triage attention lane + any split by priority", () => {
    expect(defaultInboxSort("attention", false)).toBe("priority");
    expect(defaultInboxSort("primary", true)).toBe("priority"); // a split overrides
    expect(defaultInboxSort("attention", true)).toBe("priority");
  });

  it("defaults every email-client folder to date", () => {
    expect(defaultInboxSort("primary", false)).toBe("date");
    expect(defaultInboxSort("done", false)).toBe("date");
    expect(defaultInboxSort("snoozed", false)).toBe("date");
    expect(defaultInboxSort("all", false)).toBe("date");
    expect(defaultInboxSort("starred", false)).toBe("date");
    expect(defaultInboxSort("trash", false)).toBe("date");
  });
});

describe("date sort", () => {
  const items = [
    { id: "old", lastInboundAt: "2026-06-01T10:00:00Z" },
    { id: "new", lastInboundAt: "2026-06-10T10:00:00Z" },
    { id: "mid", lastInboundAt: "2026-06-05T10:00:00Z" },
  ];

  it("date = newest received first (regardless of importance)", () => {
    // 'old' is the only hot one — date sort must still float 'new' to the top.
    const withHot = [
      { id: "old", lastInboundAt: "2026-06-01T10:00:00Z", importanceTier: 1 as const, importanceScore: 90 },
      { id: "new", lastInboundAt: "2026-06-10T10:00:00Z", importanceTier: 4 as const },
    ];
    expect(order("date", withHot)).toEqual(["new", "old"]);
  });

  it("date-asc = oldest first", () => {
    expect(order("date-asc", items)).toEqual(["old", "mid", "new"]);
  });

  it("falls back to lastMessageAt when there is no inbound timestamp", () => {
    const m = [
      { id: "a", lastInboundAt: null, lastMessageAt: "2026-06-02T00:00:00Z" },
      { id: "b", lastInboundAt: null, lastMessageAt: "2026-06-09T00:00:00Z" },
    ];
    expect(order("date", m)).toEqual(["b", "a"]);
  });

  it("treats a missing/invalid date as epoch (sinks to the bottom, newest-first)", () => {
    const m = [
      { id: "dated", lastInboundAt: "2026-06-05T00:00:00Z" },
      { id: "undated", lastInboundAt: null, lastMessageAt: null },
    ];
    expect(order("date", m)).toEqual(["dated", "undated"]);
  });
});

describe("priority sort", () => {
  it("orders by tier, then finer score, then overdue follow-up, then recency", () => {
    const items = [
      { id: "neutral", importanceTier: 4 as const, importanceScore: 0, lastInboundAt: "2026-06-10T10:00:00Z" },
      { id: "hot-low", importanceTier: 1 as const, importanceScore: 62, lastInboundAt: "2026-06-01T10:00:00Z" },
      { id: "hot-high", importanceTier: 1 as const, importanceScore: 80, lastInboundAt: "2026-06-01T09:00:00Z" },
      { id: "warm", importanceTier: 2 as const, importanceScore: 40, lastInboundAt: "2026-06-09T10:00:00Z" },
    ];
    expect(order("priority", items)).toEqual(["hot-high", "hot-low", "warm", "neutral"]);
  });

  it("an overdue follow-up leads at equal tier+score, newest breaks the final tie", () => {
    const items = [
      { id: "upcoming", importanceTier: 2 as const, importanceScore: 40, followupOverdue: false, lastInboundAt: "2026-06-08T10:00:00Z" },
      { id: "overdue", importanceTier: 2 as const, importanceScore: 40, followupOverdue: true, lastInboundAt: "2026-06-01T10:00:00Z" },
    ];
    expect(order("priority", items)).toEqual(["overdue", "upcoming"]);
  });

  it("applies importance across rows that differ in lane (the Primary-view fix)", () => {
    // A handled (tier 4) and an attention (tier 1) thread interleaved: priority
    // must rank the hot one first even though the handled one is more recent —
    // the legacy attention-only comparator left this to pure date.
    const items = [
      { id: "handled-recent", importanceTier: 4 as const, importanceScore: 0, lastInboundAt: "2026-06-10T10:00:00Z" },
      { id: "attention-old", importanceTier: 1 as const, importanceScore: 70, lastInboundAt: "2026-06-01T10:00:00Z" },
    ];
    expect(order("priority", items)).toEqual(["attention-old", "handled-recent"]);
  });
});

describe("unread sort", () => {
  it("unread leads, then newest within each group", () => {
    const items = [
      { id: "read-new", unread: false, lastInboundAt: "2026-06-10T10:00:00Z" },
      { id: "unread-old", unread: true, lastInboundAt: "2026-06-01T10:00:00Z" },
      { id: "unread-new", unread: true, lastInboundAt: "2026-06-09T10:00:00Z" },
      { id: "read-old", unread: false, lastInboundAt: "2026-06-02T10:00:00Z" },
    ];
    expect(order("unread", items)).toEqual(["unread-new", "unread-old", "read-new", "read-old"]);
  });
});

describe("sender sort", () => {
  it("A→Z by display name, case-insensitive, newest breaks a tie", () => {
    const items = [
      { id: "z", sortName: "zoe ng" },
      { id: "a1", sortName: "anna keller", lastInboundAt: "2026-06-01T10:00:00Z" },
      { id: "a2", sortName: "anna keller", lastInboundAt: "2026-06-09T10:00:00Z" },
      { id: "m", sortName: "Marc Favre" },
    ];
    expect(order("sender", items)).toEqual(["a2", "a1", "m", "z"]);
  });
});

describe("compareBy is a usable comparator", () => {
  it("is symmetric in sign for the date mode", () => {
    const a = row({ lastInboundAt: "2026-06-10T00:00:00Z" });
    const b = row({ lastInboundAt: "2026-06-01T00:00:00Z" });
    expect(Math.sign(compareBy("date", a, b))).toBe(-Math.sign(compareBy("date", b, a)));
  });

  it("returns 0 for identical date keys", () => {
    const a = row({ lastInboundAt: "2026-06-10T00:00:00Z" });
    const b = row({ lastInboundAt: "2026-06-10T00:00:00Z" });
    expect(compareBy("date", a, b)).toBe(0);
  });
});
