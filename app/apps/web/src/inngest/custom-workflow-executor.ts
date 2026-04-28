/**
 * Custom Workflow Executor — Inngest function
 *
 * Listens for CRM events (workflow/trigger) and checks if any user-defined
 * custom workflows (created via the NL Workflow Builder) match the trigger.
 * Executes matching workflows step-by-step with delay support.
 *
 * This extends the existing workflow-engine.ts (which handles the legacy
 * WorkflowDef format in settings.workflows) with support for the new
 * WorkflowDefinition format stored in settings.custom_workflows.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  executeWorkflowStep,
  type WorkflowDefinition,
  type WorkflowStep,
} from "@/lib/workflows/nl-workflow-builder";

/**
 * Parse a delay string (e.g. "5d", "2h", "30m") into a sleep-compatible
 * duration string for Inngest's step.sleep().
 */
function delayToSleepDuration(delay: string): string {
  const match = delay.match(/^(\d+)([dhm])$/);
  if (!match) return "0s";
  const [, amount, unit] = match;
  switch (unit) {
    case "d": return `${amount}d`;
    case "h": return `${amount}h`;
    case "m": return `${amount}m`;
    default: return "0s";
  }
}

export const executeCustomWorkflow = inngest.createFunction(
  {
    id: "execute-custom-workflow",
    name: "Execute Custom NL Workflow",
    retries: 2,
    triggers: [{ event: "workflow/trigger" }],
  },
  async ({ event, step }) => {
    const { tenantId, triggerType, triggerData, userId } = event.data as {
      tenantId: string;
      triggerType: string;
      triggerData: Record<string, unknown>;
      userId: string;
    };

    // Load custom workflow definitions from tenant settings
    const customWorkflows = await step.run("load-custom-workflows", async () => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) return [];
      const settings = (tenant.settings || {}) as Record<string, unknown>;
      return ((settings.custom_workflows || []) as WorkflowDefinition[])
        .filter((w) => w.enabled && w.trigger.type === triggerType);
    });

    if (customWorkflows.length === 0) return { customExecuted: 0 };

    let executed = 0;

    for (const workflow of customWorkflows) {
      // Check conditions
      const conditions = workflow.trigger.conditions || {};
      let matches = true;
      for (const [key, value] of Object.entries(conditions)) {
        if (value !== undefined && triggerData[key] !== value) {
          matches = false;
          break;
        }
      }

      if (!matches) continue;

      // Build execution context with entity data from the trigger
      const context: Record<string, unknown> = {
        ...triggerData,
        userId,
        tenantId,
        // Structured entity accessors for template variable resolution
        deal: {
          name: triggerData.dealName || triggerData.entityName || "",
          stage: triggerData.newStage || triggerData.stage || "",
          value: triggerData.dealValue || triggerData.value || 0,
          id: triggerData.dealId || (triggerData.entityType === "deal" ? triggerData.entityId : ""),
        },
        contact: {
          name: triggerData.contactName || "",
          email: triggerData.contactEmail || "",
          id: triggerData.contactId || (triggerData.entityType === "contact" ? triggerData.entityId : ""),
        },
        company: {
          name: triggerData.companyName || "",
          id: triggerData.companyId || (triggerData.entityType === "company" ? triggerData.entityId : ""),
        },
        // Pass through entity refs for step execution
        dealId: triggerData.dealId || (triggerData.entityType === "deal" ? triggerData.entityId : undefined),
        contactId: triggerData.contactId || (triggerData.entityType === "contact" ? triggerData.entityId : undefined),
        entityType: triggerData.entityType,
        entityId: triggerData.entityId,
      };

      // Execute steps sequentially with delay support
      for (let i = 0; i < workflow.steps.length; i++) {
        const workflowStep = workflow.steps[i];

        // Handle delay on the step
        if (workflowStep.delay) {
          const sleepDuration = delayToSleepDuration(workflowStep.delay);
          await step.sleep(`delay-${workflow.id}-step-${i}`, sleepDuration);
        }

        // Handle wait action (explicit wait step)
        if (workflowStep.action === "wait") {
          const duration = (workflowStep.config.duration as string) || "0m";
          const sleepDuration = delayToSleepDuration(duration);
          await step.sleep(`wait-${workflow.id}-step-${i}`, sleepDuration);
          continue;
        }

        // Execute the step
        await step.run(`step-${workflow.id}-${i}-${workflowStep.action}`, async () => {
          const result = await executeWorkflowStep(workflowStep, context, tenantId);
          if (!result.success) {
            console.warn(
              `Custom workflow "${workflow.name}" step ${i + 1} (${workflowStep.action}) failed:`,
              result.result,
            );
          }
          return result;
        });
      }

      executed++;
    }

    return { customExecuted: executed, customTotal: customWorkflows.length };
  },
);
