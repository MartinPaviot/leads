import { describe, it, expect } from "vitest";
import {
  buildConversations,
  conversationKeyFor,
  laneCounts,
  type InboundRow,
  type OutboundRow,
  type TriageRow,
} from "@/lib/inbox/conversations";

const NOW = new Date("2026-06-10T12:00:00Z");

function inbound(over: Partial<InboundRow> & { id: string }): InboundRow {
  return {
    threadId: null,
    contactId: null,
    occurredAt: "2026-06-10T10:00:00Z",
    summary: "Re: Elevay",
    rawContent: "Merci pour votre message, pouvons-nous en parler ?",
    metadata: { from: "prospect@acme.ch", to: "martin@elevay.dev" },
    sentiment: "neutral",
    intent: [],
    ...over,
  };
}

function outbound(over: Partial<OutboundRow> & { id: string }): OutboundRow {
  return {
    threadId: null,
    contactId: null,
    subject: "Elevay <> Acme",
    bodyText: "Bonjour, je vous écris car…",
    sentAt: "2026-06-09T09:00:00Z",
    status: "sent",
    repliedAt: null,
    replyClassification: null,
    bounceType: null,
    stepNumber: 1,
    toAddress: "prospect@acme.ch",
    fromAddress: "martin@elevay.dev",
    enrollmentId: null,
    ...over,
  };
}

function triage(over: Partial<TriageRow> & { conversationKey: string }): TriageRow {
  return {
    status: "open",
    doneAt: null,
    snoozedUntil: null,
    updatedAt: "2026-06-10T11:00:00Z",
    ...over,
  };
}

describe("conversationKeyFor", () => {
  it("prefers threadId, then contact, then email id", () => {
    expect(conversationKeyFor({ threadId: "t1", contactId: "c1", id: "e1" })).toBe("t1");
    expect(conversationKeyFor({ threadId: null, contactId: "c1", id: "e1" })).toBe("contact:c1");
    expect(conversationKeyFor({ threadId: null, contactId: null, id: "e1" })).toBe("email:e1");
  });
});

describe("grouping", () => {
  it("joins inbound and outbound sharing a threadId into one conversation", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    expect(convs).toHaveLength(1);
    expect(convs[0].messageCount).toBe(2);
    expect(convs[0].messages.map((m) => m.direction)).toEqual(["outbound", "inbound"]);
  });

  it("never merges thread-less conversations of different contacts", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", contactId: "c1" }),
        inbound({ id: "i2", contactId: "c2" }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs).toHaveLength(2);
  });

  it("excludes outbound-only conversations (they belong to the Outbound tab)", () => {
    const convs = buildConversations({
      inbound: [],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    expect(convs).toHaveLength(0);
  });
});

describe("lanes", () => {
  it("puts a fresh inbound conversation in attention", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("attention");
  });

  it("routes out_of_office intent to handled with the reschedule note", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", intent: ["out_of_office"] })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("handled");
    expect(convs[0].handledNote).toContain("rescheduled");
  });

  it("routes ooo reply_classification to handled", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [
        outbound({
          id: "o1",
          threadId: "t1",
          repliedAt: "2026-06-10T10:00:00Z",
          replyClassification: "ooo",
        }),
      ],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("handled");
  });

  it("a NEWER inbound supersedes a stale ooo classification (no handled trap)", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i2", threadId: "t1", occurredAt: "2026-06-10T11:00:00Z", intent: ["interested"] }),
      ],
      outbound: [
        outbound({
          id: "o1",
          threadId: "t1",
          repliedAt: "2026-06-08T10:00:00Z",
          replyClassification: "ooo",
        }),
      ],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("attention");
    expect(convs[0].reason).toBe("Interested");
  });

  it("routes unsubscribe to handled with the opt-out note", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", intent: ["unsubscribe"] })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("handled");
    expect(convs[0].handledNote).toContain("opt-out");
  });

  it("shows an inbound-less bounced thread as handled", () => {
    const convs = buildConversations({
      inbound: [],
      outbound: [outbound({ id: "o1", threadId: "t1", status: "bounced", bounceType: "hard" })],
      triage: [],
      now: NOW,
    });
    expect(convs).toHaveLength(1);
    expect(convs[0].lane).toBe("handled");
    expect(convs[0].handledNote).toContain("Bounced");
  });

  it("routes an automated/role sender (noreply@) to handled — never attention", () => {
    const convs = buildConversations({
      inbound: [
        inbound({
          id: "i1",
          threadId: "t1",
          metadata: { from: "Infomaniak <no-reply@infomaniak.com>", to: "martin@pilae.ch" },
        }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("handled");
    expect(convs[0].handledNote).toContain("Automated");
  });

  it("keeps a human sender in attention (role detection doesn't over-match)", () => {
    const convs = buildConversations({
      inbound: [
        inbound({
          id: "i1",
          threadId: "t1",
          metadata: { from: "Anna Keller <anna.keller@romandco.ch>", to: "martin@pilae.ch" },
        }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("attention");
  });
});

describe("triage state machine (computed reopen)", () => {
  it("done stays done while no newer inbound arrives", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-10T10:00:00Z" })],
      outbound: [],
      triage: [
        triage({ conversationKey: "t1", status: "done", doneAt: "2026-06-10T11:00:00Z" }),
      ],
      now: NOW,
    });
    expect(convs[0].lane).toBe("done");
  });

  it("reopens a done conversation when a newer inbound arrives", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-10T10:00:00Z" }),
        inbound({ id: "i2", threadId: "t1", occurredAt: "2026-06-10T11:30:00Z" }),
      ],
      outbound: [],
      triage: [
        triage({ conversationKey: "t1", status: "done", doneAt: "2026-06-10T11:00:00Z" }),
      ],
      now: NOW,
    });
    expect(convs[0].lane).toBe("attention");
  });

  it("snoozed stays snoozed until snoozedUntil", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [],
      triage: [
        triage({
          conversationKey: "t1",
          status: "snoozed",
          snoozedUntil: "2026-06-12T08:00:00Z",
        }),
      ],
      now: NOW,
    });
    expect(convs[0].lane).toBe("snoozed");
  });

  it("snooze expires back to attention", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [],
      triage: [
        triage({
          conversationKey: "t1",
          status: "snoozed",
          snoozedUntil: "2026-06-10T08:00:00Z",
        }),
      ],
      now: NOW,
    });
    expect(convs[0].lane).toBe("attention");
  });

  it("a new inbound breaks a snooze", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-10T11:45:00Z" })],
      outbound: [],
      triage: [
        triage({
          conversationKey: "t1",
          status: "snoozed",
          snoozedUntil: "2026-06-15T08:00:00Z",
          updatedAt: "2026-06-10T11:00:00Z",
        }),
      ],
      now: NOW,
    });
    expect(convs[0].lane).toBe("attention");
  });
});

describe("priority + ordering + reasons", () => {
  it("orders attention by bucket: meeting_request before question before objection before neutral", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t-neutral", occurredAt: "2026-06-10T11:59:00Z" }),
        inbound({ id: "i2", threadId: "t-objection", intent: ["objection"], occurredAt: "2026-06-10T09:00:00Z" }),
        inbound({ id: "i3", threadId: "t-question", intent: ["question"], occurredAt: "2026-06-10T08:00:00Z" }),
        inbound({ id: "i4", threadId: "t-hot", intent: ["interested"], occurredAt: "2026-06-10T07:00:00Z" }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs.map((c) => c.key)).toEqual(["t-hot", "t-question", "t-objection", "t-neutral"]);
  });

  it("uses meeting_request classification from outbound when inbound has no intent", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [
        outbound({
          id: "o1",
          threadId: "t1",
          repliedAt: "2026-06-10T10:00:00Z",
          replyClassification: "meeting_request",
        }),
      ],
      triage: [],
      now: NOW,
    });
    expect(convs[0].priority).toBe(1);
    expect(convs[0].reason).toBe("Meeting request");
  });

  it("falls back to sentiment for the reason when no label matches", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", sentiment: "positive" })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("Positive reply");
  });

  it("ties within a bucket break by freshest inbound first", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t-old", intent: ["question"], occurredAt: "2026-06-09T10:00:00Z" }),
        inbound({ id: "i2", threadId: "t-new", intent: ["question"], occurredAt: "2026-06-10T10:00:00Z" }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs.map((c) => c.key)).toEqual(["t-new", "t-old"]);
  });
});

describe("content extraction", () => {
  it("surfaces the latest threadIntelligence from inbound metadata", () => {
    const ti = { signals: [{ type: "budget", evidence: "enveloppe Q3", confidence: 0.8 }], urgencyLevel: "high" };
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-09T10:00:00Z" }),
        inbound({
          id: "i2",
          threadId: "t1",
          occurredAt: "2026-06-10T10:00:00Z",
          metadata: { from: "p@acme.ch", threadIntelligence: ti },
        }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].intelligence).toEqual(ti);
  });

  it("renders no intelligence section when none was persisted", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].intelligence).toBeNull();
  });

  it("keeps full message bodies and normalizes the list snippet", () => {
    const long = "ligne 1\nligne 2   avec   espaces " + "x".repeat(200);
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", rawContent: long })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].messages[0].body).toBe(long);
    expect(convs[0].snippet.length).toBeLessThanOrEqual(140);
    expect(convs[0].snippet).not.toContain("\n");
  });

  it("counts lanes", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t1" }),
        inbound({ id: "i2", threadId: "t2", intent: ["out_of_office"] }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(laneCounts(convs)).toEqual({ attention: 1, handled: 1, snoozed: 0, done: 0 });
  });
});
