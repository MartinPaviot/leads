import { describe, it, expect } from "vitest";
import {
  buildNeedsYou,
  buildLedger,
  buildEngineLine,
  ledgerSentence,
  isTestLabel,
  type ReplyInput,
  type ApprovalInput,
  type DealRiskInput,
  type MeetingInput,
  type TaskInput,
  type ReactionInput,
} from "@/lib/home/up-next";

const NOW = new Date("2026-06-10T12:00:00Z");

function reply(over: Partial<ReplyInput> & { conversationKey: string }): ReplyInput {
  return {
    contactId: null,
    subject: "Re: Elevay",
    fromAddress: "prospect@acme.ch",
    reason: "Replied",
    priority: 4,
    lastInboundAt: "2026-06-10T10:00:00Z",
    ...over,
  };
}
function approval(over: Partial<ApprovalInput> & { id: string }): ApprovalInput {
  return {
    actionType: "send_followup",
    reasoning: "Drafted a follow-up grounded in their pricing question.",
    entityType: "contact",
    entityId: "c1",
    entityLabel: "Marie Dubois",
    confidence: 0.8,
    amount: null,
    createdAt: "2026-06-10T09:00:00Z",
    ...over,
  };
}
function deal(over: Partial<DealRiskInput> & { id: string }): DealRiskInput {
  return { name: "Acme expansion", stage: "proposal", value: 48000, daysSilent: 14, ...over };
}
function meeting(over: Partial<MeetingInput> & { id: string }): MeetingInput {
  return { title: "Intro — Acme", time: "10:00 AM", ...over };
}
function task(over: Partial<TaskInput> & { id: string }): TaskInput {
  return { title: "Send deck", overdue: false, account: "Acme", entityType: "company", entityId: "co1", ...over };
}

describe("buildNeedsYou — merge + ranking (AC1, AC3)", () => {
  it("merges every lane into one list", () => {
    const items = buildNeedsYou(
      {
        replies: [reply({ conversationKey: "t1", priority: 1 })],
        approvals: [approval({ id: "a1" })],
        dealsAtRisk: [deal({ id: "d1" })],
        meetings: [meeting({ id: "m1" })],
        tasks: [task({ id: "k1" })],
      },
      NOW,
    );
    expect(items).toHaveLength(5);
    expect(new Set(items.map((i) => i.kind))).toEqual(
      new Set(["reply", "approval", "deal_risk", "meeting", "task"]),
    );
  });

  it("ranks a hot reply (priority 1) above an approval, and a task last", () => {
    const items = buildNeedsYou(
      {
        replies: [reply({ conversationKey: "hot", priority: 1, reason: "Meeting request" })],
        approvals: [approval({ id: "a1", confidence: 0.5, amount: null })],
        tasks: [task({ id: "k1" })],
      },
      NOW,
    );
    expect(items[0].kind).toBe("reply");
    expect(items[items.length - 1].kind).toBe("task");
  });

  it("floats a big, very-stale deal up the queue (value + age boosts)", () => {
    const items = buildNeedsYou(
      {
        replies: [reply({ conversationKey: "lukewarm", priority: 4 })],
        dealsAtRisk: [deal({ id: "d1", value: 200000, daysSilent: 60 })],
      },
      NOW,
    );
    // a $200k deal silent 60d should outrank a neutral "replied" reply
    expect(items[0].kind).toBe("deal_risk");
  });

  it("is deterministic for equal scores (stable id tiebreak)", () => {
    const a = buildNeedsYou({ tasks: [task({ id: "b" }), task({ id: "a" })] }, NOW);
    const b = buildNeedsYou({ tasks: [task({ id: "a" }), task({ id: "b" })] }, NOW);
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });
});

describe("buildNeedsYou — approvals are present and actionable (AC2)", () => {
  it("carries actionId so the card can Approve/Skip", () => {
    const items = buildNeedsYou({ approvals: [approval({ id: "a1" })] }, NOW);
    expect(items[0].actionId).toBe("a1");
    expect(items[0].kind).toBe("approval");
  });
});

describe("buildNeedsYou — differentiated content (AC4)", () => {
  it("keeps each item's real grounded reason, not a constant", () => {
    const items = buildNeedsYou(
      {
        replies: [
          reply({ conversationKey: "t1", reason: "Asked about pricing", priority: 2 }),
          reply({ conversationKey: "t2", reason: "Meeting request", priority: 1 }),
        ],
      },
      NOW,
    );
    const reasons = items.map((i) => i.why);
    expect(new Set(reasons).size).toBe(2);
    expect(reasons).toContain("Asked about pricing");
    expect(reasons).toContain("Meeting request");
  });

  it("renders stakes as money for valued items", () => {
    const items = buildNeedsYou({ dealsAtRisk: [deal({ id: "d1", value: 48000 })] }, NOW);
    expect(items[0].stakes).toBe("$48k");
  });
});

describe("buildNeedsYou — dedupe", () => {
  it("drops a task for a contact already surfaced as a reply", () => {
    const items = buildNeedsYou(
      {
        replies: [reply({ conversationKey: "t1", contactId: "c9" })],
        tasks: [task({ id: "k1", entityType: "contact", entityId: "c9" })],
      },
      NOW,
    );
    expect(items.filter((i) => i.kind === "task")).toHaveLength(0);
    expect(items.filter((i) => i.kind === "reply")).toHaveLength(1);
  });
});

describe("isTestLabel + test filtering (AC8)", () => {
  it("flags e2e / test markers but not normal names", () => {
    expect(isTestLabel("E2E Full Deal")).toBe(true);
    expect(isTestLabel("test deal 3")).toBe(true);
    expect(isTestLabel("__test fixture")).toBe(true);
    expect(isTestLabel("Craft Health API Integration")).toBe(false);
    expect(isTestLabel(null)).toBe(false);
  });

  it("excludes test rows from the queue", () => {
    const items = buildNeedsYou(
      {
        dealsAtRisk: [deal({ id: "d1", name: "E2E Full Deal" }), deal({ id: "d2", name: "Acme expansion" })],
      },
      NOW,
    );
    expect(items.map((i) => i.title)).toEqual(["Acme expansion"]);
  });
});

describe("buildLedger — synthesis not row dump (AC6)", () => {
  function rx(trigger: string, label: string, deferred = 0): ReactionInput {
    return { trigger, entityLabel: label, actionsTaken: 0, actionsDeferred: deferred };
  }
  it("groups by trigger with counts and samples (no phantom approval count)", () => {
    const groups = buildLedger([
      rx("signal_detected", "Siit", 1),
      rx("signal_detected", "Axelor", 1),
      rx("signal_detected", "Vizzia"),
      rx("signal_detected", "Dashdoc"),
      rx("deal_stale", "Acme"),
    ]);
    expect(groups[0].trigger).toBe("signal_detected");
    expect(groups[0].count).toBe(4);
    expect(groups[0].samples).toHaveLength(3);
    expect(groups[0].verb).toBe("Detected buying signals");
    // The ledger must NOT assert "awaiting approval" — that's the queue's job.
    expect("awaitingApproval" in groups[0]).toBe(false);
  });
  it("renders the +N overflow sentence", () => {
    const g = { trigger: "signal_detected", verb: "Detected buying signals", count: 5, samples: ["Siit", "Axelor"] };
    expect(ledgerSentence(g)).toBe("Detected buying signals at Siit, Axelor +3");
  });
  it("drops test entities from the ledger", () => {
    const groups = buildLedger([rx("signal_detected", "E2E Full Deal")]);
    expect(groups).toHaveLength(0);
  });
});

describe("buildEngineLine — one number, one lever (AC7)", () => {
  const base = { totalAccounts: 0, activeDeals: 0, totalContacts: 0, emailsSent7d: 0, pipelineValue: 0, winRate: null };
  it("accounts but no deals → start-outreach lever", () => {
    const e = buildEngineLine({ ...base, totalAccounts: 761 });
    expect(e.text).toContain("761 target accounts");
    expect(e.cta?.href).toBe("/accounts?sort=score&dir=desc");
  });
  it("contacts but no outreach → launch-campaign lever", () => {
    const e = buildEngineLine({ ...base, totalAccounts: 10, activeDeals: 2, totalContacts: 500, emailsSent7d: 0 });
    // activeDeals>0 so first branch skipped; second branch fires
    expect(e.cta?.href).toBe("/sequences");
  });
  it("active pipeline → review-pipeline lever with win rate", () => {
    const e = buildEngineLine({ ...base, totalAccounts: 10, activeDeals: 4, emailsSent7d: 20, pipelineValue: 120000, winRate: 33 });
    expect(e.text).toContain("$120k pipeline");
    expect(e.text).toContain("33% win rate");
    expect(e.cta?.href).toBe("/opportunities");
  });
});

describe("empty inputs (AC7)", () => {
  it("returns an empty queue with no throw", () => {
    expect(buildNeedsYou({}, NOW)).toEqual([]);
    expect(buildLedger([])).toEqual([]);
  });
});
