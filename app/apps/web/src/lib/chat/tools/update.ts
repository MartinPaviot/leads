import { db } from "@/db";
import {
  activities,
  companies,
  connectedMailboxes,
  contacts,
  deals,
  notificationPreferences,
  sequences,
  sequenceSteps,
  tasks,
  tenants,
  users,
} from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import {
  getTenantSettings,
  updateTenantSettings,
  type CustomObjectTypeDef,
} from "@/lib/tenant-settings";
import { logToolCall } from "@/lib/chat/tool-call-log";
import { makeTool, type ToolContext } from "./context";

export function buildUpdateTools(ctx: ToolContext) {
  const { tenantId, userId, authCtx } = ctx;
  const isAdmin = authCtx.role === "admin";

  return {
    updateContact: makeTool({
      description:
        "Update a contact's fields. Only fields you pass are changed — other fields are left untouched. Use when the user asks to change a contact's title, company, email, phone, LinkedIn, etc. Pass null to clear a field.",
      inputSchema: z.object({
        contactId: z.string().describe("The contact ID to update"),
        firstName: z.string().nullable().optional(),
        lastName: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        companyId: z.string().nullable().optional().describe("Link to an account by ID, or null to unlink"),
        linkedinUrl: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const [existing] = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId)))
          .limit(1);
        if (!existing) return { error: "Contact not found" };

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.firstName !== undefined) updates.firstName = input.firstName?.trim() || null;
        if (input.lastName !== undefined) updates.lastName = input.lastName?.trim() || null;
        if (input.email !== undefined) updates.email = input.email?.trim()?.toLowerCase() || null;
        if (input.title !== undefined) updates.title = input.title?.trim() || null;
        if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
        if (input.companyId !== undefined) updates.companyId = input.companyId || null;
        if (input.linkedinUrl !== undefined) updates.linkedinUrl = input.linkedinUrl?.trim() || null;

        if (Object.keys(updates).length === 1) {
          return { error: "No fields to update" };
        }

        const [updated] = await db
          .update(contacts)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, tenantId)))
          .returning();

        await logToolCall({
          tenantId,
          userId,
          toolName: "updateContact",
          args: input as unknown as Record<string, unknown>,
          result: { id: updated.id },
          snapshot: {
            type: "update",
            entity: "contact",
            id: existing.id,
            before: existing as unknown as Record<string, unknown>,
          },
        });

        return {
          updated: {
            id: updated.id,
            name: [updated.firstName, updated.lastName].filter(Boolean).join(" "),
            email: updated.email,
            title: updated.title,
            companyId: updated.companyId,
          },
        };
      },
    }),

    updateAccount: makeTool({
      description:
        "Update an account/company's fields. Only fields you pass are changed. Use when the user asks to change an account's name, domain, industry, size, revenue, description, or score.",
      inputSchema: z.object({
        accountId: z.string().describe("The account/company ID to update"),
        name: z.string().optional(),
        domain: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        size: z.string().nullable().optional(),
        revenue: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        score: z.number().nullable().optional(),
      }),
      execute: async (input) => {
        const [existing] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId)))
          .limit(1);
        if (!existing) return { error: "Account not found" };

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name !== undefined) updates.name = input.name;
        if (input.domain !== undefined) updates.domain = input.domain;
        if (input.industry !== undefined) updates.industry = input.industry;
        if (input.size !== undefined) updates.size = input.size;
        if (input.revenue !== undefined) updates.revenue = input.revenue;
        if (input.description !== undefined) updates.description = input.description;
        if (input.score !== undefined) updates.score = input.score;

        if (Object.keys(updates).length === 1) {
          return { error: "No fields to update" };
        }

        const [updated] = await db
          .update(companies)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId)))
          .returning();

        await logToolCall({
          tenantId,
          userId,
          toolName: "updateAccount",
          args: input as unknown as Record<string, unknown>,
          result: { id: updated.id },
          snapshot: {
            type: "update",
            entity: "company",
            id: existing.id,
            before: existing as unknown as Record<string, unknown>,
          },
        });

        return {
          updated: {
            id: updated.id,
            name: updated.name,
            domain: updated.domain,
            industry: updated.industry,
            score: updated.score,
          },
        };
      },
    }),

    updateDeal: makeTool({
      description:
        "Update a deal/opportunity's fields: name, stage, value, summary, expected close date, linked company/contact. Supersedes updateDealStage (which only changes stage). Logs a stage-change activity when stage is modified.",
      inputSchema: z.object({
        dealId: z.string().describe("The deal ID to update"),
        name: z.string().optional(),
        stage: z.string().optional().describe("New stage: lead, qualification, demo, trial, proposal, negotiation, won, lost"),
        value: z.number().nullable().optional(),
        summary: z.string().nullable().optional(),
        expectedCloseDate: z
          .string()
          .nullable()
          .optional()
          .describe("ISO date string (YYYY-MM-DD) or null to clear"),
        companyId: z.string().nullable().optional(),
        contactId: z.string().nullable().optional(),
      }),
      execute: async (input) => {
        const [existing] = await db
          .select()
          .from(deals)
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId)))
          .limit(1);
        if (!existing) return { error: "Deal not found" };

        const updates: Record<string, unknown> = { updatedAt: new Date() };
        const oldStage = existing.stage;
        if (input.name !== undefined) updates.name = input.name;
        if (input.stage !== undefined) updates.stage = input.stage;
        if (input.value !== undefined) updates.value = input.value;
        if (input.summary !== undefined) updates.summary = input.summary;
        if (input.expectedCloseDate !== undefined) {
          updates.expectedCloseDate = input.expectedCloseDate ? new Date(input.expectedCloseDate) : null;
        }
        if (input.companyId !== undefined) updates.companyId = input.companyId;
        if (input.contactId !== undefined) updates.contactId = input.contactId;

        if (Object.keys(updates).length === 1) {
          return { error: "No fields to update" };
        }

        const [updated] = await db
          .update(deals)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId)))
          .returning();

        await logToolCall({
          tenantId,
          userId,
          toolName: "updateDeal",
          args: input as unknown as Record<string, unknown>,
          result: { id: updated.id },
          snapshot: {
            type: "update",
            entity: "deal",
            id: existing.id,
            before: existing as unknown as Record<string, unknown>,
          },
        });

        if (input.stage !== undefined && input.stage !== oldStage) {
          await db.insert(activities).values({
            tenantId,
            actorType: "user",
            actorId: userId,
            entityType: "deal",
            entityId: input.dealId,
            activityType:
              input.stage === "won"
                ? "deal_won"
                : input.stage === "lost"
                  ? "deal_lost"
                  : "deal_stage_changed",
            channel: "system",
            direction: "internal",
            summary: `Stage changed from ${oldStage} to ${input.stage}`,
            metadata: { oldStage, newStage: input.stage },
          });
        }

        return {
          updated: {
            id: updated.id,
            name: updated.name,
            stage: updated.stage,
            value: updated.value,
            expectedCloseDate: updated.expectedCloseDate,
            ...(input.stage !== undefined && input.stage !== oldStage
              ? { stageChangedFrom: oldStage }
              : {}),
          },
        };
      },
    }),

    updateTask: makeTool({
      description:
        "Update a task's fields: title, description, due date, priority, status. Supersedes completeTask (use this with status='completed' instead).",
      inputSchema: z.object({
        taskId: z.string().describe("The task ID to update"),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional().describe("ISO date or null to clear"),
        priority: z.enum(["low", "medium", "high"]).optional(),
        status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
      }),
      execute: async (input) => {
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.title !== undefined) updates.title = input.title;
        if (input.description !== undefined) updates.description = input.description;
        if (input.dueDate !== undefined) {
          updates.dueDate = input.dueDate ? new Date(input.dueDate) : null;
        }
        if (input.priority !== undefined) updates.priority = input.priority;
        if (input.status !== undefined) updates.status = input.status;

        if (Object.keys(updates).length === 1) {
          return { error: "No fields to update" };
        }

        // Snapshot before update for reversal
        const [before] = await db
          .select()
          .from(tasks)
          .where(and(eq(tasks.id, input.taskId), eq(tasks.tenantId, tenantId)))
          .limit(1);

        const [updated] = await db
          .update(tasks)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(and(eq(tasks.id, input.taskId), eq(tasks.tenantId, tenantId)))
          .returning();
        if (!updated) return { error: "Task not found" };

        if (before) {
          await logToolCall({
            tenantId,
            userId,
            toolName: "updateTask",
            args: input as unknown as Record<string, unknown>,
            result: { id: updated.id },
            snapshot: {
              type: "update",
              entity: "task",
              id: before.id,
              before: before as unknown as Record<string, unknown>,
            },
          });
        }

        return {
          updated: {
            id: updated.id,
            title: updated.title,
            status: updated.status,
            priority: updated.priority,
            dueDate: updated.dueDate,
          },
        };
      },
    }),

    updateAccountLifecycle: makeTool({
      description:
        "Set an account's lifecycle stage (prospect, customer, churned, etc.). Use when the user says 'mark Acme as a customer', 'move X to churned', 'they're a lead now'.",
      inputSchema: z.object({
        accountId: z.string().describe("Account/company ID"),
        stage: z
          .string()
          .describe(
            "Lifecycle stage — one of the workspace's configured LIFECYCLE_STAGES (e.g. lead, prospect, customer, churned, lost)"
          ),
      }),
      execute: async (input) => {
        const { LIFECYCLE_STAGES } = await import("@/lib/lifecycle");
        if (!(LIFECYCLE_STAGES as readonly string[]).includes(input.stage)) {
          return { error: `Invalid lifecycle stage. Valid: ${LIFECYCLE_STAGES.join(", ")}` };
        }

        const [company] = await db
          .select()
          .from(companies)
          .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId)))
          .limit(1);
        if (!company) return { error: "Account not found" };

        const currentProps = (company.properties || {}) as Record<string, unknown>;
        await db
          .update(companies)
          .set({
            properties: { ...currentProps, lifecycle: input.stage },
            updatedAt: new Date(),
          })
          .where(and(eq(companies.id, input.accountId), eq(companies.tenantId, tenantId)));

        return {
          updated: {
            accountId: input.accountId,
            name: company.name,
            oldStage: currentProps.lifecycle ?? null,
            newStage: input.stage,
          },
        };
      },
    }),

    updateMeetingNotes: makeTool({
      description:
        "Update a meeting's structured notes or follow-up email draft. Partial updates supported — pass only the keys you want to change. Use when the user edits their meeting notes via chat, adjusts the follow-up subject/body, etc.",
      inputSchema: z.object({
        meetingId: z.string().describe("The meeting/activity ID"),
        structuredNotes: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Structured notes object (summary, keyPoints, actionItems, decisions, buyingSignals). Pass only to replace wholesale."
          ),
        followUpDraft: z
          .object({
            subject: z.string().optional(),
            body: z.string().optional(),
          })
          .optional()
          .describe("Follow-up email draft — subject/body merged into existing draft"),
      }),
      execute: async (input) => {
        if (input.structuredNotes === undefined && input.followUpDraft === undefined) {
          return { error: "Nothing to update — pass structuredNotes or followUpDraft" };
        }

        const [activity] = await db
          .select()
          .from(activities)
          .where(and(eq(activities.id, input.meetingId), eq(activities.tenantId, tenantId)))
          .limit(1);
        if (!activity) return { error: "Meeting not found" };

        const currentMeta = (activity.metadata ?? {}) as Record<string, unknown>;
        const nextMeta: Record<string, unknown> = { ...currentMeta };
        if (input.structuredNotes !== undefined) {
          nextMeta.structuredNotes = input.structuredNotes;
        }
        if (input.followUpDraft !== undefined) {
          const currentDraft = (currentMeta.followUpEmailDraft ?? {}) as Record<string, unknown>;
          nextMeta.followUpEmailDraft = { ...currentDraft, ...input.followUpDraft };
        }
        nextMeta.notesEditedAt = new Date().toISOString();

        await db
          .update(activities)
          .set({ metadata: nextMeta })
          .where(eq(activities.id, input.meetingId));

        return {
          updated: {
            meetingId: input.meetingId,
            notesUpdated: input.structuredNotes !== undefined,
            draftUpdated: input.followUpDraft !== undefined,
          },
        };
      },
    }),

    updateSequence: makeTool({
      description:
        "Update a sequence's metadata: name, description, status (draft|active|paused|completed|archived). Use when the user asks to 'rename this sequence', 'pause the Q2 campaign', 'archive this'.",
      inputSchema: z.object({
        sequenceId: z.string().describe("Sequence ID"),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        status: z
          .enum(["draft", "active", "paused", "completed", "archived"])
          .optional(),
      }),
      execute: async (input) => {
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.name) updates.name = input.name.trim();
        if (input.description !== undefined) {
          updates.description = input.description?.trim() || null;
        }
        if (input.status) updates.status = input.status;

        if (Object.keys(updates).length === 1) {
          return { error: "No fields to update" };
        }

        const [updated] = await db
          .update(sequences)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(
            and(eq(sequences.id, input.sequenceId), eq(sequences.tenantId, tenantId))
          )
          .returning();
        if (!updated) return { error: "Sequence not found" };

        return {
          updated: {
            id: updated.id,
            name: updated.name,
            status: updated.status,
            description: updated.description,
          },
        };
      },
    }),

    updateSequenceStep: makeTool({
      description:
        "Edit a sequence step's subject/body/delayDays. Tenant-scoped. Edits apply to future send-time for contacts not yet at this step; already-sent emails are historical.",
      inputSchema: z.object({
        sequenceId: z.string().describe("Parent sequence ID"),
        stepId: z.string().describe("Step ID to edit"),
        subjectTemplate: z.string().optional(),
        bodyTemplate: z.string().optional(),
        delayDays: z.number().optional().describe("Must be ≥ 0"),
      }),
      execute: async (input) => {
        const [sequence] = await db
          .select({ id: sequences.id })
          .from(sequences)
          .where(
            and(eq(sequences.id, input.sequenceId), eq(sequences.tenantId, tenantId))
          )
          .limit(1);
        if (!sequence) return { error: "Sequence not found" };

        const updates: Record<string, unknown> = {};
        if (typeof input.subjectTemplate === "string") {
          updates.subjectTemplate = input.subjectTemplate.trim();
        }
        if (typeof input.bodyTemplate === "string") {
          updates.bodyTemplate = input.bodyTemplate.trim();
        }
        if (typeof input.delayDays === "number" && input.delayDays >= 0) {
          updates.delayDays = input.delayDays;
        }
        if (Object.keys(updates).length === 0) {
          return { error: "No valid fields to update" };
        }

        const [updated] = await db
          .update(sequenceSteps)
          .set(updates)
          .where(
            and(
              eq(sequenceSteps.id, input.stepId),
              eq(sequenceSteps.sequenceId, input.sequenceId)
            )
          )
          .returning();
        if (!updated) return { error: "Step not found" };

        return {
          updated: {
            id: updated.id,
            stepNumber: updated.stepNumber,
            delayDays: updated.delayDays,
          },
        };
      },
    }),

    updateDealStage: makeTool({
      description:
        "Move a deal to a different pipeline stage. Use when the user says 'move deal X to proposal', 'progress this deal', 'mark as won/lost', etc.",
      inputSchema: z.object({
        dealId: z.string().describe("The deal ID to update"),
        newStage: z
          .string()
          .describe("The new stage name (e.g. qualification, demo, proposal, won, lost)"),
      }),
      execute: async (input) => {
        const [deal] = await db
          .select()
          .from(deals)
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId)))
          .limit(1);
        if (!deal) return { error: "Deal not found" };

        const oldStage = deal.stage;
        await db
          .update(deals)
          .set({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            stage: input.newStage as any,
            updatedAt: new Date(),
          })
          .where(and(eq(deals.id, input.dealId), eq(deals.tenantId, tenantId)));

        await db.insert(activities).values({
          tenantId,
          actorType: "user",
          actorId: userId,
          entityType: "deal",
          entityId: input.dealId,
          activityType:
            input.newStage === "won"
              ? "deal_won"
              : input.newStage === "lost"
                ? "deal_lost"
                : "deal_stage_changed",
          channel: "system",
          direction: "internal",
          summary: `Stage changed from ${oldStage} to ${input.newStage}`,
          metadata: { oldStage, newStage: input.newStage },
        });

        return { updated: { id: deal.id, name: deal.name, oldStage, newStage: input.newStage } };
      },
    }),

    completeTask: makeTool({
      description: "Mark a task as completed. Use when user says 'done', 'complete task', 'mark as finished'.",
      inputSchema: z.object({
        taskId: z.string().describe("Task ID to mark as completed"),
      }),
      execute: async (input) => {
        const [updated] = await db
          .update(tasks)
          .set({
            status: "completed",
            updatedAt: new Date(),
          })
          .where(and(eq(tasks.id, input.taskId), eq(tasks.tenantId, tenantId)))
          .returning();
        if (!updated) return { error: "Task not found" };
        return { completed: { id: updated.id, title: updated.title } };
      },
    }),

    bulkUpdateDeals: makeTool({
      description:
        "Bulk update multiple deals at once. Use when user says 'reassign all deals', 'move all X deals to Y stage', 'tag all deals with', or any bulk deal operation.",
      inputSchema: z.object({
        filter: z
          .object({
            stage: z.string().optional().describe("Filter deals by current stage"),
            search: z.string().optional().describe("Filter deals by name search"),
          })
          .describe("Filter to select which deals to update"),
        update: z
          .object({
            stage: z.string().optional().describe("New stage to set"),
            assigneeId: z.string().optional().describe("New assignee user ID"),
          })
          .describe("Fields to update on matched deals"),
      }),
      execute: async (input) => {
        const conditions = [eq(deals.tenantId, tenantId)];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (input.filter.stage) conditions.push(eq(deals.stage, input.filter.stage as any));
        if (input.filter.search) conditions.push(ilike(deals.name, `%${input.filter.search}%`));

        // Full-row snapshot for undo (bulk_update reversal)
        const fullMatched = await db
          .select()
          .from(deals)
          .where(and(...conditions));

        const matchedDeals = fullMatched;

        if (matchedDeals.length === 0)
          return { bulkUpdated: { count: 0 }, message: "No deals matched the filter" };

        const updateFields: Record<string, unknown> = { updatedAt: new Date() };
        if (input.update.stage) updateFields.stage = input.update.stage;

        await db
          .update(deals)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updateFields as any)
          .where(and(...conditions));

        for (const deal of matchedDeals) {
          await db.insert(activities).values({
            tenantId,
            actorType: "user",
            actorId: userId,
            entityType: "deal",
            entityId: deal.id,
            activityType: "deal_stage_changed",
            channel: "system",
            direction: "internal",
            summary: `Bulk update: ${Object.entries(input.update)
              .map(([k, v]) => `${k}→${v}`)
              .join(", ")}`,
            metadata: { bulkOperation: true, filter: input.filter, update: input.update },
          });
        }

        await logToolCall({
          tenantId,
          userId,
          toolName: "bulkUpdateDeals",
          args: input as unknown as Record<string, unknown>,
          result: { count: matchedDeals.length },
          snapshot: {
            type: "bulk_update",
            entity: "deal",
            rows: matchedDeals.map((d) => ({
              id: d.id,
              before: d as unknown as Record<string, unknown>,
            })),
          },
        });

        return {
          bulkUpdated: {
            count: matchedDeals.length,
            deals: matchedDeals.map((d) => ({ id: d.id, name: d.name })),
          },
        };
      },
    }),

    bulkUpdateContacts: makeTool({
      description:
        "Bulk update multiple contacts. Use when user says 'tag all contacts at X', 'update all contacts with', or any bulk contact operation.",
      inputSchema: z.object({
        filter: z
          .object({
            companyId: z.string().optional().describe("Filter by company ID"),
            search: z.string().optional().describe("Filter by name/email search"),
          })
          .describe("Filter to select which contacts to update"),
        update: z
          .object({
            title: z.string().optional(),
            companyId: z.string().optional(),
          })
          .describe("Fields to update on matched contacts"),
      }),
      execute: async (input) => {
        const conditions = [eq(contacts.tenantId, tenantId)];
        if (input.filter.companyId) conditions.push(eq(contacts.companyId, input.filter.companyId));
        if (input.filter.search) {
          conditions.push(
            or(
              ilike(contacts.firstName, `%${input.filter.search}%`),
              ilike(contacts.lastName, `%${input.filter.search}%`),
              ilike(contacts.email, `%${input.filter.search}%`)
            )!
          );
        }

        // Full-row snapshot for undo
        const matchedContacts = await db
          .select()
          .from(contacts)
          .where(and(...conditions));

        if (matchedContacts.length === 0)
          return { bulkUpdated: { count: 0 }, message: "No contacts matched the filter" };

        const updateFields: Record<string, unknown> = { updatedAt: new Date() };
        if (input.update.title) updateFields.title = input.update.title;
        if (input.update.companyId) updateFields.companyId = input.update.companyId;

        await db
          .update(contacts)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updateFields as any)
          .where(and(...conditions));

        await logToolCall({
          tenantId,
          userId,
          toolName: "bulkUpdateContacts",
          args: input as unknown as Record<string, unknown>,
          result: { count: matchedContacts.length },
          snapshot: {
            type: "bulk_update",
            entity: "contact",
            rows: matchedContacts.map((c) => ({
              id: c.id,
              before: c as unknown as Record<string, unknown>,
            })),
          },
        });

        return {
          bulkUpdated: {
            count: matchedContacts.length,
            contacts: matchedContacts.map((c) => ({
              id: c.id,
              name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            })),
          },
        };
      },
    }),

    updateICP: makeTool({
      description:
        "Update the workspace's Ideal Customer Profile settings (productDescription, salesMotion, primaryChallenge, aiTone, targetIndustries[], targetCompanySizes[], targetRoles, targetGeographies[]). Admin-only. Used to tune the AI's understanding of who to target and how.",
      inputSchema: z.object({
        productDescription: z.string().optional(),
        salesMotion: z.string().optional(),
        primaryChallenge: z.string().optional(),
        aiTone: z.string().optional(),
        targetIndustries: z.array(z.string()).optional(),
        targetCompanySizes: z.array(z.string()).optional(),
        targetRoles: z.string().optional(),
        targetGeographies: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const current = (tenant.settings || {}) as Record<string, unknown>;
        const next: Record<string, unknown> = { ...current };
        const fields: Array<keyof typeof input> = [
          "productDescription",
          "salesMotion",
          "primaryChallenge",
          "aiTone",
          "targetIndustries",
          "targetCompanySizes",
          "targetRoles",
          "targetGeographies",
        ];
        let changedCount = 0;
        for (const f of fields) {
          if (input[f] !== undefined) {
            next[f] = input[f];
            changedCount++;
          }
        }
        if (changedCount === 0) return { error: "No fields to update" };

        await db
          .update(tenants)
          .set({ settings: next, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        return {
          updated: { tenantId, fieldsChanged: changedCount },
        };
      },
    }),

    updateWorkspace: makeTool({
      description:
        "Update the workspace name, primary domain, additional domains, or agentApprovalMode. Admin-only. " +
        "agentApprovalMode accepts the v2 values (review-each|batch-daily|auto-high-confidence) or legacy values (auto|ask|off) for backwards compatibility. " +
        "Legacy values are coerced to v2 before persistence.",
      inputSchema: z.object({
        name: z.string().optional(),
        companyDomain: z.string().optional(),
        companyDomains: z.array(z.string()).optional(),
        // WS-1 — both legacy and v2 values accepted; v2 is coerced via
        // `readApprovalMode` downstream, and writers that go through the
        // chat tool emit v2 after the coercion below.
        agentApprovalMode: z
          .enum([
            "review-each",
            "batch-daily",
            "auto-high-confidence",
            "auto",
            "ask",
            "off",
          ])
          .optional(),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        if (input.name !== undefined) {
          await db
            .update(tenants)
            .set({ name: input.name.trim() })
            .where(eq(tenants.id, tenantId));
        }

        const currentSettings = (tenant.settings || {}) as Record<string, unknown>;
        const updates: Record<string, unknown> = { ...currentSettings };
        if (input.companyDomain !== undefined) updates.companyDomain = input.companyDomain;
        if (input.companyDomains !== undefined) {
          const primary = (input.companyDomain ??
            updates.companyDomain ??
            "") as string;
          updates.companyDomains = primary
            ? input.companyDomains.filter((d) => d !== primary)
            : input.companyDomains;
        }
        if (input.agentApprovalMode !== undefined) {
          // WS-1 — coerce legacy strings to v2 at write-time so every
          // row written post-PR-B is clean v2. Read-path coercion in
          // `readApprovalMode` stays as the belt-and-braces.
          const legacyMap: Record<string, "review-each" | "batch-daily" | "auto-high-confidence"> = {
            auto: "auto-high-confidence",
            ask: "review-each",
            off: "review-each",
          };
          updates.agentApprovalMode =
            legacyMap[input.agentApprovalMode] ?? input.agentApprovalMode;
        }

        await db
          .update(tenants)
          .set({ settings: updates, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        return {
          updated: {
            tenantId,
            name: input.name,
            agentApprovalMode: input.agentApprovalMode,
          },
        };
      },
    }),

    updateUserProfile: makeTool({
      description:
        "Update the current user's profile (firstName, lastName) and locale preferences (language, timezone). Use when the user asks to 'change my name', 'update my timezone', 'switch to French'.",
      inputSchema: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        language: z.string().optional().describe("Language code (en, fr, es, etc.)"),
        timezone: z
          .string()
          .optional()
          .describe("IANA timezone identifier (e.g. Europe/Paris)"),
      }),
      execute: async (input) => {
        const userUpdates: Record<string, unknown> = { updatedAt: new Date() };
        if (input.firstName !== undefined) userUpdates.firstName = input.firstName.trim();
        if (input.lastName !== undefined) userUpdates.lastName = input.lastName.trim();

        if (Object.keys(userUpdates).length > 1) {
          await db.update(users).set(userUpdates).where(eq(users.id, userId));
        }

        if (input.language !== undefined || input.timezone !== undefined) {
          const [tenant] = await db
            .select({ settings: tenants.settings })
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);
          const currentSettings = (tenant?.settings || {}) as Record<string, unknown>;
          const next = { ...currentSettings };
          if (input.language !== undefined) next.language = input.language;
          if (input.timezone !== undefined) next.timezone = input.timezone;
          await db
            .update(tenants)
            .set({ settings: next })
            .where(eq(tenants.id, tenantId));
        }

        return {
          updated: {
            userId,
            firstName: input.firstName,
            lastName: input.lastName,
            language: input.language,
            timezone: input.timezone,
          },
        };
      },
    }),

    updateNotificationPreferences: makeTool({
      description:
        "Update the current user's notification preferences (emailEnabled, inAppEnabled, per-type preferences). Optionally set a Slack webhook at the workspace level. Use when the user says 'turn off email notifications for deal risks', 'silence task alerts', 'route to Slack'.",
      inputSchema: z.object({
        emailEnabled: z.boolean().optional(),
        inAppEnabled: z.boolean().optional(),
        preferences: z
          .record(
            z.string(),
            z.object({
              email: z.boolean().optional(),
              inApp: z.boolean().optional(),
            })
          )
          .optional()
          .describe(
            "Per-type prefs. Keys: deal_risk, deal_won, deal_lost, enrichment_done, sequence_reply, task_due, task_assigned, meeting_upcoming, new_contact, system"
          ),
        slackWebhook: z
          .string()
          .nullable()
          .optional()
          .describe("Slack incoming webhook URL for this workspace, or null to clear"),
      }),
      execute: async (input) => {
        if (input.slackWebhook !== undefined) {
          const [tenant] = await db
            .select()
            .from(tenants)
            .where(eq(tenants.id, tenantId))
            .limit(1);
          if (tenant) {
            const settings = (tenant.settings || {}) as Record<string, unknown>;
            await db
              .update(tenants)
              .set({
                settings: { ...settings, slackWebhookUrl: input.slackWebhook || null },
                updatedAt: new Date(),
              })
              .where(eq(tenants.id, tenantId));
          }
        }

        const [existing] = await db
          .select()
          .from(notificationPreferences)
          .where(eq(notificationPreferences.userId, userId))
          .limit(1);

        if (existing) {
          await db
            .update(notificationPreferences)
            .set({
              emailEnabled: input.emailEnabled ?? existing.emailEnabled,
              inAppEnabled: input.inAppEnabled ?? existing.inAppEnabled,
              preferences: input.preferences ?? existing.preferences,
              updatedAt: new Date(),
            })
            .where(eq(notificationPreferences.id, existing.id));
        } else {
          await db.insert(notificationPreferences).values({
            userId,
            tenantId,
            emailEnabled: input.emailEnabled ?? true,
            inAppEnabled: input.inAppEnabled ?? true,
            preferences: input.preferences ?? {},
          });
        }

        return {
          updated: {
            userId,
            emailEnabled: input.emailEnabled,
            inAppEnabled: input.inAppEnabled,
            slackWebhookConfigured: input.slackWebhook !== undefined,
          },
        };
      },
    }),

    updatePrivacySettings: makeTool({
      description:
        "Update workspace privacy settings: contactCreationMode (selective|all|none), backsyncRange (how far back to ingest mailbox history, e.g. '3m'), doNotTrackDomains[] (domains to exclude from tracking). Admin-only.",
      inputSchema: z.object({
        contactCreationMode: z.enum(["selective", "all", "none"]).optional(),
        backsyncRange: z.string().optional().describe("e.g. 1m, 3m, 6m, 1y"),
        doNotTrackDomains: z.array(z.string()).optional(),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const current = (tenant.settings || {}) as Record<string, unknown>;
        const updates: Record<string, unknown> = { ...current };
        let changed = 0;
        if (input.contactCreationMode !== undefined) {
          updates.contactCreationMode = input.contactCreationMode;
          changed++;
        }
        if (input.backsyncRange !== undefined) {
          updates.backsyncRange = input.backsyncRange;
          changed++;
        }
        if (input.doNotTrackDomains !== undefined) {
          updates.doNotTrackDomains = input.doNotTrackDomains;
          changed++;
        }
        if (changed === 0) return { error: "No fields to update" };

        await db
          .update(tenants)
          .set({ settings: updates, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));

        return { updated: { tenantId, fieldsChanged: changed } };
      },
    }),

    updateKnowledgeEntry: makeTool({
      description:
        "Edit an existing knowledge base entry (topic and/or content). Admin-only. Use when the user asks to 'update our pricing knowledge', 'fix the value-prop entry'.",
      inputSchema: z.object({
        id: z.string().describe("Knowledge entry ID (from createKnowledgeEntry)"),
        topic: z.string().optional(),
        content: z.string().optional(),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const settings = (tenant.settings || {}) as Record<string, unknown>;
        const knowledge = (settings.knowledge as Array<{ id: string; topic: string; content: string }>) || [];
        const idx = knowledge.findIndex((k) => k.id === input.id);
        if (idx === -1) return { error: "Knowledge entry not found" };

        if (input.topic !== undefined) knowledge[idx].topic = input.topic.trim();
        if (input.content !== undefined) knowledge[idx].content = input.content.trim();

        await db
          .update(tenants)
          .set({
            settings: { ...settings, knowledge },
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));

        return { updated: knowledge[idx] };
      },
    }),

    updatePipelineStages: makeTool({
      description:
        "Replace the workspace's pipeline stages wholesale. Pass the full array — partial updates not supported. Each stage needs { id, name, description, category: 'in_progress' | 'done' }. Admin-only.",
      inputSchema: z.object({
        stages: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              description: z.string(),
              category: z.enum(["in_progress", "done"]),
            })
          )
          .describe("Full ordered list of pipeline stages"),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const settings = (tenant.settings || {}) as Record<string, unknown>;

        await db
          .update(tenants)
          .set({
            settings: { ...settings, pipelineStages: input.stages },
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));

        return { updated: { stageCount: input.stages.length } };
      },
    }),

    updateCustomFieldSchema: makeTool({
      description:
        "Replace the workspace's custom field definitions wholesale. Each field needs { entityType: 'contact'|'company'|'deal', name, type, aiFillMode, options? }. Admin-only. Pass the full array — partial updates not supported.",
      inputSchema: z.object({
        fields: z.array(
          z.object({
            entityType: z.enum(["contact", "company", "deal"]),
            name: z.string(),
            type: z.string().describe("text | number | select | multiselect | date | boolean"),
            aiFillMode: z.string().describe("auto | manual | off"),
            options: z.array(z.string()).optional(),
          })
        ),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const settings = (tenant.settings || {}) as Record<string, unknown>;
        await db
          .update(tenants)
          .set({ settings: { ...settings, customFields: input.fields } })
          .where(eq(tenants.id, tenantId));

        return { updated: { fieldCount: input.fields.length } };
      },
    }),

    updateCustomSignalDefinitions: makeTool({
      description:
        "Replace the workspace's custom buying-signal definitions. Each is { name, enabled }. Admin-only. Used to extend the default signal taxonomy with workspace-specific signals.",
      inputSchema: z.object({
        customSignals: z.array(
          z.object({
            name: z.string(),
            enabled: z.boolean(),
          })
        ),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const settings = (tenant.settings || {}) as Record<string, unknown>;
        await db
          .update(tenants)
          .set({
            settings: { ...settings, customSignals: input.customSignals },
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));

        return { updated: { signalCount: input.customSignals.length } };
      },
    }),

    updateWorkflows: makeTool({
      description:
        "Replace the workspace's automation workflow definitions. Each workflow has { id, name, trigger: { type }, actions: [{ type, params }] }. Admin-only. Allowed triggers: deal_stage_changed, contact_created, email_received, task_due, schedule, deal_won, deal_lost, score_changed, enrichment_completed, sequence_reply_received, meeting_completed, account_created. Allowed actions: send_notification, create_task, send_email, call_webhook, update_field, ai_action, enroll_sequence, assign_owner, add_tag. Max 100 workflows, 20 actions per workflow.",
      inputSchema: z.object({
        workflows: z
          .array(z.record(z.string(), z.unknown()))
          .describe("Array of WorkflowDef objects"),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const allowedTriggers = new Set([
          "deal_stage_changed",
          "contact_created",
          "email_received",
          "task_due",
          "schedule",
          "deal_won",
          "deal_lost",
          "score_changed",
          "enrichment_completed",
          "sequence_reply_received",
          "meeting_completed",
          "account_created",
        ]);
        const allowedActions = new Set([
          "send_notification",
          "create_task",
          "send_email",
          "call_webhook",
          "update_field",
          "ai_action",
          "enroll_sequence",
          "assign_owner",
          "add_tag",
        ]);

        if (input.workflows.length > 100) {
          return { error: "Maximum 100 workflows per workspace" };
        }

        for (const wf of input.workflows) {
          if (typeof wf.id !== "string" || !wf.id.trim()) {
            return { error: "Each workflow needs an id" };
          }
          if (typeof wf.name !== "string" || !wf.name.trim()) {
            return { error: `Workflow ${wf.id}: name required` };
          }
          const trigger = wf.trigger as { type?: string } | undefined;
          if (!trigger || !allowedTriggers.has(trigger.type || "")) {
            return { error: `Workflow ${wf.id}: invalid trigger.type` };
          }
          const actions = wf.actions as Array<{ type?: string; params?: unknown }> | undefined;
          if (!Array.isArray(actions) || actions.length < 1) {
            return { error: `Workflow ${wf.id}: at least 1 action required` };
          }
          if (actions.length > 20) {
            return { error: `Workflow ${wf.id}: maximum 20 actions` };
          }
          for (const a of actions) {
            if (!allowedActions.has(a.type || "")) {
              return { error: `Workflow ${wf.id}: invalid action.type "${a.type}"` };
            }
            if (!a.params || typeof a.params !== "object") {
              return { error: `Workflow ${wf.id}: action.params must be an object` };
            }
          }
        }

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (!tenant) return { error: "Workspace not found" };

        const settings = (tenant.settings || {}) as Record<string, unknown>;
        await db
          .update(tenants)
          .set({
            settings: { ...settings, workflows: input.workflows },
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));

        return { updated: { workflowCount: input.workflows.length } };
      },
    }),

    updateMemberRole: makeTool({
      description:
        "Change a workspace member's role (admin|member). Admin-only. Rejects self-demotion. Use when the user says 'promote X to admin', 'demote Y to member'.",
      inputSchema: z.object({
        memberId: z.string().describe("User ID of the member"),
        role: z.enum(["admin", "member"]).describe("New role"),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };
        if (input.memberId === userId && input.role !== "admin") {
          return { error: "Cannot demote yourself" };
        }

        await db
          .update(users)
          .set({ role: input.role, updatedAt: new Date() })
          .where(and(eq(users.id, input.memberId), eq(users.tenantId, tenantId)));

        return { updated: { memberId: input.memberId, role: input.role } };
      },
    }),

    updateMailboxSettings: makeTool({
      description:
        "Update a connected mailbox's sendable settings: status, displayName, dailyLimit, sendWindowStart/End, sendDays, or 'skipWarmup' (marks mailbox as active immediately with default dailyLimit 50).",
      inputSchema: z.object({
        mailboxId: z.string().describe("Mailbox ID"),
        displayName: z.string().optional(),
        status: z.string().optional().describe("active | paused | warming_up | disconnected"),
        dailyLimit: z.number().optional(),
        sendWindowStart: z.string().optional().describe("HH:MM"),
        sendWindowEnd: z.string().optional().describe("HH:MM"),
        sendDays: z.array(z.string()).optional().describe("Days of week sent on"),
        skipWarmup: z
          .boolean()
          .optional()
          .describe("true to force-transition to active with default dailyLimit"),
      }),
      execute: async (input) => {
        const condition = and(
          eq(connectedMailboxes.id, input.mailboxId),
          eq(connectedMailboxes.tenantId, tenantId)
        );

        if (input.skipWarmup) {
          await db
            .update(connectedMailboxes)
            .set({
              status: "active",
              warmupCompletedAt: new Date(),
              dailyLimit: 50,
              updatedAt: new Date(),
            })
            .where(condition);
          return { updated: { mailboxId: input.mailboxId, status: "active", skippedWarmup: true } };
        }

        const updates: Record<string, unknown> = {};
        if (input.displayName !== undefined) updates.displayName = input.displayName;
        if (input.status !== undefined) updates.status = input.status;
        if (input.dailyLimit !== undefined) updates.dailyLimit = input.dailyLimit;
        if (input.sendWindowStart !== undefined) updates.sendWindowStart = input.sendWindowStart;
        if (input.sendWindowEnd !== undefined) updates.sendWindowEnd = input.sendWindowEnd;
        if (input.sendDays !== undefined) updates.sendDays = input.sendDays;

        if (Object.keys(updates).length === 0) {
          return { error: "No fields to update" };
        }
        updates.updatedAt = new Date();

        const [updated] = await db
          .update(connectedMailboxes)
          .set(updates)
          .where(condition)
          .returning();
        if (!updated) return { error: "Mailbox not found" };

        return {
          updated: {
            mailboxId: updated.id,
            status: updated.status,
            dailyLimit: updated.dailyLimit,
          },
        };
      },
    }),

    updateMailCalendarIntegration: makeTool({
      description:
        "Update workspace-level mail & calendar sync preferences: contactCreationMode (disabled|selective|always), backsyncRange (1m|3m|6m|12m), doNotTrackDomains[]. Available to any authenticated workspace member (these affect the whole workspace).",
      inputSchema: z.object({
        contactCreationMode: z.enum(["disabled", "selective", "always"]),
        backsyncRange: z.enum(["1m", "3m", "6m", "12m"]),
        doNotTrackDomains: z
          .array(z.string())
          .optional()
          .describe("Max 200 domains. Lowercased + deduped."),
      }),
      execute: async (input) => {
        const sanitized = (input.doNotTrackDomains || [])
          .filter((d): d is string => typeof d === "string")
          .map((d) => d.trim().toLowerCase())
          .filter((d, i, arr) => d && arr.indexOf(d) === i)
          .slice(0, 200);

        await updateTenantSettings(tenantId, {
          contactCreationMode: input.contactCreationMode,
          backsyncRange: input.backsyncRange,
          doNotTrackDomains: sanitized,
        });

        return {
          updated: {
            contactCreationMode: input.contactCreationMode,
            backsyncRange: input.backsyncRange,
            doNotTrackDomains: sanitized,
          },
        };
      },
    }),

    updateCustomObjectType: makeTool({
      description:
        "Update an existing custom object type (name, nameSingular, icon, fields). Admin-only. Pass the id of the type + any fields to change. Fields array replaces the whole fields set if provided.",
      inputSchema: z.object({
        id: z.string().describe("Existing object type id"),
        name: z.string().optional(),
        nameSingular: z.string().optional(),
        icon: z.string().optional(),
        fields: z
          .array(
            z.object({
              id: z.string().optional(),
              name: z.string(),
              type: z.string().optional(),
              options: z.array(z.string()).optional(),
              required: z.boolean().optional(),
            })
          )
          .optional(),
      }),
      execute: async (input) => {
        if (!isAdmin) return { error: "Admin access required" };

        const settings = await getTenantSettings(tenantId);
        const existing = settings.customObjectTypes || [];
        const idx = existing.findIndex((t) => t.id === input.id);
        if (idx === -1) return { error: "Object type not found" };

        const updated: CustomObjectTypeDef[] = [...existing];
        updated[idx] = {
          ...updated[idx],
          name: input.name?.trim() || updated[idx].name,
          nameSingular: input.nameSingular?.trim() || updated[idx].nameSingular,
          icon: input.icon || updated[idx].icon,
          fields: input.fields
            ? input.fields.map((f) => ({
                id: f.id || crypto.randomUUID(),
                name: f.name,
                type: (f.type || "text") as CustomObjectTypeDef["fields"][number]["type"],
                options: f.options,
                required: f.required || false,
              }))
            : updated[idx].fields,
        };

        await updateTenantSettings(tenantId, {
          customObjectTypes: updated,
        });

        return { updated: updated[idx] };
      },
    }),
  };
}
