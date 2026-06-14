import { describe, it, expect, vi } from "vitest";

// meeting-crm.ts imports @/db at module load; the function under test is pure
// and never touches it, so a bare stub keeps the import graph from connecting.
vi.mock("@/db", () => ({ db: {} }));

import { buildMeetingQualificationWrites } from "@/lib/meetings/meeting-crm";

const STAMP = { meetingId: "meeting-1", at: "2026-06-14T10:00:00.000Z" };

function buyingSignals(over: Record<string, unknown> = {}) {
  return {
    budget: null,
    timeline: null,
    currentStack: [],
    painPoints: [],
    objections: [],
    nextSteps: [],
    competitors: [],
    teamSize: null,
    initiatives: [],
    ...over,
  };
}

describe("buildMeetingQualificationWrites", () => {
  it("maps a full meeting note to the call-intel property shapes", () => {
    const w = buildMeetingQualificationWrites(
      {
        meddic: {
          metrics: "2 days/week lost to manual entry",
          economicBuyer: "CFO",
          decisionCriteria: ["EU hosting", "SSO"],
          decisionProcess: "Pilot then board sign-off",
          identifiedPain: "Reps don't update the CRM",
          champion: "Head of Sales",
        },
        evidence: [
          { claim: "Budget around 50k", quote: "we'd have maybe fifty thousand for this" },
          { claim: "Uses Salesforce", quote: "everything sits in Salesforce today" },
        ],
        buyingSignals: buyingSignals({
          currentStack: ["Salesforce", "Outreach"],
          competitors: ["Gong"],
          teamSize: "12 reps",
          initiatives: ["CRM migration in Q3"],
        }),
        contactProfile: { role: "Head of Sales", isDecisionMaker: false, disposition: "champion" },
      },
      STAMP,
    );

    // MEDDPICC carries the competition + provenance the scorecard reads.
    expect(w.meddic).toMatchObject({
      economicBuyer: "CFO",
      champion: "Head of Sales",
      competition: ["Gong"],
      updatedFromMeetingId: "meeting-1",
      updatedAt: STAMP.at,
    });
    expect(w.evidence).toHaveLength(2);
    // Account intel (the replaceable-stack lever).
    expect(w.callIntel).toMatchObject({
      stack: ["Salesforce", "Outreach"],
      competitors: ["Gong"],
      teamSize: "12 reps",
      initiatives: ["CRM migration in Q3"],
      updatedFromMeetingId: "meeting-1",
    });
    // Contact buying-group profile.
    expect(w.callProfile).toMatchObject({
      role: "Head of Sales",
      isDecisionMaker: false,
      disposition: "champion",
      updatedFromMeetingId: "meeting-1",
    });
  });

  it("is defensive against legacy notes missing the qualification fields", () => {
    // A pre-Slice-2 meeting: buyingSignals has no `initiatives`, no meddic /
    // contactProfile / evidence. Must not throw and must yield all-null.
    const legacy = {
      buyingSignals: {
        budget: "50k",
        timeline: "Q3",
        currentStack: [],
        painPoints: ["manual entry"],
        objections: [],
        nextSteps: [],
        competitors: [],
        teamSize: null,
      } as unknown as ReturnType<typeof buyingSignals>,
    };
    const w = buildMeetingQualificationWrites(legacy, STAMP);
    expect(w.meddic).toBeNull();
    expect(w.callIntel).toBeNull();
    expect(w.callProfile).toBeNull();
    expect(w.evidence).toEqual([]);
  });

  it("builds account intel when ONLY initiatives are present", () => {
    const w = buildMeetingQualificationWrites(
      { buyingSignals: buyingSignals({ initiatives: ["renewal coming up"] }) },
      STAMP,
    );
    expect(w.callIntel).toMatchObject({ initiatives: ["renewal coming up"], stack: [], competitors: [] });
  });

  it("yields no account intel when nothing about the org was said", () => {
    const w = buildMeetingQualificationWrites({ buyingSignals: buyingSignals() }, STAMP);
    expect(w.callIntel).toBeNull();
  });

  it("caps evidence at 12 quotes", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ claim: `c${i}`, quote: `q${i}` }));
    const w = buildMeetingQualificationWrites({ evidence: many, buyingSignals: buyingSignals() }, STAMP);
    expect(w.evidence).toHaveLength(12);
  });
});
