import { db } from "@/db";
import {
  activities,
  companies,
  contacts,
  deals,
  notes,
  sequences,
  sequenceSteps,
  tasks,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ingestEpisode } from "@/lib/context-graph";
import { makeTool, type ToolContext } from "./context";

export function buildCreateTools(ctx: ToolContext) {
  const { tenantId, userId, agentApprovalMode } = ctx;

  const createContactSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    companyId: z.string().optional().describe("Link to an existing account by ID"),
  });

  const createAccountSchema = z.object({
    name: z.string(),
    domain: z.string().optional(),
    industry: z.string().optional(),
  });

  const createDealSchema = z.object({
    name: z.string(),
    stage: z.enum(["lead", "qualification", "demo", "trial", "proposal", "negotiation"]).optional(),
    value: z.number().optional(),
    companyId: z.string().optional(),
    contactId: z.string().optional(),
  });

  return {
    createContact: makeTool({
      description:
        agentApprovalMode === "ask"
          ? "Propose creating a new contact. Returns a proposal card that the user must approve before the record is created."
          : "Create a new contact in the CRM. Use when the user asks to add a contact.",
      inputSchema: createContactSchema,
      execute: async (input) => {
        if (agentApprovalMode === "ask") {
          return {
            proposal: true,
            action: "createContact",
            entityType: "contact",
            entityName: [input.firstName, input.lastName].filter(Boolean).join(" ") || "New Contact",
            fields: input,
          };
        }
        const [created] = await db
          .insert(contacts)
          .values({ tenantId, ...input })
          .returning();
        return {
          created: {
            id: created.id,
            name: [created.firstName, created.lastName].filter(Boolean).join(" "),
            email: created.email,
          },
        };
      },
    }),

    createAccount: makeTool({
      description:
        agentApprovalMode === "ask"
          ? "Propose creating a new account. Returns a proposal card that the user must approve before the record is created."
          : "Create a new account/company in the CRM.",
      inputSchema: createAccountSchema,
      execute: async (input) => {
        if (agentApprovalMode === "ask") {
          return {
            proposal: true,
            action: "createAccount",
            entityType: "account",
            entityName: input.name || "New Account",
            fields: input,
          };
        }
        const [created] = await db
          .insert(companies)
          .values({ tenantId, ...input })
          .returning();
        return { created: { id: created.id, name: created.name, domain: created.domain } };
      },
    }),

    createDeal: makeTool({
      description:
        agentApprovalMode === "ask"
          ? "Propose creating a new deal. Returns a proposal card that the user must approve before the record is created."
          : "Create a new deal/opportunity in the CRM.",
      inputSchema: createDealSchema,
      execute: async (input) => {
        if (agentApprovalMode === "ask") {
          return {
            proposal: true,
            action: "createDeal",
            entityType: "deal",
            entityName: input.name || "New Deal",
            fields: input,
          };
        }
        const [created] = await db
          .insert(deals)
          .values({
            tenantId,
            stage: input.stage ?? "lead",
            name: input.name,
            value: input.value,
            companyId: input.companyId,
            contactId: input.contactId,
          })
          .returning();
        return {
          created: { id: created.id, name: created.name, stage: created.stage, value: created.value },
        };
      },
    }),

    createNote: makeTool({
      description:
        "Create a note attached to a contact, account, or deal. Use when the user asks to 'add a note', 'write down that...', 'jot a note about X'. Notes feed into the context graph for semantic recall.",
      inputSchema: z.object({
        content: z.string().describe("The note content (required)"),
        entityType: z
          .enum(["contact", "company", "deal"])
          .describe("What the note is attached to"),
        entityId: z.string().describe("ID of the entity this note is attached to"),
        title: z.string().optional().describe("Short title for the note"),
      }),
      execute: async (input) => {
        if (!input.content || input.content.trim().length === 0) {
          return { error: "Content is required" };
        }

        const [note] = await db
          .insert(notes)
          .values({
            tenantId,
            authorId: userId,
            title: input.title?.trim() || null,
            content: input.content.trim(),
            entityType: input.entityType,
            entityId: input.entityId,
          })
          .returning();

        if (input.content.trim().length > 20) {
          const graphContent = `Note: ${input.title || "Untitled"}\n\n${input.content
            .trim()
            .slice(0, 3000)}`;
          ingestEpisode(tenantId, graphContent, "note", note.id).catch((e) =>
            console.warn("createNote: ingestEpisode failed (non-blocking)", e)
          );
        }

        return {
          created: {
            id: note.id,
            title: note.title,
            entityType: note.entityType,
            entityId: note.entityId,
            _sourceLink:
              note.entityType === "contact"
                ? `/contacts/${note.entityId}`
                : note.entityType === "company"
                  ? `/accounts/${note.entityId}`
                  : note.entityType === "deal"
                    ? `/opportunities/${note.entityId}`
                    : undefined,
          },
        };
      },
    }),

    logActivity: makeTool({
      description:
        "Log a manual activity against a contact, account, or deal (call, meeting, note, touchpoint). Use when the user says 'I just called Jane', 'had a call with Acme', 'log a touch with X', or similar. Distinct from createNote (which is a long-form note).",
      inputSchema: z.object({
        entityType: z
          .enum(["contact", "company", "deal"])
          .describe("The entity this activity is attached to"),
        entityId: z.string().describe("The entity ID"),
        activityType: z
          .string()
          .describe(
            "Activity type: call_completed, meeting_completed, note_added, email_sent, email_received, or a custom label"
          ),
        channel: z
          .enum(["email", "phone", "meeting", "linkedin", "manual", "system", "other"])
          .optional()
          .describe("Channel of the activity (default: manual)"),
        direction: z
          .enum(["inbound", "outbound", "internal"])
          .optional()
          .describe("Direction (default: internal)"),
        summary: z.string().optional().describe("Short summary of what happened"),
        metadata: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional structured fields (attendees, duration, etc.)"),
      }),
      execute: async (input) => {
        const [activity] = await db
          .insert(activities)
          .values({
            tenantId,
            actorType: "user",
            actorId: userId,
            entityType: input.entityType,
            entityId: input.entityId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            activityType: input.activityType as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            channel: (input.channel || "manual") as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            direction: (input.direction || "internal") as any,
            summary: input.summary || null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata: (input.metadata || {}) as any,
          })
          .returning();

        return {
          logged: {
            id: activity.id,
            activityType: activity.activityType,
            entityType: activity.entityType,
            entityId: activity.entityId,
            occurredAt: activity.occurredAt,
          },
        };
      },
    }),

    createSequence: makeTool({
      description:
        "Create an outbound email sequence/campaign shell. Creates the parent record only — add steps via addSequenceStep afterwards. Use when the user asks to 'create a new sequence', 'set up a campaign', 'start a drip'.",
      inputSchema: z.object({
        name: z.string().describe("Sequence name (e.g. 'Q2 warm intros')"),
        description: z.string().optional().describe("Short description of the sequence's goal"),
      }),
      execute: async (input) => {
        if (!input.name || input.name.trim().length === 0) {
          return { error: "Name is required" };
        }
        const [sequence] = await db
          .insert(sequences)
          .values({
            tenantId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
          })
          .returning();
        return {
          created: {
            id: sequence.id,
            name: sequence.name,
            status: sequence.status,
            _sourceLink: `/sequences/${sequence.id}`,
          },
        };
      },
    }),

    addSequenceStep: makeTool({
      description:
        "Append an email step to an existing sequence. Auto-assigns the next stepNumber. Use when the user asks to 'add a step', 'add another email', 'append follow-up #N'.",
      inputSchema: z.object({
        sequenceId: z.string().describe("Sequence ID"),
        subjectTemplate: z
          .string()
          .describe("Subject line template (supports {{firstName}} etc.)"),
        bodyTemplate: z.string().describe("Body template"),
        delayDays: z
          .number()
          .optional()
          .describe("Days to wait after previous step (default 2, 0 for immediate)"),
      }),
      execute: async (input) => {
        const [sequence] = await db
          .select()
          .from(sequences)
          .where(and(eq(sequences.id, input.sequenceId), eq(sequences.tenantId, tenantId)))
          .limit(1);
        if (!sequence) return { error: "Sequence not found" };

        const [maxStep] = await db
          .select({ max: sql<number>`coalesce(max(step_number), 0)` })
          .from(sequenceSteps)
          .where(eq(sequenceSteps.sequenceId, input.sequenceId));
        const stepNumber = (maxStep?.max || 0) + 1;

        const [step] = await db
          .insert(sequenceSteps)
          .values({
            sequenceId: input.sequenceId,
            stepNumber,
            subjectTemplate: input.subjectTemplate.trim(),
            bodyTemplate: input.bodyTemplate.trim(),
            delayDays: input.delayDays ?? 2,
          })
          .returning();

        return {
          created: {
            id: step.id,
            sequenceId: step.sequenceId,
            stepNumber: step.stepNumber,
            delayDays: step.delayDays,
          },
        };
      },
    }),

    createTask: makeTool({
      description:
        "Create a task in the CRM. Use when the user asks to create a follow-up, reminder, todo, or task. Link it to a contact, account, or deal.",
      inputSchema: z.object({
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description/details"),
        dueDate: z.string().optional().describe("Due date in ISO format (YYYY-MM-DD)"),
        priority: z.enum(["low", "medium", "high"]).optional(),
        entityType: z.string().optional().describe("Link to entity type: contact, company, deal"),
        entityId: z.string().optional().describe("ID of the linked entity"),
      }),
      execute: async (input) => {
        const [created] = await db
          .insert(tasks)
          .values({
            tenantId,
            assigneeId: userId,
            title: input.title,
            description: input.description,
            dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
            priority: input.priority || "medium",
            entityType: input.entityType,
            entityId: input.entityId,
            status: "pending",
          })
          .returning();
        return {
          created: {
            id: created.id,
            title: created.title,
            dueDate: created.dueDate,
            status: created.status,
          },
        };
      },
    }),
  };
}
