import { z } from "zod";
import { makeTool, type ToolContext } from "./context";
import {
  parseNaturalLanguageWorkflow,
  validateWorkflow,
  saveWorkflow,
  deleteWorkflow,
  listWorkflows,
} from "@/lib/workflows/nl-workflow-builder";
import { logToolCall } from "@/lib/chat/tool-call-log";

export function buildWorkflowTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

  return {
    createWorkflow: makeTool({
      description:
        "Create an automated workflow from a natural language description. The system parses the description into a trigger + action steps, " +
        "validates it, and saves it. Workflows run automatically when their trigger conditions are met. " +
        'Use when the user says "when a deal reaches proposal, create a follow-up task", ' +
        '"automate: send case study email when deal moves to demo", "set up a workflow for...", ' +
        '"every time a new contact is created, notify me", or describes any automation rule.',
      inputSchema: z.object({
        description: z.string().describe(
          "Natural language description of the workflow. " +
          'Example: "When a deal reaches proposal stage, create a check-in task for 5 days later and send the case study email"',
        ),
      }),
      execute: async (input) => {
        if (!input.description || input.description.trim().length < 10) {
          return { error: "Please provide a more detailed workflow description (at least 10 characters)." };
        }

        try {
          // 1. Parse NL to structured workflow
          const workflow = await parseNaturalLanguageWorkflow(input.description, tenantId);

          // 2. Validate
          const validation = await validateWorkflow(workflow);
          if (!validation.valid) {
            return {
              error: "Workflow validation failed",
              validationErrors: validation.errors,
              parsed: {
                name: workflow.name,
                trigger: workflow.trigger,
                steps: workflow.steps.map((s) => ({
                  action: s.action,
                  config: s.config,
                  delay: s.delay,
                })),
              },
            };
          }

          // 3. Save to tenant settings
          const saveResult = await saveWorkflow(workflow, tenantId);
          if (!saveResult.saved) {
            return { error: saveResult.error || "Failed to save workflow" };
          }

          // 4. Log tool call for audit trail
          await logToolCall({
            tenantId,
            userId,
            toolName: "createWorkflow",
            args: { description: input.description },
            result: { id: workflow.id, name: workflow.name },
            snapshot: { type: "create", entity: "workflow" as never, id: workflow.id },
          });

          return {
            created: {
              id: workflow.id,
              name: workflow.name,
              description: workflow.description,
              trigger: {
                type: workflow.trigger.type,
                conditions: workflow.trigger.conditions,
              },
              steps: workflow.steps.map((s, i) => ({
                step: i + 1,
                action: s.action,
                config: s.config,
                delay: s.delay || null,
              })),
              enabled: workflow.enabled,
              createdAt: workflow.createdAt,
            },
          };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : "Failed to parse workflow description",
          };
        }
      },
    }),

    listWorkflows: makeTool({
      description:
        "List all custom workflows configured for this workspace. " +
        'Use when the user asks "show my workflows", "what automations are set up", ' +
        '"list workflows", or "what runs automatically".',
      inputSchema: z.object({}),
      execute: async () => {
        const workflows = await listWorkflows(tenantId);

        if (workflows.length === 0) {
          return {
            workflows: [],
            message: "No custom workflows configured yet. Describe an automation and I will create it.",
          };
        }

        return {
          workflowCount: workflows.length,
          workflows: workflows.map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            trigger: w.trigger.type,
            triggerConditions: w.trigger.conditions,
            stepCount: w.steps.length,
            steps: w.steps.map((s) => s.action),
            enabled: w.enabled,
            createdAt: w.createdAt,
          })),
        };
      },
    }),

    deleteWorkflow: makeTool({
      description:
        "Delete a custom workflow by its ID. " +
        'Use when the user asks to "remove workflow", "delete automation", or "turn off workflow X".',
      inputSchema: z.object({
        workflowId: z.string().describe("The workflow ID to delete"),
      }),
      execute: async (input) => {
        const result = await deleteWorkflow(input.workflowId, tenantId);

        if (!result.deleted) {
          return { error: result.error || "Failed to delete workflow" };
        }

        await logToolCall({
          tenantId,
          userId,
          toolName: "deleteWorkflow",
          args: { workflowId: input.workflowId },
          result: { deleted: true },
        });

        return { deleted: true, workflowId: input.workflowId };
      },
    }),
  };
}
