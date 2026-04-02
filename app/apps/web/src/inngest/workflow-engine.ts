import { inngest } from "./client";
import { db } from "@/db";
import { tenants, tasks, activities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendNotification } from "@/lib/notifications";
import type { WorkflowDef } from "@/app/api/settings/workflows/route";

/**
 * Minimum viable workflow engine.
 *
 * Listens for CRM events, checks if any user-defined workflows match,
 * and executes the configured actions.
 *
 * Triggers: deal_stage_changed, contact_created, email_received, task_due
 * Actions: send_notification, create_task, call_webhook, update_field
 */
export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-workflow",
    name: "Execute User Workflow",
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

    // Load workflow definitions
    const workflows = await step.run("load-workflows", async () => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const settings = (tenant?.settings || {}) as Record<string, unknown>;
      return ((settings.workflows || []) as WorkflowDef[])
        .filter((w) => w.enabled && w.trigger.type === triggerType);
    });

    if (workflows.length === 0) return { executed: 0 };

    let executed = 0;

    for (const workflow of workflows) {
      // Check conditions
      const conditions = workflow.trigger.conditions || {};
      let matches = true;
      for (const [key, value] of Object.entries(conditions)) {
        if (triggerData[key] !== value) {
          matches = false;
          break;
        }
      }

      if (!matches) continue;

      // Execute actions
      for (const action of workflow.actions) {
        await step.run(`action-${workflow.id}-${action.type}`, async () => {
          switch (action.type) {
            case "send_notification":
              await sendNotification({
                tenantId,
                userId,
                type: "system",
                title: action.params.title || `Workflow: ${workflow.name}`,
                body: action.params.body || `Triggered by ${triggerType}`,
                entityType: triggerData.entityType as string,
                entityId: triggerData.entityId as string,
              });
              break;

            case "create_task":
              await db.insert(tasks).values({
                tenantId,
                assigneeId: userId,
                title: action.params.title || `Auto-task from ${workflow.name}`,
                description: action.params.description,
                dueDate: action.params.dueDays
                  ? new Date(Date.now() + parseInt(action.params.dueDays) * 86400000)
                  : undefined,
                priority: (action.params.priority as "low" | "medium" | "high") || "medium",
                entityType: triggerData.entityType as string,
                entityId: triggerData.entityId as string,
                status: "pending",
              });
              break;

            case "call_webhook":
              if (action.params.url) {
                await fetch(action.params.url, {
                  method: action.params.method || "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    workflow: workflow.name,
                    trigger: triggerType,
                    data: triggerData,
                    timestamp: new Date().toISOString(),
                  }),
                }).catch(console.warn);
              }
              break;

            case "send_email":
              // TODO: Wire to email sending infrastructure
              break;

            case "update_field":
              // TODO: Wire to entity update
              break;

            case "ai_action":
              // TODO: Wire to AI tool execution
              break;
          }
        });
      }

      // Update run count
      await step.run(`update-count-${workflow.id}`, async () => {
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        if (tenant) {
          const settings = (tenant.settings || {}) as Record<string, unknown>;
          const allWorkflows = (settings.workflows || []) as WorkflowDef[];
          const updated = allWorkflows.map((w) =>
            w.id === workflow.id
              ? { ...w, runCount: (w.runCount || 0) + 1, lastRunAt: new Date().toISOString() }
              : w
          );
          await db.update(tenants).set({
            settings: { ...settings, workflows: updated },
          }).where(eq(tenants.id, tenantId));
        }
      });

      executed++;
    }

    return { executed, total: workflows.length };
  }
);

/**
 * Helper: fire a workflow trigger from anywhere in the codebase.
 * Call this after CRM events (stage change, contact creation, etc.)
 */
export async function fireWorkflowTrigger(
  tenantId: string,
  userId: string,
  triggerType: string,
  triggerData: Record<string, unknown>
): Promise<void> {
  await inngest.send({
    name: "workflow/trigger",
    data: { tenantId, userId, triggerType, triggerData },
  }).catch(console.warn);
}
