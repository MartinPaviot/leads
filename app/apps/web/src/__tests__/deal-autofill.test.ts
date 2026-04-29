/**
 * Tests for deal-autofill.ts -- dollar extraction, timeline extraction,
 * autofill logic, approval mode integration, and edge cases.
 *
 * The core autofillDealFromIntelligence function uses DB + approval mode,
 * so we test:
 * 1. extractDollarAmount pure function (regex-based, no mocks needed)
 * 2. extractTimelineDate pure function (regex-based, no mocks needed)
 * 3. autofillDealFromIntelligence with mocked DB and approval mode
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ThreadIntelligence } from "@/lib/email-intelligence";

// ── Mock setup ──────────────────────────────────────────────────

// Track recordAgentAction calls across tests
const mockRecordAgentAction = vi.fn().mockResolvedValue({ id: "action-1" });
const mockSendNotification = vi.fn().mockResolvedValue(undefined);
let mockSelectResult: unknown[] = [
  {
    value: null,
    expectedCloseDate: null,
    properties: {},
    id: "user-1",
  },
];

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(mockSelectResult)),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: "action-1" }])),
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  deals: {
    id: "id",
    tenantId: "tenant_id",
    value: "value",
    expectedCloseDate: "expected_close_date",
    properties: "properties",
  },
  contacts: {
    id: "id",
    tenantId: "tenant_id",
    properties: "properties",
  },
  users: { id: "id", tenantId: "tenant_id" },
  agentActions: {
    id: "id",
    tenantId: "tenant_id",
    userId: "user_id",
    actionType: "action_type",
    payload: "payload",
    scheduledExecutionAt: "scheduled_execution_at",
    reversibleUntil: "reversible_until",
    status: "status",
    executedAt: "executed_at",
    createdAt: "created_at",
  },
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi
    .fn()
    .mockResolvedValue({ agentApprovalMode: "auto-high-confidence" }),
}));

vi.mock("@/lib/agent-actions", () => ({
  recordAgentAction: (...args: unknown[]) => mockRecordAgentAction(...args),
}));

vi.mock("@/lib/notifications", () => ({
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

vi.mock("@/lib/guardrails/trust-score", () => ({
  recordAutonomyEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import tested module after mocks ─────────────────────────

import {
  extractDollarAmount,
  extractTimelineDate,
  autofillDealFromIntelligence,
} from "@/lib/deal-autofill";

// ── extractDollarAmount tests ────────────────────────────────

describe("extractDollarAmount", () => {
  it("extracts $50,000 from budget signal evidence", () => {
    const result = extractDollarAmount(
      "We have $50,000 allocated for this project",
    );
    expect(result).toBe(50000);
  });

  it("extracts $50K shorthand", () => {
    expect(extractDollarAmount("Budget is around $50K")).toBe(50000);
  });

  it("extracts 50k without dollar sign when followed by currency", () => {
    expect(extractDollarAmount("About 50k dollars")).toBe(50000);
  });

  it("extracts $1.2M (millions)", () => {
    expect(extractDollarAmount("Total contract value is $1.2M")).toBe(1200000);
  });

  it('extracts "50 thousand" without dollar sign', () => {
    expect(extractDollarAmount("We were thinking around 50 thousand")).toBe(
      50000,
    );
  });

  it("extracts $500 simple amount", () => {
    expect(extractDollarAmount("Price is $500 per month")).toBe(500);
  });

  it("returns null for text with no dollar amounts", () => {
    expect(
      extractDollarAmount("We need to discuss the budget next week"),
    ).toBeNull();
  });

  it("extracts from complex sentences", () => {
    expect(
      extractDollarAmount(
        'The VP mentioned they have "$200,000 in the FY26 software budget"',
      ),
    ).toBe(200000);
  });
});

// ── extractTimelineDate tests ─────────────────────────────────

describe("extractTimelineDate", () => {
  it('extracts "Q3 2026" to last day of September 2026', () => {
    const result = extractTimelineDate("We need this by Q3 2026");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(8); // September (0-indexed)
    expect(result!.getDate()).toBe(30);
  });

  it('extracts "end of June" to last day of June', () => {
    const result = extractTimelineDate("We need a decision by end of June");
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(5); // June (0-indexed)
    expect(result!.getDate()).toBe(30);
  });

  it('extracts "Q1 2027" correctly', () => {
    const result = extractTimelineDate("Planning for Q1 2027");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2027);
    expect(result!.getMonth()).toBe(2); // March
    expect(result!.getDate()).toBe(31);
  });

  it('extracts "by January 2027"', () => {
    const result = extractTimelineDate("Need to finalize by January 2027");
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2027);
    expect(result!.getMonth()).toBe(0); // January
    expect(result!.getDate()).toBe(31);
  });

  it('handles "end of year"', () => {
    const result = extractTimelineDate("We want this deployed by end of year");
    expect(result).not.toBeNull();
    expect(result!.getMonth()).toBe(11); // December
    expect(result!.getDate()).toBe(31);
  });

  it("returns null for text with no timeline", () => {
    expect(
      extractTimelineDate("The product looks interesting, tell me more"),
    ).toBeNull();
  });
});

// ── autofillDealFromIntelligence tests ────────────────────────

describe("autofillDealFromIntelligence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default mock: deal exists with null values
    mockSelectResult = [
      {
        value: null,
        expectedCloseDate: null,
        properties: {},
        id: "user-1",
      },
    ];
  });

  const baseIntelligence: ThreadIntelligence = {
    threadId: "thread-test-1",
    signals: [],
    competitors: [],
    sentiment: "neutral",
    sentimentTrend: "stable",
    objections: [],
    nextSteps: [],
    urgencyLevel: "none",
    extractedAt: new Date().toISOString(),
  };

  it("handles no signals gracefully (returns empty result)", async () => {
    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: baseIntelligence,
      sourceType: "email",
    });

    expect(result.fieldsUpdated).toHaveLength(0);
    expect(result.suggestionsCreated).toHaveLength(0);
  });

  it("handles missing deal gracefully", async () => {
    // Override mock to return empty array (deal not found)
    mockSelectResult = [];

    const result = await autofillDealFromIntelligence({
      dealId: "nonexistent-deal",
      tenantId: "tenant-1",
      intelligence: {
        ...baseIntelligence,
        signals: [
          { type: "budget", evidence: "Budget is $50,000", confidence: 0.9 },
        ],
      },
      sourceType: "email",
    });

    expect(result.fieldsUpdated).toHaveLength(0);
    expect(result.suggestionsCreated).toHaveLength(0);
  });

  it("processes budget signal and routes through approval mode", async () => {
    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        ...baseIntelligence,
        signals: [
          {
            type: "budget",
            evidence: "We have $50,000 allocated for this project",
            confidence: 0.95,
          },
        ],
      },
      sourceType: "email",
    });

    // With auto-high-confidence mode and confidence 0.95 * 0.8 = 0.76,
    // deal-stage-change threshold is 0.9, so this should be queued.
    expect(
      result.fieldsUpdated.includes("value") ||
        result.suggestionsCreated.includes("value"),
    ).toBe(true);

    // recordAgentAction should have been called
    expect(mockRecordAgentAction).toHaveBeenCalled();
  });

  it("adds competitors to deal properties", async () => {
    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        ...baseIntelligence,
        competitors: ["Salesforce", "HubSpot"],
      },
      sourceType: "email",
    });

    // Competitors should be either updated or queued as suggestion
    expect(
      result.fieldsUpdated.includes("competitors") ||
        result.suggestionsCreated.includes("competitors"),
    ).toBe(true);
  });

  it("records agent actions for undo capability", async () => {
    await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        ...baseIntelligence,
        competitors: ["Salesforce"],
        sentiment: "positive",
        signals: [
          {
            type: "budget",
            evidence: "$100,000 budget approved",
            confidence: 0.95,
          },
        ],
      },
      sourceType: "meeting",
    });

    // recordAgentAction should have been called for each field update
    expect(mockRecordAgentAction).toHaveBeenCalled();
    // Each call should have actionType "deal-autofill"
    const calls = mockRecordAgentAction.mock.calls;
    for (const call of calls) {
      expect(call[0].actionType).toBe("deal-autofill");
    }
  });

  it("updates sentiment when it differs from current", async () => {
    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        ...baseIntelligence,
        sentiment: "positive",
        sentimentTrend: "improving",
      },
      sourceType: "email",
    });

    expect(
      result.fieldsUpdated.includes("sentiment") ||
        result.suggestionsCreated.includes("sentiment"),
    ).toBe(true);
  });

  it("does not update sentiment when it is neutral", async () => {
    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        ...baseIntelligence,
        sentiment: "neutral",
      },
      sourceType: "email",
    });

    expect(result.fieldsUpdated).not.toContain("sentiment");
    expect(result.suggestionsCreated).not.toContain("sentiment");
  });
});

// ── Value protection: don't overwrite higher value ────────────

describe("autofillDealFromIntelligence -- value protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not overwrite existing higher deal value", async () => {
    // Deal with existing value of $100,000
    mockSelectResult = [
      {
        value: 100000,
        expectedCloseDate: null,
        properties: {},
        id: "user-1",
      },
    ];

    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        threadId: "thread-1",
        signals: [
          {
            type: "budget",
            evidence: "We can spend $50,000 on this",
            confidence: 0.95,
          },
        ],
        competitors: [],
        sentiment: "neutral",
        sentimentTrend: "stable",
        objections: [],
        nextSteps: [],
        urgencyLevel: "none",
        extractedAt: new Date().toISOString(),
      },
      sourceType: "email",
    });

    // $50,000 < existing $100,000 -- should NOT update
    expect(result.fieldsUpdated).not.toContain("value");
    expect(result.suggestionsCreated).not.toContain("value");
  });
});

// ── Approval mode respect ─────────────────────────────────────

describe("autofillDealFromIntelligence -- approval mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectResult = [
      {
        value: null,
        expectedCloseDate: null,
        properties: {},
        id: "user-1",
      },
    ];
  });

  it("queues updates in review-each mode", async () => {
    // Override tenant settings to review-each
    const { getTenantSettings } = await import("@/lib/tenant-settings");
    vi.mocked(getTenantSettings).mockResolvedValueOnce({
      agentApprovalMode: "review-each",
    } as any);

    const result = await autofillDealFromIntelligence({
      dealId: "deal-1",
      tenantId: "tenant-1",
      intelligence: {
        threadId: "thread-1",
        signals: [
          {
            type: "budget",
            evidence: "Budget is $50,000",
            confidence: 0.95,
          },
        ],
        competitors: ["Salesforce"],
        sentiment: "positive",
        sentimentTrend: "improving",
        objections: [],
        nextSteps: [],
        urgencyLevel: "none",
        extractedAt: new Date().toISOString(),
      },
      sourceType: "email",
    });

    // In review-each mode, nothing should auto-execute -- all should be suggestions
    expect(result.fieldsUpdated).toHaveLength(0);
    expect(result.suggestionsCreated.length).toBeGreaterThan(0);
  });
});
