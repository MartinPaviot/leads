/**
 * Tests for enriched-prospect-context.ts
 *
 * Validates that the enriched context builder correctly merges base
 * ProspectContext with extracted signals, graph facts, and email bodies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ──────────────────────────────────────────────

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: { id: "id", tenantId: "tenant_id", companyId: "company_id" },
  companies: { id: "id", tenantId: "tenant_id" },
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
    channel: "channel",
    body: "body",
    summary: "summary",
    direction: "direction",
    occurredAt: "occurred_at",
    metadata: "metadata",
  },
  contextGraphNodes: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
  },
  contextGraphEdges: {
    tenantId: "tenant_id",
    sourceNodeId: "source_node_id",
    targetNodeId: "target_node_id",
    relationType: "relation_type",
    fact: "fact",
    tValid: "t_valid",
    tCreated: "t_created",
    tExpired: "t_expired",
    confidence: "confidence",
  },
  outboundEmails: {
    contactId: "contact_id",
    tenantId: "tenant_id",
    stepNumber: "step_number",
    subject: "subject",
    bodyText: "body_text",
    sentAt: "sent_at",
  },
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({
    knowledge: [],
    productDescription: "Test product",
    aiTone: "Direct",
    onboardingCompanyName: "TestCo",
  }),
}));

vi.mock("@/lib/outbound-methodologies", () => ({
  pickBestSignal: vi.fn().mockReturnValue(null),
}));

// ── Tests ────────────────────────────────────────────────

import type {
  ExtractedSignals,
  GraphFact,
  RecentEmailBody,
  EnrichedProspectContext,
} from "@/lib/context/enriched-prospect-context";
import { formatEnrichedContextForPrompt } from "@/lib/context/enriched-prospect-context";

describe("ExtractedSignals type", () => {
  it("has correct structure", () => {
    const signals: ExtractedSignals = {
      objections: [{ text: "Too expensive", date: "2026-03-15", status: "open" }],
      nextSteps: [{ text: "Send spec", owner: "us", deadline: "Friday" }],
      championSignals: [{ text: "Strong advocate", contactName: "Sarah" }],
      budgetMentions: [{ text: "$50K budget approved", amount: "50000" }],
      competitorMentions: [{ competitor: "Rival Co", context: "Currently using" }],
    };
    expect(signals.objections).toHaveLength(1);
    expect(signals.nextSteps[0].owner).toBe("us");
    expect(signals.championSignals[0].contactName).toBe("Sarah");
    expect(signals.budgetMentions[0].amount).toBe("50000");
    expect(signals.competitorMentions[0].competitor).toBe("Rival Co");
  });
});

describe("GraphFact type", () => {
  it("has correct structure", () => {
    const fact: GraphFact = {
      relation: "OBJECTED_TO",
      fact: "Sarah objected to the migration timeline",
      date: "2026-03-20",
      confidence: 0.85,
    };
    expect(fact.relation).toBe("OBJECTED_TO");
    expect(fact.confidence).toBeGreaterThan(0.5);
  });
});

describe("RecentEmailBody type", () => {
  it("has correct structure", () => {
    const email: RecentEmailBody = {
      direction: "inbound",
      from: "sarah@acme.com",
      date: "2026-03-25",
      subject: "Re: Proposal",
      bodySnippet: "Thanks for the proposal. We need to discuss...",
    };
    expect(email.direction).toBe("inbound");
    expect(email.bodySnippet.length).toBeLessThanOrEqual(800);
  });
});

describe("formatEnrichedContextForPrompt", () => {
  const baseContext: EnrichedProspectContext = {
    contact: {
      id: "c1",
      firstName: "Sarah",
      lastName: "Chen",
      fullName: "Sarah Chen",
      email: "sarah@acme.com",
      title: "VP Engineering",
      seniority: "vp",
      departments: ["engineering"],
      linkedinUrl: null,
      score: 85,
      scoreReasons: ["High engagement"],
    },
    company: {
      id: "comp-1",
      name: "Acme Corp",
      domain: "acme.com",
      industry: "Technology",
      size: "51-200",
      revenue: "$10M-$50M",
      description: "Enterprise software",
      foundedYear: 2015,
      city: "San Francisco",
      state: "CA",
      country: "US",
    },
    signals: [],
    bestSignal: null,
    technologies: ["React", "PostgreSQL"],
    funding: { stage: "Series B", amount: "20000000", amountPrinted: "$20M" },
    knowledge: [],
    productDescription: "AI CRM",
    aiTone: "Direct",
    companyName: "Elevay",
    previousEmails: [],
    recentActivities: [],
    extractedSignals: {
      objections: [{ text: "Integration concerns", date: "2026-03-15", status: "open" }],
      nextSteps: [{ text: "Send technical spec", owner: "us" }],
      championSignals: [],
      budgetMentions: [{ text: "$50K approved" }],
      competitorMentions: [{ competitor: "Competitor X", context: "Currently evaluating" }],
    },
    graphFacts: [
      { relation: "OBJECTED_TO", fact: "Migration timeline too aggressive", date: "2026-03-20", confidence: 0.9 },
      { relation: "REQUESTED", fact: "Technical deep-dive session", date: "2026-03-22", confidence: 0.8 },
    ],
    recentEmailBodies: [
      {
        direction: "inbound",
        from: "sarah@acme.com",
        date: "2026-03-25",
        subject: "Re: Proposal",
        bodySnippet: "We need to discuss the timeline with our CTO before committing.",
      },
    ],
  };

  it("includes extracted signals in formatted output", () => {
    const formatted = formatEnrichedContextForPrompt(baseContext);
    expect(formatted).toContain("KNOWN OBJECTIONS:");
    expect(formatted).toContain("Integration concerns");
    expect(formatted).toContain("[open]");
  });

  it("includes next steps", () => {
    const formatted = formatEnrichedContextForPrompt(baseContext);
    expect(formatted).toContain("PENDING NEXT STEPS:");
    expect(formatted).toContain("Send technical spec");
    expect(formatted).toContain("[us]");
  });

  it("includes budget mentions", () => {
    const formatted = formatEnrichedContextForPrompt(baseContext);
    expect(formatted).toContain("BUDGET MENTIONS:");
    expect(formatted).toContain("$50K approved");
  });

  it("includes competitor mentions", () => {
    const formatted = formatEnrichedContextForPrompt(baseContext);
    expect(formatted).toContain("COMPETITOR MENTIONS:");
    expect(formatted).toContain("Competitor X");
  });

  it("includes high-confidence graph facts", () => {
    const formatted = formatEnrichedContextForPrompt(baseContext);
    expect(formatted).toContain("KNOWLEDGE GRAPH FACTS:");
    expect(formatted).toContain("OBJECTED_TO");
    expect(formatted).toContain("Migration timeline too aggressive");
  });

  it("includes email excerpts with direction and date", () => {
    const formatted = formatEnrichedContextForPrompt(baseContext);
    expect(formatted).toContain("RECENT EMAIL EXCERPTS");
    expect(formatted).toContain("INBOUND from sarah@acme.com");
    expect(formatted).toContain("discuss the timeline with our CTO");
  });

  it("filters out low-confidence graph facts", () => {
    const ctx = {
      ...baseContext,
      graphFacts: [
        { relation: "DISCUSSED", fact: "Low quality fact", date: "2026-01-01", confidence: 0.3 },
      ],
    };
    const formatted = formatEnrichedContextForPrompt(ctx);
    expect(formatted).not.toContain("KNOWLEDGE GRAPH FACTS:");
  });

  it("handles empty signals gracefully", () => {
    const ctx = {
      ...baseContext,
      extractedSignals: {
        objections: [],
        nextSteps: [],
        championSignals: [],
        budgetMentions: [],
        competitorMentions: [],
      },
      graphFacts: [],
      recentEmailBodies: [],
    };
    const formatted = formatEnrichedContextForPrompt(ctx);
    expect(formatted).not.toContain("KNOWN OBJECTIONS:");
    expect(formatted).not.toContain("KNOWLEDGE GRAPH FACTS:");
    expect(formatted).not.toContain("RECENT EMAIL EXCERPTS");
    // Should still contain base context
    expect(formatted).toContain("Sarah Chen");
  });
});
