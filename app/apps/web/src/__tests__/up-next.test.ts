import { describe, it, expect } from "vitest";
import {
  buildNeedsYou,
  buildKpis,
  buildActualites,
  aggregateOpens,
  mapAddBatches,
  formatCallDuration,
  shouldSurfaceInboundEvent,
  isTestLabel,
  money,
  type ReplyInput,
  type DealRiskInput,
  type MeetingInput,
  type TaskInput,
  type KpiMetrics,
  type Actualite,
  type OpenRow,
  type AddBatch,
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
  it("frames every card with a zero-state sub for an empty tenant (no bare numerals)", () => {
    const zero: KpiMetrics = {
      pipelineValue: 0, activeDeals: 0, callsBookedWeek: 0, callsBookedPrevWeek: 0,
      replies7d: 0, replyRate: null, outreach7d: 0, winRate: null,
    };
    const k = buildKpis(zero);
    // Regression: a wall of context-free "0"/"€0"/"—" read as a broken dashboard.
    // Every card must carry framing copy under its value.
    for (const card of k) {
      expect(card.sub, `${card.key} should have zero-state framing`).toBeTruthy();
    }
    const by = (key: string) => k.find((x) => x.key === key)!.sub;
    expect(by("pipeline")).toBe("no open deals yet");
    expect(by("deals")).toBe("none open yet");
    expect(by("calls")).toBe("none this week");
    expect(by("replies")).toBe("none yet · 7d");
    expect(by("outreach")).toBe("none sent yet · 7d");
    expect(by("winrate")).toBe("no closed deals yet");
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
  it("caps chatty kinds (opens ≤ 3) while replies stay uncapped", () => {
    const opens = [1, 2, 3, 4, 5].map((n) =>
      ev({ id: `o${n}`, at: `2026-06-11T1${n}:00:00Z`, kind: "open", title: `Contact ${n} opened your email` }),
    );
    const replies = [1, 2, 3, 4].map((n) =>
      ev({ id: `r${n}`, at: `2026-06-10T0${n}:00:00Z`, title: `Prospect ${n} replied` }),
    );
    const feed = buildActualites([...opens, ...replies], 12);
    expect(feed.filter((f) => f.kind === "open").map((f) => f.id)).toEqual(["o5", "o4", "o3"]); // newest win the cap
    expect(feed.filter((f) => f.kind === "reply")).toHaveLength(4);
  });
});

describe("aggregateOpens", () => {
  function row(over: Partial<OpenRow> & { id: string }): OpenRow {
    return { contactId: "c1", name: "Marie Dupont", at: "2026-06-11T08:00:00.000Z", ...over };
  }
  it("one line per contact: counts emails, keeps the newest timestamp", () => {
    const out = aggregateOpens([
      row({ id: "o1" }),
      row({ id: "o2", at: "2026-06-11T10:00:00.000Z" }),
      row({ id: "o3", contactId: "c2", name: "Jean Petit" }),
    ]);
    expect(out).toHaveLength(2);
    const marie = out.find((o) => o.id === "open:c1")!;
    expect(marie.title).toBe("Marie Dupont opened your email");
    expect(marie.detail).toBe("2 emails opened"); // first-open-per-email semantics, never "opened 2×"
    expect(marie.at).toBe("2026-06-11T10:00:00.000Z");
    expect(marie.href).toBe("/contacts/c1");
    expect(out.find((o) => o.id === "open:c2")!.detail).toBeNull();
  });
  it("skips unattributable and test-named rows", () => {
    const out = aggregateOpens([
      row({ id: "o1", contactId: null }),
      row({ id: "o2", contactId: "c9", name: "E2E Tester" }),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("mapAddBatches", () => {
  function batch(over: Partial<AddBatch>): AddBatch {
    return {
      sourceSystem: "apollo",
      n: 136,
      newest: "2026-06-08T07:05:00.000Z",
      sampleIds: ["a1", "a2"],
      sampleNames: ["Acme SA", "Beta SA"],
      ...over,
    };
  }
  it("renders one dated event per import batch with the exact frozen count", () => {
    const out = mapAddBatches([batch({})], "account");
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("136 accounts added"); // the batch's real size, not a window aggregate
    expect(out[0].detail).toBe("sourced by Elevay"); // never the provider name
    expect(out[0].at).toBe("2026-06-08T07:05:00.000Z");
    expect(out[0].href).toBe("/accounts");
  });
  it("two imports from the same source are two distinct events", () => {
    const out = mapAddBatches(
      [
        batch({ n: 500, newest: "2026-06-01T10:00:00.000Z", sampleIds: ["x1"], sampleNames: ["Old SA"] }),
        batch({ n: 136, newest: "2026-06-08T07:05:00.000Z" }),
      ],
      "account",
    );
    expect(out.map((o) => o.title)).toEqual(["500 accounts added", "136 accounts added"]);
    expect(new Set(out.map((o) => o.id)).size).toBe(2);
  });
  it("a small batch renders as individual named lines with provenance", () => {
    const out = mapAddBatches(
      [batch({ n: 2, sampleIds: ["c1", "c2"], sampleNames: ["Marie Dupont", "Jean Petit"], sourceSystem: "manual" })],
      "contact",
    );
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe("Marie Dupont");
    expect(out[0].detail).toBe("contact added · manually");
    expect(out[0].href).toBe("/contacts/c1");
  });
  it("never leaks an unknown sourceSystem value and skips test-named rows", () => {
    const out = mapAddBatches(
      [batch({ n: 2, sourceSystem: "kaspr", sampleIds: ["c1", "c2"], sampleNames: ["Real SA", "Test Workspace Co"] })],
      "contact",
    );
    expect(out).toHaveLength(1); // test row dropped
    expect(out[0].detail).toBe("contact added"); // raw internal value shown as nothing
  });
});

describe("formatCallDuration", () => {
  it("formats seconds / minutes / null", () => {
    expect(formatCallDuration(45)).toBe("45s");
    expect(formatCallDuration(360)).toBe("6m");
    expect(formatCallDuration(372)).toBe("6m12");
    expect(formatCallDuration(0)).toBeNull();
    expect(formatCallDuration(null)).toBeNull();
  });
});

describe("shouldSurfaceInboundEvent — feed shows prospects, not noise", () => {
  const base = {
    entityType: "contact" as string | null,
    fromHeader: "Alex Prospect <alex@acme.ch>",
    contactEmail: "alex@acme.ch",
    contactProperties: null as Record<string, unknown> | null,
    engaged: true,
  };

  it("surfaces an engaged human contact not ruled out as a lead", () => {
    expect(shouldSurfaceInboundEvent(base)).toBe(true);
  });

  it("drops unassigned events (service/newsletter mail with no contact)", () => {
    expect(shouldSurfaceInboundEvent({ ...base, entityType: "unassigned" })).toBe(false);
    expect(shouldSurfaceInboundEvent({ ...base, entityType: null })).toBe(false);
  });

  it("drops machine senders by the From header (bots, notifications)", () => {
    expect(
      shouldSurfaceInboundEvent({
        ...base,
        fromHeader: "vercel[bot] <notifications@github.com>",
      }),
    ).toBe(false);
  });

  it("drops machine senders via the contact-email fallback when From is empty (#260 clobber)", () => {
    expect(
      shouldSurfaceInboundEvent({
        ...base,
        fromHeader: null,
        contactEmail: "no-reply@infomaniak.com",
      }),
    ).toBe(false);
  });

  it("drops an un-engaged human we never worked (colleague, person-shaped newsletter)", () => {
    expect(
      shouldSurfaceInboundEvent({
        ...base,
        fromHeader: "Paul Madelénat <paul.madelenat@pilae.ch>",
        contactEmail: "paul.madelenat@pilae.ch",
        engaged: false,
      }),
    ).toBe(false);
  });

  it("surfaces an un-engaged contact the LLM confirmed as an inbound lead", () => {
    expect(
      shouldSurfaceInboundEvent({
        ...base,
        engaged: false,
        contactProperties: {
          leadRelationship: {
            isInboundLead: true,
            relationshipToUs: "prospect",
            reason: "asked for a demo",
            at: "2026-06-20T10:00:00Z",
          },
        },
      }),
    ).toBe(true);
  });

  it("surfaces an un-engaged contact the user marked a lead", () => {
    expect(
      shouldSurfaceInboundEvent({
        ...base,
        engaged: false,
        contactProperties: { leadFeedback: { isLead: true, at: "2026-06-20T10:00:00Z" } },
      }),
    ).toBe(true);
  });

  it("drops a contact ruled NOT a lead even when engaged (human verdict wins)", () => {
    expect(
      shouldSurfaceInboundEvent({
        ...base,
        engaged: true,
        contactProperties: { leadFeedback: { isLead: false, at: "2026-06-20T10:00:00Z" } },
      }),
    ).toBe(false);
  });
});
