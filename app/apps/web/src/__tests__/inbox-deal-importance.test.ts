import { describe, it, expect } from "vitest";
import {
  isOpenStage,
  dealStageRank,
  pickOpenDeal,
  isSeniorTitle,
  contactImportance,
} from "@/lib/inbox/deal-importance";
import { scoreImportance } from "@/lib/inbox/importance";
import { formatImportanceWhy, hasPriorityReason } from "@/app/(dashboard)/inbox/_types";

/**
 * P1 — deal-ranked inbox. The pure helpers + the end-to-end ranking scenarios
 * that demonstrate the intended behaviour ("open the inbox → the hottest open
 * deal is on top, with its reason"). Read the scenario blocks to confirm the
 * weighting matches what we want before it ships.
 */

describe("deal-importance helpers", () => {
  it("isOpenStage: open pipeline stages true; won/lost/unknown false", () => {
    for (const s of ["lead", "qualification", "demo", "trial", "proposal", "negotiation"]) {
      expect(isOpenStage(s)).toBe(true);
    }
    expect(isOpenStage("won")).toBe(false);
    expect(isOpenStage("lost")).toBe(false);
    expect(isOpenStage(null)).toBe(false);
    expect(isOpenStage("nonsense")).toBe(false);
  });

  it("dealStageRank: later stage = higher rank", () => {
    expect(dealStageRank("lead")).toBe(0);
    expect(dealStageRank("proposal")).toBe(4);
    expect(dealStageRank("negotiation")).toBe(5);
    expect(dealStageRank("won")).toBe(0); // closed → 0 (never used; hasOpenDeal is false)
    expect(dealStageRank(null)).toBe(0);
  });

  it("pickOpenDeal: returns the MOST-ADVANCED open deal", () => {
    expect(pickOpenDeal([{ stage: "lead" }, { stage: "proposal" }, { stage: "demo" }])).toEqual({
      stage: "proposal",
      rank: 4,
    });
    // closed deals are ignored entirely
    expect(pickOpenDeal([{ stage: "won" }, { stage: "lost" }])).toBeNull();
    // an open deal alongside a closed one still counts
    expect(pickOpenDeal([{ stage: "won" }, { stage: "qualification" }])).toEqual({
      stage: "qualification",
      rank: 1,
    });
    expect(pickOpenDeal([])).toBeNull();
  });

  it("isSeniorTitle: exec/lead titles only", () => {
    for (const t of ["CEO", "Chief Revenue Officer", "VP Sales", "SVP, Marketing", "Head of Growth", "Co-Founder", "Managing Director"]) {
      expect(isSeniorTitle(t)).toBe(true);
    }
    for (const t of ["Software Engineer", "Account Executive", "Sales Development Rep", "Designer", null, ""]) {
      expect(isSeniorTitle(t)).toBe(false);
    }
  });

  it("contactImportance: composes deals + title into the importance inputs", () => {
    expect(
      contactImportance({ deals: [{ stage: "proposal" }, { stage: "lead" }], title: "VP Sales" }),
    ).toEqual({ hasOpenDeal: true, dealStageRank: 4, senioritySenior: true });

    expect(contactImportance({ deals: [{ stage: "won" }], title: "Engineer" })).toEqual({
      hasOpenDeal: false,
      senioritySenior: false,
    });
  });
});

describe("deal-ranked inbox — end-to-end ranking scenarios (does it match what we want?)", () => {
  // Helper: derive the importance inputs from a contact, then score the thread.
  const rank = (args: {
    intentLabel: string;
    deals?: Array<{ stage: string | null }>;
    title?: string | null;
    ageHours?: number;
  }) => {
    const enrich = contactImportance({ deals: args.deals ?? [], title: args.title });
    return scoreImportance({
      intentLabel: args.intentLabel,
      hasOpenDeal: enrich.hasOpenDeal,
      dealStageRank: enrich.dealStageRank,
      senioritySenior: enrich.senioritySenior,
      ageHours: args.ageHours,
    });
  };

  it("an open deal in proposal + pricing inquiry sits in tier 1, ABOVE a cold pricing inquiry", () => {
    // Sarah Chen: pricing question, open deal at proposal, fresh, senior sender.
    const hot = rank({
      intentLabel: "pricing_inquiry",
      deals: [{ stage: "proposal" }],
      title: "VP Operations",
      ageHours: 3,
    });
    // A stranger asking the same pricing question, no deal, no title.
    const cold = rank({ intentLabel: "pricing_inquiry", ageHours: 3 });

    expect(hot.tier).toBe(1);
    expect(hot.score).toBeGreaterThan(cold.score);
    expect(cold.tier).toBeGreaterThan(1); // cold inquiry is NOT tier 1
    const why = hot.factors.map((f) => f.label).join(" · ");
    expect(why).toContain("open deal");
    expect(why).toContain("advanced deal stage");
    expect(why).toContain("intent: pricing_inquiry");
  });

  it("the more advanced deal ranks higher when intent is equal", () => {
    const negotiation = rank({ intentLabel: "question", deals: [{ stage: "negotiation" }] });
    const lead = rank({ intentLabel: "question", deals: [{ stage: "lead" }] });
    expect(negotiation.score).toBeGreaterThan(lead.score);
  });

  it("a closed-won deal does NOT re-prioritise the thread (no open-deal factor)", () => {
    const closed = rank({ intentLabel: "thank_you", deals: [{ stage: "won" }] });
    expect(closed.factors.some((f) => f.label === "open deal")).toBe(false);
  });

  it("a senior sender outranks an IC on an otherwise identical thread", () => {
    const exec = rank({ intentLabel: "question", title: "Chief Marketing Officer" });
    const ic = rank({ intentLabel: "question", title: "Marketing Coordinator" });
    expect(exec.score).toBeGreaterThan(ic.score);
  });

  it("the row 'why' reads as a concise, deal-led reason", () => {
    const factors = scoreImportance({
      intentLabel: "pricing_inquiry",
      hasOpenDeal: true,
      dealStageRank: 4,
      ageHours: 2,
    }).factors.map((f) => f.label);
    // Deal leads, then stage, then intent — the order a founder scans.
    expect(formatImportanceWhy(factors)).toBe("open deal · advanced stage · pricing intent");
    expect(hasPriorityReason(factors)).toBe(true);
  });

  it("the 'why' is suppressed on a plain, low-signal thread", () => {
    const factors = scoreImportance({ intentLabel: "thank_you", ageHours: 200 }).factors.map((f) => f.label);
    expect(hasPriorityReason(factors)).toBe(false);
  });
});
