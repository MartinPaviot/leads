import { describe, it, expect } from "vitest";
import {
  classifyChannel,
  computeLastTouchByOthers,
  assembleContactCollisions,
  UNKNOWN_TEAMMATE,
  type TouchRow,
} from "../recent-touch";

const NOW = new Date("2026-06-11T12:00:00Z");
const ME = "user-me";
const names = new Map<string, string>([
  ["user-a", "Marie Curie"],
  ["user-b", "Paul Erdos"],
]);

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("classifyChannel", () => {
  it("maps email-ish to email", () => {
    expect(classifyChannel("email_sent", null)).toBe("email");
    expect(classifyChannel(null, "email")).toBe("email");
    expect(classifyChannel("email_received", "email")).toBe("email");
  });
  it("maps call-ish to call", () => {
    expect(classifyChannel("call_completed", null)).toBe("call");
    expect(classifyChannel(null, "phone")).toBe("call");
  });
  it("falls back to other", () => {
    expect(classifyChannel("note_added", null)).toBe("other");
    expect(classifyChannel(null, null)).toBe("other");
  });
});

describe("computeLastTouchByOthers", () => {
  it("returns null when there are no rows", () => {
    expect(computeLastTouchByOthers([], ME, names, NOW)).toBeNull();
  });

  it("returns null when only the current user touched the contact", () => {
    const rows: TouchRow[] = [
      { userId: ME, channel: "call", outcome: "connected", occurredAt: daysAgo(1) },
      { userId: ME, channel: "email", outcome: null, occurredAt: daysAgo(2) },
    ];
    expect(computeLastTouchByOthers(rows, ME, names, NOW)).toBeNull();
  });

  it("returns null when the actor id is null (unattributed)", () => {
    const rows: TouchRow[] = [{ userId: null, channel: "other", outcome: null, occurredAt: daysAgo(1) }];
    expect(computeLastTouchByOthers(rows, ME, names, NOW)).toBeNull();
  });

  it("picks the most recent touch by another user, with the resolved name", () => {
    const rows: TouchRow[] = [
      { userId: "user-a", channel: "call", outcome: "callback_requested", occurredAt: daysAgo(5) },
      { userId: "user-b", channel: "email", outcome: null, occurredAt: daysAgo(2) },
      { userId: ME, channel: "call", outcome: "connected", occurredAt: daysAgo(0) },
    ];
    const r = computeLastTouchByOthers(rows, ME, names, NOW)!;
    expect(r.userId).toBe("user-b");
    expect(r.userName).toBe("Paul Erdos");
    expect(r.channel).toBe("email");
    expect(r.daysAgo).toBe(2);
    expect(r.otherUserCount).toBe(2);
  });

  it("counts only DISTINCT other users", () => {
    const rows: TouchRow[] = [
      { userId: "user-a", channel: "call", outcome: null, occurredAt: daysAgo(3) },
      { userId: "user-a", channel: "email", outcome: null, occurredAt: daysAgo(2) },
      { userId: "user-b", channel: "call", outcome: null, occurredAt: daysAgo(4) },
    ];
    expect(computeLastTouchByOthers(rows, ME, names, NOW)!.otherUserCount).toBe(2);
  });

  it("ignores touches older than the recency window", () => {
    const rows: TouchRow[] = [
      { userId: "user-a", channel: "call", outcome: null, occurredAt: daysAgo(45) },
    ];
    expect(computeLastTouchByOthers(rows, ME, names, NOW)).toBeNull();
    // …but a custom window can include it.
    expect(computeLastTouchByOthers(rows, ME, names, NOW, 60)).not.toBeNull();
  });

  it("is order-independent (same result regardless of row order)", () => {
    const rows: TouchRow[] = [
      { userId: "user-a", channel: "call", outcome: null, occurredAt: daysAgo(2) },
      { userId: "user-b", channel: "email", outcome: null, occurredAt: daysAgo(2) },
    ];
    const a = computeLastTouchByOthers(rows, ME, names, NOW)!;
    const b = computeLastTouchByOthers([...rows].reverse(), ME, names, NOW)!;
    expect(a.userId).toBe(b.userId);
    expect(a.channel).toBe(b.channel);
  });

  it("uses a non-empty fallback label when the actor resolves to no name", () => {
    const rows: TouchRow[] = [
      { userId: "ghost", channel: "call", outcome: null, occurredAt: daysAgo(1) },
    ];
    const r = computeLastTouchByOthers(rows, ME, names, NOW)!;
    expect(r.userName).toBe(UNKNOWN_TEAMMATE);
    expect(r.otherUserCount).toBe(1);
  });
});

describe("assembleContactCollisions", () => {
  it("maps each contact to its collision (or null), keeping clear contacts", () => {
    const byContact = new Map<string, TouchRow[]>([
      ["c-other", [{ userId: "user-a", channel: "call", outcome: null, occurredAt: daysAgo(1) }]],
      ["c-self", [{ userId: ME, channel: "call", outcome: null, occurredAt: daysAgo(1) }]],
      ["c-empty", []],
    ]);
    const out = assembleContactCollisions(byContact, ME, names, NOW);
    expect(out["c-other"]?.userName).toBe("Marie Curie");
    expect(out["c-self"]).toBeNull();
    expect(out["c-empty"]).toBeNull();
  });
});
