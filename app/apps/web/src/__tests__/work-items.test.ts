import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

import { serializeWorkQueue } from "@/lib/agent-state/work-items";

describe("Agent Work Items — Serialization", () => {
  it("serializes empty queue to empty string", () => {
    expect(serializeWorkQueue([])).toBe("");
  });

  it("serializes work items into readable format", () => {
    const items = [
      {
        id: "w1",
        tenantId: "t1",
        entityType: "deal",
        entityId: "d1",
        entityLabel: "Acme Corp — Series A",
        strategy: "push",
        strategyReasoning: "Positive demo feedback, pushing for close",
        strategySetAt: new Date(),
        priority: "critical",
        priorityReasoning: null,
        nextAction: "send_followup",
        nextActionDetail: "Send proposal follow-up",
        nextActionAt: new Date(Date.now() - 86400000), // overdue
        lastAgentActionId: null,
        lastEvaluatedAt: new Date(),
        evaluationCount: 3,
        status: "active",
        archivedReason: null,
        archivedAt: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "w2",
        tenantId: "t1",
        entityType: "company",
        entityId: "c1",
        entityLabel: "FinTech Co",
        strategy: "research",
        strategyReasoning: "New TAM company with hiring signal",
        strategySetAt: new Date(),
        priority: "high",
        priorityReasoning: null,
        nextAction: "enrich_contact",
        nextActionDetail: "Enrich contacts",
        nextActionAt: new Date(Date.now() + 86400000), // tomorrow
        lastAgentActionId: null,
        lastEvaluatedAt: new Date(),
        evaluationCount: 1,
        status: "active",
        archivedReason: null,
        archivedAt: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const serialized = serializeWorkQueue(items);
    expect(serialized).toContain("## Your Active Work Queue");
    expect(serialized).toContain("Acme Corp — Series A");
    expect(serialized).toContain("(deal, push)");
    expect(serialized).toContain("(OVERDUE)");
    expect(serialized).toContain("FinTech Co");
    expect(serialized).toContain("(company, research)");
    // Only Acme is overdue, FinTech is not
    const lines = serialized.split("\n");
    const fintechLine = lines.find((l: string) => l.includes("FinTech"));
    expect(fintechLine).not.toContain("OVERDUE");
  });
});
