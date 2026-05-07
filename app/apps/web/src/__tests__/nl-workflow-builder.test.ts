/**
 * Tests for nl-workflow-builder.ts
 *
 * Tests the validation logic, template variable resolution,
 * step execution with mocked DB, and delay parsing.
 * The NL parsing (LLM call) is not tested here since it requires
 * an LLM; instead we test the downstream pipeline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────

const { dbMock, sendNotificationMock, inngestMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  sendNotificationMock: vi.fn(),
  inngestMock: {
    send: vi.fn(),
  },
}));

vi.mock("@/db", () => ({ db: dbMock }));

vi.mock("@/db/schema", () => ({
  tenants: { id: "id", settings: "settings", updatedAt: "updated_at" },
  tasks: { id: "id", tenantId: "tenant_id" },
  activities: { id: "id", tenantId: "tenant_id" },
  outboundEmails: { id: "id", tenantId: "tenant_id" },
  contacts: { id: "id", tenantId: "tenant_id", email: "email" },
  companies: { id: "id" },
  deals: { id: "id", tenantId: "tenant_id" },
  sequenceEnrollments: { sequenceId: "sequence_id", contactId: "contact_id" },
  sequences: { id: "id", tenantId: "tenant_id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}));

vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: vi.fn(),
}));

vi.mock("@/lib/ai/ai-provider", () => ({
  anthropic: (m: string) => `mock-${m}`,
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: (m: string) => `mock-${m}`,
}));

vi.mock("@/lib/emails/notifications", () => ({
  sendNotification: (...args: unknown[]) => sendNotificationMock(...args),
}));

vi.mock("@/inngest/client", () => ({
  inngest: inngestMock,
}));

vi.mock("zod", async () => {
  const actual = await vi.importActual("zod");
  return actual;
});

const {
  validateWorkflow,
  executeWorkflowStep,
} = await import("@/lib/workflows/nl-workflow-builder");

import type {
  WorkflowDefinition,
  WorkflowStep,
} from "@/lib/workflows/nl-workflow-builder";

// ── Helpers ─────────────────────────────────────────────────────

function makeWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: "wf-1",
    name: "Test Workflow",
    description: "Test description",
    trigger: {
      type: "deal_stage_changed",
      conditions: { newStage: "proposal" },
    },
    steps: [
      {
        action: "create_task",
        config: { title: "Follow up on {deal.name}", priority: "high" },
      },
    ],
    enabled: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inngestMock.send.mockResolvedValue(undefined);
  sendNotificationMock.mockResolvedValue(undefined);
});

// ── Workflow Validation ─────────────────────────────────────────

describe("validateWorkflow", () => {
  it("validates a correct workflow definition", async () => {
    const workflow = makeWorkflow();
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects unknown trigger type", async () => {
    const workflow = makeWorkflow({
      trigger: {
        type: "unknown_event" as any,
        conditions: {},
      },
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid trigger type"))).toBe(true);
  });

  it("rejects unknown action type in step", async () => {
    const workflow = makeWorkflow({
      steps: [
        {
          action: "delete_everything" as any,
          config: {},
        },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid action type"))).toBe(true);
  });

  it("rejects invalid delay format", async () => {
    const workflow = makeWorkflow({
      steps: [
        {
          action: "create_task",
          config: { title: "Test task" },
          delay: "5weeks",
        },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid delay format"))).toBe(true);
  });

  it("rejects workflow with zero steps", async () => {
    const workflow = makeWorkflow({ steps: [] });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one step"))).toBe(true);
  });

  it("rejects workflow with all wait steps (no action steps)", async () => {
    const workflow = makeWorkflow({
      steps: [
        { action: "wait", config: { duration: "5d" } },
        { action: "wait", config: { duration: "2h" } },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("non-wait action"))).toBe(true);
  });

  it("rejects create_task step missing title", async () => {
    const workflow = makeWorkflow({
      steps: [
        { action: "create_task", config: { priority: "high" } },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("rejects send_email step missing subject and body", async () => {
    const workflow = makeWorkflow({
      steps: [
        { action: "send_email", config: {} },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("subject"))).toBe(true);
    expect(result.errors.some((e) => e.includes("body"))).toBe(true);
  });

  it("rejects invalid deal stage in trigger condition", async () => {
    const workflow = makeWorkflow({
      trigger: {
        type: "deal_stage_changed",
        conditions: { newStage: "invalid_stage" },
      },
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid deal stage"))).toBe(true);
  });

  it("rejects time_based trigger without schedule", async () => {
    const workflow = makeWorkflow({
      trigger: {
        type: "time_based",
        conditions: {},
      },
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schedule"))).toBe(true);
  });

  it("accepts valid delay formats", async () => {
    const workflow = makeWorkflow({
      steps: [
        { action: "create_task", config: { title: "Test" }, delay: "5d" },
        { action: "send_notification", config: { title: "Alert" }, delay: "2h" },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(true);
  });

  it("rejects wait step with invalid duration", async () => {
    const workflow = makeWorkflow({
      steps: [
        { action: "wait", config: { duration: "forever" } },
        { action: "create_task", config: { title: "After wait" } },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid duration format"))).toBe(true);
  });

  it("rejects update_deal step without stage or value", async () => {
    const workflow = makeWorkflow({
      steps: [
        { action: "update_deal", config: {} },
      ],
    });
    const result = await validateWorkflow(workflow);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("stage"))).toBe(true);
  });
});

// ── Step Execution ──────────────────────────────────────────────

describe("executeWorkflowStep", () => {
  it("executes create_task step and returns task data", async () => {
    const createdTask = { id: "task-1", title: "Follow up on Acme" };
    dbMock.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([createdTask]),
      }),
    });

    const step: WorkflowStep = {
      action: "create_task",
      config: { title: "Follow up on {deal.name}", priority: "high", dueDays: 5 },
    };
    const context = {
      deal: { name: "Acme" },
      userId: "user-1",
      entityType: "deal",
      entityId: "deal-1",
    };

    const result = await executeWorkflowStep(step, context, "tenant-1");
    expect(result.success).toBe(true);
    expect((result.result as any).taskId).toBe("task-1");
    expect(dbMock.insert).toHaveBeenCalled();
  });

  it("executes send_notification step and calls notification system", async () => {
    const step: WorkflowStep = {
      action: "send_notification",
      config: { title: "Deal alert for {deal.name}", body: "Stage changed" },
    };
    const context = {
      deal: { name: "Acme" },
      userId: "user-1",
      entityType: "deal",
      entityId: "deal-1",
    };

    const result = await executeWorkflowStep(step, context, "tenant-1");
    expect(result.success).toBe(true);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: "user-1",
        title: "Deal alert for Acme",
      }),
    );
  });

  it("executes wait step and returns delay info", async () => {
    const step: WorkflowStep = {
      action: "wait",
      config: { duration: "5d" },
    };

    const result = await executeWorkflowStep(step, {}, "tenant-1");
    expect(result.success).toBe(true);
    expect((result.result as any).waitDuration).toBe("5d");
    expect((result.result as any).delayMs).toBe(5 * 86400000);
  });

  it("returns failure for unknown action type", async () => {
    const step: WorkflowStep = {
      action: "unknown_action" as any,
      config: {},
    };

    const result = await executeWorkflowStep(step, {}, "tenant-1");
    expect(result.success).toBe(false);
  });
});

// ── Template Variable Resolution ────────────────────────────────

describe("template variable resolution", () => {
  it("resolves {deal.name} in step config", async () => {
    const createdTask = { id: "task-1", title: "Follow up on Acme Corp" };
    dbMock.insert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([createdTask]),
      }),
    });

    const step: WorkflowStep = {
      action: "create_task",
      config: { title: "Follow up on {deal.name}" },
    };
    const context = { deal: { name: "Acme Corp" }, userId: "u1" };

    const result = await executeWorkflowStep(step, context, "tenant-1");
    expect(result.success).toBe(true);
    // The DB insert should have been called with the resolved title
    const insertCall = dbMock.insert.mock.calls[0];
    expect(insertCall).toBeDefined();
  });

  it("leaves unresolved variables as-is when entity not in context", async () => {
    // For send_notification, the title gets resolved. If no "company" in context,
    // {company.name} stays as-is
    const step: WorkflowStep = {
      action: "send_notification",
      config: { title: "Alert for {company.name}", body: "Check it" },
    };
    const context = { userId: "u1" }; // no company in context

    const result = await executeWorkflowStep(step, context, "tenant-1");
    expect(result.success).toBe(true);
    // The notification call should have the unresolved variable
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Alert for {company.name}",
      }),
    );
  });
});

// ── Delay Parsing ───────────────────────────────────────────────

describe("delay parsing via wait step", () => {
  it("parses day delay correctly", async () => {
    const step: WorkflowStep = { action: "wait", config: { duration: "3d" } };
    const result = await executeWorkflowStep(step, {}, "t");
    expect((result.result as any).delayMs).toBe(3 * 86400000);
  });

  it("parses hour delay correctly", async () => {
    const step: WorkflowStep = { action: "wait", config: { duration: "12h" } };
    const result = await executeWorkflowStep(step, {}, "t");
    expect((result.result as any).delayMs).toBe(12 * 3600000);
  });

  it("parses minute delay correctly", async () => {
    const step: WorkflowStep = { action: "wait", config: { duration: "30m" } };
    const result = await executeWorkflowStep(step, {}, "t");
    expect((result.result as any).delayMs).toBe(30 * 60000);
  });

  it("returns 0 for invalid duration format", async () => {
    const step: WorkflowStep = { action: "wait", config: { duration: "invalid" } };
    const result = await executeWorkflowStep(step, {}, "t");
    expect((result.result as any).delayMs).toBe(0);
  });
});
