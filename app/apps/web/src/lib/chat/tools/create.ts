import { db } from "@/db";
import { companies, contacts, deals, notes, tasks } from "@/db/schema";
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
