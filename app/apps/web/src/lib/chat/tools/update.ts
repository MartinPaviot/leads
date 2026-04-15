import { db } from "@/db";
import { activities, companies, contacts, deals, tasks } from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { makeTool, type ToolContext } from "./context";

export function buildUpdateTools(ctx: ToolContext) {
  const { tenantId, userId } = ctx;

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
          .select({ id: companies.id })
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

        const [updated] = await db
          .update(tasks)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set(updates as any)
          .where(and(eq(tasks.id, input.taskId), eq(tasks.tenantId, tenantId)))
          .returning();
        if (!updated) return { error: "Task not found" };

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

        const matchedDeals = await db
          .select({ id: deals.id, name: deals.name, stage: deals.stage })
          .from(deals)
          .where(and(...conditions));

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

        const matchedContacts = await db
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
          })
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
  };
}
