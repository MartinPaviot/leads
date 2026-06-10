import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
          orderBy: vi.fn(() => ({ limit: vi.fn(() => []) })),
        })),
        orderBy: vi.fn(() => ({ limit: vi.fn(() => []) })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => []) })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: "test-id" }]),
        onConflictDoNothing: vi.fn(),
        catch: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => ({
    agentApprovalMode: "review-each",
    targetIndustries: ["SaaS"],
    targetCompanySizes: ["51-200"],
    targetRoles: "CTO",
    targetGeographies: ["Europe"],
  })),
}));

vi.mock("@/lib/agent-actions", () => ({
  recordAgentAction: vi.fn(() => ({ id: "action-123" })),
  DEFAULT_EMAIL_GRACE_MS: 60000,
}));

vi.mock("@/lib/outcomes/create-watcher", () => ({
  createOutcomeWatcher: vi.fn(() => ({ id: "watcher-123" })),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  HEURISTIC_DECISIONS,
  type AgentTrigger,
  type AgentDecision,
  type ReactorContext,
} from "@/lib/agent-reactor/types";
import { loadReactorContext } from "@/lib/agent-reactor/context-loader";
import {
  buildDecisionSystemPrompt,
  buildDecisionUserPrompt,
} from "@/lib/agent-reactor/decision-prompt";

describe("Agent Reactor — Types & Heuristics", () => {
  it("provides heuristic decisions for known triggers", () => {
    const triggers: AgentTrigger[] = [
      "email_opened",
      "email_bounced",
      "deal_stale",
      "signal_detected",
      "meeting_completed",
    ];

    for (const trigger of triggers) {
      const decision = HEURISTIC_DECISIONS[trigger];
      expect(decision).toBeDefined();
      expect(decision!.reasoning).toBeTruthy();
      expect(decision!.confidence).toBeGreaterThanOrEqual(0);
      expect(decision!.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("email_opened heuristic takes no action", () => {
    const decision = HEURISTIC_DECISIONS.email_opened!;
    expect(decision.actions).toHaveLength(0);
  });

  it("email_bounced heuristic alerts founder", () => {
    const decision = HEURISTIC_DECISIONS.email_bounced!;
    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0].type).toBe("alert_founder");
  });

  it("deal_stale heuristic takes no reflex action (surfaced to the founder instead)", () => {
    const decision = HEURISTIC_DECISIONS.deal_stale!;
    expect(decision.actions).toHaveLength(0);
  });

  it("signal_detected heuristic takes no action (signals prioritise outreach, not create deals)", () => {
    const decision = HEURISTIC_DECISIONS.signal_detected!;
    expect(decision.actions).toHaveLength(0);
  });
});

describe("Agent Reactor — Decision Prompt", () => {
  it("builds a valid system prompt", () => {
    const prompt = buildDecisionSystemPrompt();
    expect(prompt).toContain("autonomous decision engine");
    expect(prompt).toContain("send_followup");
    expect(prompt).toContain("hold");
    expect(prompt).toContain("JSON");
  });

  it("builds user prompt with entity context", () => {
    const context: ReactorContext = {
      entity: { type: "company", id: "c1", label: "Acme Corp", data: { industry: "SaaS", score: 85 } },
      recentActivities: [
        { type: "email_sent", summary: "Intro email", occurredAt: "2026-05-01T10:00:00Z", direction: "outbound" },
      ],
      activeSequences: [],
      signals: [{ type: "funding_recent", value: { amount: "10M" } }],
      pastActions: [],
      workItem: { strategy: "push", nextAction: "send_followup", priority: "high" },
      icp: { industries: ["SaaS"], sizes: ["51-200"], roles: ["CTO"], geographies: ["Europe"] },
      triggerMetadata: { signalType: "funding_recent" },
    };

    const prompt = buildDecisionUserPrompt("signal_detected", context);
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("buying signal was detected");
    expect(prompt).toContain("funding_recent");
    expect(prompt).toContain("push");
    expect(prompt).toContain("SaaS");
  });

  it("handles minimal context gracefully", () => {
    const context: ReactorContext = {
      entity: { type: "contact", id: "ct1", label: "Unknown contact", data: {} },
      recentActivities: [],
      activeSequences: [],
      signals: [],
      pastActions: [],
      workItem: null,
      icp: { industries: [], sizes: [], roles: [], geographies: [] },
      triggerMetadata: {},
    };

    const prompt = buildDecisionUserPrompt("email_opened", context);
    expect(prompt).toContain("Unknown contact");
    expect(prompt).toContain("prospect opened an email");
  });
});

describe("Agent Reactor — Context Loader", () => {
  it("returns default context for unknown entity", async () => {
    const context = await loadReactorContext("t1", "unknown", "x1", {});
    expect(context.entity.label).toBe("Unknown entity");
    expect(context.recentActivities).toEqual([]);
    expect(context.workItem).toBeNull();
  });
});
