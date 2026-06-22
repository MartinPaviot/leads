import { describe, it, expect } from "vitest";
import {
  buildOutboundQueue,
  itemPriority,
  QUALITY_SENTINEL,
  assembleOutboundQueue,
  type QueueItem,
} from "../queue";

const now = new Date("2026-06-22T12:00:00Z");
const iso = (offsetH: number) => new Date(now.getTime() + offsetH * 3600_000).toISOString();

describe("buildOutboundQueue — priority order", () => {
  it("replies first, then overdue reminders, then upcoming, then drafts", () => {
    const items: QueueItem[] = [
      { kind: "draft", id: "d", qualityScore: 0.9 },
      { kind: "reminder", id: "r-upcoming", dueAt: iso(5) },
      { kind: "reply", id: "rep" },
      { kind: "reminder", id: "r-overdue", dueAt: iso(-5) },
    ];
    const out = buildOutboundQueue(items, now).map((i) => i.id);
    expect(out).toEqual(["rep", "r-overdue", "r-upcoming", "d"]);
  });

  it("drafts ordered by qualityScore desc; null uses the 0.5 sentinel", () => {
    const items: QueueItem[] = [
      { kind: "draft", id: "low", qualityScore: 0.2 },
      { kind: "draft", id: "unscored", qualityScore: null },
      { kind: "draft", id: "high", qualityScore: 0.95 },
    ];
    const out = buildOutboundQueue(items, now).map((i) => i.id);
    // high (0.95) > unscored (0.5) > low (0.2)
    expect(out).toEqual(["high", "unscored", "low"]);
  });

  it("signal freshness breaks ties between equal-quality drafts", () => {
    const items: QueueItem[] = [
      { kind: "draft", id: "stale", qualityScore: 0.8, signalFreshnessDays: 9 },
      { kind: "draft", id: "fresh", qualityScore: 0.8, signalFreshnessDays: 1 },
    ];
    const out = buildOutboundQueue(items, now).map((i) => i.id);
    expect(out).toEqual(["fresh", "stale"]);
  });

  it("itemPriority: reply > overdue reminder > upcoming reminder > any draft", () => {
    expect(itemPriority({ kind: "reply", id: "x" }, now)).toBeGreaterThan(
      itemPriority({ kind: "reminder", id: "x", dueAt: iso(-1) }, now),
    );
    expect(itemPriority({ kind: "reminder", id: "x", dueAt: iso(-1) }, now)).toBeGreaterThan(
      itemPriority({ kind: "reminder", id: "x", dueAt: iso(1) }, now),
    );
    expect(itemPriority({ kind: "reminder", id: "x", dueAt: iso(1) }, now)).toBeGreaterThan(
      itemPriority({ kind: "draft", id: "x", qualityScore: 1 }, now),
    );
    expect(QUALITY_SENTINEL).toBe(0.5);
  });

  it("empty queue -> []", () => {
    expect(buildOutboundQueue([], now)).toEqual([]);
  });
});

describe("assembleOutboundQueue — cockpit assembly (P1-15)", () => {
  it("orders replies > reminders > drafts and carries display fields", () => {
    const out = assembleOutboundQueue(
      {
        replies: [
          { id: "rep1", contactName: "Ada Lovelace", subject: "Re: ramp", repliedAt: iso(-1), classification: "positive" },
        ],
        reminders: [
          { id: "enr1", contactName: "Babbage", sequenceName: "Founders Q3", dueAt: iso(-2) },
        ],
        drafts: [
          { id: "d-low", subject: "low", qualityScore: 0.3, generatedAt: iso(-3), contactName: "Grace" },
          { id: "d-high", subject: "high", qualityScore: 0.95, generatedAt: iso(-4), contactName: "Alan" },
        ],
      },
      now,
    );
    expect(out.map((i) => i.id)).toEqual(["rep1", "enr1", "d-high", "d-low"]);

    const reply = out[0];
    expect(reply.kind).toBe("reply");
    expect(reply.title).toBe("Ada Lovelace replied");
    expect(reply.subtitle).toBe("positive · Re: ramp");
    expect(reply.href).toBe("/inbox");

    const reminder = out[1];
    expect(reminder.title).toBe("Overdue touch — Babbage");
    expect(reminder.subtitle).toBe("Sequence: Founders Q3");
    expect(reminder.href).toBe("/sequences");

    const draft = out[2];
    expect(draft.kind).toBe("draft");
    expect(draft.title).toBe("high");
    expect(draft.subtitle).toBe("Draft for Alan");
    expect(draft.href).toBe("/sequences/review");
    expect(draft.qualityScore).toBe(0.95);
  });

  it("labels upcoming vs overdue touches and falls back on missing names/subjects", () => {
    const out = assembleOutboundQueue(
      {
        replies: [{ id: "rep", contactName: null, subject: null, repliedAt: iso(0), classification: null }],
        reminders: [{ id: "up", contactName: "X", sequenceName: null, dueAt: iso(5) }],
        drafts: [],
      },
      now,
    );
    const reply = out.find((i) => i.id === "rep")!;
    expect(reply.title).toBe("Unknown contact replied");
    expect(reply.subtitle).toBe("(no subject)");
    const reminder = out.find((i) => i.id === "up")!;
    expect(reminder.title).toBe("Upcoming touch — X");
    expect(reminder.subtitle).toBe("Scheduled sequence step");
  });

  it("empty sources -> []", () => {
    expect(assembleOutboundQueue({ replies: [], reminders: [], drafts: [] }, now)).toEqual([]);
  });
});
