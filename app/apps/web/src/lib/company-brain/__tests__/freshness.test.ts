/**
 * Pure unit tests for the freshness deriver. No DB.
 */

import { describe, it, expect } from "vitest";
import { deriveFreshness } from "../freshness";

const baseEmpty = {
  company: {
    id: "c1",
    name: "Acme",
    domain: null,
    industry: null,
    sizeBand: null,
    score: null,
    createdAt: new Date("2025-01-01"),
  },
  contacts: [],
  deals: [],
  activities: [],
  meetings: [],
  knowledgeEntries: [],
  contextGraphEdges: [],
  memories: [],
  dossier: null,
};

describe("deriveFreshness", () => {
  it("returns nulls for empty layers", () => {
    const f = deriveFreshness(baseEmpty);
    expect(f.contacts).toBeNull();
    expect(f.activities).toBeNull();
    expect(f.meetings).toBeNull();
    expect(f.memories).toBeNull();
    expect(f.transcriptChunks).toBeNull();
  });

  it("returns max date across activities", () => {
    const f = deriveFreshness({
      ...baseEmpty,
      activities: [
        {
          id: "a1",
          type: "email",
          direction: "outbound",
          occurredAt: new Date("2026-01-15"),
          summary: null,
          entityType: null,
          entityId: null,
        },
        {
          id: "a2",
          type: "email",
          direction: "inbound",
          occurredAt: new Date("2026-03-10"),
          summary: null,
          entityType: null,
          entityId: null,
        },
        {
          id: "a3",
          type: "email",
          direction: "outbound",
          occurredAt: new Date("2026-02-01"),
          summary: null,
          entityType: null,
          entityId: null,
        },
      ],
    });
    expect(f.activities?.toISOString()).toBe(
      new Date("2026-03-10").toISOString(),
    );
  });

  it("returns the company.createdAt unchanged", () => {
    const f = deriveFreshness(baseEmpty);
    expect(f.company?.toISOString()).toBe(baseEmpty.company.createdAt.toISOString());
  });

  it("transcriptChunks freshness = max meeting date for the chunks' meetings", () => {
    const meetings = [
      { id: "m1", title: "kickoff", occurredAt: new Date("2026-02-01"), transcriptChunkCount: 5 },
      { id: "m2", title: "demo", occurredAt: new Date("2026-04-01"), transcriptChunkCount: 8 },
    ];
    const f = deriveFreshness({
      ...baseEmpty,
      meetings,
      transcriptChunks: [
        {
          meetingId: "m1",
          startSec: 60,
          speaker: null,
          text: "x",
          score: 0.9,
        },
      ],
    });
    expect(f.transcriptChunks?.toISOString()).toBe(
      new Date("2026-02-01").toISOString(),
    );
  });

  it("returns null when transcriptChunks layer is undefined", () => {
    const f = deriveFreshness({
      ...baseEmpty,
      meetings: [
        { id: "m1", title: "x", occurredAt: new Date("2026-01-01"), transcriptChunkCount: 0 },
      ],
    });
    expect(f.transcriptChunks).toBeNull();
  });
});
