import { describe, it, expect, vi } from "vitest";
import { composeMeetingPrepContext } from "../meeting-prep-context";
import type { CompanyBrain } from "../types";

function makeBrain(overrides: Partial<CompanyBrain> = {}): CompanyBrain {
  return {
    company: {
      id: "co-1",
      name: "AcmeCorp",
      domain: "acme.test",
      industry: "SaaS",
      sizeBand: "51-200",
      score: 78,
      createdAt: new Date("2026-01-01"),
    },
    contacts: [],
    deals: [],
    activities: [],
    meetings: [],
    knowledgeEntries: [],
    contextGraphEdges: [],
    memories: [],
    dossier: null,
    freshness: {
      company: null,
      contacts: null,
      deals: null,
      activities: null,
      meetings: null,
      transcriptChunks: null,
      knowledgeEntries: null,
      contextGraphEdges: null,
      memories: null,
      dossier: null,
    },
    truncated: { activities: false, contacts: false, memories: false },
    ...overrides,
  };
}

describe("composeMeetingPrepContext", () => {
  it("requires a tenantId", async () => {
    const stub = vi.fn();
    await expect(
      composeMeetingPrepContext(
        {
          meetingTitle: "Discovery",
          startTimeIso: "2026-05-10T15:00:00Z",
          attendees: [],
          companyIds: [],
          tenantId: "",
        },
        { getCompanyBrain: stub as any },
      ),
    ).rejects.toThrow(/tenantId/);
  });

  it("renders header even with no companies", async () => {
    const stub = vi.fn();
    const ctx = await composeMeetingPrepContext(
      {
        meetingTitle: "Cold intro",
        startTimeIso: "2026-05-10T15:00:00Z",
        attendees: [{ email: "guest@elsewhere.com", displayName: "Guest" }],
        companyIds: [],
        tenantId: "tenant-A",
      },
      { getCompanyBrain: stub as any },
    );
    expect(ctx).toContain("Meeting: Cold intro");
    expect(ctx).toContain("Guest");
    expect(stub).not.toHaveBeenCalled();
  });

  it("dedupes company ids and caps at 3", async () => {
    const stub = vi.fn(async (id: string) => makeBrain({ company: { ...makeBrain().company, id, name: `Co-${id}` } }));
    const ctx = await composeMeetingPrepContext(
      {
        meetingTitle: "Multi-company sync",
        startTimeIso: null,
        attendees: [],
        companyIds: ["a", "a", "b", "c", "d", "e"],
        tenantId: "tenant-A",
      },
      { getCompanyBrain: stub as any },
    );
    expect(stub).toHaveBeenCalledTimes(3); // a, b, c after dedup + cap
    expect(ctx).toContain("Co-a");
    expect(ctx).toContain("Co-b");
    expect(ctx).toContain("Co-c");
    expect(ctx).not.toContain("Co-d");
  });

  it("renders contacts with champion + intent flags", async () => {
    const stub = vi.fn(async () =>
      makeBrain({
        contacts: [
          {
            id: "ct-1",
            firstName: "Alice",
            lastName: "Doe",
            email: "alice@acme.test",
            title: "VP Eng",
            isChampion: true,
            intentScore: 82,
            intentTrend: "heating",
            lastTouchAt: null,
          },
        ],
      }),
    );
    const ctx = await composeMeetingPrepContext(
      {
        meetingTitle: "Q2 review",
        startTimeIso: null,
        attendees: [],
        companyIds: ["co-1"],
        tenantId: "tenant-A",
      },
      { getCompanyBrain: stub as any },
    );
    expect(ctx).toContain("Alice Doe");
    expect(ctx).toContain("VP Eng");
    expect(ctx).toContain("champion");
    expect(ctx).toContain("intent 82");
    expect(ctx).toContain("heating");
  });

  it("renders deals with risk + stall probability", async () => {
    const stub = vi.fn(async () =>
      makeBrain({
        deals: [
          {
            id: "d-1",
            name: "Acme Q2 expansion",
            stage: "demo",
            value: 50000,
            expectedCloseDate: null,
            properties: {},
            riskLevel: "high",
            riskReasons: ["No champion identified", "Last touch > 14 days"],
            stallProbability: 0.71,
            stallIndicators: [],
          },
        ],
      }),
    );
    const ctx = await composeMeetingPrepContext(
      {
        meetingTitle: "Pipeline review",
        startTimeIso: null,
        attendees: [],
        companyIds: ["co-1"],
        tenantId: "tenant-A",
      },
      { getCompanyBrain: stub as any },
    );
    expect(ctx).toContain("Acme Q2 expansion");
    expect(ctx).toContain("risk=high");
    expect(ctx).toContain("stall=71%");
    expect(ctx).toContain("No champion identified");
  });

  it("does not throw if a brain fetch fails — falls back to header", async () => {
    const stub = vi.fn(async () => {
      throw new Error("transient db error");
    });
    const ctx = await composeMeetingPrepContext(
      {
        meetingTitle: "Discovery",
        startTimeIso: null,
        attendees: [],
        companyIds: ["co-1"],
        tenantId: "tenant-A",
      },
      { getCompanyBrain: stub as any },
    );
    expect(ctx).toContain("Meeting: Discovery");
    expect(stub).toHaveBeenCalledOnce();
  });
});
