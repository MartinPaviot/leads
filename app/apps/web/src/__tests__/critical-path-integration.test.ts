/**
 * Critical path integration test.
 * Validates that the core pipeline flow compiles and the schema
 * re-exports work after the domain split + lib reorganization.
 *
 * This is a structural test — it verifies that imports resolve,
 * types are compatible, and the pipeline contract holds.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
          orderBy: vi.fn(() => []),
        })),
        orderBy: vi.fn(() => []),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => [{ id: "test-id" }]),
        onConflictDoNothing: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

describe("Schema re-exports after domain split", () => {
  it("exports all core tables from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.tenants).toBeDefined();
    expect(schema.users).toBeDefined();
    expect(schema.companies).toBeDefined();
    expect(schema.contacts).toBeDefined();
    expect(schema.deals).toBeDefined();
    expect(schema.activities).toBeDefined();
  });

  it("exports all auth tables from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.authUsers).toBeDefined();
    expect(schema.authAccounts).toBeDefined();
    expect(schema.authSessions).toBeDefined();
    expect(schema.savedViews).toBeDefined();
  });

  it("exports all outbound tables from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.sequences).toBeDefined();
    expect(schema.sequenceEnrollments).toBeDefined();
    expect(schema.connectedMailboxes).toBeDefined();
    expect(schema.outboundEmails).toBeDefined();
    expect(schema.warmupEmails).toBeDefined();
    expect(schema.emailOptouts).toBeDefined();
    expect(schema.notifications).toBeDefined();
  });

  it("exports all intelligence tables from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.chatMemories).toBeDefined();
    expect(schema.contextGraphNodes).toBeDefined();
    expect(schema.contextGraphEdges).toBeDefined();
    expect(schema.evalDatasets).toBeDefined();
    expect(schema.evalRuns).toBeDefined();
    expect(schema.agentTraces).toBeDefined();
    expect(schema.agentPromptVersions).toBeDefined();
  });

  it("exports all agent tables from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.agentActions).toBeDefined();
    expect(schema.agentReactions).toBeDefined();
    expect(schema.agentWorkItems).toBeDefined();
    expect(schema.actionOutcomes).toBeDefined();
    expect(schema.trustEvents).toBeDefined();
  });

  it("exports all campaign tables from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.intelligenceBriefs).toBeDefined();
    expect(schema.outreachPlaybooks).toBeDefined();
    expect(schema.autonomyConfig).toBeDefined();
    expect(schema.systemTrustScore).toBeDefined();
    expect(schema.pipelineEvents).toBeDefined();
  });

  it("exports all enums from barrel", async () => {
    const schema = await import("@/db/schema");
    expect(schema.activityTypeEnum).toBeDefined();
    expect(schema.dealStageEnum).toBeDefined();
    expect(schema.mailboxStatusEnum).toBeDefined();
    expect(schema.outboundStatusEnum).toBeDefined();
    expect(schema.pipelineStageEnum).toBeDefined();
  });
});

describe("Reorganized lib imports resolve", () => {
  it("imports from auth/", async () => {
    // auth-utils requires next-auth server runtime; test a non-server module instead
    const mod = await import("@/lib/auth/password-hash");
    expect(mod).toBeDefined();
  });

  it("imports from billing/", async () => {
    const mod = await import("@/lib/billing/cost-tracker");
    expect(mod.trackTokenUsage).toBeDefined();
    expect(mod.getTenantCost).toBeDefined();
    expect(mod.getTopCostConsumers).toBeDefined();
  });

  it("imports from observability/", async () => {
    const mod = await import("@/lib/observability/logger");
    expect(mod).toBeDefined();
  });

  it("imports from infra/", async () => {
    const mod = await import("@/lib/infra/api-errors");
    expect(mod).toBeDefined();
  });

  it("imports from scoring/", async () => {
    const mod = await import("@/lib/scoring/scoring");
    expect(mod).toBeDefined();
  });

  it("imports from ai/", async () => {
    const mod = await import("@/lib/ai/ai-provider");
    expect(mod).toBeDefined();
  });

  it("imports from integrations/", async () => {
    const mod = await import("@/lib/integrations/apollo-client");
    expect(mod).toBeDefined();
  });

  it("imports from deals/", async () => {
    const mod = await import("@/lib/deals/deal-helpers");
    expect(mod).toBeDefined();
  });

  it("imports from context/", async () => {
    const mod = await import("@/lib/context/prospect-context");
    expect(mod).toBeDefined();
  });

  it("imports from search/", async () => {
    const mod = await import("@/lib/search/filters");
    expect(mod).toBeDefined();
  });

  it("imports from config/", async () => {
    const mod = await import("@/lib/config/tenant-settings");
    expect(mod).toBeDefined();
  });
});

describe("Billing schema", () => {
  it("exports billing tables", async () => {
    const { subscriptions, usageEvents } = await import("@/db/billing-schema");
    expect(subscriptions).toBeDefined();
    expect(usageEvents).toBeDefined();
  });
});
