/**
 * Natural Language Workflow Builder
 *
 * Translates natural language descriptions into executable workflows:
 *
 * "Every time a deal reaches proposal stage, schedule a check-in task
 * for 5 days later and send the case study email."
 *
 * becomes:
 * {
 *   trigger: { type: "deal_stage_changed", condition: { newStage: "proposal" } },
 *   steps: [
 *     { action: "create_task", config: { title: "Check-in on {deal.name}", delay: "5d" } },
 *     { action: "send_email", config: { template: "case_study", to: "{deal.primaryContact}" } }
 *   ]
 * }
 *
 * The builder:
 * 1. Parses the NL description to extract trigger + conditions + actions
 * 2. Validates that all referenced entities/fields exist
 * 3. Generates a workflow definition (JSON, not code)
 * 4. The workflow engine (inngest/workflow-engine.ts) executes it at runtime
 */

import { db } from "@/db";
import { guardEnrollment } from "@/lib/anti-collision/enroll-guard";
import { tenants, tasks, activities, outboundEmails, contacts, companies, deals, sequenceEnrollments, sequences } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { tracedGenerateObject } from "@/lib/ai/traced-ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { sendNotification } from "@/lib/emails/notifications";
import { z } from "zod";
import { inngest } from "@/inngest/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowTriggerType =
  | "deal_stage_changed"
  | "email_received"
  | "meeting_completed"
  | "task_completed"
  | "contact_created"
  | "signal_detected"
  | "time_based";

export type WorkflowActionType =
  | "create_task"
  | "send_email"
  | "update_deal"
  | "create_note"
  | "send_notification"
  | "wait"
  | "enroll_sequence";

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  conditions: Record<string, unknown>;
}

export interface WorkflowStep {
  action: WorkflowActionType;
  config: Record<string, unknown>;
  delay?: string; // "5d", "2h", "30m"
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string; // original NL
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  enabled: boolean;
  createdAt: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  errors: string[];
}

export interface StepExecutionResult {
  success: boolean;
  result: unknown;
}

// ---------------------------------------------------------------------------
// Valid enums for validation
// ---------------------------------------------------------------------------

const VALID_TRIGGER_TYPES: WorkflowTriggerType[] = [
  "deal_stage_changed",
  "email_received",
  "meeting_completed",
  "task_completed",
  "contact_created",
  "signal_detected",
  "time_based",
];

const VALID_ACTION_TYPES: WorkflowActionType[] = [
  "create_task",
  "send_email",
  "update_deal",
  "create_note",
  "send_notification",
  "wait",
  "enroll_sequence",
];

const VALID_DEAL_STAGES = [
  "lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost",
];

const VALID_PRIORITIES = ["low", "medium", "high"];

// ---------------------------------------------------------------------------
// Parse NL description into structured workflow
// ---------------------------------------------------------------------------

const workflowSchema = z.object({
  name: z.string().describe("Short descriptive name for the workflow (max 60 chars)"),
  trigger: z.object({
    type: z.enum([
      "deal_stage_changed",
      "email_received",
      "meeting_completed",
      "task_completed",
      "contact_created",
      "signal_detected",
      "time_based",
    ]).describe("The event that triggers this workflow"),
    conditions: z.record(z.string(), z.unknown()).describe(
      "Conditions that must be met. For deal_stage_changed: { newStage: 'proposal' }. " +
      "For signal_detected: { signalType: 'funding_recent' }. " +
      "For time_based: { schedule: '0 9 * * MON' } (cron). " +
      "For email_received: { from: 'pattern' or empty for any }. " +
      "For others: {} for any match.",
    ),
  }),
  steps: z.array(z.object({
    action: z.enum([
      "create_task",
      "send_email",
      "update_deal",
      "create_note",
      "send_notification",
      "wait",
      "enroll_sequence",
    ]).describe("Action to perform"),
    config: z.record(z.string(), z.unknown()).describe(
      "Action configuration. Supports template variables: {deal.name}, {deal.stage}, {contact.name}, {contact.email}, {company.name}. " +
      "create_task: { title, description?, priority?, dueDays? }. " +
      "send_email: { subject, body, toAddress? }. " +
      "update_deal: { stage?, value? }. " +
      "create_note: { content, entityType?, entityId? }. " +
      "send_notification: { title, body }. " +
      "wait: { duration } (e.g. '5d', '2h', '30m'). " +
      "enroll_sequence: { sequenceId or sequenceName }.",
    ),
    delay: z.string().optional().describe(
      "Optional delay before this step executes. Format: '5d' (5 days), '2h' (2 hours), '30m' (30 minutes). " +
      "Use for scheduling future actions like 'check in 5 days later'.",
    ),
  })).min(1).describe("Ordered list of actions to execute"),
});

export async function parseNaturalLanguageWorkflow(
  description: string,
  tenantId: string,
): Promise<WorkflowDefinition> {
  const model = process.env.ANTHROPIC_API_KEY
    ? anthropic("claude-sonnet-4-6")
    : process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : null;

  if (!model) {
    throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
  }

  const { object } = await tracedGenerateObject({
    model,
    schema: workflowSchema,
    prompt: `You are a workflow builder for a CRM (Elevay). Parse this natural language workflow description into a structured workflow definition.

The CRM has these entity types: deals, contacts, companies, tasks, activities, sequences.

Deal stages (in order): lead, qualification, demo, trial, proposal, negotiation, won, lost.

Available triggers:
- deal_stage_changed: fires when a deal moves to a new stage. Conditions: { newStage: "stage_name" }
- email_received: fires when an email is received from a contact. Conditions: {} or { from: "pattern" }
- meeting_completed: fires when a meeting is marked complete. Conditions: {}
- task_completed: fires when a task is done. Conditions: {}
- contact_created: fires when a new contact is added. Conditions: {}
- signal_detected: fires when a buying signal is detected. Conditions: { signalType: "funding_recent" | "hiring_intent" | "engagement_spike" }
- time_based: fires on a schedule. Conditions: { schedule: "cron expression" }

Available actions:
- create_task: create a follow-up task. Config: { title, description, priority: "low"|"medium"|"high", dueDays: number }
- send_email: send an email. Config: { subject, body, toAddress (optional - defaults to deal's primary contact) }
- update_deal: update deal fields. Config: { stage, value }
- create_note: create a note. Config: { content }
- send_notification: in-app notification. Config: { title, body }
- wait: pause before next step. Config: { duration: "5d" | "2h" | "30m" }
- enroll_sequence: enroll contact in an email sequence. Config: { sequenceName }

Template variables available in all config strings:
{deal.name}, {deal.stage}, {deal.value}, {contact.name}, {contact.email}, {company.name}

IMPORTANT: If the user mentions a delay between steps (e.g. "5 days later"), use either:
1. A delay field on the step: delay: "5d"
2. A separate "wait" step before the action

User's workflow description:
"${description}"

Parse this into the structured format. Be precise with trigger conditions and action configs.`,
    _trace: { agentId: "nl-workflow-builder", tenantId },
  });

  const workflow: WorkflowDefinition = {
    id: crypto.randomUUID(),
    name: object.name,
    description,
    trigger: object.trigger,
    steps: object.steps,
    enabled: true,
    createdAt: new Date().toISOString(),
  };

  return workflow;
}

// ---------------------------------------------------------------------------
// Validate workflow
// ---------------------------------------------------------------------------

export async function validateWorkflow(
  workflow: WorkflowDefinition,
): Promise<WorkflowValidationResult> {
  const errors: string[] = [];

  // Validate trigger type
  if (!VALID_TRIGGER_TYPES.includes(workflow.trigger.type)) {
    errors.push(`Invalid trigger type: "${workflow.trigger.type}". Valid types: ${VALID_TRIGGER_TYPES.join(", ")}`);
  }

  // Validate trigger conditions
  if (workflow.trigger.type === "deal_stage_changed") {
    const newStage = workflow.trigger.conditions.newStage as string | undefined;
    if (newStage && !VALID_DEAL_STAGES.includes(newStage)) {
      errors.push(`Invalid deal stage in trigger condition: "${newStage}". Valid stages: ${VALID_DEAL_STAGES.join(", ")}`);
    }
  }

  if (workflow.trigger.type === "time_based") {
    const schedule = workflow.trigger.conditions.schedule as string | undefined;
    if (!schedule) {
      errors.push("time_based trigger requires a 'schedule' condition with a cron expression.");
    }
  }

  // Validate steps
  if (workflow.steps.length === 0) {
    errors.push("Workflow must have at least one step.");
  }

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];

    if (!VALID_ACTION_TYPES.includes(step.action)) {
      errors.push(`Step ${i + 1}: Invalid action type "${step.action}". Valid types: ${VALID_ACTION_TYPES.join(", ")}`);
    }

    // Validate delay format
    if (step.delay) {
      if (!/^\d+[dhm]$/.test(step.delay)) {
        errors.push(`Step ${i + 1}: Invalid delay format "${step.delay}". Use format like "5d", "2h", "30m".`);
      }
    }

    // Validate action-specific config
    switch (step.action) {
      case "create_task":
        if (!step.config.title) {
          errors.push(`Step ${i + 1} (create_task): "title" is required.`);
        }
        if (step.config.priority && !VALID_PRIORITIES.includes(step.config.priority as string)) {
          errors.push(`Step ${i + 1} (create_task): Invalid priority "${step.config.priority}". Valid: ${VALID_PRIORITIES.join(", ")}`);
        }
        break;

      case "send_email":
        if (!step.config.subject) {
          errors.push(`Step ${i + 1} (send_email): "subject" is required.`);
        }
        if (!step.config.body) {
          errors.push(`Step ${i + 1} (send_email): "body" is required.`);
        }
        break;

      case "update_deal":
        if (step.config.stage && !VALID_DEAL_STAGES.includes(step.config.stage as string)) {
          errors.push(`Step ${i + 1} (update_deal): Invalid stage "${step.config.stage}".`);
        }
        if (!step.config.stage && !step.config.value) {
          errors.push(`Step ${i + 1} (update_deal): At least "stage" or "value" must be specified.`);
        }
        break;

      case "create_note":
        if (!step.config.content) {
          errors.push(`Step ${i + 1} (create_note): "content" is required.`);
        }
        break;

      case "send_notification":
        if (!step.config.title) {
          errors.push(`Step ${i + 1} (send_notification): "title" is required.`);
        }
        break;

      case "wait":
        if (!step.config.duration) {
          errors.push(`Step ${i + 1} (wait): "duration" is required (e.g. "5d", "2h").`);
        } else if (!/^\d+[dhm]$/.test(step.config.duration as string)) {
          errors.push(`Step ${i + 1} (wait): Invalid duration format "${step.config.duration}".`);
        }
        break;

      case "enroll_sequence":
        if (!step.config.sequenceId && !step.config.sequenceName) {
          errors.push(`Step ${i + 1} (enroll_sequence): "sequenceId" or "sequenceName" is required.`);
        }
        break;
    }
  }

  // Validate no circular waits (e.g., all steps are waits)
  const nonWaitSteps = workflow.steps.filter((s) => s.action !== "wait");
  if (nonWaitSteps.length === 0) {
    errors.push("Workflow must have at least one non-wait action step.");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Template variable resolution
// ---------------------------------------------------------------------------

function resolveTemplateVars(
  text: string,
  context: Record<string, unknown>,
): string {
  return text.replace(/\{(\w+)\.(\w+)\}/g, (_match, entity, field) => {
    const entityData = context[entity] as Record<string, unknown> | undefined;
    if (entityData && entityData[field] !== undefined) {
      return String(entityData[field]);
    }
    return `{${entity}.${field}}`; // leave unresolved vars as-is
  });
}

// ---------------------------------------------------------------------------
// Parse delay string to milliseconds
// ---------------------------------------------------------------------------

function parseDelay(delay: string): number {
  const match = delay.match(/^(\d+)([dhm])$/);
  if (!match) return 0;
  const [, amount, unit] = match;
  const num = parseInt(amount, 10);
  switch (unit) {
    case "d": return num * 86400000;
    case "h": return num * 3600000;
    case "m": return num * 60000;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Execute a single workflow step
// ---------------------------------------------------------------------------

export async function executeWorkflowStep(
  step: WorkflowStep,
  context: Record<string, unknown>,
  tenantId: string,
): Promise<StepExecutionResult> {
  const userId = (context.userId as string) || "";

  // Resolve template variables in all string config values
  const resolvedConfig: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(step.config)) {
    resolvedConfig[key] = typeof value === "string" ? resolveTemplateVars(value, context) : value;
  }

  try {
    switch (step.action) {
      case "create_task": {
        const dueDays = resolvedConfig.dueDays as number | undefined;
        const dueDate = dueDays
          ? new Date(Date.now() + dueDays * 86400000)
          : undefined;

        const [created] = await db.insert(tasks).values({
          tenantId,
          assigneeId: userId || null,
          title: (resolvedConfig.title as string) || "Auto-created task",
          description: resolvedConfig.description as string | undefined,
          priority: (resolvedConfig.priority as "low" | "medium" | "high") || "medium",
          dueDate,
          entityType: (context.entityType as string) || undefined,
          entityId: (context.entityId as string) || undefined,
          status: "pending",
        }).returning();

        return { success: true, result: { taskId: created.id, title: created.title } };
      }

      case "send_email": {
        // Resolve recipient
        let toAddress = resolvedConfig.toAddress as string | undefined;
        if (!toAddress) {
          const contactId = context.contactId as string | undefined;
          if (contactId) {
            const [c] = await db.select({ email: contacts.email })
              .from(contacts)
              .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)))
              .limit(1);
            toAddress = c?.email || undefined;
          }
        }

        if (!toAddress) {
          return { success: false, result: { error: "No recipient email found" } };
        }

        const subject = (resolvedConfig.subject as string) || "Automated email";
        const body = (resolvedConfig.body as string) || "";

        const [email] = await db.insert(outboundEmails).values({
          tenantId,
          contactId: (context.contactId as string) || null,
          fromAddress: "pending@rotation",
          toAddress,
          subject,
          bodyHtml: `<div>${body.replace(/\n/g, "<br>")}</div>`,
          bodyText: body,
          status: "queued",
          queuedAt: new Date(),
        }).returning();

        // Trigger send
        await inngest.send({
          name: "email/send-now",
          data: { emailId: email.id },
        }).catch(() => {});

        return { success: true, result: { emailId: email.id, to: toAddress, subject } };
      }

      case "update_deal": {
        const dealId = (context.dealId as string) || (context.entityId as string);
        if (!dealId) {
          return { success: false, result: { error: "No deal ID in context" } };
        }

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (resolvedConfig.stage) updates.stage = resolvedConfig.stage;
        if (resolvedConfig.value) updates.value = resolvedConfig.value;

        await db.update(deals)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(and(eq(deals.id, dealId), eq(deals.tenantId, tenantId)));

        return { success: true, result: { dealId, updates: Object.keys(updates).filter((k) => k !== "updatedAt") } };
      }

      case "create_note": {
        await db.insert(activities).values({
          tenantId,
          actorType: "system",
          actorId: null,
          entityType: (context.entityType as string) || "deal",
          entityId: (context.entityId as string) || tenantId,
          activityType: "note_created",
          summary: (resolvedConfig.content as string) || "Auto-generated note",
        });

        return { success: true, result: { note: resolvedConfig.content } };
      }

      case "send_notification": {
        if (userId) {
          await sendNotification({
            tenantId,
            userId,
            type: "system",
            title: (resolvedConfig.title as string) || "Workflow notification",
            body: (resolvedConfig.body as string) || "",
            entityType: context.entityType as string,
            entityId: context.entityId as string,
          });
        }

        return { success: true, result: { notified: true } };
      }

      case "wait": {
        // Wait steps are handled by the Inngest function via step.sleep
        // At runtime, the caller should handle delay scheduling
        const duration = resolvedConfig.duration as string || "0m";
        return { success: true, result: { waitDuration: duration, delayMs: parseDelay(duration) } };
      }

      case "enroll_sequence": {
        const contactId = context.contactId as string | undefined;
        if (!contactId) {
          return { success: false, result: { error: "No contact ID in context for sequence enrollment" } };
        }

        let sequenceId = resolvedConfig.sequenceId as string | undefined;

        // Resolve by name if ID not provided
        if (!sequenceId && resolvedConfig.sequenceName) {
          const [seq] = await db.select({ id: sequences.id })
            .from(sequences)
            .where(and(
              eq(sequences.tenantId, tenantId),
              eq(sequences.name, resolvedConfig.sequenceName as string),
            ))
            .limit(1);
          sequenceId = seq?.id;
        }

        if (!sequenceId) {
          return { success: false, result: { error: `Sequence not found: ${resolvedConfig.sequenceName || resolvedConfig.sequenceId}` } };
        }

        // Spec 14 — anti-collision (record-only unless ANTI_COLLISION_ENFORCE).
        const ac = await guardEnrollment({ tenantId, contactId, enrollmentId: `${sequenceId}:${contactId}` });
        if (!ac.proceed) {
          return { success: true, result: { sequenceId, contactId, enrolled: false, reason: "anti_collision" } };
        }

        await db.insert(sequenceEnrollments).values({
          sequenceId,
          contactId,
          status: "active",
          currentStep: 1,
          enrolledAt: new Date(),
          nextStepAt: new Date(),
        });

        return { success: true, result: { sequenceId, contactId, enrolled: true } };
      }

      default:
        return { success: false, result: { error: `Unknown action: ${step.action}` } };
    }
  } catch (err) {
    return {
      success: false,
      result: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

// ---------------------------------------------------------------------------
// Store workflow in tenant settings (custom_workflows)
// ---------------------------------------------------------------------------

export async function saveWorkflow(
  workflow: WorkflowDefinition,
  tenantId: string,
): Promise<{ saved: boolean; error?: string }> {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return { saved: false, error: "Tenant not found" };

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const existingWorkflows = (settings.custom_workflows || []) as WorkflowDefinition[];

    // Check for duplicate names
    if (existingWorkflows.some((w) => w.name === workflow.name)) {
      return { saved: false, error: `A workflow named "${workflow.name}" already exists` };
    }

    // Limit to 50 workflows per tenant
    if (existingWorkflows.length >= 50) {
      return { saved: false, error: "Maximum of 50 custom workflows reached" };
    }

    existingWorkflows.push(workflow);

    await db.update(tenants).set({
      settings: { ...settings, custom_workflows: existingWorkflows },
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return { saved: true };
  } catch (err) {
    return { saved: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Delete a custom workflow
// ---------------------------------------------------------------------------

export async function deleteWorkflow(
  workflowId: string,
  tenantId: string,
): Promise<{ deleted: boolean; error?: string }> {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return { deleted: false, error: "Tenant not found" };

    const settings = (tenant.settings || {}) as Record<string, unknown>;
    const existingWorkflows = (settings.custom_workflows || []) as WorkflowDefinition[];
    const filtered = existingWorkflows.filter((w) => w.id !== workflowId);

    if (filtered.length === existingWorkflows.length) {
      return { deleted: false, error: "Workflow not found" };
    }

    await db.update(tenants).set({
      settings: { ...settings, custom_workflows: filtered },
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return { deleted: true };
  } catch (err) {
    return { deleted: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// List custom workflows for a tenant
// ---------------------------------------------------------------------------

export async function listWorkflows(
  tenantId: string,
): Promise<WorkflowDefinition[]> {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return [];
    const settings = (tenant.settings || {}) as Record<string, unknown>;
    return (settings.custom_workflows || []) as WorkflowDefinition[];
  } catch {
    return [];
  }
}
