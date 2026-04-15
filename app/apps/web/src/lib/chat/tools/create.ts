import { db } from "@/db";
import {
  activities,
  companies,
  contacts,
  deals,
  notes,
  savedViews,
  sequences,
  sequenceSteps,
  tasks,
  tenants,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ingestEpisode } from "@/lib/context-graph";
import {
  getTenantSettings,
  updateTenantSettings,
  type CustomObjectTypeDef,
} from "@/lib/tenant-settings";
import { makeTool, type ToolContext } from "./context";

export function buildCreateTools(ctx: ToolContext) {
  const { tenantId, userId, agentApprovalMode, authCtx } = ctx;
  const isAdmin = authCtx.role === "admin";

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

    createKnowledgeEntry: makeTool({
      description:
        "Add a knowledge base entry to the workspace's 'world model'. These entries are injected into the chat system prompt as business context. Admin-only. Use when the user says 'remember that our value prop is X', 'add this to our knowledge base', 'teach the assistant about Y'.",
      inputSchema: z.object({
        topic: z.string().describe("Short topic title (e.g. 'Pricing tiers', 'Value prop')"),
        content: z.string().describe("The knowledge content itself — can be multiple paragraphs"),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };
        if (!input.topic.trim() || !input.content.trim()) {
          return { error: "Topic and content required" };
        }

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const settings = (tenant.settings || {}) as Record<string, unknown>;
        const knowledge = (settings.knowledge as Array<{ id: string; topic: string; content: string }>) || [];

        const newEntry = {
          id: crypto.randomUUID(),
          topic: input.topic.trim(),
          content: input.content.trim(),
        };
        knowledge.push(newEntry);

        await db
          .update(tenants)
          .set({
            settings: { ...settings, knowledge },
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));

        return { created: newEntry };
      },
    }),

    createCustomObjectType: makeTool({
      description:
        "Create a new custom object type (e.g. 'Projects', 'Partners', 'Assets'). Admin-only. Custom object types are workspace-defined and extend the standard CRM schema. Each type has an id (auto-slug-sanitized), a display name (plural + singular), an icon, and a list of fields.",
      inputSchema: z.object({
        id: z.string().describe("Slug id (lowercased, dashes only — auto-sanitized)"),
        name: z.string().describe("Plural display name (e.g. 'Projects')"),
        nameSingular: z.string().describe("Singular display name (e.g. 'Project')"),
        icon: z.string().optional().describe("Icon name (default 'Box')"),
        fields: z
          .array(
            z.object({
              id: z.string().optional(),
              name: z.string(),
              type: z.string().optional().describe("text|number|date|select|boolean"),
              options: z.array(z.string()).optional(),
              required: z.boolean().optional(),
            })
          )
          .optional(),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const slug = input.id
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "");
        if (!slug) return { error: "Invalid id" };

        const settings = await getTenantSettings(tenantId);
        const existing = settings.customObjectTypes || [];
        if (existing.some((t) => t.id === slug)) {
          return { error: `Object type "${slug}" already exists` };
        }

        const newType: CustomObjectTypeDef = {
          id: slug,
          name: input.name.trim(),
          nameSingular: input.nameSingular.trim(),
          icon: input.icon || "Box",
          fields: (input.fields || []).map((f) => ({
            id: f.id || crypto.randomUUID(),
            name: f.name,
            type: (f.type || "text") as CustomObjectTypeDef["fields"][number]["type"],
            options: f.options,
            required: f.required || false,
          })),
        };

        await updateTenantSettings(tenantId, {
          customObjectTypes: [...existing, newType],
        });

        return { created: newType };
      },
    }),

    createSavedView: makeTool({
      description:
        "Save a filter/sort/columns view for a resource (accounts, contacts, deals, etc.) scoped to the current user. Use when the user says 'save this view as X', 'bookmark these filters'. isDefault=true will unset the default on sibling views so at most one default per (user, resource).",
      inputSchema: z.object({
        resource: z
          .string()
          .describe(
            "Resource type: accounts, contacts, deals, opportunities, meetings, tasks, notes, sequences, ..."
          ),
        name: z.string().describe("View name (max 120 chars)"),
        filters: z
          .array(
            z.object({
              field: z.string(),
              operator: z.string(),
              value: z.unknown(),
            })
          )
          .describe("Filter clauses"),
        sort: z
          .object({
            field: z.string(),
            dir: z.enum(["asc", "desc"]),
          })
          .nullable()
          .optional(),
        columns: z.array(z.string()).optional().describe("Visible column IDs"),
        isDefault: z.boolean().optional(),
      }),
      execute: async (input) => {
        if (input.isDefault) {
          await db
            .update(savedViews)
            .set({ isDefault: false })
            .where(
              and(
                eq(savedViews.userId, authCtx.userId),
                eq(savedViews.resource, input.resource)
              )
            );
        }

        const [inserted] = await db
          .insert(savedViews)
          .values({
            userId: authCtx.userId,
            resource: input.resource,
            name: input.name,
            filters: input.filters as never,
            sort: (input.sort ?? null) as never,
            columns: (input.columns ?? null) as never,
            isDefault: Boolean(input.isDefault),
          })
          .returning();

        return {
          created: {
            id: inserted.id,
            resource: inserted.resource,
            name: inserted.name,
            isDefault: inserted.isDefault,
          },
        };
      },
    }),
  };
}
