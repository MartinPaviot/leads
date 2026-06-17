import { db } from "@/db";
import {
  activities,
  comments,
  companies,
  contacts,
  deals,
  notes,
  savedViews,
  sequences,
  sequenceSteps,
  sharedPrompts,
  tasks,
  tenants,
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ingestEpisode } from "@/lib/ai/context-graph";
import {
  getTenantSettings,
  updateTenantSettings,
  type CustomObjectTypeDef,
} from "@/lib/config/tenant-settings";
import { logToolCall } from "@/lib/chat/tool-call-log";
import { logDealEvent } from "@/lib/deals/log-deal-event";
import { chatCreateDisposition } from "@/lib/guardrails/approval-mode";
import { makeTool, type ToolContext } from "./context";

export function buildCreateTools(ctx: ToolContext) {
  const { tenantId, userId, agentApprovalMode, authCtx } = ctx;
  const isAdmin = authCtx.role === "admin";
  // CLE-00: one disposition drives the description copy AND the execute guard, so the
  // two can never drift (the original bug was two independent `=== "ask"` literal tests).
  // CLE-10 will replace this local mapper with decideAction(...).
  const proposeFirst = chatCreateDisposition(agentApprovalMode) === "proposal";

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
        proposeFirst
          ? "Propose creating a new contact. Returns a proposal card that the user must approve before the record is created."
          : "Create a new contact in the CRM. Use when the user asks to add a contact.",
      inputSchema: createContactSchema,
      execute: async (input) => {
        if (proposeFirst) {
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
        await logToolCall({
          tenantId,
          userId,
          toolName: "createContact",
          args: input as Record<string, unknown>,
          result: { id: created.id },
          snapshot: { type: "create", entity: "contact", id: created.id },
        });
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
        proposeFirst
          ? "Propose creating a new account. Returns a proposal card that the user must approve before the record is created."
          : "Create a new account/company in the CRM.",
      inputSchema: createAccountSchema,
      execute: async (input) => {
        if (proposeFirst) {
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
        await logToolCall({
          tenantId,
          userId,
          toolName: "createAccount",
          args: input as Record<string, unknown>,
          result: { id: created.id },
          snapshot: { type: "create", entity: "company", id: created.id },
        });
        return { created: { id: created.id, name: created.name, domain: created.domain } };
      },
    }),

    createDeal: makeTool({
      description:
        proposeFirst
          ? "Propose creating a new deal. Returns a proposal card that the user must approve before the record is created."
          : "Create a new deal/opportunity in the CRM.",
      inputSchema: createDealSchema,
      execute: async (input) => {
        if (proposeFirst) {
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
        await logDealEvent({
          tenantId,
          dealId: created.id,
          type: "deal_created",
          actorType: "user",
          actorId: userId,
          summary: "Deal created",
          newStage: created.stage,
          triggeredBy: "chat",
        });
        await logToolCall({
          tenantId,
          userId,
          toolName: "createDeal",
          args: input as Record<string, unknown>,
          result: { id: created.id },
          snapshot: { type: "create", entity: "deal", id: created.id },
        });
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

        await logToolCall({
          tenantId,
          userId,
          toolName: "createNote",
          args: input as Record<string, unknown>,
          result: { id: note.id },
          snapshot: { type: "create", entity: "note", id: note.id },
        });

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

        await logToolCall({
          tenantId,
          userId,
          toolName: "logActivity",
          args: input as unknown as Record<string, unknown>,
          result: { id: activity.id },
          snapshot: { type: "create", entity: "activity", id: activity.id },
        });

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
            createdBy: authCtx.userId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
          })
          .returning();
        await logToolCall({
          tenantId,
          userId,
          toolName: "createSequence",
          args: input as unknown as Record<string, unknown>,
          result: { id: sequence.id },
          snapshot: { type: "create", entity: "sequence", id: sequence.id },
        });
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

        await logToolCall({
          tenantId,
          userId,
          toolName: "addSequenceStep",
          args: input as unknown as Record<string, unknown>,
          result: { id: step.id },
          snapshot: { type: "create", entity: "sequence_step", id: step.id },
        });

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
        await logToolCall({
          tenantId,
          userId,
          toolName: "createTask",
          args: input as Record<string, unknown>,
          result: { id: created.id },
          snapshot: { type: "create", entity: "task", id: created.id },
        });
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
        "Add a knowledge base entry to the workspace. Entries are embedded for semantic retrieval and injected into skill prompts (proposals, coaching, battlecards). Admin-only. Use when the user says 'remember that our value prop is X', 'add this to our knowledge base', 'teach the assistant about Y'.",
      inputSchema: z.object({
        topic: z.string().describe("Short topic title (e.g. 'Pricing tiers', 'Value prop')"),
        content: z.string().describe("The knowledge content — can be multiple paragraphs"),
        category: z.enum(["icp", "competitors", "objections", "product", "process", "context", "custom"]).optional().describe("Category (default: custom)"),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };
        if (!input.topic.trim() || !input.content.trim()) {
          return { error: "Topic and content required" };
        }

        const { knowledgeEntries: keTable } = await import("@/db/schema");
        const { createHash } = await import("crypto");
        const { embedKnowledgeEntry } = await import("@/lib/knowledge/retrieval");

        const contentHash = createHash("sha256")
          .update(input.content.trim())
          .digest("hex");

        const [entry] = await db
          .insert(keTable)
          .values({
            tenantId,
            // knowledgeEntries.createdBy FK -> auth_user.id (AUTH id), not the app users.id.
            createdBy: authCtx.userId,
            scope: "workspace",
            title: input.topic.trim(),
            category: input.category ?? "custom",
            content: input.content.trim(),
            contentHash,
          })
          .returning();

        embedKnowledgeEntry(tenantId, entry.id, entry.title, entry.content)
          .catch(() => {});

        return { created: { id: entry.id, title: entry.title, category: entry.category } };
      },
    }),

    upsertContact: makeTool({
      description:
        "Find-or-create a contact by email. If a contact with this email exists in the workspace, updates the supplied fields on it; otherwise creates a new one. Idempotent — safe to call repeatedly. Use when ingesting leads from external sources where you don't know if they already exist.",
      inputSchema: z.object({
        email: z.string().email().describe("Natural key — looked up case-insensitive"),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        title: z.string().optional(),
        phone: z.string().optional(),
        companyId: z.string().optional(),
        linkedinUrl: z.string().optional(),
      }),
      execute: async (input) => {
        const emailLower = input.email.toLowerCase();
        const [existing] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, emailLower)))
          .limit(1);

        if (existing) {
          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (input.firstName !== undefined) updates.firstName = input.firstName;
          if (input.lastName !== undefined) updates.lastName = input.lastName;
          if (input.title !== undefined) updates.title = input.title;
          if (input.phone !== undefined) updates.phone = input.phone;
          if (input.companyId !== undefined) updates.companyId = input.companyId;
          if (input.linkedinUrl !== undefined) updates.linkedinUrl = input.linkedinUrl;

          const [updated] = await db
            .update(contacts)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set(updates as any)
            .where(eq(contacts.id, existing.id))
            .returning();

          return {
            upserted: {
              id: updated.id,
              action: "updated",
              email: updated.email,
              name: [updated.firstName, updated.lastName].filter(Boolean).join(" "),
            },
          };
        }

        const [created] = await db
          .insert(contacts)
          .values({
            tenantId,
            email: emailLower,
            firstName: input.firstName,
            lastName: input.lastName,
            title: input.title,
            phone: input.phone,
            companyId: input.companyId,
            linkedinUrl: input.linkedinUrl,
          })
          .returning();

        return {
          upserted: {
            id: created.id,
            action: "created",
            email: created.email,
            name: [created.firstName, created.lastName].filter(Boolean).join(" "),
          },
        };
      },
    }),

    upsertAccount: makeTool({
      description:
        "Find-or-create a company by domain. Case-insensitive domain match. Updates supplied fields on existing match, creates otherwise. Idempotent. Use when enriching companies from external feeds.",
      inputSchema: z.object({
        domain: z.string().describe("Natural key — company website domain (case-insensitive)"),
        name: z.string().optional(),
        industry: z.string().optional(),
        size: z.string().optional(),
        revenue: z.string().optional(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        const domainLower = input.domain.toLowerCase().trim();
        const [existing] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.tenantId, tenantId), eq(companies.domain, domainLower)))
          .limit(1);

        if (existing) {
          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (input.name !== undefined) updates.name = input.name;
          if (input.industry !== undefined) updates.industry = input.industry;
          if (input.size !== undefined) updates.size = input.size;
          if (input.revenue !== undefined) updates.revenue = input.revenue;
          if (input.description !== undefined) updates.description = input.description;

          const [updated] = await db
            .update(companies)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set(updates as any)
            .where(eq(companies.id, existing.id))
            .returning();

          return {
            upserted: {
              id: updated.id,
              action: "updated",
              name: updated.name,
              domain: updated.domain,
            },
          };
        }

        const [created] = await db
          .insert(companies)
          .values({
            tenantId,
            name: input.name || domainLower,
            domain: domainLower,
            industry: input.industry,
            size: input.size,
            revenue: input.revenue,
            description: input.description,
          })
          .returning();

        return {
          upserted: {
            id: created.id,
            action: "created",
            name: created.name,
            domain: created.domain,
          },
        };
      },
    }),

    upsertDealByCompany: makeTool({
      description:
        "Find-or-create a deal for a specific company + contact + stage combination, avoiding duplicates. If a deal with the same name and companyId already exists, updates its fields; otherwise creates a new deal. Use for idempotent deal pipelines.",
      inputSchema: z.object({
        name: z.string().describe("Deal name (uniqueness key with companyId)"),
        companyId: z.string(),
        contactId: z.string().optional(),
        stage: z
          .enum(["lead", "qualification", "demo", "trial", "proposal", "negotiation", "won", "lost"])
          .optional(),
        value: z.number().optional(),
        summary: z.string().optional(),
        expectedCloseDate: z.string().optional(),
      }),
      execute: async (input) => {
        const existingRows = await db
          .select()
          .from(deals)
          .where(
            and(
              eq(deals.tenantId, tenantId),
              eq(deals.companyId, input.companyId),
              eq(deals.name, input.name)
            )
          )
          .limit(1);
        const existing = existingRows[0];

        if (existing) {
          const updates: Record<string, unknown> = { updatedAt: new Date() };
          if (input.stage !== undefined) updates.stage = input.stage;
          if (input.value !== undefined) updates.value = input.value;
          if (input.contactId !== undefined) updates.contactId = input.contactId;
          if (input.summary !== undefined) updates.summary = input.summary;
          if (input.expectedCloseDate !== undefined) {
            updates.expectedCloseDate = new Date(input.expectedCloseDate);
          }
          const [updated] = await db
            .update(deals)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set(updates as any)
            .where(eq(deals.id, existing.id))
            .returning();
          return {
            upserted: {
              id: updated.id,
              action: "updated",
              name: updated.name,
              stage: updated.stage,
              value: updated.value,
            },
          };
        }

        const [created] = await db
          .insert(deals)
          .values({
            tenantId,
            name: input.name,
            companyId: input.companyId,
            contactId: input.contactId,
            stage: input.stage ?? "lead",
            value: input.value,
            summary: input.summary,
            expectedCloseDate: input.expectedCloseDate
              ? new Date(input.expectedCloseDate)
              : undefined,
          })
          .returning();
        await logDealEvent({
          tenantId,
          dealId: created.id,
          type: "deal_created",
          actorType: "user",
          actorId: userId,
          summary: "Deal created",
          newStage: created.stage,
          triggeredBy: "chat",
        });
        return {
          upserted: {
            id: created.id,
            action: "created",
            name: created.name,
            stage: created.stage,
            value: created.value,
          },
        };
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

    createComment: makeTool({
      description:
        "Create a comment on a CRM entity (contact, company, deal, meeting, sequence, or any polymorphic target). Supports threaded replies via parentCommentId. Use when the user says 'comment on this', 'leave a note for the team about X'. Distinct from createNote: comments are lightweight conversational threads; notes are long-form observations.",
      inputSchema: z.object({
        entityType: z.string().describe("What is being commented on (e.g. 'contact', 'deal', 'meeting')"),
        entityId: z.string().describe("Id of the entity"),
        body: z.string().min(1).describe("Comment body"),
        parentCommentId: z.string().optional().describe("Reply to an existing comment"),
      }),
      execute: async (input) => {
        if (!input.body.trim()) return { error: "Body is required" };

        const [created] = await db
          .insert(comments)
          .values({
            tenantId,
            authorId: userId,
            entityType: input.entityType,
            entityId: input.entityId,
            parentCommentId: input.parentCommentId,
            body: input.body.trim(),
          })
          .returning();

        await logToolCall({
          tenantId,
          userId,
          toolName: "createComment",
          args: input as unknown as Record<string, unknown>,
          result: { id: created.id },
          snapshot: { type: "create", entity: "comment", id: created.id },
        });

        return {
          created: {
            id: created.id,
            entityType: created.entityType,
            entityId: created.entityId,
            parentCommentId: created.parentCommentId,
            createdAt: created.createdAt,
          },
        };
      },
    }),

    createSharedPrompt: makeTool({
      description:
        "Save a reusable prompt template under a short title. Scope defaults to 'user' (private); admins can set scope='workspace' to share with the whole team. Surfaces in the '/' palette of the chat input. Use when the user says 'save this prompt as X', 'codify this into a template', 'let the team use this'.",
      inputSchema: z.object({
        title: z.string().min(1).max(120),
        prompt: z.string().min(1),
        scope: z.enum(["user", "workspace"]).optional(),
      }),
      execute: async (input) => {
        const scope = input.scope || "user";
        if (scope === "workspace" && !isAdmin) {
          return { error: "Admin access required to publish workspace prompts" };
        }
        const [created] = await db
          .insert(sharedPrompts)
          .values({
            tenantId,
            authorId: userId,
            title: input.title.trim(),
            prompt: input.prompt.trim(),
            scope,
          })
          .returning();
        await logToolCall({
          tenantId,
          userId,
          toolName: "createSharedPrompt",
          args: input as unknown as Record<string, unknown>,
          result: { id: created.id },
          snapshot: { type: "create", entity: "shared_prompt", id: created.id },
        });
        return {
          created: {
            id: created.id,
            title: created.title,
            scope: created.scope,
          },
        };
      },
    }),
  };
}
