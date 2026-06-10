import { describe, it, expect } from "vitest";
import {
  buildNeedsYou,
  buildKpis,
  buildActualites,
  isTestLabel,
  money,
  type ReplyInput,
  type DealRiskInput,
  type MeetingInput,
  type TaskInput,
  type KpiMetrics,
  type Actualite,
} from "@/lib/home/up-next";

function reply(over: Partial<ReplyInput> & { conversationKey: string }): ReplyInput {
  return { contactId: null, subject: "Re: Elevay", fromAddress: "prospect@acme.ch", reason: "A répondu", priority: 4, lastInboundAt: "2026-06-10T10:00:00Z", ...over };
}
function deal(over: Partial<DealRiskInput> & { id: string }): DealRiskInput {
  return { name: "Acme expansion", stage: "proposal", value: 48000, daysSilent: 14, ...over };
}
function meeting(over: Partial<MeetingInput> & { id: string }): MeetingInput {
  return { title: "Intro — Acme", time: "10:00", ...over };
}
function task(over: Partial<TaskInput> & { id: string }): TaskInput {
  return { title: "Envoyer le deck", overdue: false, account: "Acme", entityType: "company", entityId: "co1", ...over };
}

describe("buildNeedsYou — À faire (genuine human work only)", () => {
  it("merges reply / meeting / deal_risk / task; NO approval lane", () => {
    const items = buildNeedsYou({
      replies: [reply({ conversationKey: "t1", priority: 1 })],
      dealsAtRisk: [deal({ id: "d1" })],
      meetings: [meeting({ id: "m1" })],
      tasks: [task({ id: "k1" })],
    });
    expect(items).toHaveLength(4);
    expect(new Set(items.map((i) => i.kind))).toEqual(new Set(["reply", "deal_risk", "meeting", "task"]));
    expect(items.some((i) => (i.kind as string) === "approval")).toBe(false);
  });
  it("ranks a hot reply first and a task last", () => {
    const items = buildNeedsYou({
      replies: [reply({ conversationKey: "hot", priority: 1, reason: "Demande de RDV" })],
      tasks: [task({ id: "k1" })],
      meetings: [meeting({ id: "m1" })],
    });
    expect(items[0].kind).toBe("reply");
    expect(items[items.length - 1].kind).toBe("task");
  });
  it("floats a big, very-stale deal up", () => {
    const items = buildNeedsYou({
      replies: [reply({ conversationKey: "lukewarm", priority: 4 })],
      dealsAtRisk: [deal({ id: "d1", value: 200000, daysSilent: 60 })],
    });
    expect(items[0].kind).toBe("deal_risk");
  });
  it("drops a task for a contact already surfaced as a reply", () => {
    const items = buildNeedsYou({
      replies: [reply({ conversationKey: "t1", contactId: "c9" })],
      tasks: [task({ id: "k1", entityType: "contact", entityId: "c9" })],
    });
    expect(items.filter((i) => i.kind === "task")).toHaveLength(0);
  });
  it("keeps each item's grounded reason", () => {
    const items = buildNeedsYou({
      replies: [
        reply({ conversationKey: "t1", reason: "A demandé le prix", priority: 2 }),
        reply({ conversationKey: "t2", reason: "Demande de RDV", priority: 1 }),
      ],
    });
    expect(new Set(items.map((i) => i.why)).size).toBe(2);
  });
});

describe("isTestLabel + filtering", () => {
  it("flags test markers, not real names", () => {
    expect(isTestLabel("E2E Full Deal")).toBe(true);
    expect(isTestLabel("test deal 3")).toBe(true);
    expect(isTestLabel("Craft Health")).toBe(false);
    expect(isTestLabel(null)).toBe(false);
  });
  it("excludes test rows from À faire", () => {
    const items = buildNeedsYou({ dealsAtRisk: [deal({ id: "d1", name: "E2E Full Deal" }), deal({ id: "d2", name: "Acme" })] });
    expect(items.map((i) => i.title)).toEqual(["Acme"]);
  });
});

describe("money", () => {
  it("formats k / M / small", () => {
    expect(money(0)).toBe("€0");
    expect(money(48000)).toBe("€48k");
    expect(money(2_500_000)).toBe("€2.5M");
    expect(money(900)).toBe("€900");
  });
});

describe("buildKpis", () => {
  const base: KpiMetrics = {
    pipelineValue: 128000, activeDeals: 4, callsBookedWeek: 3, callsBookedPrevWeek: 1,
    replies7d: 9, replyRate: 18, outreach7d: 142, winRate: 33,
  };
  it("produces the 6 KPIs in order with formatting", () => {
    const k = buildKpis(base);
    expect(k.map((x) => x.key)).toEqual(["pipeline", "deals", "calls", "replies", "outreach", "winrate"]);
    expect(k[0].value).toBe("€128k");
    expect(k[2].delta).toBe(2); // 3 - 1
    expect(k[3].sub).toBe("18% · 7d");
    expect(k[5].value).toBe("33%");
  });
  it("handles no closed deals (win rate —) and unknown prior week", () => {
    const k = buildKpis({ ...base, winRate: null, callsBookedPrevWeek: null });
    expect(k.find((x) => x.key === "winrate")!.value).toBe("—");
    expect(k.find((x) => x.key === "calls")!.delta).toBeNull();
  });
});

describe("buildActualites", () => {
  function ev(over: Partial<Actualite> & { id: string; at: string }): Actualite {
    return { kind: "reply", title: "Marie a répondu", detail: null, href: null, ...over };
  }
  it("sorts newest-first, dedupes by id, drops test, caps", () => {
    const feed = buildActualites(
      [
        ev({ id: "a", at: "2026-06-10T08:00:00Z", title: "Vieux" }),
        ev({ id: "b", at: "2026-06-10T10:00:00Z", title: "Récent" }),
        ev({ id: "b", at: "2026-06-10T10:00:00Z", title: "Doublon" }),
        ev({ id: "c", at: "2026-06-10T09:00:00Z", title: "E2E Full Deal" }),
      ],
      2,
    );
    expect(feed.map((f) => f.title)).toEqual(["Récent", "Vieux"]); // c dropped (test), b deduped, capped 2
  });
});
