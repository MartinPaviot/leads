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

  it("uses sentiment for the reason only on a genuine reply (has outbound)", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", sentiment: "positive" })],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("Positive reply");
    expect(convs[0].reasonSource).toBe("sentiment");
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

describe("honest badge (INBOX-T08)", () => {
  it("never shows a sales-reply label on general inbound (no outbound)", () => {
    // intent ["introduction"] maps to "Introduction" — but with no outbound this
    // is not a reply to us, so we must not assert a sales meaning on it.
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", intent: ["introduction"] })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("");
    expect(convs[0].reasonSource).toBeNull();
  });

  it("never emits the bare 'Replied' fallback", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", sentiment: "neutral", intent: [] })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("");
    expect(convs[0].reason).not.toBe("Replied");
  });

  it("shows the cached AI summary line for general inbound when present", () => {
    const convs = buildConversations({
      inbound: [
        inbound({
          id: "i1",
          threadId: "t1",
          // anna.keller@ is a confirmed human sender (stays in attention), so the
          // summary path — not the automated-handled path — is exercised.
          metadata: { from: "anna.keller@romandco.ch", aiSummaryLine: "Login code from your hosting provider" },
        }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("Login code from your hosting provider");
    expect(convs[0].reasonSource).toBe("summary");
  });

  it("maps a real sequence-reply classification to friendly text", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", intent: ["pricing_inquiry"] })],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("Asked about pricing");
    expect(convs[0].reasonSource).toBe("reply");
  });

  it("a real label beats both summary and sentiment on a reply", () => {
    const convs = buildConversations({
      inbound: [
        inbound({
          id: "i1",
          threadId: "t1",
          sentiment: "positive",
          intent: ["meeting_request"],
          metadata: { from: "prospect@acme.ch", aiSummaryLine: "should be ignored" },
        }),
      ],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    expect(convs[0].reason).toBe("Meeting request");
    expect(convs[0].reasonSource).toBe("reply");
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

  it("threads the captured HTML body onto inbound messages (INBOX-R01)", () => {
    const convs = buildConversations({
      inbound: [
        inbound({
          id: "i1",
          threadId: "t1",
          metadata: { from: "p@acme.ch", bodyHtml: "<p>Hello <b>world</b></p>" },
        }),
      ],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    const inboundMsg = convs[0].messages.find((m) => m.direction === "inbound")!;
    const outboundMsg = convs[0].messages.find((m) => m.direction === "outbound")!;
    expect(inboundMsg.bodyHtml).toBe("<p>Hello <b>world</b></p>");
    expect(outboundMsg.bodyHtml).toBeNull(); // outbound is composed as text
  });

  it("leaves bodyHtml null for inbound with no HTML part", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].messages[0].bodyHtml).toBeNull();
  });

  it("threads the sender domain-auth verdict onto messages (INBOX-R06)", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t1", metadata: { from: "p@acme.ch", senderAuth: { status: "pass" } } }),
      ],
      outbound: [outbound({ id: "o1", threadId: "t1" })],
      triage: [],
      now: NOW,
    });
    const inboundMsg = convs[0].messages.find((m) => m.direction === "inbound")!;
    const outboundMsg = convs[0].messages.find((m) => m.direction === "outbound")!;
    expect(inboundMsg.senderVerified).toBe("pass");
    expect(outboundMsg.senderVerified).toBe("unknown"); // our own sent mail
  });

  it("defaults senderVerified to unknown when no auth verdict was captured", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1" })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].messages[0].senderVerified).toBe("unknown");
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

describe("response SLA (INBOX-N04)", () => {
  it("flags an attention conversation awaiting our reply past the threshold", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-08T10:00:00Z" })], // ~50h before NOW
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].slaHoursOverdue).not.toBeNull();
    expect(convs[0].slaHoursOverdue!).toBeGreaterThan(0);
  });

  it("does not flag a conversation within the SLA window", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-10T10:00:00Z" })], // 2h before NOW
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].slaHoursOverdue).toBeNull();
  });

  it("does not flag when we replied last (not awaiting our reply)", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-08T10:00:00Z" })],
      outbound: [outbound({ id: "o1", threadId: "t1", sentAt: "2026-06-09T10:00:00Z" })],
      triage: [],
      now: NOW,
    });
    expect(convs[0].slaHoursOverdue).toBeNull();
  });

  it("does not flag handled conversations", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-08T10:00:00Z", intent: ["out_of_office"] })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].lane).toBe("handled");
    expect(convs[0].slaHoursOverdue).toBeNull();
  });
});

describe("follow-up timing (B7)", () => {
  it("attaches an overdue follow-up on an awaiting-their-reply thread, SLA-exclusive", () => {
    const convs = buildConversations({
      // 2026-06-01 is a Monday; we replied last that morning, no answer since.
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-01T10:00:00Z" })],
      outbound: [outbound({ id: "o1", threadId: "t1", sentAt: "2026-06-01T11:00:00Z" })],
      triage: [],
      now: NOW, // 2026-06-10, well past Mon+3 business days = Thu 06-04
    });
    const c = convs[0];
    expect(c.awaitingTheirReply).toBe(true);
    expect(c.followup).not.toBeNull();
    expect(c.followup!.dueAt).not.toBeNull();
    expect(c.followup!.stage).toBe(1);
    expect(c.followup!.overdue).toBe(true);
    expect(c.slaHoursOverdue).toBeNull(); // never both populated (R2.6)
  });

  it("attaches no follow-up when we owe the reply (awaiting our reply)", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-10T10:00:00Z" })],
      outbound: [],
      triage: [],
      now: NOW,
    });
    expect(convs[0].awaitingOurReply).toBe(true);
    expect(convs[0].followup).toBeNull();
  });

  it("sorts an overdue follow-up ahead of an upcoming one at equal importance (B4.1)", () => {
    // Both threads share the same inbound (06-01) -> identical importance tier+score.
    // t-over's outbound is old (overdue follow-up); t-up's is recent (upcoming).
    const convs = buildConversations({
      inbound: [
        inbound({ id: "iu", threadId: "t-up", occurredAt: "2026-06-01T10:00:00Z" }),
        inbound({ id: "io", threadId: "t-over", occurredAt: "2026-06-01T10:00:00Z" }),
      ],
      outbound: [
        outbound({ id: "ou", threadId: "t-up", sentAt: "2026-06-09T11:00:00Z" }), // upcoming
        outbound({ id: "oo", threadId: "t-over", sentAt: "2026-06-01T11:00:00Z" }), // overdue
      ],
      triage: [],
      now: NOW,
    });
    const over = convs.find((c) => c.key === "t-over")!;
    const up = convs.find((c) => c.key === "t-up")!;
    expect(over.followup!.overdue).toBe(true);
    expect(up.followup!.overdue).toBe(false);
    expect(convs.indexOf(over)).toBeLessThan(convs.indexOf(up)); // overdue leads
  });

  it("counts two trailing outbounds as the stage-2 interval", () => {
    const convs = buildConversations({
      inbound: [inbound({ id: "i1", threadId: "t1", occurredAt: "2026-06-01T10:00:00Z" })],
      outbound: [
        outbound({ id: "o1", threadId: "t1", sentAt: "2026-06-01T11:00:00Z" }),
        outbound({ id: "o2", threadId: "t1", sentAt: "2026-06-04T11:00:00Z" }), // first nudge
      ],
      triage: [],
      now: NOW,
    });
    const c = convs[0];
    expect(c.awaitingTheirReply).toBe(true);
    expect(c.followup!.stage).toBe(2);
  });
});

describe("importance ranking (INBOX-T04)", () => {
  it("scores a hot intent above the bottom and pins automated senders to tier 4", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t-hot", intent: ["meeting_request"] }),
        inbound({
          id: "i2",
          threadId: "t-auto",
          metadata: { from: "Infomaniak <no-reply@infomaniak.com>", to: "m@pilae.ch" },
        }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    const hot = convs.find((c) => c.key === "t-hot")!;
    const auto = convs.find((c) => c.key === "t-auto")!;
    expect(hot.importanceTier).toBeLessThan(4);
    expect(hot.importanceFactors.length).toBeGreaterThan(0); // cited, never opaque
    expect(auto.importanceTier).toBe(4);
    expect(auto.importanceScore).toBe(0);
  });
});

describe("bulk bundling flag (INBOX-T03)", () => {
  it("flags automated/bulk senders isBulk and leaves real threads alone", () => {
    const convs = buildConversations({
      inbound: [
        inbound({ id: "i1", threadId: "t-human", intent: ["meeting_request"] }),
        inbound({
          id: "i2",
          threadId: "t-bulk",
          metadata: { from: "Acme Newsletter <no-reply@news.acme.com>", to: "m@pilae.ch" },
        }),
      ],
      outbound: [],
      triage: [],
      now: NOW,
    });
    const human = convs.find((c) => c.key === "t-human")!;
    const bulk = convs.find((c) => c.key === "t-bulk")!;
    expect(bulk.isBulk).toBe(true); // feeds the Bundles view
    expect(human.isBulk).toBe(false); // a real reply never gets bundled away
  });
});
