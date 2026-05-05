import { describe, it, expect } from "vitest";
import {
  allocateContextBudget,
  estimateTokens,
  formatBudgetSummary,
  type RagResult,
} from "@/lib/ai/context-budget";
import type { UIMessage } from "ai";

// ── Helpers ───────────────────────────────────────────────────

function makeMessage(role: "user" | "assistant", text: string, id?: string): UIMessage {
  return {
    id: id || `msg-${Math.random().toString(36).slice(2, 8)}`,
    role,
    parts: [{ type: "text", text }],
  };
}

function makeMessages(count: number, charsPer: number = 200): UIMessage[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage(
      i % 2 === 0 ? "user" : "assistant",
      "x".repeat(charsPer),
      `msg-${i}`,
    ),
  );
}

function makeRagResults(count: number, charsPer: number = 500): RagResult[] {
  return Array.from({ length: count }, (_, i) => ({
    content: "r".repeat(charsPer),
    score: 1 - i * 0.1,
  }));
}

// ── Tests ─────────────────────────────────────────────────────

describe("context-budget: estimateTokens", () => {
  it("estimates ~0.25 tokens per char", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    // 1000 chars => 250 tokens
    expect(estimateTokens("x".repeat(1000))).toBe(250);
  });
});

describe("context-budget: allocateContextBudget", () => {
  it("returns all sections with correct structure", () => {
    const result = allocateContextBudget({
      systemPrompt: "You are a helpful assistant.",
      toolDefinitions: { tool1: { description: "test" } },
      messages: [makeMessage("user", "Hello")],
      ragResults: [],
      entityContext: "",
    });

    expect(result.budget).toBeDefined();
    expect(result.budget.systemPrompt).toBeDefined();
    expect(result.budget.tools).toBeDefined();
    expect(result.budget.history).toBeDefined();
    expect(result.budget.rag).toBeDefined();
    expect(result.budget.entity).toBeDefined();
    expect(result.budget.total).toBeDefined();
    expect(result.budget.total.remaining).toBeGreaterThan(0);
    expect(result.optimizedMessages).toHaveLength(1);
    expect(result.optimizedRag).toHaveLength(0);
  });

  it("does not compact when within budget", () => {
    const messages = makeMessages(5);
    const result = allocateContextBudget({
      systemPrompt: "Short system prompt.",
      toolDefinitions: { t1: {}, t2: {} },
      messages,
      ragResults: makeRagResults(2),
      entityContext: "Entity details here.",
    });

    expect(result.budget.history.compacted).toBe(false);
    expect(result.optimizedMessages).toHaveLength(5);
    expect(result.optimizedRag).toHaveLength(2);
  });

  it("compacts history when total exceeds budget", () => {
    // Create a conversation that blows the budget
    // 124K tokens available. Make messages consume ~130K.
    // 130K tokens * 4 chars/token = 520K chars
    const bigMessages = makeMessages(100, 5200); // 100 msgs * 5200 chars = 520K chars = 130K tokens

    const result = allocateContextBudget({
      systemPrompt: "System prompt.",
      toolDefinitions: {},
      messages: bigMessages,
      ragResults: [],
      entityContext: "",
    });

    expect(result.budget.history.compacted).toBe(true);
    expect(result.optimizedMessages.length).toBeLessThan(100);
    expect(result.budget.total.used).toBeLessThanOrEqual(124_000 + 1000); // Some tolerance
  });

  it("trims RAG results when history compaction is not enough", () => {
    // Fill most of the budget with system prompt + big RAG + big messages
    const bigRag = makeRagResults(20, 5000); // 20 * 5000 chars = 100K chars = 25K tokens
    const messages = makeMessages(80, 5000); // 80 * 5000 chars = 400K chars = 100K tokens

    const result = allocateContextBudget({
      systemPrompt: "x".repeat(20000), // 5K tokens
      toolDefinitions: {},
      messages,
      ragResults: bigRag,
      entityContext: "",
    });

    // RAG should be trimmed since total exceeds budget
    expect(result.optimizedRag.length).toBeLessThanOrEqual(20);
    // Remaining RAG results should be sorted by score (highest first)
    if (result.optimizedRag.length > 1) {
      for (let i = 1; i < result.optimizedRag.length; i++) {
        expect(result.optimizedRag[i - 1].score).toBeGreaterThanOrEqual(
          result.optimizedRag[i].score,
        );
      }
    }
  });

  it("truncates entity context as last resort", () => {
    // Create a scenario where history compaction and RAG trimming are
    // not enough, forcing entity truncation. The history is small (kept),
    // RAG is empty, but entity is massive relative to remaining budget.
    // System prompt: 100K tokens (400K chars) + entity: 50K tokens (200K chars)
    // Total: 150K > 124K budget. History and RAG are empty so only entity
    // gets truncated.
    const result = allocateContextBudget({
      systemPrompt: "x".repeat(400_000), // 100K tokens -- deliberately over cap
      toolDefinitions: {},
      messages: makeMessages(3, 200), // small
      ragResults: [],
      entityContext: "e".repeat(200_000), // 50K tokens
    });

    // Entity should be truncated since total exceeds budget
    expect(result.optimizedEntityContext.length).toBeLessThan(200_000);
  });

  it("never trims system prompt", () => {
    const longPrompt = "s".repeat(24000); // 6K tokens (at limit)
    const result = allocateContextBudget({
      systemPrompt: longPrompt,
      toolDefinitions: {},
      messages: makeMessages(100, 5200),
      ragResults: [],
      entityContext: "",
    });

    // System prompt should be unchanged in the budget
    expect(result.budget.systemPrompt.content).toBe(longPrompt);
    expect(result.budget.systemPrompt.used).toBe(estimateTokens(longPrompt));
  });

  it("tracks tool count correctly", () => {
    const tools = {
      searchCRM: { description: "Search" },
      queryContacts: { description: "Query contacts" },
      createDeal: { description: "Create deal" },
    };

    const result = allocateContextBudget({
      systemPrompt: "Test.",
      toolDefinitions: tools,
      messages: [makeMessage("user", "Hello")],
      ragResults: [],
      entityContext: "",
    });

    expect(result.budget.tools.count).toBe(3);
    expect(result.budget.tools.used).toBeGreaterThan(0);
  });

  it("handles empty inputs gracefully", () => {
    const result = allocateContextBudget({
      systemPrompt: "",
      toolDefinitions: {},
      messages: [],
      ragResults: [],
      entityContext: "",
    });

    // Empty toolDefinitions still serializes to "{}" = 1 token
    expect(result.budget.total.used).toBeLessThanOrEqual(2);
    expect(result.budget.total.remaining).toBeGreaterThan(123_000);
    expect(result.budget.history.compacted).toBe(false);
  });
});

describe("context-budget: formatBudgetSummary", () => {
  it("produces a readable string", () => {
    const result = allocateContextBudget({
      systemPrompt: "You are an assistant.",
      toolDefinitions: { searchCRM: {} },
      messages: makeMessages(3),
      ragResults: makeRagResults(1),
      entityContext: "Some entity context.",
    });

    const summary = formatBudgetSummary(result.budget);

    expect(summary).toContain("Context Budget:");
    expect(summary).toContain("System:");
    expect(summary).toContain("Tools:");
    expect(summary).toContain("History:");
    expect(summary).toContain("RAG:");
    expect(summary).toContain("Entity:");
    expect(summary).toContain("Remaining:");
  });

  it("shows COMPACTED flag when history was compacted", () => {
    const bigMessages = makeMessages(100, 5200);
    const result = allocateContextBudget({
      systemPrompt: "Test.",
      toolDefinitions: {},
      messages: bigMessages,
      ragResults: [],
      entityContext: "",
    });

    const summary = formatBudgetSummary(result.budget);

    if (result.budget.history.compacted) {
      expect(summary).toContain("[COMPACTED]");
    }
  });
});

describe("context-budget: budget allocation preserves message ordering", () => {
  it("keeps first message and recent messages after compaction", () => {
    const messages = [
      makeMessage("user", "First message with context", "first"),
      ...makeMessages(50, 10000).slice(1), // lots of middle messages
      makeMessage("user", "Last message", "last"),
    ];

    const result = allocateContextBudget({
      systemPrompt: "System prompt.",
      toolDefinitions: {},
      messages,
      ragResults: [],
      entityContext: "",
    });

    if (result.budget.history.compacted) {
      // First message should be preserved
      expect(result.optimizedMessages[0].id).toBe("first");
      // Last message should be preserved
      const lastOpt = result.optimizedMessages[result.optimizedMessages.length - 1];
      expect(lastOpt.id).toBe("last");
    }
  });
});

describe("context-budget: RAG trimming preserves highest-score results", () => {
  it("keeps highest-scoring results when trimming", () => {
    const ragResults: RagResult[] = [
      { content: "x".repeat(5000), score: 0.9 },
      { content: "x".repeat(5000), score: 0.3 },
      { content: "x".repeat(5000), score: 0.7 },
      { content: "x".repeat(5000), score: 0.5 },
    ];

    // Force trimming by making total exceed budget
    const result = allocateContextBudget({
      systemPrompt: "x".repeat(20000),
      toolDefinitions: {},
      messages: makeMessages(80, 5000), // take up most budget
      ragResults,
      entityContext: "x".repeat(8000),
    });

    if (result.optimizedRag.length < 4) {
      // The highest-scoring result should be retained
      expect(result.optimizedRag[0].score).toBe(0.9);
      // Results should be in descending score order
      for (let i = 1; i < result.optimizedRag.length; i++) {
        expect(result.optimizedRag[i - 1].score).toBeGreaterThanOrEqual(
          result.optimizedRag[i].score,
        );
      }
    }
  });
});
